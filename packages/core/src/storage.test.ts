import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { StorageError } from "./errors.js";
import { S3StorageProvider, createS3Storage } from "./storage.js";
import type { PublicationMeta, S3Config } from "./types.js";

const baseConfig: S3Config = {
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
};

interface SentCall {
  command: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any;
}

interface FakeClient {
  sent: SentCall[];
  send: (cmd: unknown) => Promise<unknown>;
}

function withFakeClient(
  provider: S3StorageProvider,
  responder: (cmd: unknown) => Promise<unknown> | unknown,
): FakeClient {
  const sent: SentCall[] = [];
  const send = async (cmd: unknown): Promise<unknown> => {
    sent.push({
      command: cmd,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: (cmd as any).input,
    });
    return responder(cmd);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).client = { send };
  return { sent, send };
}

function fakeBody(text: string): {
  transformToByteArray: () => Promise<Uint8Array>;
  transformToString: (encoding?: string) => Promise<string>;
} {
  return {
    transformToByteArray: async () => new TextEncoder().encode(text),
    transformToString: async () => text,
  };
}

describe("createS3Storage()", () => {
  it("returns an S3StorageProvider", () => {
    expect(createS3Storage(baseConfig)).toBeInstanceOf(S3StorageProvider);
  });
});

describe("S3StorageProvider — pure helpers", () => {
  it("publicUrl formats {host}/{bucket}/{key} from endpoint", () => {
    const p = new S3StorageProvider(baseConfig);
    expect(p.publicUrl("foo.html")).toBe(
      "https://storage.yandexcloud.net/public/foo.html",
    );
  });

  it("publicUrl honors a custom pattern", () => {
    const p = new S3StorageProvider({
      ...baseConfig,
      publicUrlPattern: "https://cdn.example.com/{key}",
    });
    expect(p.publicUrl("a/b.html")).toBe("https://cdn.example.com/a/b.html");
  });

  it("metaKey concatenates metaPrefix + slug + .json", () => {
    const p = new S3StorageProvider(baseConfig);
    expect(p.metaKey("ivan")).toBe("_meta/ivan.json");
  });

  it("metaKey honors a custom metaPrefix", () => {
    const p = new S3StorageProvider({ ...baseConfig, metaPrefix: "x/" });
    expect(p.metaKey("ivan")).toBe("x/ivan.json");
  });
});

describe("S3StorageProvider.putPublic", () => {
  it("sends PutObjectCommand to publicBucket with ACL and content-type", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({}));
    const res = await p.putPublic({
      key: "foo.html",
      body: Buffer.from("<html>"),
      contentType: "text/html; charset=utf-8",
    });
    expect(res.url).toBe("https://storage.yandexcloud.net/public/foo.html");
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.command).toBeInstanceOf(PutObjectCommand);
    expect(fake.sent[0]!.input).toMatchObject({
      Bucket: "public",
      Key: "foo.html",
      ContentType: "text/html; charset=utf-8",
      ACL: "public-read",
    });
    expect(fake.sent[0]!.input.Metadata).toBeUndefined();
  });

  it("includes Metadata when provided", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({}));
    await p.putPublic({
      key: "foo.html",
      body: Buffer.from("x"),
      contentType: "text/html",
      metadata: { client: "ivan" },
    });
    expect(fake.sent[0]!.input.Metadata).toEqual({ client: "ivan" });
  });

  it("wraps SDK errors in StorageError", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      throw new Error("S3 down");
    });
    await expect(
      p.putPublic({
        key: "foo.html",
        body: Buffer.from("x"),
        contentType: "text/html",
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3StorageProvider.getPublic", () => {
  it("returns body bytes from S3", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({ Body: fakeBody("hello") }));
    const buf = await p.getPublic("foo.html");
    expect(buf.toString("utf8")).toBe("hello");
    expect(fake.sent[0]!.command).toBeInstanceOf(GetObjectCommand);
    expect(fake.sent[0]!.input).toMatchObject({
      Bucket: "public",
      Key: "foo.html",
    });
  });

  it("throws StorageError if SDK throws", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      throw new Error("boom");
    });
    await expect(p.getPublic("foo")).rejects.toBeInstanceOf(StorageError);
  });

  it("throws StorageError on empty body", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ Body: null }));
    await expect(p.getPublic("foo")).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3StorageProvider.deletePublic", () => {
  it("returns the SDK http status code", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({
      $metadata: { httpStatusCode: 204 },
    }));
    const res = await p.deletePublic("foo.html");
    expect(res.status).toBe(204);
    expect(fake.sent[0]!.command).toBeInstanceOf(DeleteObjectCommand);
    expect(fake.sent[0]!.input).toMatchObject({
      Bucket: "public",
      Key: "foo.html",
    });
  });

  it("defaults status to 204 when SDK omits it", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ $metadata: {} }));
    const res = await p.deletePublic("foo");
    expect(res.status).toBe(204);
  });

  it("wraps SDK errors", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      throw new Error("nope");
    });
    await expect(p.deletePublic("foo")).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3StorageProvider.putMeta", () => {
  it("PUTs JSON to privateBucket at metaKey", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({}));
    const meta: PublicationMeta = {
      slug: "ivan",
      key: "ivan-abc.html",
      password: "p",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      clientName: "Иван",
    };
    await p.putMeta(meta);
    const call = fake.sent[0]!;
    expect(call.command).toBeInstanceOf(PutObjectCommand);
    expect(call.input).toMatchObject({
      Bucket: "private",
      Key: "_meta/ivan.json",
      ContentType: "application/json; charset=utf-8",
    });
    const body = (call.input.Body as Buffer).toString("utf8");
    expect(JSON.parse(body)).toEqual(meta);
  });

  it("wraps SDK errors", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      throw new Error("denied");
    });
    await expect(
      p.putMeta({
        slug: "ivan",
        key: "k",
        password: "p",
        createdAt: "x",
        updatedAt: "y",
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3StorageProvider.getMeta", () => {
  const meta: PublicationMeta = {
    slug: "ivan",
    key: "ivan-abc.html",
    password: "p",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("parses JSON body", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ Body: fakeBody(JSON.stringify(meta)) }));
    expect(await p.getMeta("ivan")).toEqual(meta);
  });

  it("returns null when body is missing", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ Body: null }));
    expect(await p.getMeta("ivan")).toBeNull();
  });

  it("returns null on NoSuchKey", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      const err = new Error("no such key");
      (err as Error & { name: string }).name = "NoSuchKey";
      throw err;
    });
    expect(await p.getMeta("missing")).toBeNull();
  });

  it("returns null on http 404", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      const err = Object.assign(new Error("not found"), {
        $metadata: { httpStatusCode: 404 },
      });
      throw err;
    });
    expect(await p.getMeta("missing")).toBeNull();
  });

  it("wraps non-404 SDK errors in StorageError", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => {
      throw Object.assign(new Error("perm"), {
        $metadata: { httpStatusCode: 403 },
      });
    });
    await expect(p.getMeta("ivan")).rejects.toBeInstanceOf(StorageError);
  });

  it("throws StorageError when body is not valid JSON", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ Body: fakeBody("{not json") }));
    await expect(p.getMeta("ivan")).rejects.toBeInstanceOf(StorageError);
  });

  it("throws StorageError when JSON does not match the schema", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({
      Body: fakeBody(JSON.stringify({ slug: "ivan" })),
    }));
    await expect(p.getMeta("ivan")).rejects.toBeInstanceOf(StorageError);
  });
});

describe("S3StorageProvider.deleteMeta", () => {
  it("targets privateBucket / metaKey", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({
      $metadata: { httpStatusCode: 204 },
    }));
    const res = await p.deleteMeta("ivan");
    expect(res.status).toBe(204);
    expect(fake.sent[0]!.input).toMatchObject({
      Bucket: "private",
      Key: "_meta/ivan.json",
    });
  });
});

describe("S3StorageProvider.listSummaries", () => {
  it("scopes prefix to metaPrefix and parses ids from keys", async () => {
    const p = new S3StorageProvider(baseConfig);
    const date = new Date("2026-03-01T00:00:00.000Z");
    const fake = withFakeClient(p, () => ({
      Contents: [
        { Key: "_meta/ivan.json", LastModified: date },
        { Key: "_meta/petya.json", LastModified: date },
        { Key: "_meta/not-json.txt", LastModified: date },
      ],
      IsTruncated: false,
    }));
    const summaries = await p.listSummaries();
    expect(summaries).toEqual([
      { id: "ivan", updatedAt: date.toISOString() },
      { id: "petya", updatedAt: date.toISOString() },
    ]);
    expect(fake.sent[0]!.command).toBeInstanceOf(ListObjectsV2Command);
    expect(fake.sent[0]!.input).toMatchObject({
      Bucket: "private",
      Prefix: "_meta/",
    });
  });

  it("appends an explicit prefix to metaPrefix when given", async () => {
    const p = new S3StorageProvider(baseConfig);
    const fake = withFakeClient(p, () => ({
      Contents: [],
      IsTruncated: false,
    }));
    await p.listSummaries("iv");
    expect(fake.sent[0]!.input.Prefix).toBe("_meta/iv");
  });

  it("paginates while IsTruncated, passing ContinuationToken", async () => {
    const p = new S3StorageProvider(baseConfig);
    const date = new Date("2026-03-01T00:00:00.000Z");
    let call = 0;
    const fake = withFakeClient(p, () => {
      call++;
      if (call === 1) {
        return {
          Contents: [{ Key: "_meta/a.json", LastModified: date }],
          IsTruncated: true,
          NextContinuationToken: "TOKEN-1",
        };
      }
      return {
        Contents: [{ Key: "_meta/b.json", LastModified: date }],
        IsTruncated: false,
      };
    });
    const summaries = await p.listSummaries();
    expect(summaries.map((s) => s.id)).toEqual(["a", "b"]);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[0]!.input.ContinuationToken).toBeUndefined();
    expect(fake.sent[1]!.input.ContinuationToken).toBe("TOKEN-1");
  });

  it("falls back to epoch-zero when LastModified is missing", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({
      Contents: [{ Key: "_meta/x.json" }],
      IsTruncated: false,
    }));
    const summaries = await p.listSummaries();
    expect(summaries[0]!.updatedAt).toBe(new Date(0).toISOString());
  });

  it("returns [] when bucket is empty", async () => {
    const p = new S3StorageProvider(baseConfig);
    withFakeClient(p, () => ({ IsTruncated: false }));
    expect(await p.listSummaries()).toEqual([]);
  });
});

describe("S3StorageProvider.listMeta", () => {
  it("calls listSummaries then getMeta per id, skipping nulls", async () => {
    const p = new S3StorageProvider(baseConfig);
    const meta: PublicationMeta = {
      slug: "ivan",
      key: "ivan.html",
      password: "p",
      createdAt: "x",
      updatedAt: "y",
    };
    const calls: string[] = [];
    withFakeClient(p, (cmd) => {
      if (cmd instanceof ListObjectsV2Command) {
        calls.push("LIST");
        return {
          Contents: [
            { Key: "_meta/ivan.json", LastModified: new Date(0) },
            { Key: "_meta/missing.json", LastModified: new Date(0) },
          ],
          IsTruncated: false,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (cmd as any).input.Key as string;
      calls.push(`GET ${key}`);
      if (key === "_meta/ivan.json") {
        return { Body: fakeBody(JSON.stringify(meta)) };
      }
      // simulate not-found
      const err = Object.assign(new Error("nope"), { name: "NoSuchKey" });
      throw err;
    });
    const result = await p.listMeta();
    expect(result).toEqual([meta]);
    expect(calls).toEqual([
      "LIST",
      "GET _meta/ivan.json",
      "GET _meta/missing.json",
    ]);
  });
});
