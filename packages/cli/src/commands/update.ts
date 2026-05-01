import { existsSync, readFileSync, statSync } from "node:fs";
import type { Command } from "commander";
import { buildContext } from "../context.js";
import { emit } from "../output.js";

export function registerUpdate(program: Command): void {
  program
    .command("update <id> <source>")
    .description("update an existing publication (preserves URL and password)")
    .option("-c, --client <name>", "update the stored client name")
    .option("-t, --template <path>", "custom staticrypt wrapper template (default: built-in)")
    .action(async (id: string, source: string, opts, cmd: Command) => {
      if (!existsSync(source) || !statSync(source).isFile()) {
        throw new Error(`source file not found: ${source}`);
      }
      const html = readFileSync(source, "utf8");

      const ctx = await buildContext();
      const result = await ctx.service.update({
        id,
        html,
        ...(opts.client ? { clientName: opts.client } : {}),
        ...(opts.template ? { templatePath: opts.template } : {}),
      });
      emit(cmd, () => `updated: ${result.publication.url}`, result);
    });
}
