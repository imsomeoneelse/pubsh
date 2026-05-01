// Tests focus on the file-I/O contract (the unique-to-CLI part) and on the
// JSON summary not leaking decrypted html. Output formatting is covered by
// output.test.ts.

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
import { registerDownload } from "./download.js";

const buildContextMock = vi.mocked(buildContext);

describe("pubsh download", () => {
  let service: FakeService;
  let tmp: string;
  let cap: OutputCapture;
  let originalCwd: string;

  beforeEach(() => {
    service = new FakeService();
    buildContextMock.mockResolvedValue({ service: service.asService() });
    // realpath, since process.chdir() resolves symlinks (e.g. /var → /private/var on macOS)
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "pubsh-cli-download-")));
    originalCwd = process.cwd();
    process.chdir(tmp);
    cap = captureOutput();
  });
  afterEach(() => {
    cap.restore();
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("writes decrypted html to ./decrypted/<id>.html by default", async () => {
    const program = makeProgram(registerDownload);
    await program.parseAsync(["node", "pubsh", "download", "ivan"]);

    expect(service.downloadCalls).toEqual([{ id: "ivan" }]);
    const out = resolve(tmp, "decrypted", "ivan.html");
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, "utf8")).toBe("<h1>secret</h1>");
  });

  it("does not inline decrypted html into the --json summary", async () => {
    const program = makeProgram(registerDownload);
    await program.parseAsync([
      "node",
      "pubsh",
      "--json",
      "download",
      "ivan",
    ]);
    const parsed = JSON.parse(cap.stdout.join("")) as Record<string, unknown>;
    expect(parsed.decryptedPath).toBe(resolve(tmp, "decrypted", "ivan.html"));
    expect(parsed).not.toHaveProperty("html");
  });
});
