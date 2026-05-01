import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PubshError } from "@pubsh/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_INLINE_HTML_BYTES,
  resolveHtml,
  wrapHandler,
} from "./_shared.js";

describe("resolveHtml()", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pubsh-mcp-shared-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns inline html when provided", () => {
    expect(resolveHtml({ html: "<h1>x</h1>" })).toBe("<h1>x</h1>");
  });

  it("prefers inline html over source", () => {
    const path = join(tmp, "f.html");
    writeFileSync(path, "from disk", "utf8");
    expect(resolveHtml({ source: path, html: "inline" })).toBe("inline");
  });

  it("reads from source when html is empty", () => {
    const path = join(tmp, "f.html");
    writeFileSync(path, "from disk", "utf8");
    expect(resolveHtml({ source: path, html: "" })).toBe("from disk");
  });

  it("throws on relative source path", () => {
    expect(() =>
      resolveHtml({ source: "relative/path.html" }),
    ).toThrow(/source path must be absolute/);
  });

  it("throws on missing absolute source path", () => {
    expect(() =>
      resolveHtml({ source: resolve(tmp, "nope.html") }),
    ).toThrow(/source file not found/);
  });

  it("throws when source points to a directory", () => {
    expect(() => resolveHtml({ source: tmp })).toThrow(/source file not found/);
  });

  it("throws when neither source nor html is provided", () => {
    expect(() => resolveHtml({})).toThrow(/either `source`.*or `html`/);
  });

  it("throws when inline html exceeds the size cap", () => {
    const huge = "a".repeat(MAX_INLINE_HTML_BYTES + 1);
    expect(() => resolveHtml({ html: huge })).toThrow(/exceeds .* bytes/);
  });
});

describe("wrapHandler()", () => {
  it("passes a successful result through unchanged", async () => {
    const wrapped = wrapHandler<{ x: number }>(async ({ x }) => ({
      content: [{ type: "text", text: String(x * 2) }],
    }));
    const res = await wrapped({ x: 21 });
    expect(res).toEqual({
      content: [{ type: "text", text: "42" }],
    });
    expect(res.isError).toBeUndefined();
  });

  it("converts a thrown plain Error to isError content", async () => {
    const wrapped = wrapHandler(async () => {
      throw new Error("boom");
    });
    const res = await wrapped({});
    expect(res.isError).toBe(true);
    expect(res.content[0]).toEqual({ type: "text", text: "boom" });
  });

  it("formats PubshError with its code", async () => {
    const wrapped = wrapHandler(async () => {
      throw new PubshError("bad input", "INVALID_ID");
    });
    const res = await wrapped({});
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toBe(
      "[INVALID_ID] bad input",
    );
  });

  it("formats non-Error throws via String()", async () => {
    const wrapped = wrapHandler(async () => {
      throw "weird"; // eslint-disable-line @typescript-eslint/only-throw-error
    });
    const res = await wrapped({});
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toBe("weird");
  });

  it("times out a hung handler with a clear message", async () => {
    const wrapped = wrapHandler(
      async () => new Promise<never>(() => {}), // never resolves
      50,
    );
    const res = await wrapped({});
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(
      /timed out after 50ms/,
    );
  });
});
