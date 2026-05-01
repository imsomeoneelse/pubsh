import { describe, expect, it } from "vitest";
import {
  ConfigError,
  CryptoError,
  NotFoundError,
  PubshError,
  StorageError,
} from "./errors.js";

describe("PubshError", () => {
  it("carries message, code, and optional cause", () => {
    const cause = new Error("inner");
    const err = new PubshError("boom", "CUSTOM_CODE", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PubshError);
    expect(err.message).toBe("boom");
    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("PubshError");
  });

  it("works without a cause", () => {
    const err = new PubshError("boom", "X");
    expect(err.cause).toBeUndefined();
  });
});

describe("ConfigError", () => {
  it("uses CONFIG_ERROR code and own name", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(PubshError);
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.name).toBe("ConfigError");
  });
});

describe("StorageError", () => {
  it("uses STORAGE_ERROR code, preserves cause", () => {
    const cause = new Error("S3 down");
    const err = new StorageError("upload failed", cause);
    expect(err).toBeInstanceOf(PubshError);
    expect(err.code).toBe("STORAGE_ERROR");
    expect(err.name).toBe("StorageError");
    expect(err.cause).toBe(cause);
  });
});

describe("CryptoError", () => {
  it("uses CRYPTO_ERROR code", () => {
    const err = new CryptoError("decrypt failed");
    expect(err).toBeInstanceOf(PubshError);
    expect(err.code).toBe("CRYPTO_ERROR");
    expect(err.name).toBe("CryptoError");
  });
});

describe("NotFoundError", () => {
  it("uses NOT_FOUND code", () => {
    const err = new NotFoundError("missing");
    expect(err).toBeInstanceOf(PubshError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.name).toBe("NotFoundError");
  });
});
