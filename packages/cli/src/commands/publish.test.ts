import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context.js", () => ({
  buildContext: vi.fn(),
}));

import { buildContext } from "../context.js";
import {
  FakeService,
  type OutputCapture,
  captureOutput,
  makeProgram,
} from "./_test-utils.js";
import { registerPublish } from "./publish.js";

const buildContextMock = vi.mocked(buildContext);

describe("pubsh publish", () => {
  let service: FakeService;
  let tmp: string;
  let cap: OutputCapture;
  let htmlPath: string;

  beforeEach(() => {
    service = new FakeService();
    buildContextMock.mockResolvedValue({ service: service.asService() });
    tmp = mkdtempSync(join(tmpdir(), "pubsh-cli-publish-"));
    htmlPath = join(tmp, "input.html");
    writeFileSync(htmlPath, "<h1>hello</h1>", "utf8");
    cap = captureOutput();
  });
  afterEach(() => {
    cap.restore();
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("forwards explicit --id and reads HTML from <source>", async () => {
    const program = makeProgram(registerPublish);
    await program.parseAsync([
      "node",
      "pubsh",
      "publish",
      htmlPath,
      "--id",
      "ivan",
    ]);
    expect(service.publishCalls).toEqual([
      { html: "<h1>hello</h1>", id: "ivan" },
    ]);
  });

  it("derives id from --client via slug() when --id is absent", async () => {
    const program = makeProgram(registerPublish);
    await program.parseAsync([
      "node",
      "pubsh",
      "publish",
      htmlPath,
      "-c",
      "Иван Иванов",
    ]);
    expect(service.publishCalls[0]).toEqual({
      html: "<h1>hello</h1>",
      id: "ivan-ivanov",
      clientName: "Иван Иванов",
    });
  });

  it("rejects when neither --id nor --client is given", async () => {
    const program = makeProgram(registerPublish);
    await expect(
      program.parseAsync(["node", "pubsh", "publish", htmlPath]),
    ).rejects.toThrow(/--id <id> or --client <name> is required/);
  });

  it("rejects when source file does not exist", async () => {
    const program = makeProgram(registerPublish);
    await expect(
      program.parseAsync([
        "node",
        "pubsh",
        "publish",
        join(tmp, "nope.html"),
        "--id",
        "ivan",
      ]),
    ).rejects.toThrow(/source file not found/);
    expect(service.publishCalls).toEqual([]);
  });
});
