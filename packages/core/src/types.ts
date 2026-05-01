import { z } from "zod";

export const S3ConfigSchema = z.object({
  endpoint: z.string().url().default("https://storage.yandexcloud.net"),
  region: z.string().min(1).default("ru-central1"),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  publicBucket: z.string().min(1),
  privateBucket: z.string().min(1),
  metaPrefix: z.string().default("_meta/"),
  publicAcl: z.string().default("public-read"),
  publicUrlPattern: z
    .string()
    .default("https://{host}/{bucket}/{key}")
    .describe(
      "Pattern for the public URL. Supports {host}, {bucket}, {key} placeholders.",
    ),
  forcePathStyle: z.boolean().default(true),
});
export type S3Config = z.infer<typeof S3ConfigSchema>;

export const EncryptionConfigSchema = z.object({
  rememberDays: z.number().int().nonnegative().default(30),
  templatePath: z.string().optional(),
});
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;

export const ConfigSchema = z.object({
  s3: S3ConfigSchema,
  encryption: EncryptionConfigSchema.default({}),
  defaults: z
    .object({
      indexFile: z.string().default("index.html"),
    })
    .default({}),
});
export type Config = z.infer<typeof ConfigSchema>;

export const PublicationMetaSchema = z.object({
  /** On-disk id field. Historically named `slug`; kept for compat. */
  slug: z.string().min(1),
  key: z.string().min(1),
  password: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  clientName: z.string().optional(),
});
export type PublicationMeta = z.infer<typeof PublicationMetaSchema>;

export interface Publication {
  id: string;
  url: string;
  password: string;
  clientName?: string;
  createdAt: string;
  updatedAt: string;
  key: string;
}

export interface PublicationSummary {
  id: string;
  updatedAt: string;
}

export interface PublishInput {
  /**
   * Source HTML content. The caller is responsible for reading from disk
   * if needed — core stays I/O-agnostic about input.
   */
  html: string;
  /**
   * Unique publication id. Must satisfy `isValidId` (lowercase a-z0-9-, ≤80
   * chars, no leading/trailing dash). Callers can derive one from a client's
   * full name via the `slug()` helper.
   */
  id: string;
  /** Optional human-readable client name — stored in meta for display only. */
  clientName?: string;
  password?: string;
  /** Per-publication override of the staticrypt wrapper template. */
  templatePath?: string;
}

export interface PublishResult {
  publication: Publication;
  isUpdate: boolean;
  mode: "new" | "update";
}

export interface UpdateInput {
  id: string;
  /** New source HTML content (caller reads from disk if needed). */
  html: string;
  /** Optional update of the human-readable client name in meta. */
  clientName?: string;
  /** Per-publication override of the staticrypt wrapper template. */
  templatePath?: string;
}

export interface DeleteInput {
  id: string;
  confirm?: boolean;
}

export interface DeleteResult {
  mode: "dry-run" | "deleted";
  publication: Publication;
  htmlDeleteStatus?: number;
  metaDeleteStatus?: number;
  deletedAt?: string;
}

export interface DownloadInput {
  id: string;
}

export interface DownloadResult {
  publication: Publication;
  /** Decrypted source HTML, in memory. Callers decide what to do with it. */
  html: string;
  decryptedBytes: number;
}

export interface ListOptions {
  limit?: number;
  prefix?: string;
}
