import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { registerDeleteTool } from "./tools/delete.js";
import { registerDownloadTool } from "./tools/download.js";
import { registerInfoTool } from "./tools/info.js";
import { registerListTool } from "./tools/list.js";
import { registerPublishTool } from "./tools/publish.js";
import { registerUpdateTool } from "./tools/update.js";

export function registerTools(server: McpServer, service: PublicationService): void {
  registerPublishTool(server, service);
  registerListTool(server, service);
  registerInfoTool(server, service);
  registerUpdateTool(server, service);
  registerDownloadTool(server, service);
  registerDeleteTool(server, service);
}
