import { existsSync, readFileSync, statSync } from "node:fs";
import type { Command } from "commander";
import { buildContext } from "../context.js";
import { emit } from "../output.js";

export function registerPublish(program: Command): void {
  program
    .command("publish <source>")
    .description(
      "encrypt and publish HTML — idempotent by id (re-runs reuse the same URL + password)",
    )
    .option("--id <id>", "explicit publication id (must be [a-z0-9-], 1–80 chars)")
    .option(
      "-c, --client <name>",
      "client full name; if --id is absent, the id is derived via service.slug() (e.g. \"Иванов Иван 1985-03-15\" → ivanov-ivan-1985-03-15)",
    )
    .option("-t, --template <path>", "custom staticrypt wrapper template (default: built-in)")
    .action(async (source: string, opts, cmd: Command) => {
      if (!existsSync(source) || !statSync(source).isFile()) {
        throw new Error(`source file not found: ${source}`);
      }
      const html = readFileSync(source, "utf8");

      const ctx = await buildContext();
      const id = resolveId(opts, ctx.service.slug.bind(ctx.service));
      const result = await ctx.service.publish({
        html,
        id,
        ...(opts.client ? { clientName: opts.client } : {}),
        ...(opts.template ? { templatePath: opts.template } : {}),
      });
      emit(
        cmd,
        () =>
          [
            `mode:     ${result.mode}`,
            `id:       ${result.publication.id}`,
            `url:      ${result.publication.url}`,
            `password: ${result.publication.password}`,
            `updated:  ${result.publication.updatedAt}`,
          ].join("\n"),
        result,
      );
    });
}

function resolveId(
  opts: { id?: string; client?: string },
  slug: (s: string) => string,
): string {
  if (opts.id) return opts.id;
  if (opts.client) {
    const derived = slug(opts.client);
    if (!derived) {
      throw new Error(
        `cannot derive id from --client "${opts.client}" (no [a-z0-9] chars after normalization)`,
      );
    }
    return derived;
  }
  throw new Error("either --id <id> or --client <name> is required");
}
