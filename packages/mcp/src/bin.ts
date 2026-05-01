#!/usr/bin/env node
// Standalone MCP server entry. Reads pubsh configuration from PUBSH_* env vars
// (no filesystem, no user-conventional paths) and starts the stdio transport.
// The host (Claude Desktop / Claude Code / any MCP client) is responsible for
// passing the env vars in its mcpServers config block.

import { PubshError, loadConfigFromEnv, validateConfig } from "@pubsh/core";
import { type RunningServer, startMcpServer } from "./server.js";

const DEBUG = process.env.PUBSH_DEBUG === "1";

function reportError(err: unknown): void {
  const prefix = "pubsh-mcp error: ";
  if (err instanceof PubshError) {
    process.stderr.write(`${prefix}[${err.code}] ${err.message}\n`);
    if (DEBUG && err.stack) process.stderr.write(`${err.stack}\n`);
    return;
  }
  if (err instanceof Error) {
    process.stderr.write(`${prefix}${err.message}\n`);
    if (DEBUG && err.stack) process.stderr.write(`${err.stack}\n`);
    return;
  }
  process.stderr.write(`${prefix}${String(err)}\n`);
}

let running: RunningServer | undefined;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (DEBUG) process.stderr.write(`pubsh-mcp: received ${signal}, closing\n`);
  try {
    await running?.close();
  } catch (err) {
    reportError(err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", (sig) => {
  void shutdown(sig);
});
process.on("SIGINT", (sig) => {
  void shutdown(sig);
});

try {
  const config = validateConfig(loadConfigFromEnv(process.env));
  running = await startMcpServer({ config, transport: { kind: "stdio" } });
} catch (err) {
  reportError(err);
  process.exit(1);
}
