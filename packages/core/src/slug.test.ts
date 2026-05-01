import { describe, expect, it } from "vitest";
import { isValidId, slug } from "./slug.js";

describe("slug()", () => {
  it("lowercases and collapses non-alnum to single dash", () => {
    expect(slug("Hello World")).toBe("hello-world");
    expect(slug("Foo  Bar___Baz")).toBe("foo-bar-baz");
    expect(slug("a!b@c#d")).toBe("a-b-c-d");
  });

  it("trims leading and trailing dashes", () => {
    expect(slug("---abc---")).toBe("abc");
    expect(slug("  hi  ")).toBe("hi");
  });

  it("transliterates Cyrillic via ICAO Doc 9303", () => {
    expect(slug("Иван Иванов")).toBe("ivan-ivanov");
    expect(slug("Юлия Щербак")).toBe("iuliia-shcherbak");
    expect(slug("Ёлка")).toBe("elka");
  });

  it("handles Ukrainian / Belarusian extras", () => {
    expect(slug("Їжак")).toBe("izhak");
    expect(slug("Ґанок")).toBe("ganok");
    expect(slug("Ўладзімір")).toBe("uladzimir");
  });

  it("strips diacritics from Latin-with-marks", () => {
    expect(slug("café")).toBe("cafe");
    expect(slug("naïve")).toBe("naive");
  });

  it("preserves digits alongside letters", () => {
    expect(slug("Client 42 v2")).toBe("client-42-v2");
  });

  it("caps output at 80 chars", () => {
    const long = "a".repeat(200);
    expect(slug(long)).toHaveLength(80);
  });

  it("returns empty string for input with no alphanumerics", () => {
    expect(slug("!!!")).toBe("");
    expect(slug("   ")).toBe("");
    expect(slug("")).toBe("");
  });

  it("is idempotent on already-canonical ids", () => {
    expect(slug("ivan-ivanov")).toBe("ivan-ivanov");
    expect(slug(slug("Иван Иванов"))).toBe(slug("Иван Иванов"));
  });
});

describe("isValidId()", () => {
  it("accepts canonical lowercase ids with digits and dashes", () => {
    expect(isValidId("abc")).toBe(true);
    expect(isValidId("ivan-ivanov-42")).toBe(true);
    expect(isValidId("a")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidId("")).toBe(false);
  });

  it("rejects ids longer than 80 chars", () => {
    expect(isValidId("a".repeat(80))).toBe(true);
    expect(isValidId("a".repeat(81))).toBe(false);
  });

  it("rejects uppercase, spaces, and special chars", () => {
    expect(isValidId("Abc")).toBe(false);
    expect(isValidId("a b")).toBe(false);
    expect(isValidId("a_b")).toBe(false);
    expect(isValidId("a.b")).toBe(false);
  });

  it("rejects leading or trailing dashes", () => {
    expect(isValidId("-abc")).toBe(false);
    expect(isValidId("abc-")).toBe(false);
    expect(isValidId("-abc-")).toBe(false);
  });

  it("rejects Cyrillic input (must be transliterated first)", () => {
    expect(isValidId("иван")).toBe(false);
  });
});
