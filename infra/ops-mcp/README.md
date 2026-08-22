# ops-mcp

Read-only operational MCP server for OGZPrime. This directory is the
version-controlled source of the audited Tier-1 artifact (Fable audit: PASS,
2026-08-21 — receipt at `ogz-meta/inbox/fable/2026-08-21/ops-mcp-build-receipt.md`).

- **Deploy target:** `/opt/ogzprime/ops-mcp/` on `ogzprime-prod-001` (files
  root-owned; `bin/pm2-snapshot.sh` under `bin/`; `npm install` in place for
  `@modelcontextprotocol/sdk`, `express`, `zod`).
- **Runs as:** the unprivileged `opsmcp` user via `ops-mcp.service`. The
  companion `ops-mcp-pm2-snapshot.service` runs as `linuxuser` and dumps
  `pm2 jlist` to `snapshots/pm2.json` every 10s (per-user pm2 daemon
  isolation — see receipt).
- **Bind:** `127.0.0.1` + the `tailscale0` address only, port from `.env`
  (default 8321). No public interface in any configuration.
- **Token:** `/opt/ogzprime/ops-mcp/.env` (`OPS_MCP_TOKEN`, mode 640
  root:opsmcp) — **NEVER in this repo.** No secret is committed here; the
  server refuses to start without a token of at least 32 chars.
