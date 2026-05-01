export class PubshError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PubshError";
  }
}

export class ConfigError extends PubshError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG_ERROR", cause);
    this.name = "ConfigError";
  }
}

export class StorageError extends PubshError {
  constructor(message: string, cause?: unknown) {
    super(message, "STORAGE_ERROR", cause);
    this.name = "StorageError";
  }
}

export class CryptoError extends PubshError {
  constructor(message: string, cause?: unknown) {
    super(message, "CRYPTO_ERROR", cause);
    this.name = "CryptoError";
  }
}

export class NotFoundError extends PubshError {
  constructor(message: string) {
    super(message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
