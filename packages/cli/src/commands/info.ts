import type { Command } from "commander";
import { buildContext } from "../context.js";
import { emit } from "../output.js";

export function registerInfo(program: Command): void {
  program
    .command("info <id>")
    .description("show details of a publication")
    .action(async (id: string, _opts, cmd: Command) => {
      const ctx = await buildContext();
      const item = await ctx.service.info(id);
      emit(
        cmd,
        () =>
          [
            `id:        ${item.id}`,
            `client:    ${item.clientName ?? "(not stored)"}`,
            `url:       ${item.url}`,
            `password:  ${item.password}`,
            `key:       ${item.key}`,
            `created:   ${item.createdAt}`,
            `updated:   ${item.updatedAt}`,
          ].join("\n"),
        item,
      );
    });
}
