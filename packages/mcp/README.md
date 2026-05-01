# @pubsh/mcp

MCP (Model Context Protocol) server for [pubsh](https://github.com/anthropics/pubsh):
exposes the publication lifecycle as tools that LLM hosts (Claude Desktop,
Claude Code, Cursor, etc.) can call.

## Tools

| Name       | Hint                          | Purpose                                                  |
| ---------- | ----------------------------- | -------------------------------------------------------- |
| `publish`  | idempotent                    | encrypt HTML and upload to S3 (idempotent by id)         |
| `list`     | read-only                     | list publications, newest first                          |
| `info`     | read-only                     | metadata for a single publication                        |
| `update`   | idempotent                    | re-publish over an existing id (same URL, same password) |
| `download` | read-only                     | decrypt to a local file; returns the absolute path       |
| `delete`   | destructive, idempotent       | remove a publication (`confirm:true` to actually delete) |

All tool errors come back as `{ isError: true, content: [{ type: "text", text: "[CODE] …" }] }`,
so the model can read the message and react. `PubshError`s from the core
service are formatted with their `code` (e.g. `[NOT_FOUND]`, `[INVALID_ID]`).

## Running it

### Standalone (stdio) — Claude Desktop

Claude Desktop's built-in filesystem tool already has read/write access to
`~/Claude/`. Point `PUBSH_DOWNLOAD_DIR` somewhere under that root and you
don't need to wire up a separate `server-filesystem` MCP at all — the model
will be able to read/edit the decrypted HTML out of the box.

```jsonc
{
  "mcpServers": {
    "pubsh": {
      "command": "node",
      "args": ["/Users/me/Sources/pubsh/packages/mcp/dist/bin.js"],
      "env": {
        // S3 (required)
        "PUBSH_S3_ENDPOINT": "https://storage.yandexcloud.net",
        "PUBSH_S3_REGION": "ru-central1",
        "PUBSH_S3_ACCESS_KEY_ID": "...",
        "PUBSH_S3_SECRET_ACCESS_KEY": "...",
        "PUBSH_S3_PUBLIC_BUCKET": "...",
        "PUBSH_S3_PRIVATE_BUCKET": "...",

        // optional: custom staticrypt wrapper template
        "PUBSH_TEMPLATE_PATH": "/Users/me/Sources/pubsh/templates/my-pass.html",

        // download dir under ~/Claude/ → readable by Claude Desktop's
        // built-in filesystem tool, no extra MCP needed.
        "PUBSH_DOWNLOAD_DIR": "/Users/me/Claude/pubsh-dashboards"
      }
    }
  }
}
```

`command: "node"` + absolute path to `dist/bin.js` works for local dev
against a built tree. Once published, `command: "pubsh-mcp"` is enough.

`bin.ts` reads configuration **only** from the environment — no
`~/.config/pubsh/config.json`, no project files. The host owns the secrets.

Set `PUBSH_DEBUG=1` to print stack traces on stderr.

### Standalone (stdio) — other hosts

For Claude Code, Cursor, or any host without built-in filesystem access to
the download dir, add a sibling [filesystem-MCP][fs] server pointed at the
**same** path as `PUBSH_DOWNLOAD_DIR`:

[fs]: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem

```jsonc
{
  "mcpServers": {
    "pubsh": {
      "command": "pubsh-mcp",
      "env": {
        /* …S3 + template envs… */
        "PUBSH_DOWNLOAD_DIR": "/Users/me/Documents/pubsh-dashboards"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/me/Documents/pubsh-dashboards"
      ]
    }
  }
}
```

The two paths must be **identical absolute strings**, otherwise filesystem-mcp
will refuse the read with "access denied" (it sandboxes itself to its
allowed roots).

### Workflow

1. `pubsh.download({ id })` decrypts and writes `<PUBSH_DOWNLOAD_DIR>/<id>.html`.
2. The host's filesystem tool reads the HTML — the model can quote/edit it in chat.
3. The host writes edits back to the same path.
4. `pubsh.update({ id, source: '<PUBSH_DOWNLOAD_DIR>/<id>.html' })` —
   re-publishes; same URL, same password.

### Embedded

```ts
import { startMcpServer } from "@pubsh/mcp";

const running = await startMcpServer({
  config,                          // a fully-validated @pubsh/core Config
  transport: { kind: "stdio" },
});

// later, when the host process is shutting down:
await running.close();
```

`startMcpServer` returns a handle with the underlying `McpServer` and an
async `close()` for graceful shutdown.

## Transport support

Currently only `{ kind: "stdio" }`. The SDK ships
`StreamableHTTPServerTransport`; HTTP support will be added behind a future
`{ kind: "http"; port: number }` variant. Until then, the `Transport` type
intentionally rejects HTTP at compile time.

## Limits and timeouts

- Inline `html` payloads are capped at 20 MiB (room for pages with base64-embedded
  images); pass `source` (an absolute file path) for anything larger.
- The `download` tool always writes to `$PUBSH_DOWNLOAD_DIR/<id>.html` (default:
  `os.tmpdir()/pubsh-dashboards`). The path is **not** an LLM-controlled input —
  letting the model pick a path is a footgun, since it tends to invent paths
  like `/home/claude` that don't exist on the host. Pin the path server-side
  and grant the same path to a sibling filesystem-MCP server if you want the
  model to read/edit the HTML.
- Each tool call has a 90-second wall-clock timeout. AWS SDK retries happen
  inside that envelope.
- `source` paths must be **absolute**. MCP servers run in the host's working
  directory, which is unpredictable from the LLM's perspective; relative
  paths are rejected with a clear error.

## Graceful shutdown

`pubsh-mcp` traps `SIGTERM` and `SIGINT`, calls `server.close()`, and exits
0. Set `PUBSH_DEBUG=1` to log signal receipt.
