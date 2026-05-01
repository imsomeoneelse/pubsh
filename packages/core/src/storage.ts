import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  type PublicationMeta,
  type PublicationSummary,
  type S3Config,
  PublicationMetaSchema,
} from "./types.js";
import { StorageError } from "./errors.js";

export interface PutPublicInput {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageDeleteResult {
  status: number;
}

export interface StorageProvider {
  putPublic(input: PutPublicInput): Promise<{ url: string }>;
  getPublic(key: string): Promise<Buffer>;
  deletePublic(key: string): Promise<StorageDeleteResult>;
  publicUrl(key: string): string;

  putMeta(meta: PublicationMeta): Promise<void>;
  getMeta(slug: string): Promise<PublicationMeta | null>;
  deleteMeta(slug: string): Promise<StorageDeleteResult>;
  /** Cheap enumeration via a single LIST — returns slug + LastModified per key. */
  listSummaries(prefix?: string): Promise<PublicationSummary[]>;
  /** Full enumeration — N+1 GETs to read each meta JSON. Avoid on large buckets. */
  listMeta(prefix?: string): Promise<PublicationMeta[]>;

  metaKey(slug: string): string;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putPublic(input: PutPublicInput): Promise<{ url: string }> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.publicBucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ACL: this.config.publicAcl as never,
          ...(input.metadata && { Metadata: input.metadata }),
        }),
      );
    } catch (err) {
      throw new StorageError(
        `S3 put ${this.config.publicBucket}/${input.key} failed: ${(err as Error).message}`,
        err,
      );
    }
    return { url: this.publicUrl(input.key) };
  }

  async getPublic(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.publicBucket, Key: key }),
      );
      if (!res.Body) throw new StorageError(`empty body for ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      throw new StorageError(
        `S3 get ${this.config.publicBucket}/${key} failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  async deletePublic(key: string): Promise<StorageDeleteResult> {
    try {
      const res = await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.publicBucket, Key: key }),
      );
      return { status: res.$metadata.httpStatusCode ?? 204 };
    } catch (err) {
      throw new StorageError(
        `S3 delete ${this.config.publicBucket}/${key} failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  publicUrl(key: string): string {
    const host = new URL(this.config.endpoint).host;
    return this.config.publicUrlPattern
      .replace("{host}", host)
      .replace("{bucket}", this.config.publicBucket)
      .replace("{key}", key);
  }

  metaKey(slug: string): string {
    return `${this.config.metaPrefix}${slug}.json`;
  }

  async putMeta(meta: PublicationMeta): Promise<void> {
    const key = this.metaKey(meta.slug);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.privateBucket,
          Key: key,
          Body: Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
          ContentType: "application/json; charset=utf-8",
        }),
      );
    } catch (err) {
      throw new StorageError(
        `S3 put ${this.config.privateBucket}/${key} failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  async getMeta(slug: string): Promise<PublicationMeta | null> {
    const key = this.metaKey(slug);
    let text: string;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.privateBucket, Key: key }),
      );
      if (!res.Body) return null;
      text = await res.Body.transformToString("utf-8");
    } catch (err) {
      if (isNotFound(err)) return null;
      throw new StorageError(
        `S3 get ${this.config.privateBucket}/${key} failed: ${(err as Error).message}`,
        err,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new StorageError(
        `meta at ${this.config.privateBucket}/${key} is not valid JSON: ${(err as Error).message}`,
        err,
      );
    }
    const parsed = PublicationMetaSchema.safeParse(raw);
    if (!parsed.success) {
      throw new StorageError(
        `meta at ${this.config.privateBucket}/${key} failed schema validation: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        parsed.error,
      );
    }
    return parsed.data;
  }

  async deleteMeta(slug: string): Promise<StorageDeleteResult> {
    const key = this.metaKey(slug);
    try {
      const res = await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.privateBucket, Key: key }),
      );
      return { status: res.$metadata.httpStatusCode ?? 204 };
    } catch (err) {
      throw new StorageError(
        `S3 delete ${this.config.privateBucket}/${key} failed: ${(err as Error).message}`,
        err,
      );
    }
  }

  async listSummaries(prefix?: string): Promise<PublicationSummary[]> {
    const fullPrefix = prefix
      ? `${this.config.metaPrefix}${prefix}`
      : this.config.metaPrefix;

    const summaries: PublicationSummary[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.privateBucket,
          Prefix: fullPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || !obj.Key.endsWith(".json")) continue;
        const id = obj.Key.slice(this.config.metaPrefix.length, -".json".length);
        if (!id) continue;
        summaries.push({
          id,
          updatedAt: (obj.LastModified ?? new Date(0)).toISOString(),
        });
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);

    return summaries;
  }

  async listMeta(prefix?: string): Promise<PublicationMeta[]> {
    const summaries = await this.listSummaries(prefix);
    const results: PublicationMeta[] = [];
    for (const s of summaries) {
      const meta = await this.getMeta(s.id);
      if (meta) results.push(meta);
    }
    return results;
  }
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}

export function createS3Storage(config: S3Config): StorageProvider {
  return new S3StorageProvider(config);
}
