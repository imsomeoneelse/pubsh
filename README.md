# pubsh

Encrypt HTML and publish it to S3-compatible storage. Comes with a terminal
CLI and an MCP server so AI tools (Claude Desktop, Claude Code, Cursor, …)
can publish, update, and download dashboards as first-class tools.

The encrypted page is a self-contained HTML file (powered by
[staticrypt](https://github.com/robinmoisson/staticrypt)) — anyone with the
URL **and** the password can open it in a browser; without the password the
file is just opaque ciphertext.

## Architecture

Three thin layers, fully independent.

```
packages/
├── core/   @pubsh/core   — pure business logic (encryption, storage, publications)
├── cli/    pubsh         — terminal interface (commander)
└── mcp/    @pubsh/mcp    — MCP server for AI clients (stdio)
```

The **core** package knows nothing about CLI or MCP. Both protocol layers
are thin wrappers that build a `PublicationService` from `@pubsh/core` and
forward calls. Adding a new protocol (HTTP API, gRPC, …) is a new package
that depends on `@pubsh/core`; nothing else changes.

### Pluggable interfaces in core

Each external concern is hidden behind an interface so implementations can
be swapped:

- `StorageProvider` — current implementation: `S3StorageProvider`.
- `Encryptor` — current implementation: `StaticryptEncryptor`.

## Quickstart

```bash
pnpm install
pnpm build              # tsc project references build
pnpm test               # 192 tests across all packages

# one-off interactive setup of S3 credentials → ~/.config/pubsh/config.json
pnpm cli init

# encrypt and publish
pnpm cli publish ./report.html --client "Иванов Иван 1985-03-15"
# → derives id "ivanov-ivan-1985-03-15" via Russian-passport transliteration,
#   prints url + password.

pnpm cli list
pnpm cli info <id>
pnpm cli download <id>            # decrypts to ./decrypted/<id>.html
pnpm cli update <id> ./report.html
pnpm cli delete <id> --yes
```

Configuration is layered (later wins): `~/.config/pubsh/config.json` →
`./pubsh.config.json` → `PUBSH_*` env vars → CLI flags.

## MCP server (AI tool integration)

`@pubsh/mcp` exposes the same six operations (`publish`, `list`, `info`,
`update`, `download`, `delete`) as MCP tools. See
[packages/mcp/README.md](packages/mcp/README.md) for full host config. TL;DR
for Claude Desktop:

```jsonc
{
  "mcpServers": {
    "pubsh": {
      "command": "node",
      "args": ["/absolute/path/to/pubsh/packages/mcp/dist/bin.js"],
      "env": {
        "PUBSH_S3_ENDPOINT": "https://storage.yandexcloud.net",
        "PUBSH_S3_REGION": "ru-central1",
        "PUBSH_S3_ACCESS_KEY_ID": "…",
        "PUBSH_S3_SECRET_ACCESS_KEY": "…",
        "PUBSH_S3_PUBLIC_BUCKET": "…",
        "PUBSH_S3_PRIVATE_BUCKET": "…",
        "PUBSH_DOWNLOAD_DIR": "/Users/me/Claude/pubsh-dashboards"
      }
    }
  }
}
```

The `download` tool writes decrypted HTML to `$PUBSH_DOWNLOAD_DIR/<id>.html`
so the model's host filesystem tools can read and edit the file in chat;
calling `update({ id, source })` with the same path re-publishes (same URL,
same password).

## Testing

```bash
pnpm test                                  # all packages, vitest run
pnpm --filter @pubsh/core test:watch       # core only, watch mode
```

Today: 192 tests across `core` (103), `cli` (39), `mcp` (50). Both build
and tests are clean.

## License

AGPL-3.0-or-later.
