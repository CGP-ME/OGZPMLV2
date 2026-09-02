# Inherited violations

## `scripts/check-protected-paths.js`

- `result.stderr || result.stdout || 'no command output'` remains a diagnostic
  text fallback, not trading data.
- `String(process.env.NTFY_TOPIC || '')` remains an env-absence fallback, but
  the ruled path is not silent: it emits a named absence and records delivery
  unavailable/unproven.
- The preserved HTTPS implementation has request-level timeout/error handling.
  No live non-2xx/timeout fault receipt was produced.
- No swallowed catch, trading-data `|| 0`, approval bypass, or trailer parser
  remains.

## `.github/workflows/protected-paths.yml`

- GitHub may withhold secrets from fork pull requests. That flows to the named
  green delivery-absence path and must not be represented as notification
  verified.
- The default-branch expression is GitHub repository metadata interpolated into
  the push command. It is not an added repo config key.
- No approval, exemption, block, revert, runtime action, or broker action exists.

## Packet files

All packet files are new. They contain no inherited production behavior.
