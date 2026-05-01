// staticrypt ships no .d.ts files. We declare only the lib subpaths we use.

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

declare module "staticrypt/lib/formater.js" {
  export function renderTemplate(
    template: string,
    data: Record<string, unknown>,
  ): string;
}

declare module "staticrypt/cli/helpers.js" {
  export function buildStaticryptJS(): string;
}
