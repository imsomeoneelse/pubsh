import { type Config, ConfigSchema } from "./types.js";
import { ConfigError } from "./errors.js";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Pure mapping from env vars (PUBSH_*) to a partial Config. No filesystem,
 * no defaults — just translation. Safe to call in any runtime (MCP subprocess,
 * Lambda, browser-like sandbox).
 */
export function loadConfigFromEnv(
  env: Record<string, string | undefined>,
): DeepPartial<Config> {
  const out: DeepPartial<Config> = {};
  const s3: DeepPartial<Config["s3"]> = {};
  const encryption: DeepPartial<Config["encryption"]> = {};

  if (env.PUBSH_S3_ENDPOINT) s3.endpoint = env.PUBSH_S3_ENDPOINT;
  if (env.PUBSH_S3_REGION) s3.region = env.PUBSH_S3_REGION;
  if (env.PUBSH_S3_ACCESS_KEY_ID) s3.accessKeyId = env.PUBSH_S3_ACCESS_KEY_ID;
  if (env.PUBSH_S3_SECRET_ACCESS_KEY) s3.secretAccessKey = env.PUBSH_S3_SECRET_ACCESS_KEY;
  if (env.PUBSH_S3_PUBLIC_BUCKET) s3.publicBucket = env.PUBSH_S3_PUBLIC_BUCKET;
  if (env.PUBSH_S3_PRIVATE_BUCKET) s3.privateBucket = env.PUBSH_S3_PRIVATE_BUCKET;
  if (env.PUBSH_S3_META_PREFIX) s3.metaPrefix = env.PUBSH_S3_META_PREFIX;
  if (env.PUBSH_S3_PUBLIC_ACL) s3.publicAcl = env.PUBSH_S3_PUBLIC_ACL;
  if (env.PUBSH_S3_PUBLIC_URL_PATTERN) s3.publicUrlPattern = env.PUBSH_S3_PUBLIC_URL_PATTERN;
  if (env.PUBSH_S3_FORCE_PATH_STYLE) {
    s3.forcePathStyle = env.PUBSH_S3_FORCE_PATH_STYLE === "true";
  }

  if (env.PUBSH_REMEMBER_DAYS) {
    const n = Number.parseInt(env.PUBSH_REMEMBER_DAYS, 10);
    if (Number.isFinite(n)) encryption.rememberDays = n;
  }
  if (env.PUBSH_TEMPLATE_PATH) encryption.templatePath = env.PUBSH_TEMPLATE_PATH;

  if (Object.keys(s3).length > 0) out.s3 = s3;
  if (Object.keys(encryption).length > 0) out.encryption = encryption;
  return out;
}

/**
 * Validate an arbitrary object against the Config schema. Throws ConfigError
 * with a structured message on failure. Pure — no IO.
 */
export function validateConfig(raw: unknown): Config {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(
      `invalid pubsh config: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      parsed.error,
    );
  }
  return parsed.data;
}

/**
 * Deep-merge two `DeepPartial<Config>` layers. Right side wins for scalars;
 * objects merge recursively. Pure — no IO.
 */
export function mergeConfigLayers<T>(
  a: DeepPartial<T>,
  b: DeepPartial<T>,
): DeepPartial<T> {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    const existing = out[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[k] = mergeConfigLayers(
        existing as DeepPartial<unknown>,
        v as DeepPartial<unknown>,
      );
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as DeepPartial<T>;
}
