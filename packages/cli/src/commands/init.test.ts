import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

import { confirm, input, password } from "@inquirer/prompts";
import {
  type OutputCapture,
  captureOutput,
  makeProgram,
} from "./_test-utils.js";
import { registerInit } from "./init.js";

const confirmMock = vi.mocked(confirm);
const inputMock = vi.mocked(input);
const passwordMock = vi.mocked(password);

const validAnswers = {
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  accessKeyId: "AKIA-TEST",
  secretAccessKey: "SECRET-TEST",
  publicBucket: "pub",
  privateBucket: "priv",
};

/** Queue input answers in the order init.ts prompts them. */
function queueValidAnswers(): void {
  inputMock
    .mockResolvedValueOnce(validAnswers.endpoint)
    .mockResolvedValueOnce(validAnswers.region)
    .mockResolvedValueOnce(validAnswers.accessKeyId)
    .mockResolvedValueOnce(validAnswers.publicBucket)
    .mockResolvedValueOnce(validAnswers.privateBucket);
  passwordMock.mockResolvedValueOnce(validAnswers.secretAccessKey);
}

describe("pubsh init", () => {
  let tmp: string;
  let configPath: string;
  let cap: OutputCapture;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "pubsh-cli-init-"));
    configPath = join(tmp, "nested", "config.json");
    cap = captureOutput();
  });
  afterEach(() => {
    cap.restore();
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("writes a valid config file with restrictive permissions on happy path", async () => {
    queueValidAnswers();

    const program = makeProgram(registerInit);
    await program.parseAsync([
      "node",
      "pubsh",
      "init",
      "--path",
      configPath,
    ]);

    expect(existsSync(configPath)).toBe(true);
    const written = JSON.parse(readFileSync(configPath, "utf8")) as {
      s3: Record<string, string>;
    };
    expect(written.s3).toEqual({
      endpoint: validAnswers.endpoint,
      region: validAnswers.region,
      accessKeyId: validAnswers.accessKeyId,
      secretAccessKey: validAnswers.secretAccessKey,
      publicBucket: validAnswers.publicBucket,
      privateBucket: validAnswers.privateBucket,
    });

    // file permissions: 0o600 (owner rw only)
    const mode = statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("does not call confirm() when config does not exist", async () => {
    queueValidAnswers();

    const program = makeProgram(registerInit);
    await program.parseAsync([
      "node",
      "pubsh",
      "init",
      "--path",
      configPath,
    ]);

    expect(confirmMock).not.toHaveBeenCalled();
    // 5 input fields + 1 password
    expect(inputMock).toHaveBeenCalledTimes(5);
    expect(passwordMock).toHaveBeenCalledTimes(1);
  });

  it("calls confirm() when config exists, and aborts on 'no'", async () => {
    const existingPath = join(tmp, "config.json");
    writeFileSync(
      existingPath,
      JSON.stringify({ s3: { region: "previous" } }),
      "utf8",
    );

    confirmMock.mockResolvedValueOnce(false);

    const program = makeProgram(registerInit);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {
        throw new Error("__exit__");
      }) as never);

    await expect(
      program.parseAsync([
        "node",
        "pubsh",
        "init",
        "--path",
        existingPath,
      ]),
    ).rejects.toThrow("__exit__");

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls[0]![0]).toMatchObject({
      message: expect.stringContaining("overwrite"),
      default: false,
    });
    expect(inputMock).not.toHaveBeenCalled();
    expect(passwordMock).not.toHaveBeenCalled();
    // file untouched: still the previous JSON content
    expect(readFileSync(existingPath, "utf8")).toContain("previous");
    expect(cap.stderr.join("")).toContain("aborted");

    exitSpy.mockRestore();
  });

  it("with --force, skips confirm() even if file exists", async () => {
    const existingPath = join(tmp, "config.json");
    writeFileSync(
      existingPath,
      JSON.stringify({ s3: { region: "previous" } }),
      "utf8",
    );
    queueValidAnswers();

    const program = makeProgram(registerInit);
    await program.parseAsync([
      "node",
      "pubsh",
      "init",
      "--force",
      "--path",
      existingPath,
    ]);

    expect(confirmMock).not.toHaveBeenCalled();
    const written = JSON.parse(readFileSync(existingPath, "utf8")) as {
      s3: { accessKeyId: string };
    };
    expect(written.s3.accessKeyId).toBe("AKIA-TEST");
  });

  it("does not bake any deployment-specific defaults into bucket prompts", async () => {
    queueValidAnswers();

    const program = makeProgram(registerInit);
    await program.parseAsync([
      "node",
      "pubsh",
      "init",
      "--path",
      configPath,
    ]);

    const callsByMessage = new Map<string, { default?: string }>(
      inputMock.mock.calls.map((c) => {
        const arg = c[0] as { message: string; default?: string };
        return [arg.message, arg];
      }),
    );
    expect(callsByMessage.get("Public bucket (encrypted HTML)")?.default)
      .toBeUndefined();
    expect(callsByMessage.get("Private bucket (metadata)")?.default)
      .toBeUndefined();
  });
});
