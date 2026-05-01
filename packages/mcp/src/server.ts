import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type Config, createPublicationService } from "@pubsh/core";
import { registerTools } from "./tools.js";

// Pulled at module load so the announced server version always tracks the
// installed package version, not a hard-coded literal that drifts.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };
const SERVER_NAME = pkg.name;
const SERVER_VERSION = pkg.version;

/**
 * Transport options. HTTP is intentionally not part of the union yet — the
 * StreamableHTTPServerTransport from the SDK is available, but we have not
 * wired it up. Add `{ kind: "http"; port: number }` here once the server.ts
 * implementation lands; otherwise callers get TS-time feedback that only
 * stdio is supported.
 */
export type Transport = { kind: "stdio" };

export interface StartOptions {
  /**
   * Pubsh configuration. The MCP server is intentionally I/O-naive: the caller
   * is responsible for assembling the Config from whichever sources are
   * available (env-only in subprocess scenarios, full file hierarchy when
   * launched from the CLI).
   */
  config: Config;
  transport: Transport;
}

export interface RunningServer {
  /** Underlying SDK server, exposed so callers can attach extra handlers. */
  server: McpServer;
  /** Stop the server and close the active transport. */
  close(): Promise<void>;
}

export async function startMcpServer(
  options: StartOptions,
): Promise<RunningServer> {
  const service = createPublicationService({ config: options.config });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, service);

  // Only stdio is supported today. Switch on `transport.kind` when more land.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return {
    server,
    async close() {
      await server.close();
    },
  };
}
