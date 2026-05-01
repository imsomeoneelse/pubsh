import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { PubshError } from "@pubsh/core";

/**
 * 20 MiB cap on inline HTML payload. Pages that embed base64-encoded images
 * inflate fast (a single 2 MB JPEG becomes ~2.7 MB of base64), so 5 MiB was
 * too tight for real dashboards. 20 MiB still bounds memory use and gives a
 * clear error well before AWS's per-PUT limit.
 */
export const MAX_INLINE_HTML_BYTES = 20 * 1024 * 1024;

/**
 * Default per-tool wall-clock timeout. AWS SDK has its own retry/timeout
 * stack (~30s × retries) — this is the outer envelope that ensures a single
 * MCP call never sits forever holding the stdio pipe.
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 90_000;

export type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | {
        type: "resource";
        resource: { uri: string; mimeType: string; text: string };
      }
  >;
  isError?: boolean;
};

export type ToolHandler<A> = (args: A) => Promise<ToolResult>;

/**
 * Wrap a tool handler so that:
 *   1. uncaught throws return as `{ isError: true, content: [...] }`
 *      (per MCP convention — the LLM can read the message and react,
 *      whereas a thrown error becomes an opaque JSON-RPC error);
 *   2. handlers that hang past `timeoutMs` are aborted with a clear message
 *      instead of holding the stdio pipe forever.
 *
 * Errors from `@pubsh/core` (PubshError) are formatted with their `code` so
 * the LLM can branch on `INVALID_ID`, `NOT_FOUND`, etc.
 */
export function wrapHandler<A>(
  handler: ToolHandler<A>,
  timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS,
): ToolHandler<A> {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await withTimeout(handler(args), timeoutMs);
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`tool timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function formatError(err: unknown): string {
  if (err instanceof PubshError) return `[${err.code}] ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Resolve HTML content from either a `source` path or an inline `html` string.
 * Exactly one is required. Reading the file is the MCP layer's job — the core
 * service is I/O-agnostic about input.
 *
 * `source` MUST be an absolute path. MCP servers run in the host's working
 * directory, which is not predictable from the LLM's point of view; resolving
 * a relative path silently would publish from a surprising location.
 */
export function resolveHtml(args: { source?: string; html?: string }): string {
  if (args.html !== undefined && args.html.length > 0) {
    if (Buffer.byteLength(args.html, "utf8") > MAX_INLINE_HTML_BYTES) {
      throw new Error(
        `inline html exceeds ${MAX_INLINE_HTML_BYTES} bytes — pass a \`source\` file path instead`,
      );
    }
    return args.html;
  }
  if (args.source) {
    if (!isAbsolute(args.source)) {
      throw new Error(
        `source path must be absolute, got "${args.source}". Pass an absolute path on this machine.`,
      );
    }
    if (!existsSync(args.source) || !statSync(args.source).isFile()) {
      throw new Error(
        `source file not found: ${args.source}. Pass an absolute path on this machine, or use the \`html\` field with the content directly.`,
      );
    }
    return readFileSync(args.source, "utf8");
  }
  throw new Error(
    "either `source` (absolute file path) or `html` (HTML content) is required",
  );
}
