import type { Command } from "commander";
import { buildContext } from "../context.js";
import { emit } from "../output.js";

export function registerDelete(program: Command): void {
  program
    .command("delete <id>")
    .description("delete a publication (dry-run unless --yes)")
    .option("--yes", "actually delete (irreversible)", false)
    .action(async (id: string, opts, cmd: Command) => {
      const ctx = await buildContext();
      const result = await ctx.service.delete({ id, confirm: !!opts.yes });

      emit(
        cmd,
        () => {
          if (result.mode === "dry-run") {
            return [
              "=== DRY RUN ===",
              `would delete: ${result.publication.url}`,
              `         key: ${result.publication.key}`,
              `    password: ${result.publication.password}`,
              `     created: ${result.publication.createdAt}`,
              `     updated: ${result.publication.updatedAt}`,
              "",
              "re-run with --yes to actually delete (irreversible)",
            ].join("\n");
          }
          return [
            `deleted: ${result.publication.url}`,
            `html status: ${result.htmlDeleteStatus}`,
            `meta status: ${result.metaDeleteStatus}`,
          ].join("\n");
        },
        result,
      );
    });
}
