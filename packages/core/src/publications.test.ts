import { beforeEach, describe, expect, it } from "vitest";
import type {
  DecryptInput,
  DecryptResult,
  EncryptInput,
  EncryptResult,
  Encryptor,
} from "./crypto.js";
import { NotFoundError, PubshError } from "./errors.js";
import {
  PublicationService,
  createPublicationService,
} from "./publications.js";
import type {
  PutPublicInput,
  StorageDeleteResult,
  StorageProvider,
} from "./storage.js";
import type {
  Config,
  PublicationMeta,
  PublicationSummary,
} from "./types.js";

const config: Config = {
  s3: {
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    accessKeyId: "AK",
    secretAccessKey: "SK",
    publicBucket: "public",
    privateBucket: "private",
    metaPrefix: "_meta/",
    publicAcl: "public-read",
    publicUrlPattern: "https://{host}/{bucket}/{key}",
    forcePathStyle: true,
  },
  encryption: { rememberDays: 30 },
  defaults: { indexFile: "index.html" },
};

class FakeStorage implements StorageProvider {
  public puts: PutPublicInput[] = [];
  public putMetas: PublicationMeta[] = [];
  public deletedPublic: string[] = [];
  public deletedMeta: string[] = [];
  public publics = new Map<string, Buffer>();
  public metas = new Map<string, PublicationMeta>();

  async putPublic(input: PutPublicInput): Promise<{ url: string }> {
    this.puts.push(input);
    this.publics.set(input.key, input.body);
    return { url: this.publicUrl(input.key) };
  }
  async getPublic(key: string): Promise<Buffer> {
    const v = this.publics.get(key);
    if (!v) throw new Error(`missing ${key}`);
    return v;
  }
  async deletePublic(key: string): Promise<StorageDeleteResult> {
    this.deletedPublic.push(key);
    this.publics.delete(key);
    return { status: 204 };
  }
  publicUrl(key: string): string {
    return `https://storage.yandexcloud.net/public/${key}`;
  }
  async putMeta(meta: PublicationMeta): Promise<void> {
    this.putMetas.push(meta);
    this.metas.set(meta.slug, meta);
  }
  async getMeta(slug: string): Promise<PublicationMeta | null> {
    return this.metas.get(slug) ?? null;
  }
  async deleteMeta(slug: string): Promise<StorageDeleteResult> {
    this.deletedMeta.push(slug);
    this.metas.delete(slug);
    return { status: 204 };
  }
  async listSummaries(prefix?: string): Promise<PublicationSummary[]> {
    return [...this.metas.values()]
      .filter((m) => (prefix ? m.slug.startsWith(prefix) : true))
      .map((m) => ({ id: m.slug, updatedAt: m.updatedAt }));
  }
  async listMeta(prefix?: string): Promise<PublicationMeta[]> {
    return [...this.metas.values()].filter((m) =>
      prefix ? m.slug.startsWith(prefix) : true,
    );
  }
  metaKey(slug: string): string {
    return `_meta/${slug}.json`;
  }
}

class FakeEncryptor implements Encryptor {
  public encryptCalls: EncryptInput[] = [];
  public decryptCalls: DecryptInput[] = [];

  async encrypt(input: EncryptInput): Promise<EncryptResult> {
    this.encryptCalls.push(input);
    return { html: `WRAP(${input.password}):${input.html}` };
  }
  async decrypt(input: DecryptInput): Promise<DecryptResult> {
    this.decryptCalls.push(input);
    const prefix = `WRAP(${input.password}):`;
    if (!input.encryptedHtml.startsWith(prefix)) {
      throw new Error("bad password");
    }
    return { html: input.encryptedHtml.slice(prefix.length) };
  }
}

function makeService(): {
  service: PublicationService;
  storage: FakeStorage;
  encryptor: FakeEncryptor;
} {
  const storage = new FakeStorage();
  const encryptor = new FakeEncryptor();
  const service = new PublicationService({ config, storage, encryptor });
  return { service, storage, encryptor };
}

describe("PublicationService construction", () => {
  it("createPublicationService returns a PublicationService", () => {
    const { storage, encryptor } = makeService();
    const svc = createPublicationService({ config, storage, encryptor });
    expect(svc).toBeInstanceOf(PublicationService);
  });

  it("exposes slug() helper that matches the standalone function", () => {
    const { service } = makeService();
    expect(service.slug("Иван Иванов")).toBe("ivan-ivanov");
  });
});

describe("publish() — new publication", () => {
  it("encrypts, uploads, and writes meta", async () => {
    const { service, storage, encryptor } = makeService();
    const result = await service.publish({
      html: "<h1>hello</h1>",
      id: "ivan",
      clientName: "Иван",
    });

    expect(result.mode).toBe("new");
    expect(result.isUpdate).toBe(false);
    expect(result.publication.id).toBe("ivan");
    expect(result.publication.clientName).toBe("Иван");
    expect(result.publication.password).toBeTruthy();
    expect(result.publication.url).toMatch(
      /^https:\/\/storage\.yandexcloud\.net\/public\/ivan-[0-9a-f]{16}\.html$/,
    );

    expect(encryptor.encryptCalls).toHaveLength(1);
    expect(encryptor.encryptCalls[0]!.html).toBe("<h1>hello</h1>");

    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0]!.contentType).toBe("text/html; charset=utf-8");
    expect(storage.puts[0]!.body.toString("utf8")).toBe(
      `WRAP(${result.publication.password}):<h1>hello</h1>`,
    );

    expect(storage.putMetas).toHaveLength(1);
    expect(storage.putMetas[0]).toMatchObject({
      slug: "ivan",
      clientName: "Иван",
      password: result.publication.password,
    });
  });

  it("uses caller-provided password when given", async () => {
    const { service } = makeService();
    const result = await service.publish({
      html: "<h1>hi</h1>",
      id: "ivan",
      password: "secret-passphrase",
    });
    expect(result.publication.password).toBe("secret-passphrase");
  });

  it("does not include clientName in meta when omitted", async () => {
    const { service, storage } = makeService();
    await service.publish({ html: "<h1>x</h1>", id: "ivan" });
    expect(storage.putMetas[0]).not.toHaveProperty("clientName");
  });

  it("forwards templatePath to the encryptor only when provided", async () => {
    const { service, encryptor } = makeService();
    await service.publish({
      html: "<h1>x</h1>",
      id: "ivan",
      templatePath: "/custom/tpl.html",
    });
    expect(encryptor.encryptCalls[0]!.templatePath).toBe("/custom/tpl.html");

    await service.publish({ html: "<h1>x</h1>", id: "petya" });
    expect(encryptor.encryptCalls[1]!.templatePath).toBeUndefined();
  });

  it("rejects empty html", async () => {
    const { service } = makeService();
    await expect(
      service.publish({ html: "", id: "ivan" }),
    ).rejects.toMatchObject({
      code: "INVALID_HTML",
    });
  });

  it("rejects invalid id", async () => {
    const { service } = makeService();
    await expect(
      service.publish({ html: "<h1>x</h1>", id: "Invalid Id" }),
    ).rejects.toBeInstanceOf(PubshError);
    await expect(
      service.publish({ html: "<h1>x</h1>", id: "Invalid Id" }),
    ).rejects.toMatchObject({ code: "INVALID_ID" });
  });
});

describe("publish() — re-publish over an existing id", () => {
  it("preserves password, key, and createdAt; bumps updatedAt", async () => {
    const { service, storage } = makeService();
    const first = await service.publish({ html: "<h1>v1</h1>", id: "ivan" });
    const firstMeta = storage.putMetas[0]!;

    const second = await service.publish({ html: "<h1>v2</h1>", id: "ivan" });

    expect(second.mode).toBe("update");
    expect(second.isUpdate).toBe(true);
    expect(second.publication.password).toBe(first.publication.password);
    expect(second.publication.key).toBe(first.publication.key);
    expect(second.publication.createdAt).toBe(firstMeta.createdAt);
    expect(second.publication.updatedAt >= firstMeta.updatedAt).toBe(true);
  });

  it("preserves existing clientName when re-publish omits it", async () => {
    const { service, storage } = makeService();
    await service.publish({
      html: "<h1>v1</h1>",
      id: "ivan",
      clientName: "Иван",
    });
    await service.publish({ html: "<h1>v2</h1>", id: "ivan" });
    expect(storage.putMetas.at(-1)!.clientName).toBe("Иван");
  });

  it("overrides clientName when re-publish supplies a new one", async () => {
    const { service, storage } = makeService();
    await service.publish({
      html: "<h1>v1</h1>",
      id: "ivan",
      clientName: "Old",
    });
    await service.publish({
      html: "<h1>v2</h1>",
      id: "ivan",
      clientName: "New",
    });
    expect(storage.putMetas.at(-1)!.clientName).toBe("New");
  });
});

describe("update()", () => {
  it("re-publishes through publish() when meta exists", async () => {
    const { service, storage } = makeService();
    await service.publish({ html: "<h1>v1</h1>", id: "ivan" });
    const result = await service.update({
      html: "<h1>v2</h1>",
      id: "ivan",
    });
    expect(result.mode).toBe("update");
    expect(storage.puts).toHaveLength(2);
  });

  it("throws NotFoundError when no meta exists", async () => {
    const { service } = makeService();
    await expect(
      service.update({ html: "<h1>x</h1>", id: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("can clear/override clientName via update()", async () => {
    const { service, storage } = makeService();
    await service.publish({
      html: "<h1>v1</h1>",
      id: "ivan",
      clientName: "Old",
    });
    await service.update({
      html: "<h1>v2</h1>",
      id: "ivan",
      clientName: "New",
    });
    expect(storage.putMetas.at(-1)!.clientName).toBe("New");
  });
});

describe("delete()", () => {
  let svc: ReturnType<typeof makeService>;
  beforeEach(async () => {
    svc = makeService();
    await svc.service.publish({ html: "<h1>v1</h1>", id: "ivan" });
  });

  it("returns dry-run by default and does not touch storage", async () => {
    const result = await svc.service.delete({ id: "ivan" });
    expect(result.mode).toBe("dry-run");
    expect(result.deletedAt).toBeUndefined();
    expect(svc.storage.deletedPublic).toEqual([]);
    expect(svc.storage.deletedMeta).toEqual([]);
  });

  it("with confirm=true deletes the wrapper and meta", async () => {
    const result = await svc.service.delete({ id: "ivan", confirm: true });
    expect(result.mode).toBe("deleted");
    expect(result.htmlDeleteStatus).toBe(204);
    expect(result.metaDeleteStatus).toBe(204);
    expect(typeof result.deletedAt).toBe("string");
    expect(svc.storage.deletedPublic).toHaveLength(1);
    expect(svc.storage.deletedMeta).toEqual(["ivan"]);
  });

  it("throws NotFoundError when meta is missing", async () => {
    await expect(svc.service.delete({ id: "missing" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("list()", () => {
  it("returns summaries sorted by updatedAt desc", async () => {
    const { service, storage } = makeService();
    storage.metas.set("a", {
      slug: "a",
      key: "a.html",
      password: "p",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    storage.metas.set("b", {
      slug: "b",
      key: "b.html",
      password: "p",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    storage.metas.set("c", {
      slug: "c",
      key: "c.html",
      password: "p",
      createdAt: "2026-02-15T00:00:00.000Z",
      updatedAt: "2026-02-15T00:00:00.000Z",
    });

    const result = await service.list();
    expect(result.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("respects limit", async () => {
    const { service, storage } = makeService();
    for (const id of ["a", "b", "c"]) {
      storage.metas.set(id, {
        slug: id,
        key: `${id}.html`,
        password: "p",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: `2026-01-0${id === "a" ? "1" : id === "b" ? "2" : "3"}T00:00:00.000Z`,
      });
    }
    const result = await service.list({ limit: 2 });
    expect(result.map((s) => s.id)).toEqual(["c", "b"]);
  });
});

describe("info()", () => {
  it("returns the publication for an existing id", async () => {
    const { service } = makeService();
    const published = await service.publish({
      html: "<h1>x</h1>",
      id: "ivan",
      clientName: "Иван",
    });
    const info = await service.info("ivan");
    expect(info).toEqual(published.publication);
  });

  it("throws NotFoundError when missing", async () => {
    const { service } = makeService();
    await expect(service.info("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("download()", () => {
  it("decrypts and returns the original html", async () => {
    const { service, encryptor } = makeService();
    await service.publish({ html: "<h1>secret</h1>", id: "ivan" });
    const result = await service.download({ id: "ivan" });
    expect(result.html).toBe("<h1>secret</h1>");
    expect(result.decryptedBytes).toBe(
      Buffer.byteLength("<h1>secret</h1>", "utf8"),
    );
    expect(encryptor.decryptCalls).toHaveLength(1);
  });

  it("throws NotFoundError when meta is missing", async () => {
    const { service } = makeService();
    await expect(
      service.download({ id: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
