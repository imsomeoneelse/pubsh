import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { confirm, input, password } from "@inquirer/prompts";
import type { Command } from "commander";
import { validateConfig, type Config, type DeepPartial } from "@pubsh/core";
import { defaultGlobalConfigPath } from "../config.js";

const required = (v: string): boolean | string =>
  v.trim().length > 0 ? true : "required";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("interactive setup of S3 credentials and defaults")
    .option("-f, --force", "overwrite existing config without confirmation", false)
    .option(
      "-p, --path <path>",
      "config file path (default: ~/.config/pubsh/config.json)",
    )
    .action(async (opts) => {
      const configPath = opts.path ?? defaultGlobalConfigPath();
      const existing = readExistingConfig(configPath);

      if (existing && !opts.force) {
        const overwrite = await confirm({
          message: `${configPath} already exists — overwrite?`,
          default: false,
        });
        if (!overwrite) {
          process.stderr.write("aborted\n");
          process.exit(1);
        }
      }

      const endpoint = await input({
        message: "S3 endpoint",
        default: existing?.s3?.endpoint ?? "https://storage.yandexcloud.net",
        validate: required,
      });
      const region = await input({
        message: "S3 region",
        default: existing?.s3?.region ?? "ru-central1",
        validate: required,
      });
      const accessKeyId = await input({
        message: "Access key ID",
        ...(existing?.s3?.accessKeyId
          ? { default: existing.s3.accessKeyId }
          : {}),
        validate: required,
      });
      const secretAccessKey = await password({
        message: "Secret access key",
        mask: true,
        validate: required,
      });
      const publicBucket = await input({
        message: "Public bucket (encrypted HTML)",
        ...(existing?.s3?.publicBucket
          ? { default: existing.s3.publicBucket }
          : {}),
        validate: required,
      });
      const privateBucket = await input({
        message: "Private bucket (metadata)",
        ...(existing?.s3?.privateBucket
          ? { default: existing.s3.privateBucket }
          : {}),
        validate: required,
      });

      const cfg = {
        s3: {
          endpoint: endpoint.trim(),
          region: region.trim(),
          accessKeyId: accessKeyId.trim(),
          secretAccessKey,
          publicBucket: publicBucket.trim(),
          privateBucket: privateBucket.trim(),
        },
      };

      validateConfig(cfg);

      mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
      writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
      chmodSync(configPath, 0o600);

      process.stdout.write(`\n✓ config written to ${configPath}\n`);
      process.stdout.write("  test it with: pnpm cli list\n");
    });
}

function readExistingConfig(path: string): DeepPartial<Config> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeepPartial<Config>;
  } catch {
    return null;
  }
}
