import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DeleteInput,
  type DeleteResult,
  type DownloadInput,
  type DownloadResult,
  type ListOptions,
  NotFoundError,
  type Publication,
  type PublicationService,
  type PublicationSummary,
  type PublishInput,
  type PublishResult,
  type UpdateInput,
  slug as realSlug,
} from "@pubsh/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTools } from "./tools.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any) => Promise<{ content: ContentItem[]; isError?: boolean }>;

interface ToolConfig {
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  annotations?: Record<string, any>;
}

interface CapturedTool {
  config: ToolConfig;
  handler: ToolHandler;
}

type ContentItem =
  | { type: "text"; text: string }
  | {
      type: "resource";
      resource: { uri: string; mimeType: string; text: string };
    };

class FakeMcpServer {
  tools = new Map<string, CapturedTool>();
  registerTool(name: string, config: ToolConfig, handler: ToolHandler): void {
    this.tools.set(name, { config, handler });
  }
  asMcpServer(): McpServer {
    return this as unknown as McpServer;
  }
  invoke(
    name: string,
    args: unknown,
  ): Promise<{ content: ContentItem[]; isError?: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    return tool.handler(args);
  }
}

function fixedPublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: "ivan",
    url: "https://example.com/ivan-abcd.html",
    password: "p4ssw0rd",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    key: "ivan-abcd.html",
    ...overrides,
  };
}

class FakeService {
  publishCalls: PublishInput[] = [];
  updateCalls: UpdateInput[] = [];
  deleteCalls: DeleteInput[] = [];
  downloadCalls: DownloadInput[] = [];
  listCalls: ListOptions[] = [];
  infoCalls: string[] = [];

  publishImpl?: (input: PublishInput) => Promise<PublishResult>;
  infoImpl?: (id: string) => Promise<Publication>;

  publishResult: PublishResult = {
    publication: fixedPublication(),
    isUpdate: false,
    mode: "new",
  };
  updateResult: PublishResult = {
    publication: fixedPublication(),
    isUpdate: true,
    mode: "update",
  };
  deleteResult: DeleteResult = {
    mode: "dry-run",
    publication: fixedPublication(),
  };
  downloadResult: DownloadResult = {
    publication: fixedPublication(),
    html: "<h1>secret</h1>",
    decryptedBytes: 15,
  };
  listResult: PublicationSummary[] = [
    { id: "ivan", updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "petya", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  infoResult: Publication = fixedPublication();

  slug(input: string): string {
    return realSlug(input);
  }
  async publish(input: PublishInput): Promise<PublishResult> {
    this.publishCalls.push(input);
    if (this.publishImpl) return this.publishImpl(input);
    return this.publishResult;
  }
  async update(input: UpdateInput): Promise<PublishResult> {
    this.updateCalls.push(input);
    return this.updateResult;
  }
  async delete(input: DeleteInput): Promise<DeleteResult> {
    this.deleteCalls.push(input);
    return this.deleteResult;
  }
  async download(input: DownloadInput): Promise<DownloadResult> {
    this.downloadCalls.push(input);
    return this.downloadResult;
  }
  async list(opts: ListOptions): Promise<PublicationSummary[]> {
    this.listCalls.push(opts);
    return this.listResult;
  }
  async info(id: string): Promise<Publication> {
    this.infoCalls.push(id);
    if (this.infoImpl) return this.infoImpl(id);
    return this.infoResult;
  }
  asService(): PublicationService {
    return this as unknown as PublicationService;
  }
}

function makeRig(): {
  server: FakeMcpServer;
  service: FakeService;
} {
  const server = new FakeMcpServer();
  const service = new FakeService();
  registerTools(server.asMcpServer(), service.asService());
  return { server, service };
}

function parseTextContent(content: ContentItem[]): unknown {
  const first = content[0];
  if (!first || first.type !== "text") {
    throw new Error("expected first content item to be text");
  }
  return JSON.parse(first.text);
}

function textOf(content: ContentItem[]): string {
  const first = content[0];
  if (!first || first.type !== "text") {
    throw new Error("expected first content item to be text");
  }
  return first.text;
}

describe("registerTools — registration", () => {
  it("registers all 6 expected tools", () => {
    const { server } = makeRig();
    expect([...server.tools.keys()].sort()).toEqual([
      "delete",
      "download",
      "info",
      "list",
      "publish",
      "update",
    ]);
  });

  it("attaches sensible annotation hints", () => {
    const { server } = makeRig();
    expect(server.tools.get("publish")!.config.annotations).toMatchObject({
      idempotentHint: true,
    });
    expect(server.tools.get("list")!.config.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(server.tools.get("info")!.config.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(server.tools.get("download")!.config.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(server.tools.get("update")!.config.annotations).toMatchObject({
      idempotentHint: true,
    });
    expect(server.tools.get("delete")!.config.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it("provides a description for every tool", () => {
    const { server } = makeRig();
    for (const [name, tool] of server.tools) {
      expect(
        tool.config.description,
        `description for ${name}`,
      ).toBeTruthy();
    }
  });
});

describe("publish tool", () => {
  let rig: ReturnType<typeof makeRig>;
  let tmp: string;

  beforeEach(() => {
    rig = makeRig();
    tmp = mkdtempSync(join(tmpdir(), "pubsh-mcp-test-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("forwards explicit id and inline html", async () => {
    const res = await rig.server.invoke("publish", {
      id: "ivan",
      html: "<h1>hi</h1>",
    });
    expect(res.isError).toBeUndefined();
    expect(rig.service.publishCalls).toEqual([
      { id: "ivan", html: "<h1>hi</h1>" },
    ]);
    expect(parseTextContent(res.content)).toEqual(rig.service.publishResult);
  });

  it("derives id from clientName via service.slug when id is absent", async () => {
    await rig.server.invoke("publish", {
      clientName: "Иван Иванов",
      html: "<h1>x</h1>",
    });
    const call = rig.service.publishCalls[0]!;
    expect(call.id).toBe("ivan-ivanov");
    expect(call.clientName).toBe("Иван Иванов");
  });

  it("prefers explicit id over derived when both are given", async () => {
    await rig.server.invoke("publish", {
      id: "explicit",
      clientName: "Иван Иванов",
      html: "<h1>x</h1>",
    });
    expect(rig.service.publishCalls[0]!.id).toBe("explicit");
    expect(rig.service.publishCalls[0]!.clientName).toBe("Иван Иванов");
  });

  it("returns isError when neither id nor clientName is provided", async () => {
    const res = await rig.server.invoke("publish", { html: "<h1>x</h1>" });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/`id` or `clientName` is required/);
    expect(rig.service.publishCalls).toEqual([]);
  });

  it("reads html from a source file path", async () => {
    const path = join(tmp, "input.html");
    writeFileSync(path, "<h1>from disk</h1>", "utf8");
    await rig.server.invoke("publish", { id: "ivan", source: path });
    expect(rig.service.publishCalls[0]!.html).toBe("<h1>from disk</h1>");
  });

  it("prefers inline html when both source and html are passed", async () => {
    const path = join(tmp, "input.html");
    writeFileSync(path, "from disk", "utf8");
    await rig.server.invoke("publish", {
      id: "ivan",
      source: path,
      html: "<h1>inline wins</h1>",
    });
    expect(rig.service.publishCalls[0]!.html).toBe("<h1>inline wins</h1>");
  });

  it("returns isError when source path does not exist", async () => {
    const res = await rig.server.invoke("publish", {
      id: "ivan",
      source: join(tmp, "nope.html"),
    });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/source file not found/);
  });

  it("returns isError when source path is a directory, not a file", async () => {
    const res = await rig.server.invoke("publish", { id: "ivan", source: tmp });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/source file not found/);
  });

  it("returns isError when source is a relative path", async () => {
    const res = await rig.server.invoke("publish", {
      id: "ivan",
      source: "relative/path.html",
    });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/source path must be absolute/);
  });

  it("returns isError when neither source nor html is provided", async () => {
    const res = await rig.server.invoke("publish", { id: "ivan" });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/`source`.*or `html`.*required/);
  });

  it("returns isError when inline html exceeds the size limit", async () => {
    const { MAX_INLINE_HTML_BYTES } = await import("./tools/_shared.js");
    const huge = "a".repeat(MAX_INLINE_HTML_BYTES + 1);
    const res = await rig.server.invoke("publish", { id: "ivan", html: huge });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/exceeds .* bytes/);
    expect(rig.service.publishCalls).toEqual([]);
  });

  it("formats PubshError from the service with its code", async () => {
    rig.service.publishImpl = async () => {
      // mimic core: id validation failure surfaces as PubshError
      throw new (await import("@pubsh/core")).PubshError(
        "invalid id",
        "INVALID_ID",
      );
    };
    const res = await rig.server.invoke("publish", {
      id: "ivan",
      html: "<h1>x</h1>",
    });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toBe("[INVALID_ID] invalid id");
  });

  it("forwards templatePath only when present", async () => {
    await rig.server.invoke("publish", {
      id: "ivan",
      html: "<h1>x</h1>",
      templatePath: "/tpl.html",
    });
    expect(rig.service.publishCalls[0]!.templatePath).toBe("/tpl.html");

    await rig.server.invoke("publish", { id: "petya", html: "<h1>x</h1>" });
    expect(rig.service.publishCalls[1]!.templatePath).toBeUndefined();
  });

  it("does not include clientName in the service call when not provided", async () => {
    await rig.server.invoke("publish", { id: "ivan", html: "<h1>x</h1>" });
    expect(rig.service.publishCalls[0]).not.toHaveProperty("clientName");
  });
});

describe("list tool", () => {
  it("forwards no options when none given", async () => {
    const { server, service } = makeRig();
    const res = await server.invoke("list", {});
    expect(service.listCalls).toEqual([{}]);
    expect(parseTextContent(res.content)).toEqual(service.listResult);
  });

  it("forwards limit and prefix when provided", async () => {
    const { server, service } = makeRig();
    await server.invoke("list", { limit: 5, prefix: "iv" });
    expect(service.listCalls).toEqual([{ limit: 5, prefix: "iv" }]);
  });

  it("forwards only the option that is provided", async () => {
    const { server, service } = makeRig();
    await server.invoke("list", { limit: 3 });
    expect(service.listCalls[0]).toEqual({ limit: 3 });
    expect(service.listCalls[0]).not.toHaveProperty("prefix");
  });
});

describe("info tool", () => {
  it("forwards id and JSON-serialises the result", async () => {
    const { server, service } = makeRig();
    const res = await server.invoke("info", { id: "ivan" });
    expect(service.infoCalls).toEqual(["ivan"]);
    expect(parseTextContent(res.content)).toEqual(service.infoResult);
  });

  it("returns isError with NOT_FOUND code when service throws NotFoundError", async () => {
    const { server, service } = makeRig();
    service.infoImpl = async () => {
      throw new NotFoundError("no publication for id \"missing\"");
    };
    const res = await server.invoke("info", { id: "missing" });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/^\[NOT_FOUND\]/);
  });
});

describe("update tool", () => {
  let rig: ReturnType<typeof makeRig>;
  let tmp: string;
  beforeEach(() => {
    rig = makeRig();
    tmp = mkdtempSync(join(tmpdir(), "pubsh-mcp-test-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("forwards id and inline html", async () => {
    const res = await rig.server.invoke("update", {
      id: "ivan",
      html: "<h1>v2</h1>",
    });
    expect(rig.service.updateCalls).toEqual([
      { id: "ivan", html: "<h1>v2</h1>" },
    ]);
    expect(parseTextContent(res.content)).toEqual(rig.service.updateResult);
  });

  it("reads new html from source file", async () => {
    const path = join(tmp, "v2.html");
    writeFileSync(path, "<h1>updated</h1>", "utf8");
    await rig.server.invoke("update", { id: "ivan", source: path });
    expect(rig.service.updateCalls[0]!.html).toBe("<h1>updated</h1>");
  });

  it("forwards optional clientName and templatePath only when present", async () => {
    await rig.server.invoke("update", {
      id: "ivan",
      html: "<h1>x</h1>",
      clientName: "Иван",
      templatePath: "/tpl.html",
    });
    expect(rig.service.updateCalls[0]).toMatchObject({
      clientName: "Иван",
      templatePath: "/tpl.html",
    });

    await rig.server.invoke("update", { id: "petya", html: "<h1>x</h1>" });
    const second = rig.service.updateCalls[1]!;
    expect(second).not.toHaveProperty("clientName");
    expect(second).not.toHaveProperty("templatePath");
  });

  it("returns isError when neither source nor html is provided", async () => {
    const res = await rig.server.invoke("update", { id: "ivan" });
    expect(res.isError).toBe(true);
    expect(textOf(res.content)).toMatch(/`source`.*or `html`.*required/);
  });
});

describe("download tool", () => {
  let tmp: string;
  let rig: ReturnType<typeof makeRig>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pubsh-mcp-download-"));
    // Pin the download dir BEFORE makeRig, since registerDownloadTool
    // captures it at registration time.
    process.env.PUBSH_DOWNLOAD_DIR = tmp;
    rig = makeRig();
  });
  afterEach(() => {
    delete process.env.PUBSH_DOWNLOAD_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes the decrypted html to PUBSH_DOWNLOAD_DIR and returns its path", async () => {
    const res = await rig.server.invoke("download", { id: "ivan" });
    expect(rig.service.downloadCalls).toEqual([{ id: "ivan" }]);

    expect(res.content).toHaveLength(1);
    const summary = parseTextContent(res.content) as Record<string, unknown>;
    const expectedPath = join(tmp, "ivan.html");
    expect(summary).toEqual({
      id: "ivan",
      url: rig.service.downloadResult.publication.url,
      password: rig.service.downloadResult.publication.password,
      updatedAt: rig.service.downloadResult.publication.updatedAt,
      decryptedBytes: rig.service.downloadResult.decryptedBytes,
      decryptedPath: expectedPath,
    });
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath, "utf8")).toBe("<h1>secret</h1>");
  });

  it("creates the download dir recursively if it does not exist", async () => {
    const nested = join(tmp, "a", "b", "c");
    process.env.PUBSH_DOWNLOAD_DIR = nested;
    const fresh = new FakeMcpServer();
    const service = new FakeService();
    registerTools(fresh.asMcpServer(), service.asService());

    const res = await fresh.invoke("download", { id: "ivan" });
    const summary = parseTextContent(res.content) as { decryptedPath: string };
    expect(existsSync(summary.decryptedPath)).toBe(true);
    expect(summary.decryptedPath).toBe(join(nested, "ivan.html"));
  });

  it("overwrites the file on a re-download with the same id", async () => {
    rig.service.downloadResult = {
      ...rig.service.downloadResult,
      html: "<h1>v1</h1>",
    };
    await rig.server.invoke("download", { id: "ivan" });

    rig.service.downloadResult = {
      ...rig.service.downloadResult,
      html: "<h1>v2</h1>",
    };
    await rig.server.invoke("download", { id: "ivan" });

    expect(readFileSync(join(tmp, "ivan.html"), "utf8")).toBe("<h1>v2</h1>");
  });

  it("falls back to os.tmpdir()/pubsh-dashboards when PUBSH_DOWNLOAD_DIR is unset", async () => {
    delete process.env.PUBSH_DOWNLOAD_DIR;
    const fresh = new FakeMcpServer();
    const service = new FakeService();
    registerTools(fresh.asMcpServer(), service.asService());

    const res = await fresh.invoke("download", { id: "ivan" });
    const summary = parseTextContent(res.content) as { decryptedPath: string };
    expect(summary.decryptedPath).toMatch(/pubsh-dashboards.*ivan\.html$/);
    expect(existsSync(summary.decryptedPath)).toBe(true);
  });

  it("throws at registration time when PUBSH_DOWNLOAD_DIR is a relative path", () => {
    process.env.PUBSH_DOWNLOAD_DIR = "rel/dir";
    const fresh = new FakeMcpServer();
    const service = new FakeService();
    expect(() => registerTools(fresh.asMcpServer(), service.asService())).toThrow(
      /PUBSH_DOWNLOAD_DIR must be absolute/,
    );
  });

  it("ignores any extra fields in the tool call (no outDir surface)", async () => {
    // Verifies the schema does not let the LLM redirect the download path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await rig.server.invoke("download", { id: "ivan", outDir: "/home/claude" } as any);
    const summary = parseTextContent(res.content) as { decryptedPath: string };
    expect(summary.decryptedPath).toBe(join(tmp, "ivan.html"));
    expect(summary.decryptedPath).not.toContain("/home/claude");
  });

  it("does NOT inline the decrypted html into the JSON summary", async () => {
    const res = await rig.server.invoke("download", { id: "ivan" });
    const summary = parseTextContent(res.content) as Record<string, unknown>;
    expect(summary).not.toHaveProperty("html");
    expect(summary).not.toHaveProperty("key");
    expect(summary).not.toHaveProperty("createdAt");
  });
});

describe("delete tool", () => {
  it("forwards id without confirm in dry-run mode", async () => {
    const { server, service } = makeRig();
    await server.invoke("delete", { id: "ivan" });
    expect(service.deleteCalls).toEqual([{ id: "ivan" }]);
    expect(service.deleteCalls[0]).not.toHaveProperty("confirm");
  });

  it("forwards confirm:true when provided", async () => {
    const { server, service } = makeRig();
    service.deleteResult = {
      mode: "deleted",
      publication: fixedPublication(),
      htmlDeleteStatus: 204,
      metaDeleteStatus: 204,
      deletedAt: "2026-01-03T00:00:00.000Z",
    };
    const res = await server.invoke("delete", {
      id: "ivan",
      confirm: true,
    });
    expect(service.deleteCalls).toEqual([{ id: "ivan", confirm: true }]);
    expect(parseTextContent(res.content)).toEqual(service.deleteResult);
  });

  it("forwards confirm:false explicitly when provided", async () => {
    const { server, service } = makeRig();
    await server.invoke("delete", { id: "ivan", confirm: false });
    expect(service.deleteCalls).toEqual([{ id: "ivan", confirm: false }]);
  });
});
