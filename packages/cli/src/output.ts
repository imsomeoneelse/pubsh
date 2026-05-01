import type { Command } from "commander";

export type OutputFormat = "human" | "json";

export function getOutputFormat(cmd: Command): OutputFormat {
  const opts = cmd.optsWithGlobals<{ json?: boolean }>();
  return opts.json ? "json" : "human";
}

export function emit(cmd: Command, human: () => string, data: unknown): void {
  if (getOutputFormat(cmd) === "json") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${human()}\n`);
  }
}
