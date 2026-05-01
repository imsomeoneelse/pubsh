import { readFileSync } from "node:fs";
import * as cryptoEngine from "staticrypt/lib/cryptoEngine.js";
import * as codecModule from "staticrypt/lib/codec.js";
import {
  STATICRYPT_PASSWORD_TEMPLATE,
  STATICRYPT_RUNTIME_JS,
} from "./staticrypt-assets.generated.js";
import type { EncryptionConfig } from "./types.js";
import { CryptoError } from "./errors.js";

export interface EncryptInput {
  /** Source HTML to encrypt — already loaded from disk by the caller. */
  html: string;
  password: string;
  /** Optional override of the wrapper template path. */
  templatePath?: string;
}

export interface EncryptResult {
  /** Encrypted wrapper HTML — ready to be uploaded as-is. */
  html: string;
}

export interface DecryptInput {
  /** Encrypted wrapper HTML downloaded from storage. */
  encryptedHtml: string;
  password: string;
}

export interface DecryptResult {
  html: string;
}

export interface Encryptor {
  encrypt(input: EncryptInput): Promise<EncryptResult>;
  decrypt(input: DecryptInput): Promise<DecryptResult>;
}

const codec = codecModule.init(cryptoEngine);

// Defaults mirror staticrypt CLI flag defaults (cli/helpers.js, see
// `parseCommandLineArguments`). Kept here so we don't depend on the CLI
// surface — only on the lib functions.
const TEMPLATE_DEFAULTS = {
  template_button: "DECRYPT",
  template_color_primary: "#4CAF50",
  template_color_secondary: "#76B852",
  template_instructions: "",
  template_error: "Bad password!",
  template_placeholder: "Password",
  template_remember: "Remember me",
  template_title: "Protected Page",
  template_toggle_hide: "Hide password",
  template_toggle_show: "Show password",
} as const;

export class StaticryptEncryptor implements Encryptor {
  constructor(private readonly config: EncryptionConfig) {}

  async encrypt(input: EncryptInput): Promise<EncryptResult> {
    const overridePath = input.templatePath ?? this.config.templatePath;
    const templateContents = overridePath
      ? readTemplate(overridePath)
      : STATICRYPT_PASSWORD_TEMPLATE;

    const salt = cryptoEngine.generateRandomSalt();
    const hashedPassword = await cryptoEngine.hashPassword(input.password, salt);
    const encryptedMsg = await codec.encodeWithHashedPassword(
      input.html,
      hashedPassword,
    );

    const isRememberEnabled = this.config.rememberDays > 0;
    const staticryptConfig = {
      staticryptEncryptedMsgUniqueVariableName: encryptedMsg,
      isRememberEnabled,
      rememberDurationInDays: this.config.rememberDays,
      staticryptSaltUniqueVariableName: salt,
    };

    const rendered = renderTemplate(templateContents, {
      ...TEMPLATE_DEFAULTS,
      is_remember_enabled: JSON.stringify(isRememberEnabled),
      js_staticrypt: STATICRYPT_RUNTIME_JS,
      staticrypt_config: staticryptConfig,
    });

    return { html: rendered };
  }

  async decrypt(input: DecryptInput): Promise<DecryptResult> {
    const cfg = parseStaticryptConfig(input.encryptedHtml);
    const salt = cfg.staticryptSaltUniqueVariableName;
    const signedMsg = cfg.staticryptEncryptedMsgUniqueVariableName;
    if (typeof salt !== "string" || typeof signedMsg !== "string") {
      throw new CryptoError("staticryptConfig is missing salt or encrypted message");
    }

    const hashedPassword = await cryptoEngine.hashPassword(input.password, salt);
    const result = await codec.decode(signedMsg, hashedPassword, salt);
    if (!result.success || result.decoded === undefined) {
      throw new CryptoError(
        `decryption failed: ${result.message ?? "wrong password or wrapper mismatch"}`,
      );
    }
    return { html: result.decoded };
  }
}

interface StaticryptConfig {
  staticryptSaltUniqueVariableName?: string;
  staticryptEncryptedMsgUniqueVariableName?: string;
}

function parseStaticryptConfig(html: string): StaticryptConfig {
  const m = html.match(/staticryptConfig\s*=\s*(\{[^}]+\})/);
  if (!m || !m[1]) {
    throw new CryptoError("staticryptConfig not found in wrapper HTML");
  }
  try {
    return JSON.parse(m[1]) as StaticryptConfig;
  } catch (err) {
    throw new CryptoError(
      `failed to parse staticryptConfig JSON: ${(err as Error).message}`,
      err,
    );
  }
}

function readTemplate(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new CryptoError(
      `failed to read staticrypt template at ${path}: ${(err as Error).message}`,
      err,
    );
  }
}

// Tiny replacement for staticrypt/lib/formater.js — substitutes /*[|key|]*/0
// placeholders. Inlined to drop one more cross-package dependency edge.
function renderTemplate(
  templateString: string,
  data: Record<string, unknown>,
): string {
  return templateString.replace(
    /\/\*\[\|\s*(\w+)\s*\|]\*\/\s*0/g,
    (_, key: string) => {
      const value = data[key];
      if (value === undefined) return key;
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    },
  );
}

export function createDefaultEncryptor(config: EncryptionConfig): Encryptor {
  return new StaticryptEncryptor(config);
}
