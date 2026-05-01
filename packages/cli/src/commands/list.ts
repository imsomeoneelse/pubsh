import type { Command } from "commander";
import type { PublicationSummary } from "@pubsh/core";
import { buildContext } from "../context.js";
import { intOption } from "../options.js";
import { emit } from "../output.js";

export function registerList(program: Command): void {
  program
    .command("list")
    .description("list publications (cheap — single LIST, slug + updatedAt only)")
    .option("--limit <n>", "max items", intOption("--limit", { min: 1 }))
    .option("--prefix <p>", "filter by slug prefix")
    .action(async (opts, cmd: Command) => {
      const ctx = await buildContext();
      const items = await ctx.service.list({
        limit: opts.limit,
        prefix: opts.prefix,
      });
      emit(cmd, () => formatList(items), items);
    });
}

function formatList(items: PublicationSummary[]): string {
  if (items.length === 0) return "no publications";
  const lines = items.map((p) => `${p.id}  (updated ${p.updatedAt.slice(0, 10)})`);
  const count = `${items.length} publication${items.length === 1 ? "" : "s"}`;
  return `${lines.join("\n")}\n\n${count}`;
}
