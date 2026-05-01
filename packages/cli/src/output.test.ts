import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emit, getOutputFormat } from "./output.js";

interface Capture {
  stdout: string[];
  restore: () => void;
}

function captureStdout(): Capture {
  const stdout: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stdout.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
      );
      return true;
    });
  return { stdout, restore: () => spy.mockRestore() };
}

function makeCmd(json: boolean): Command {
  const program = new Command();
  program.option("--json", "json", false);
  const sub = program.command("test").action(() => {});
  // simulate parse so options are populated
  program.parse(json ? ["node", "pubsh", "--json", "test"] : ["node", "pubsh", "test"]);
  return sub;
}

describe("getOutputFormat()", () => {
  it("returns 'json' when --json is set globally", () => {
    expect(getOutputFormat(makeCmd(true))).toBe("json");
  });

  it("returns 'human' by default", () => {
    expect(getOutputFormat(makeCmd(false))).toBe("human");
  });
});

describe("emit()", () => {
  let cap: Capture;
  beforeEach(() => {
    cap = captureStdout();
  });
  afterEach(() => {
    cap.restore();
  });

  it("writes the human string with a trailing newline in human mode", () => {
    emit(makeCmd(false), () => "hello world", { ignored: true });
    expect(cap.stdout.join("")).toBe("hello world\n");
  });

  it("writes pretty-printed JSON with trailing newline in --json mode", () => {
    emit(makeCmd(true), () => "human", { a: 1, b: "two" });
    expect(cap.stdout.join("")).toBe('{\n  "a": 1,\n  "b": "two"\n}\n');
  });

  it("does not call the human function in json mode", () => {
    const human = vi.fn(() => "shouldn't run");
    emit(makeCmd(true), human, { x: 1 });
    expect(human).not.toHaveBeenCalled();
  });

  it("does not produce JSON for the data in human mode", () => {
    emit(makeCmd(false), () => "h", { secret: 42 });
    expect(cap.stdout.join("")).not.toContain("secret");
    expect(cap.stdout.join("")).not.toContain("42");
  });
});
