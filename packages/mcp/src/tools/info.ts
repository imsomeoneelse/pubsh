import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { wrapHandler } from "./_shared.js";

export function registerInfoTool(
  server: McpServer,
  service: PublicationService,
): void {
  server.registerTool(
    "info",
    {
      description:
        "Show metadata for a single publication (URL, password, dates). " +
        "`id` is the slug returned by `list`.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async ({ id }) => {
      const item = await service.info(id);
      return {
        content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
      };
    }),
  );
}
