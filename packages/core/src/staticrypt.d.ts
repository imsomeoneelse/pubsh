// staticrypt ships no .d.ts files. We declare only the lib subpaths we use
// at runtime (server-side encrypt / decrypt). The browser-runtime JS and the
// password template are baked in at build time via
// scripts/generate-staticrypt-assets.mjs, so cli/helpers and formater are no
// longer imported from this codebase.

declare module "staticrypt/lib/cryptoEngine.js" {
  export function hashPassword(password: string, salt: string): Promise<string>;
  export function generateRandomSalt(): string;
}

declare module "staticrypt/lib/codec.js" {
  import type * as CryptoEngine from "staticrypt/lib/cryptoEngine.js";

  export interface Codec {
    encodeWithHashedPassword(msg: string, hashedPassword: string): Promise<string>;
    decode(
      signedMsg: string,
      hashedPassword: string,
      salt: string,
    ): Promise<{ success: boolean; decoded?: string; message?: string }>;
  }

  export function init(engine: typeof CryptoEngine): Codec;
}
