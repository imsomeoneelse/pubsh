import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import {
  type Config,
  type DeepPartial,
  ConfigError,
  loadConfigFromEnv,
  mergeConfigLayers,
  validateConfig,
} from "@pubsh/core";

export interface LoadConfigOptions {
  cwd?: string;
  globalConfigPath?: string;
  cliOverrides?: DeepPartial<Config>;
  env?: NodeJS.ProcessEnv;
}

const LOCAL_FILENAMES = ["pubsh.config.json", ".pubsh.json"];

export function defaultGlobalConfigPath(): string {
  return resolve(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "pubsh",
    "config.json",
  );
}

/**
 * CLI-side config loader. Merges layers in order of increasing precedence:
 *   1. ~/.config/pubsh/config.json (global)
 *   2. ./pubsh.config.json or ./.pubsh.json (local, first match wins)
 *   3. PUBSH_* environment variables
 *   4. CLI flags passed via `cliOverrides`
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const globalPath = options.globalConfigPath ?? defaultGlobalConfigPath();

  const layers: DeepPartial<Config>[] = [];

  if (existsSync(globalPath)) layers.push(readJson(globalPath));

  for (const name of LOCAL_FILENAMES) {
    const p = resolve(cwd, name);
    if (existsSync(p)) {
      layers.push(readJson(p));
      break;
    }
  }

  layers.push(loadConfigFromEnv(env));
  if (options.cliOverrides) layers.push(options.cliOverrides);

  const merged = layers.reduce<DeepPartial<Config>>(
    (acc, layer) => mergeConfigLayers(acc, layer),
    {},
  );

  return validateConfig(merged);
}

function readJson(path: string): DeepPartial<Config> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeepPartial<Config>;
  } catch (err) {
    throw new ConfigError(`failed to read ${path}: ${(err as Error).message}`, err);
  }
}
