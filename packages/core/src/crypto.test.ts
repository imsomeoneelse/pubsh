import { describe, expect, it } from "vitest";
import {
  StaticryptEncryptor,
  createDefaultEncryptor,
  type Encryptor,
} from "./crypto.js";
import { CryptoError } from "./errors.js";

const HTML = "<h1>secret</h1><p>only the password unlocks this</p>";

function makeEncryptor(): Encryptor {
  return createDefaultEncryptor({ rememberDays: 0 });
}

describe("StaticryptEncryptor", () => {
  it("createDefaultEncryptor returns a StaticryptEncryptor", () => {
    const enc = createDefaultEncryptor({ rememberDays: 30 });
    expect(enc).toBeInstanceOf(StaticryptEncryptor);
  });

  it("encrypt produces a wrapper HTML different from the input", async () => {
    const enc = makeEncryptor();
    const { html } = await enc.encrypt({ html: HTML, password: "hunter2" });
    expect(html).not.toBe(HTML);
    expect(html).not.toContain(HTML);
    expect(html).toContain("staticryptConfig");
  });

  it("encrypt → decrypt round-trips the original HTML", async () => {
    const enc = makeEncryptor();
    const { html: wrapper } = await enc.encrypt({
      html: HTML,
      password: "hunter2",
    });
    const { html: recovered } = await enc.decrypt({
      encryptedHtml: wrapper,
      password: "hunter2",
    });
    expect(recovered).toBe(HTML);
  });

  it("two encryptions with the same password yield different wrappers (random salt)", async () => {
    const enc = makeEncryptor();
    const a = await enc.encrypt({ html: HTML, password: "hunter2" });
    const b = await enc.encrypt({ html: HTML, password: "hunter2" });
    expect(a.html).not.toBe(b.html);
  });

  it("decrypt with wrong password rejects with CryptoError", async () => {
    const enc = makeEncryptor();
    const { html: wrapper } = await enc.encrypt({
      html: HTML,
      password: "right",
    });
    await expect(
      enc.decrypt({ encryptedHtml: wrapper, password: "wrong" }),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("decrypt rejects if wrapper has no staticryptConfig", async () => {
    const enc = makeEncryptor();
    await expect(
      enc.decrypt({
        encryptedHtml: "<html>no config here</html>",
        password: "x",
      }),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("decrypt wraps a malformed staticryptConfig JSON in CryptoError", async () => {
    const enc = makeEncryptor();
    // matches the regex (looks like an object) but is not valid JSON
    const wrapper = "<html>staticryptConfig = {not valid json}</html>";
    await expect(
      enc.decrypt({ encryptedHtml: wrapper, password: "x" }),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("encrypt rejects when an explicit templatePath cannot be read", async () => {
    const enc = makeEncryptor();
    await expect(
      enc.encrypt({
        html: HTML,
        password: "hunter2",
        templatePath: "/nonexistent/__pubsh_test_template__.html",
      }),
    ).rejects.toBeInstanceOf(CryptoError);
  });

  it("rememberDays > 0 enables 'remember me' in the wrapper config", async () => {
    const enc = createDefaultEncryptor({ rememberDays: 14 });
    const { html } = await enc.encrypt({ html: HTML, password: "x" });
    expect(html).toContain('"isRememberEnabled":true');
    expect(html).toContain('"rememberDurationInDays":14');
  });

  it("rememberDays = 0 disables 'remember me'", async () => {
    const enc = createDefaultEncryptor({ rememberDays: 0 });
    const { html } = await enc.encrypt({ html: HTML, password: "x" });
    expect(html).toContain('"isRememberEnabled":false');
  });
});
