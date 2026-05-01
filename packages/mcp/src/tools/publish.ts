import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { resolveHtml, wrapHandler } from "./_shared.js";

export function registerPublishTool(
  server: McpServer,
  service: PublicationService,
): void {
  server.registerTool(
    "publish",
    {
      description:
        "Encrypt HTML and upload it to S3. Idempotent by id — re-runs reuse the same URL + password. " +
        "Provide HTML via either `source` (absolute file path) OR `html` (content as string). " +
        "Provide id via either `id` (explicit) OR `clientName` (id derived via slug).",
      inputSchema: {
        source: z
          .string()
          .optional()
          .describe(
            "absolute path to a source HTML file on this machine (NOT a Linux-sandbox path)",
          ),
        html: z
          .string()
          .optional()
          .describe("HTML content as a string — used when you have content but no file"),
        id: z
          .string()
          .optional()
          .describe("explicit publication id; if absent, derived from clientName"),
        clientName: z
          .string()
          .optional()
          .describe(
            'human-readable client name, e.g. "Иванов Иван 1985-03-15". Stored in meta; if `id` is absent, used to derive it via slug.',
          ),
        templatePath: z
          .string()
          .optional()
          .describe("absolute path to a custom staticrypt wrapper template"),
      },
      annotations: { idempotentHint: true },
    },
    wrapHandler(async ({ source, html, id, clientName, templatePath }) => {
      const resolvedId = id ?? (clientName ? service.slug(clientName) : "");
      if (!resolvedId) {
        throw new Error("either `id` or `clientName` is required");
      }
      const resolvedHtml = resolveHtml({
        ...(source ? { source } : {}),
        ...(html ? { html } : {}),
      });
      const result = await service.publish({
        html: resolvedHtml,
        id: resolvedId,
        ...(clientName ? { clientName } : {}),
        ...(templatePath ? { templatePath } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }),
  );
}
