import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError } from "@pubsh/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultGlobalConfigPath, loadConfig } from "./config.js";

const fullS3 = {
  endpoint: "https://example.com",
  region: "ru-central1",
  accessKeyId: "AK",
  secretAccessKey: "SK",
  publicBucket: "pub",
  privateBucket: "priv",
};

describe("defaultGlobalConfigPath()", () => {
  const originalXdg = process.env.XDG_CONFIG_HOME;
  afterEach(() => {
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
  });

  it("uses $XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg";
    expect(defaultGlobalConfigPath()).toBe("/tmp/xdg/pubsh/config.json");
  });

  it("falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    delete process.env.XDG_CONFIG_HOME;
    expect(defaultGlobalConfigPath()).toMatch(
      /\/\.config\/pubsh\/config\.json$/,
    );
  });
});

describe("loadConfig() — single source", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pubsh-cli-config-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("loads from a global config file", () => {
    const path = join(tmp, "global.json");
    writeFileSync(path, JSON.stringify({ s3: fullS3 }), "utf8");
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: path,
      env: {},
    });
    expect(cfg.s3.accessKeyId).toBe("AK");
    expect(cfg.s3.endpoint).toBe("https://example.com");
  });

  it("loads from pubsh.config.json in cwd", () => {
    writeFileSync(
      join(tmp, "pubsh.config.json"),
      JSON.stringify({ s3: fullS3 }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: "/nonexistent",
      env: {},
    });
    expect(cfg.s3.accessKeyId).toBe("AK");
  });

  it("also accepts .pubsh.json as a local filename", () => {
    writeFileSync(
      join(tmp, ".pubsh.json"),
      JSON.stringify({ s3: fullS3 }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: "/nonexistent",
      env: {},
    });
    expect(cfg.s3.accessKeyId).toBe("AK");
  });

  it("prefers pubsh.config.json over .pubsh.json when both exist", () => {
    writeFileSync(
      join(tmp, "pubsh.config.json"),
      JSON.stringify({ s3: { ...fullS3, accessKeyId: "FROM_PUBSH_JSON" } }),
      "utf8",
    );
    writeFileSync(
      join(tmp, ".pubsh.json"),
      JSON.stringify({ s3: { ...fullS3, accessKeyId: "FROM_DOTFILE" } }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: "/nonexistent",
      env: {},
    });
    expect(cfg.s3.accessKeyId).toBe("FROM_PUBSH_JSON");
  });

  it("loads entirely from PUBSH_* env vars", () => {
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: "/nonexistent",
      env: {
        PUBSH_S3_ENDPOINT: "https://env.example.com",
        PUBSH_S3_REGION: "us-east-1",
        PUBSH_S3_ACCESS_KEY_ID: "ENV_AK",
        PUBSH_S3_SECRET_ACCESS_KEY: "ENV_SK",
        PUBSH_S3_PUBLIC_BUCKET: "env-pub",
        PUBSH_S3_PRIVATE_BUCKET: "env-priv",
      },
    });
    expect(cfg.s3.accessKeyId).toBe("ENV_AK");
    expect(cfg.s3.endpoint).toBe("https://env.example.com");
  });

  it("throws ConfigError when no source provides required fields", () => {
    expect(() =>
      loadConfig({ cwd: tmp, globalConfigPath: "/nonexistent", env: {} }),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError when a config file is malformed JSON", () => {
    const path = join(tmp, "global.json");
    writeFileSync(path, "{ not json", "utf8");
    expect(() =>
      loadConfig({ cwd: tmp, globalConfigPath: path, env: {} }),
    ).toThrow(ConfigError);
  });
});

describe("loadConfig() — layering", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pubsh-cli-layer-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("local overrides global for same field", () => {
    const globalPath = join(tmp, "global.json");
    mkdirSync(join(tmp, "work"));
    writeFileSync(
      globalPath,
      JSON.stringify({ s3: { ...fullS3, region: "global-region" } }),
      "utf8",
    );
    writeFileSync(
      join(tmp, "work", "pubsh.config.json"),
      JSON.stringify({ s3: { region: "local-region" } }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: join(tmp, "work"),
      globalConfigPath: globalPath,
      env: {},
    });
    expect(cfg.s3.region).toBe("local-region");
    expect(cfg.s3.accessKeyId).toBe("AK"); // inherited from global
  });

  it("env overrides both global and local", () => {
    const globalPath = join(tmp, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({ s3: { ...fullS3, region: "global-region" } }),
      "utf8",
    );
    writeFileSync(
      join(tmp, "pubsh.config.json"),
      JSON.stringify({ s3: { region: "local-region" } }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: globalPath,
      env: { PUBSH_S3_REGION: "env-region" },
    });
    expect(cfg.s3.region).toBe("env-region");
  });

  it("cliOverrides win over everything", () => {
    const globalPath = join(tmp, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({ s3: { ...fullS3, region: "global-region" } }),
      "utf8",
    );
    writeFileSync(
      join(tmp, "pubsh.config.json"),
      JSON.stringify({ s3: { region: "local-region" } }),
      "utf8",
    );
    const cfg = loadConfig({
      cwd: tmp,
      globalConfigPath: globalPath,
      env: { PUBSH_S3_REGION: "env-region" },
      cliOverrides: { s3: { region: "cli-region" } },
    });
    expect(cfg.s3.region).toBe("cli-region");
  });
});
