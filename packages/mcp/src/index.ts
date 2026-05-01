// Library entry — re-exports the public API for code that wants to embed the
// MCP server (e.g. the `pubsh mcp` CLI command). The standalone executable
// lives in `bin.ts` so this file is import-safe (no side effects).

export { startMcpServer, type StartOptions, type Transport } from "./server.js";
export { registerTools } from "./tools.js";
