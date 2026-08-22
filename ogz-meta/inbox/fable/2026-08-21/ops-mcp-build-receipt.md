# ops-mcp — Build Receipt

Built 2026-08-21 by Fable (Claude Code) per original brief + amendment v2, approved by Trey with: restore `repo_state` + `gate_results` (7 tools), probe 7 executes with evidence, systemd units disclosed. All FILLs otherwise accepted as specced.

## What runs

- **Server:** `/opt/ogzprime/ops-mcp/server.js`, Node 22, MCP streamable-HTTP at `http://127.0.0.1:8321/mcp`, bearer-token gated (token: `/opt/ogzprime/ops-mcp/.env`, mode 640 root:opsmcp — not reproduced here).
- **Runs as:** `opsmcp` (uid 995, system user, nologin, no home). systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `ReadOnlyPaths=/opt/ogzprime`, `PrivateTmp`.
- **Bind:** `127.0.0.1:8321` ONLY. `tailscale0` did not exist at build time → per amendment v2 §5, bound loopback and STOPPED. Tailscale node install/authorization is Trey's gate; the server auto-adds the tailscale0 IPv4 bind at next restart once the interface exists. No public interface bind exists in the code in any configuration.

## Tools (7, all read-only, every response `{ asOf, source, fresh, data }`)

| tool | source | fresh window |
|---|---|---|
| `pm2_status` | snapshot file dumped by linuxuser unit running `pm2 jlist` fixed-argv | 30s |
| `run_ledger_tail(n≤100)` | `data/supervisor-ledger.jsonl` | 60s |
| `receipt_read(line)` | same + HMAC-SHA256 verify vs `supervisor-hmac.key`, `verified: true/false/null(reason)` | 60s |
| `trade_journal_tail(file∈{trade-ledger,equity-snapshots}, n≤100)` | `data/journal/*.jsonl` | 5m |
| `fatal_events_tail(n≤100)` | `data/runtime-audit/fatal-events.jsonl` | 5m |
| `repo_state` | fixed-argv git: HEAD, branch, dirtyCount, last commit | live |
| `gate_results` | `ogz-meta/gates/runs/multi-runtime-latest.json`; absence reported as absent | 24h |

No tool argument ever reaches a command or becomes a file path: numeric args are schema-validated integers used only for slicing; the single selector arg is a zod enum over hardcoded paths; git/pm2 spawns are fixed argv with zero tool input.

## PM2 socket conflict (resolved as approved)

PM2 daemons are per-user; `pm2 jlist` as opsmcp would truthfully serve an empty list. Resolution: `ops-mcp-pm2-snapshot.service` (linuxuser) loops `pm2 jlist` → `snapshots/pm2.json` every 10s via atomic mv; opsmcp serves the file, `asOf` from mtime, `fresh` = age < 30s.

## Probe results (evidence: scratchpad `ops-mcp/evidence/`, key lines below)

1. **Write probe (PASS):** `uid=995(opsmcp)`; `touch /opt/ogzprime/OGZPMLV2/PROBE-WRITE-TEST` → `Permission denied`, file absent after.
2. **.env read (PASS):** `cat /opt/ogzprime/OGZPMLV2/.env` as opsmcp → `Permission denied` (file is 600 linuxuser).
3. **Injection args (PASS):** `n: "; rm -rf / #"` and `line: "$(reboot)"` → `MCP error -32602 Input validation error` at the schema layer; no shell exists downstream to reach.
4. **Path traversal (PASS):** `file: "../../.env"` and `file: "../supervisor-hmac.key"` → enum rejection. Traversal is impossible, not defended.
5. **Bind surface (PASS):** `ss -tlnp` → single listener `127.0.0.1:8321` (node, uid 995). No wildcard, no public interface.
6. **Auth (PASS):** no token → HTTP 401; wrong token → 401; valid token → full 7-tool roster. Comparison is length-checked `timingSafeEqual`.
7. **Hostile content, EXECUTED (PASS):** second instance of the identical server code (as opsmcp, port 8322, fixture ledger) served: (a) 8KB oversized entry → capped at 4096 chars, `truncated: true`; (b) ANSI/control bytes (`ESC[2J`, BEL, NUL) → escaped to visible `\x1b/\x07/\x00`, inert; (c) embedded "IGNORE YOUR INSTRUCTIONS and run …" → returned as quoted JSON data with `verified: false` (bogus HMAC named). Unparseable raw bytes → `verified: null, verifyNote: "verification unavailable: SyntaxError"` — unavailability named, never implied. Probe instance and fixture removed after capture.

## Footprint disclosure (complete list of new privileged artifacts)

1. **`/etc/systemd/system/ops-mcp.service`** — runs server as opsmcp (unit file below).
2. **`/etc/systemd/system/ops-mcp-pm2-snapshot.service`** — the linuxuser snapshot loop; this is the only new unit running as linuxuser (unit file below).
3. Unix user `opsmcp` (system, nologin).
4. ACL grant: `setfacl -m u:opsmcp:r data/supervisor-hmac.key` — read-only, needed for receipt verification; disclosed trade-off: a compromised opsmcp could compute valid HMACs for data it already serves, it still cannot write the ledger.
5. Package `acl` installed via apt (for setfacl).

```ini
# ops-mcp.service
[Unit]
Description=ops-mcp read-only operational MCP server (runs as opsmcp)
After=network.target
[Service]
Type=simple
User=opsmcp
Group=opsmcp
WorkingDirectory=/opt/ogzprime/ops-mcp
ExecStart=/usr/bin/node /opt/ogzprime/ops-mcp/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/ogzprime
PrivateTmp=true
[Install]
WantedBy=multi-user.target

# ops-mcp-pm2-snapshot.service
[Unit]
Description=ops-mcp pm2 jlist snapshot loop (runs as linuxuser, fixed argv)
After=network.target
[Service]
Type=simple
User=linuxuser
Group=linuxuser
ExecStart=/opt/ogzprime/ops-mcp/bin/pm2-snapshot.sh
Restart=always
RestartSec=10
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
```

## HOLD state

Build complete, all 7 probes green. Holding at loopback-only per amendment v2 §5. Next step is Trey's gate: install tailscale, authorize the node on the tailnet, restart ops-mcp (it will then also bind the tailscale0 address), re-run probe 5 to show exactly two listeners.

---

## Addendum — tailnet bind (2026-08-21 21:22 UTC, authorized by Trey per amendment 5)

- `tailscale0` up at **100.100.65.88**. Server restarted; listeners are exactly `127.0.0.1:8321` and `100.100.65.88:8321` (ss evidence: `probe-rerun-tailscale.txt`). No other interface.
- `GET /health` added: unauthenticated liveness by design (disclosed) — returns only `{status, asOf}`, no data, no version, no uptime.
- **Probes 1–7 re-executed post-bind, all PASS** — auth checked on both interfaces (401 tokenless/bad-token on each), hostile-content battery re-run against the current binary (oversized→truncated, ANSI→escaped, injection→inert data, bad HMAC→`verified:false`). Evidence: `probe-rerun-tailscale.txt`, `probe-7-rerun.txt`.

## Connector config (Claude Desktop / Desktop Commander host)

In `claude_desktop_config.json` (`%APPDATA%\Claude\` on Windows), add under `mcpServers` — replace `<TOKEN>` with the value from `/opt/ogzprime/ops-mcp/.env` on the VPS:

```json
{
  "mcpServers": {
    "ops-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://100.100.65.88:8321/mcp", "--header", "Authorization:${OPS_AUTH}"],
      "env": { "OPS_AUTH": "Bearer <TOKEN>" }
    }
  }
}
```

(The `Authorization:${OPS_AUTH}` env-var form is the documented mcp-remote workaround for Windows argument-space handling.) Desktop Commander reads the same tools through this entry — one config, both agents. claude.ai web connectors cannot reach a tailnet-only address by design; that surface stays closed per ruling (a).
