import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { buildContext } from "../context.js";
import { emit } from "../output.js";

export function registerDownload(program: Command): void {
  program
    .command("download <id>")
    .description("download an existing publication and decrypt it back to source HTML")
    .option("-o, --out-dir <dir>", "output directory", "decrypted")
    .action(async (id: string, opts, cmd: Command) => {
      const ctx = await buildContext();
      const result = await ctx.service.download({ id });

      const outDir = resolve(opts.outDir);
      mkdirSync(outDir, { recursive: true });
      const outPath = resolve(outDir, `${id}.html`);
      writeFileSync(outPath, result.html, "utf8");

      const summary = {
        id: result.publication.id,
        url: result.publication.url,
        password: result.publication.password,
        updatedAt: result.publication.updatedAt,
        decryptedBytes: result.decryptedBytes,
        decryptedPath: outPath,
      };
      emit(
        cmd,
        () =>
          [
            `recovered: ${outPath}`,
            `bytes:     ${result.decryptedBytes}`,
            `url:       ${result.publication.url}`,
            `password:  ${result.publication.password}`,
            `updated:   ${result.publication.updatedAt}`,
          ].join("\n"),
        summary,
      );
    });
}
