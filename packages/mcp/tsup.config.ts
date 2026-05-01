import { defineConfig } from "tsup";

// Bundles the MCP server (and its `@pubsh/core` workspace dep + the small
// staticrypt subset we still need at runtime) into a single self-contained
// ESM file at dist/bin.js. After this:
//
//   * `pubsh-mcp` is one npm package — no peer install of @pubsh/core needed.
//   * No runtime fs reads of staticrypt assets (those are inlined at core
//     build-time via packages/core/scripts/generate-staticrypt-assets.mjs).
//   * `npx -y pubsh-mcp` works in any MCP host.
//
// `@aws-sdk/client-s3` is left external on purpose — it pulls a long tail of
// regional clients and bundling it doubles the package size with little
// install-time benefit.

export default defineConfig({
  entry: { bin: "src/bin.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  noExternal: ["@pubsh/core", "staticrypt"],
  external: ["@aws-sdk/client-s3", "@modelcontextprotocol/sdk", "zod"],
  // staticrypt is CommonJS and uses `require("crypto")` to get the WebCrypto
  // engine. tsup's `shims: true` adds createRequire shims for our own ESM
  // imports, but the bundler's __require helper still throws for the inlined
  // CJS modules unless a real `require` is in scope. The banner provides one
  // before the helper IIFE runs.
  shims: true,
  banner: {
    js: 'import { createRequire as __pubshCreateRequire } from "node:module"; const require = __pubshCreateRequire(import.meta.url);',
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  outExtension: () => ({ js: ".js" }),
});
