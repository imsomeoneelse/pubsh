import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationService } from "@pubsh/core";
import { wrapHandler } from "./_shared.js";

const DEFAULT_DOWNLOAD_DIR = join(tmpdir(), "pubsh-dashboards");

/**
 * Where decrypted dashboards land on disk. Picked at server startup, NOT
 * exposed in the tool's inputSchema — letting the LLM choose the path is a
 * footgun, since model assumptions ("looks like Linux, must be /home/claude")
 * never match the host's actual filesystem. The host operator pins the path
 * via PUBSH_DOWNLOAD_DIR; the same value should be granted to a sibling
 * filesystem-MCP server so the model can read/edit the file.
 */
function resolveDownloadDir(): string {
  const fromEnv = process.env.PUBSH_DOWNLOAD_DIR;
  if (fromEnv && fromEnv.length > 0) {
    if (!isAbsolute(fromEnv)) {
      throw new Error(
        `PUBSH_DOWNLOAD_DIR must be absolute, got "${fromEnv}"`,
      );
    }
    return resolve(fromEnv);
  }
  return DEFAULT_DOWNLOAD_DIR;
}

export function registerDownloadTool(
  server: McpServer,
  service: PublicationService,
): void {
  const downloadDir = resolveDownloadDir();

  server.registerTool(
    "download",
    {
      description:
        "Download a publication, decrypt it, and write the HTML to a local file. " +
        `The file is always written to ${downloadDir}/<id>.html (configured server-side; ` +
        "you cannot redirect it from the tool call). Returns the absolute path. " +
        "To inspect or edit the HTML, use the host's filesystem tool against that exact path; " +
        "to re-publish edits, call `update({ id, source: <decryptedPath> })`.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    wrapHandler(async ({ id }) => {
      const result = await service.download({ id });

      mkdirSync(downloadDir, { recursive: true });
      const decryptedPath = join(downloadDir, `${result.publication.id}.html`);
      writeFileSync(decryptedPath, result.html, "utf8");

      const summary = {
        id: result.publication.id,
        url: result.publication.url,
        password: result.publication.password,
        updatedAt: result.publication.updatedAt,
        decryptedBytes: result.decryptedBytes,
        decryptedPath,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }),
  );
}
