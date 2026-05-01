import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ListOptions, PublicationService } from "@pubsh/core";
import { wrapHandler } from "./_shared.js";

export function registerListTool(
  server: McpServer,
  service: PublicationService,
): void {
  server.registerTool(
    "list",
    {
      description:
        "List all publications stored in the configured S3 bucket, newest first.",
      inputSchema: {
        limit: z.number().int().positive().optional(),
        prefix: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async (args) => {
      const opts: ListOptions = {};
      if (args.limit !== undefined) opts.limit = args.limit;
      if (args.prefix !== undefined) opts.prefix = args.prefix;
      const items = await service.list(opts);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    }),
  );
}
