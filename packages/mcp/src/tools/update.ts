import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { resolveHtml, wrapHandler } from "./_shared.js";

export function registerUpdateTool(
  server: McpServer,
  service: PublicationService,
): void {
  server.registerTool(
    "update",
    {
      description:
        "Update an existing publication. Same URL and same password. " +
        "Provide new HTML via `html` when the content is in memory, " +
        "or `source` (absolute file path) when it's on disk.",
      inputSchema: {
        id: z.string(),
        source: z
          .string()
          .optional()
          .describe("absolute path to the new source HTML file"),
        html: z
          .string()
          .optional()
          .describe("new HTML content as a string"),
        clientName: z.string().optional().describe("update the stored client name"),
        templatePath: z
          .string()
          .optional()
          .describe("absolute path to a custom staticrypt wrapper template"),
      },
      annotations: { idempotentHint: true },
    },
    wrapHandler(async ({ id, source, html, clientName, templatePath }) => {
      const resolvedHtml = resolveHtml({
        ...(source ? { source } : {}),
        ...(html ? { html } : {}),
      });
      const result = await service.update({
        id,
        html: resolvedHtml,
        ...(clientName ? { clientName } : {}),
        ...(templatePath ? { templatePath } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }),
  );
}
