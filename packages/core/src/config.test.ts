import { describe, expect, it } from "vitest";
import {
  type DeepPartial,
  loadConfigFromEnv,
  mergeConfigLayers,
  validateConfig,
} from "./config.js";
import { ConfigError } from "./errors.js";
import type { Config } from "./types.js";

const fullS3 = {
  endpoint: "https://example.com",
  region: "ru-central1",
  accessKeyId: "AK",
  secretAccessKey: "SK",
  publicBucket: "public",
  privateBucket: "private",
};

describe("loadConfigFromEnv()", () => {
  it("returns empty object when no PUBSH_ vars are set", () => {
    expect(loadConfigFromEnv({})).toEqual({});
  });

  it("ignores unrelated env vars", () => {
    expect(loadConfigFromEnv({ HOME: "/x", PATH: "/bin" })).toEqual({});
  });

  it("maps every PUBSH_S3_ var to s3 config", () => {
    const result = loadConfigFromEnv({
      PUBSH_S3_ENDPOINT: "https://s3.example.com",
      PUBSH_S3_REGION: "us-east-1",
      PUBSH_S3_ACCESS_KEY_ID: "AKIA",
      PUBSH_S3_SECRET_ACCESS_KEY: "SECRET",
      PUBSH_S3_PUBLIC_BUCKET: "pub",
      PUBSH_S3_PRIVATE_BUCKET: "priv",
      PUBSH_S3_META_PREFIX: "meta/",
      PUBSH_S3_PUBLIC_ACL: "public-read",
      PUBSH_S3_PUBLIC_URL_PATTERN: "https://{host}/{key}",
    });
    expect(result.s3).toEqual({
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "SECRET",
      publicBucket: "pub",
      privateBucket: "priv",
      metaPrefix: "meta/",
      publicAcl: "public-read",
      publicUrlPattern: "https://{host}/{key}",
    });
  });

  it("parses PUBSH_S3_FORCE_PATH_STYLE 'true' as boolean true", () => {
    expect(
      loadConfigFromEnv({ PUBSH_S3_FORCE_PATH_STYLE: "true" }).s3?.forcePathStyle,
    ).toBe(true);
  });

  it("parses anything other than 'true' as boolean false", () => {
    expect(
      loadConfigFromEnv({ PUBSH_S3_FORCE_PATH_STYLE: "false" }).s3?.forcePathStyle,
    ).toBe(false);
    expect(
      loadConfigFromEnv({ PUBSH_S3_FORCE_PATH_STYLE: "1" }).s3?.forcePathStyle,
    ).toBe(false);
  });

  it("maps encryption env vars", () => {
    const result = loadConfigFromEnv({
      PUBSH_REMEMBER_DAYS: "7",
      PUBSH_TEMPLATE_PATH: "/tmp/tpl.html",
    });
    expect(result.encryption).toEqual({
      rememberDays: 7,
      templatePath: "/tmp/tpl.html",
    });
  });

  it("ignores PUBSH_REMEMBER_DAYS that does not parse to a finite number", () => {
    const result = loadConfigFromEnv({ PUBSH_REMEMBER_DAYS: "not-a-number" });
    expect(result.encryption).toBeUndefined();
  });

  it("ignores empty string env vars (treated as falsy)", () => {
    const result = loadConfigFromEnv({
      PUBSH_S3_ENDPOINT: "",
      PUBSH_S3_REGION: "",
    });
    expect(result.s3).toBeUndefined();
  });

  it("does not include encryption key when only s3 is set", () => {
    const result = loadConfigFromEnv({ PUBSH_S3_REGION: "us-west-2" });
    expect(result).toEqual({ s3: { region: "us-west-2" } });
    expect(result.encryption).toBeUndefined();
  });
});

describe("validateConfig()", () => {
  it("accepts a minimal valid config and applies schema defaults", () => {
    const cfg = validateConfig({ s3: fullS3 });
    expect(cfg.s3.endpoint).toBe("https://example.com");
    expect(cfg.s3.metaPrefix).toBe("_meta/");
    expect(cfg.s3.publicAcl).toBe("public-read");
    expect(cfg.s3.forcePathStyle).toBe(true);
    expect(cfg.encryption.rememberDays).toBe(30);
    expect(cfg.defaults.indexFile).toBe("index.html");
  });

  it("throws ConfigError when required s3 fields are missing", () => {
    expect(() => validateConfig({ s3: {} })).toThrow(ConfigError);
  });

  it("throws ConfigError with structured path/message info", () => {
    try {
      validateConfig({ s3: { ...fullS3, publicBucket: "" } });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as ConfigError).message;
      expect(msg).toContain("invalid pubsh config");
      expect(msg).toContain("s3.publicBucket");
    }
  });

  it("throws when endpoint is not a URL", () => {
    expect(() =>
      validateConfig({ s3: { ...fullS3, endpoint: "not a url" } }),
    ).toThrow(ConfigError);
  });

  it("throws when rememberDays is negative", () => {
    expect(() =>
      validateConfig({ s3: fullS3, encryption: { rememberDays: -1 } }),
    ).toThrow(ConfigError);
  });
});

describe("mergeConfigLayers()", () => {
  it("right side wins for scalars", () => {
    const a: DeepPartial<Config> = { s3: { region: "ru-central1" } };
    const b: DeepPartial<Config> = { s3: { region: "us-east-1" } };
    expect(mergeConfigLayers(a, b)).toEqual({ s3: { region: "us-east-1" } });
  });

  it("recursively merges nested objects", () => {
    const a: DeepPartial<Config> = {
      s3: { region: "ru-central1", accessKeyId: "AK1" },
    };
    const b: DeepPartial<Config> = {
      s3: { accessKeyId: "AK2", publicBucket: "pub" },
    };
    expect(mergeConfigLayers(a, b)).toEqual({
      s3: { region: "ru-central1", accessKeyId: "AK2", publicBucket: "pub" },
    });
  });

  it("undefined values on the right do not overwrite the left", () => {
    const a: DeepPartial<Config> = { s3: { region: "ru-central1" } };
    // exactOptionalPropertyTypes blocks `{ region: undefined }` literals;
    // cast through unknown to test the runtime guard explicitly.
    const b = { s3: { region: undefined } } as unknown as DeepPartial<Config>;
    expect(mergeConfigLayers(a, b)).toEqual({ s3: { region: "ru-central1" } });
  });

  it("does not mutate either input", () => {
    const a: DeepPartial<Config> = { s3: { region: "ru-central1" } };
    const b: DeepPartial<Config> = { s3: { region: "us-east-1" } };
    const aCopy = JSON.parse(JSON.stringify(a));
    const bCopy = JSON.parse(JSON.stringify(b));
    mergeConfigLayers(a, b);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  it("merges three layers via two calls", () => {
    const base: DeepPartial<Config> = { s3: { region: "ru-central1" } };
    const env: DeepPartial<Config> = { s3: { accessKeyId: "AK" } };
    const cli: DeepPartial<Config> = { s3: { region: "us-east-1" } };
    const merged = mergeConfigLayers(mergeConfigLayers(base, env), cli);
    expect(merged).toEqual({
      s3: { region: "us-east-1", accessKeyId: "AK" },
    });
  });
});
