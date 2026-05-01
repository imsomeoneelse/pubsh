import { randomBytes } from "node:crypto";
import type {
  Config,
  DeleteInput,
  DeleteResult,
  DownloadInput,
  DownloadResult,
  ListOptions,
  Publication,
  PublicationMeta,
  PublicationSummary,
  PublishInput,
  PublishResult,
  UpdateInput,
} from "./types.js";
import { type Encryptor, createDefaultEncryptor } from "./crypto.js";
import { type StorageProvider, createS3Storage } from "./storage.js";
import { NotFoundError, PubshError } from "./errors.js";
import { isValidId, slug } from "./slug.js";

export interface PublicationServiceDeps {
  config: Config;
  storage?: StorageProvider;
  encryptor?: Encryptor;
}

export class PublicationService {
  private readonly storage: StorageProvider;
  private readonly encryptor: Encryptor;

  constructor(deps: PublicationServiceDeps) {
    this.storage = deps.storage ?? createS3Storage(deps.config.s3);
    this.encryptor =
      deps.encryptor ?? createDefaultEncryptor(deps.config.encryption);
  }

  /**
   * Derive a publication id from a human-readable string (e.g. client full
   * name). Pure helper — exposed on the service so that MCP/CLI consumers
   * have a single discoverable surface for the operation.
   */
  slug(input: string): string {
    return slug(input);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!input.html || input.html.length === 0) {
      throw new PubshError("html content is empty", "INVALID_HTML");
    }
    if (!isValidId(input.id)) {
      throw new PubshError(
        `invalid id "${input.id}"; must be 1–80 chars of [a-z0-9-] with no leading/trailing dash`,
        "INVALID_ID",
      );
    }

    const existing = await this.storage.getMeta(input.id);
    let key: string;
    let password: string;
    let createdAt: string;
    let isUpdate: boolean;

    if (existing && existing.password && existing.key) {
      isUpdate = true;
      key = existing.key;
      password = existing.password;
      createdAt = existing.createdAt;
    } else {
      isUpdate = false;
      password = input.password ?? randomBytes(20).toString("base64url");
      const suffix = randomBytes(8).toString("hex");
      key = `${input.id}-${suffix}.html`;
      createdAt = new Date().toISOString();
    }

    const encrypted = await this.encryptor.encrypt({
      html: input.html,
      password,
      ...(input.templatePath ? { templatePath: input.templatePath } : {}),
    });

    await this.storage.putPublic({
      key,
      body: Buffer.from(encrypted.html, "utf8"),
      contentType: "text/html; charset=utf-8",
    });

    const updatedAt = new Date().toISOString();
    const clientName = input.clientName ?? existing?.clientName;
    const meta: PublicationMeta = {
      slug: input.id,
      key,
      password,
      createdAt,
      updatedAt,
      ...(clientName ? { clientName } : {}),
    };
    await this.storage.putMeta(meta);

    return {
      publication: this.toPublication(meta),
      isUpdate,
      mode: isUpdate ? "update" : "new",
    };
  }

  async update(input: UpdateInput): Promise<PublishResult> {
    const meta = await this.storage.getMeta(input.id);
    if (!meta) throw new NotFoundError(`no publication for id "${input.id}"`);
    return this.publish({
      html: input.html,
      id: input.id,
      ...(input.clientName !== undefined
        ? { clientName: input.clientName }
        : meta.clientName
          ? { clientName: meta.clientName }
          : {}),
      ...(input.templatePath ? { templatePath: input.templatePath } : {}),
    });
  }

  async delete(input: DeleteInput): Promise<DeleteResult> {
    const meta = await this.storage.getMeta(input.id);
    if (!meta) throw new NotFoundError(`no publication for id "${input.id}"`);

    const publication = this.toPublication(meta);
    if (!input.confirm) {
      return { mode: "dry-run", publication };
    }

    const htmlRes = await this.storage.deletePublic(meta.key);
    const metaRes = await this.storage.deleteMeta(input.id);
    return {
      mode: "deleted",
      publication,
      htmlDeleteStatus: htmlRes.status,
      metaDeleteStatus: metaRes.status,
      deletedAt: new Date().toISOString(),
    };
  }

  async list(options: ListOptions = {}): Promise<PublicationSummary[]> {
    const summaries = await this.storage.listSummaries(options.prefix);
    summaries.sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
    return options.limit !== undefined
      ? summaries.slice(0, options.limit)
      : summaries;
  }

  async info(id: string): Promise<Publication> {
    const meta = await this.storage.getMeta(id);
    if (!meta) throw new NotFoundError(`no publication for id "${id}"`);
    return this.toPublication(meta);
  }

  async download(input: DownloadInput): Promise<DownloadResult> {
    const meta = await this.storage.getMeta(input.id);
    if (!meta) throw new NotFoundError(`no publication for id "${input.id}"`);

    const wrapper = await this.storage.getPublic(meta.key);
    const decrypted = await this.encryptor.decrypt({
      encryptedHtml: wrapper.toString("utf8"),
      password: meta.password,
    });

    return {
      publication: this.toPublication(meta),
      html: decrypted.html,
      decryptedBytes: Buffer.byteLength(decrypted.html, "utf8"),
    };
  }

  private toPublication(meta: PublicationMeta): Publication {
    return {
      id: meta.slug,
      url: this.storage.publicUrl(meta.key),
      password: meta.password,
      ...(meta.clientName ? { clientName: meta.clientName } : {}),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      key: meta.key,
    };
  }
}

export function createPublicationService(
  deps: PublicationServiceDeps,
): PublicationService {
  return new PublicationService(deps);
}
