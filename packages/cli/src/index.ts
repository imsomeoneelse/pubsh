#!/usr/bin/env node
import { Command } from "commander";
import { PubshError } from "@pubsh/core";
import { registerInit } from "./commands/init.js";
import { registerPublish } from "./commands/publish.js";
import { registerList } from "./commands/list.js";
import { registerUpdate } from "./commands/update.js";
import { registerDelete } from "./commands/delete.js";
import { registerInfo } from "./commands/info.js";
import { registerDownload } from "./commands/download.js";

const program = new Command();

program
  .name("pubsh")
  .description("Encrypt HTML and publish to S3")
  .version("0.0.1")
  .option("--json", "machine-readable JSON output", false);

registerInit(program);
registerPublish(program);
registerList(program);
registerUpdate(program);
registerDelete(program);
registerInfo(program);
registerDownload(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof PubshError) {
    process.stderr.write(`error [${err.code}]: ${err.message}\n`);
  } else if (err instanceof Error) {
    process.stderr.write(`error: ${err.message}\n`);
  } else {
    process.stderr.write(`error: ${String(err)}\n`);
  }
  process.exit(1);
});
