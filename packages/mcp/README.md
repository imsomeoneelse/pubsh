# pubsh-mcp

MCP (Model Context Protocol) server for [pubsh](https://github.com/imsomeoneelse/pubsh):
encrypt HTML and publish it to S3-compatible storage from any AI host —
Claude Desktop, Claude Code, Cursor, and anything else that speaks MCP over
stdio.

## Install

The published package is a single bundled binary; no clone, no build step.

```bash
npx -y pubsh-mcp     # one-off run, used by mcpServers configs
npm i -g pubsh-mcp   # or install globally for `pubsh-mcp` on PATH
```

Requires **Node.js ≥ 20**.

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

## Configure

`pubsh-mcp` reads configuration **only** from the environment — no
`~/.config/pubsh/config.json`, no project files. The host owns the secrets.

| Variable                      | Required | Purpose                                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------------------ |
| `PUBSH_S3_ENDPOINT`           | yes      | S3 API endpoint (e.g. `https://storage.yandexcloud.net`)                 |
| `PUBSH_S3_REGION`             | yes      | S3 region                                                                |
| `PUBSH_S3_ACCESS_KEY_ID`      | yes      | S3 access key                                                            |
| `PUBSH_S3_SECRET_ACCESS_KEY`  | yes      | S3 secret                                                                |
| `PUBSH_S3_PUBLIC_BUCKET`      | yes      | bucket where encrypted HTML is uploaded                                  |
| `PUBSH_S3_PRIVATE_BUCKET`     | yes      | bucket where the password sidecar is stored                              |
| `PUBSH_DOWNLOAD_DIR`          | no       | where `download` writes decrypted HTML (default: `os.tmpdir()/pubsh-dashboards`) |
| `PUBSH_TEMPLATE_PATH`         | no       | absolute path to a custom staticrypt wrapper template                    |
| `PUBSH_DEBUG`                 | no       | `1` prints stack traces on stderr                                        |

## Running it

### Claude Desktop

Claude Desktop's built-in filesystem tool already has read/write access to
`~/Claude/`. Point `PUBSH_DOWNLOAD_DIR` somewhere under that root and you
don't need to wire up a separate `server-filesystem` MCP at all — the model
will be able to read/edit the decrypted HTML out of the box.

```jsonc
{
  "mcpServers": {
    "pubsh": {
      "command": "npx",
      "args": ["-y", "pubsh-mcp"],
      "env": {
        "PUBSH_S3_ENDPOINT": "https://storage.yandexcloud.net",
        "PUBSH_S3_REGION": "ru-central1",
        "PUBSH_S3_ACCESS_KEY_ID": "...",
        "PUBSH_S3_SECRET_ACCESS_KEY": "...",
        "PUBSH_S3_PUBLIC_BUCKET": "...",
        "PUBSH_S3_PRIVATE_BUCKET": "...",
        "PUBSH_DOWNLOAD_DIR": "/Users/me/Claude/pubsh-dashboards"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add pubsh -- npx -y pubsh-mcp \
  --env PUBSH_S3_ENDPOINT=https://storage.yandexcloud.net \
  --env PUBSH_S3_REGION=ru-central1 \
  --env PUBSH_S3_ACCESS_KEY_ID=... \
  --env PUBSH_S3_SECRET_ACCESS_KEY=... \
  --env PUBSH_S3_PUBLIC_BUCKET=... \
  --env PUBSH_S3_PRIVATE_BUCKET=... \
  --env PUBSH_DOWNLOAD_DIR=/Users/me/Documents/pubsh-dashboards
```

### Cursor / other hosts (no built-in filesystem)

Add a sibling [filesystem-MCP][fs] server pointed at the **same** path as
`PUBSH_DOWNLOAD_DIR`:

[fs]: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem

```jsonc
{
  "mcpServers": {
    "pubsh": {
      "command": "npx",
      "args": ["-y", "pubsh-mcp"],
      "env": {
        /* …S3 + download dir envs… */
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

## Local dev

To run from a checked-out tree instead of the published bundle:

```bash
pnpm install
pnpm --filter pubsh-mcp build      # tsup → dist/bin.js
node packages/mcp/dist/bin.js
```

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
