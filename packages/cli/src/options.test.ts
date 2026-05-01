import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";
import { intOption } from "./options.js";

describe("intOption()", () => {
  it("parses a plain integer string", () => {
    expect(intOption("--limit")("42")).toBe(42);
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(intOption("--limit")("  7  ")).toBe(7);
  });

  it("throws InvalidArgumentError on non-numeric input", () => {
    expect(() => intOption("--limit")("abc")).toThrow(InvalidArgumentError);
  });

  it("throws on partially-numeric input (e.g. '12abc')", () => {
    // parseInt would happily return 12, swallowing the typo
    expect(() => intOption("--limit")("12abc")).toThrow(InvalidArgumentError);
  });

  it("throws on empty string", () => {
    expect(() => intOption("--limit")("")).toThrow(InvalidArgumentError);
  });

  it("enforces min bound", () => {
    expect(() => intOption("--limit", { min: 1 })("0")).toThrow(
      /≥ 1/,
    );
    expect(intOption("--limit", { min: 1 })("1")).toBe(1);
  });

  it("enforces max bound", () => {
    expect(() => intOption("--http", { max: 65535 })("70000")).toThrow(
      /≤ 65535/,
    );
    expect(intOption("--http", { max: 65535 })("65535")).toBe(65535);
  });

  it("allows 0 when min is 0", () => {
    expect(intOption("--http", { min: 0, max: 65535 })("0")).toBe(0);
  });
});
