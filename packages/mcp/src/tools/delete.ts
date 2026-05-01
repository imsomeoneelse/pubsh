import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { wrapHandler } from "./_shared.js";

export function registerDeleteTool(
  server: McpServer,
  service: PublicationService,
): void {
  server.registerTool(
    "delete",
    {
      description:
        "Delete a publication. Without confirm:true returns a dry-run preview; with confirm:true actually deletes (irreversible).",
      inputSchema: {
        id: z.string(),
        confirm: z
          .boolean()
          .optional()
          .describe("true to actually delete; default false (dry-run preview)"),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    wrapHandler(async ({ id, confirm }) => {
      const result = await service.delete({
        id,
        ...(confirm !== undefined ? { confirm } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }),
  );
}
