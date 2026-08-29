# Environment census adversarial receipt

Date: 2026-08-29

Reviewed artifact: `ogz-meta/inbox/amp/2026-08-28/env-census.md`

Artifact SHA-256: `387c361a6be35de62dc24e9b7923bd8a1d7c8431d8cdf06c4a15a51d3bc258ef`

Artifact bytes: 131,006

Review checkout began at `ce132ea22dfffa3a21811cb4c70c761aaafc7a27`.
Provider raw bytes remain mode `0600` under the ignored cognition-history tree;
they are not copied into Git.

## Run and raw-receipt index

Ledger: `ogz-meta/cognition-history/mercury-runs/2026-08-28.jsonl`.
Every successful run applied `mercury-2`, genuine `claude-fable-5`, and
`kimi-k3`. Fable recorded `claude-haiku-4-5-20251001` only as auxiliary
telemetry. Every Fable and Kimi stage recorded tools available `[]`, calls `[]`,
total calls `0`, and files mechanically opened `[]`. Each successful challenge
used one bounded Mercury recheck before Kimi adjudication.

The `Raw set` hash is SHA-256 of the sorted `sha256  basename\n` manifest for
all Mercury, recheck, Fable, stderr, and Kimi raw files in the named secured
directory. `Fable SHA` and `Kimi SHA` identify `fable_challenger-1.raw` and
`kimi_tie_breaker-1.raw`; each is mode `0600`.

| Ledger | Run ID | Lines / excerpt SHA-256 | Termination / verdict | Secured raw directory suffix | Raw set SHA-256 | Fable SHA-256 | Kimi SHA-256 |
|---|---|---|---|---|---|---|---|
| `:6` | `2026-08-28T21-51-09-754Z-fa75570ec9c1` | 1-150 / `70085ac24e27cef600ab3a3d6d3be10fbe657c9d3388d2648fbfa99e70bf344c` | dispatch failure / `tool_failure` | none | none | not dispatched | not dispatched |
| `:7` | `2026-08-28T21-52-59-577Z-85b0cc4d4358` | 1-75 / `0df2825202eb10ac1c10ff88d039887311b85ee5b090a4a679344c66ad2720c4` | answer, 8 / `cannot_verify` | `2026-08-28t21-51-43-456z-1258540-76c10899579d/` | `2b9f7dcf6a51b108f165ac0dcb523cd1a3cc6afe884fc0b92a6b24cc65324e3b` | `586b51cbffdc73b49d396372fec12695acd9f649e9cd8f058177286151468c24` | `4fddb6461c98271cc0ef525fcae9907245408789d43ee9df1ecaa76760cb8f46` |
| `:8` | `2026-08-28T21-55-18-239Z-150ee54b77e5` | 76-150 / `ca88241f3435fd0237f5ca0ce2897cd72e5363e4cd478756bb48afa729b70aea` | answer, 16 / `cannot_verify` | `2026-08-28t21-53-09-373z-1258825-ab13c92e56ae/` | `5e360fd43ffd75577803a7f73b37fc5dcbcc223a5838aaf3781e6684c4e80153` | `22229a48da514e3c1fca5433930af667f41ea3dcc44841cf931e5a20dbf36ad6` | `d1dc8c9efd5434f5534a6d51a220c78884ec98eafbbd39fa0671d8a3bef4d3a6` |
| `:9` | `2026-08-28T21-57-36-314Z-be3161f7f7b0` | 151-225 / `8aa5721c396a4af8d11bec9aa2fe4e48cae943b7fd8c1644c6df693eee196ba8` | answer, 16 / `no_break_found` | `2026-08-28t21-55-29-579z-1259183-2a3bf2903ec4/` | `2ab0dc20bc015cf3a00e929243f0dd57f474d6ab145c9654f2b3241fa1184a43` | `14b9e3fd1a5378e98e897f264dc6fa447e1aa6be2b28ce3000fc0a29529b0786` | `708816b5e2ea06b510a94cab2ad8653405e347d2cfd8e278a84b2f3052091c04` |
| `:10` | `2026-08-28T21-59-13-938Z-051802b21781` | 226-300 / `29a19c02e10faff8abf7ddc32093d35f8795f27fb38ca4cb95aa5b627ac6da42` | answer, 10 / `cannot_verify` | `2026-08-28t21-57-47-765z-1259726-0ae4d4722641/` | `ff14fcd1f246904f58d27581b995dc045b2f15d20a0540408c8d2a4325ff5898` | `16f83e62c32b1a1633146dde0cbff46093dd2752a1ad9e2d7439810a936b7af4` | `221ec1e7b4dda0cbf56efb17fbf07a229f0d8de0e49eaab08bbccb3958b471fb` |
| `:11` | `2026-08-28T22-00-56-231Z-e716833df022` | 301-375 / `d60a92ca70629d247fe631f3600f7227a32143e2a1a44814a4f360d40d04f3a6` | answer, 8 / `no_break_found` | `2026-08-28t21-59-29-180z-1260002-42c6a675bfd3/` | `037861ead7f71dd3afcf4bb426fd1a943090b755fc65dc48aec22a9f7fa26d77` | `c296a9d6433ae635b37799b653bef8dd9eb5d3b9a23c7124a0332751d1be54f0` | `1fac257c552534a9e327acf1588b12c7a0d95acce22efdeb41c72d0722c14677` |
| `:12` | `2026-08-28T22-02-52-428Z-a72fc9aaa347` | 376-450 / `9f66dba10521d76d6c1b37c553ec6384482e9c7099d5320bfd782b674edb93de` | answer, 8 / `cannot_verify` | `2026-08-28t22-01-06-400z-1260322-18278b76f72e/` | `6e4f9a15e3f9962989778d15b63c35a78f865a2ca9afd3a35c6c2d1c959f4ccc` | `f6ef97c1e301c661e83d2f63a71bccbf790f0288509442febdb16272076fec16` | `483b195615ee2a3e7bb2541742ea0d69b04da3ae8405cc3223f83ef3b05a6123` |
| `:13` | `2026-08-28T22-05-51-974Z-3ca24d1afd96` | 451-525 / `306e1e917a62f8f979998ca44c2ef51cc28709df503b391f614ecc81d614b85e` | answer, 12 / `cannot_verify` | `2026-08-28t22-03-03-887z-1260655-1f9cd0f771d0/` | `d0aed2f2cc5010ebc83852604bbf2c7d5072d579d264cfd1749f2bcc85f026ba` | `3637dabb0e9be611d6fe59c74d8be4940e47c529266e90fb2bd5fa72883e96b4` | `2db49328633bcd62c7fbeefbab5c804ab1dd1ec88a4be78fc81c4f49dc0ba249` |
| `:14` | `2026-08-28T22-08-00-121Z-04eac0962ee0` | 526-600 / `c127d53f238807d8c3e015d3229a7569d424897326917be783a8084893a4ee09` | answer, 28 / `no_break_found` | `2026-08-28t22-06-04-188z-1261118-313d5ae83973/` | `6b066ce7b97a95c89495b5a5ac123df7f91448dd5befa015b31df0b8fe334378` | `18a0bcf305a2675087012b9031d42715f0e6551a6c6e74978b2edcb6984da1dd` | `b8b96a37c8c60b924b4515d7745ec29d132e92576e417bf0bec2c0de0b75defc` |
| `:15` | `2026-08-28T22-10-01-990Z-1b6619de3e10` | 601-662 / `afeda0e38485075bc1b8d957a6ff62fbee2a5637605e11116f9e2d6761155cfb` | answer, 14 / `no_break_found` | `2026-08-28t22-08-12-500z-1261596-bfdfe93be7a4/` | `97b7d68b88b1c1ae99fda51bfb717e3ffd322ce7dd80de1f44a73ab14e281f41` | `9a5b4fd84d8c7a754d790df2fc91b65956705e674258a6c74e9ab88fc84a1fd9` | `105dd5e771cbe83d365f796d8ba9100176c06e0d3c78b0f8c1c5a279981a7230` |

All secured directory paths are relative to
`ogz-meta/cognition-history/mercury-runs/raw/2026-08-28/`. Individual Mercury
and recheck raw hashes remain in the corresponding ledger row under
`stages.*.provider_attempts`; this receipt does not duplicate raw model text.

## Rerun chain

The initial 1-150 request failed before provider dispatch because the embedding
endpoint rejected an input over 8,192 tokens. That failure is preserved at ledger
`:6`; it is not a model verdict. The artifact was then reviewed once, without
overlap or omission, as 1-75, 76-150, 151-225, 226-300, 301-375, 376-450,
451-525, 526-600 and 601-662. This changed only dispatch sizing; every descriptor
remained host-attested against the same full artifact hash.

## Material allegations and dispositions

1. **Models repeatedly alleged that explicit BROKER, CANDLE_FILE,
   CANDLE_SOURCE, CANDLE_TIMEFRAME, account and fee defaults were not
   “fabrication.”** The artifact explicitly defines fabrication narrowly at line
   18: yes where a fallback supplies missing broker/instrument/account/candle/fee
   identity or financial truth. Under that declared audit definition an explicit
   hard-coded fallback can be fabrication. Disposition: **rejected as a model
   definition substitution**, not a census error.
2. **Models alleged `BROKER` fallback notation was false because an enclosing
   expression returns a boolean or null.** Mechanical inspection confirmed the
   cited sites literally use `(env.BROKER || '')` or
   `(process.env.BROKER || '')`; the census records the reader fallback, not the
   enclosing function's ultimate return. Disposition: **rejected**.
3. **Models alleged empty Kraken credential defaults and disabled stock-share
   range zeros were fabrication.** The bounded recheck traced empty credentials
   to explicit startup validation and the range values behind a default-false
   enable gate. The census marks those rows `no`. Disposition: **the census was
   confirmed**.
4. **Models alleged cross-file default differences were defects omitted by the
   census.** Direct opens confirmed the census already records them, including
   ConfigLoader BROKER `alpaca` versus MultiAssetManager `kraken`, and
   CANDLE_SOURCE `websocket` versus `live` in separate config surfaces.
   Disposition: **not a missing census claim**.
5. **Mercury issued universal clearances from spot checks and occasionally cited
   files it had not opened.** Fable correctly challenged these statements.
   Disposition: unsupported blanket claims were discarded; only opened
   file:line allegations were mechanically adjudicated.

No provider found a specific source name, ownership class, cited fallback, reachability
flag, dead-example entry, or parser count that survived mechanical contradiction.

## Final conclusion and limitations

Final repo conclusion: **no supported environment-census correction**. The
artifact remains 536 named/computed rows across 267 inventoried runtime source
files, with 151 names in `config/.env.example`, 81 dead example names, and zero
reported JavaScript/TypeScript, Python, or shell parse failures.

Limitations: this adversarial pass did not independently rebuild the generator's
entire 536-row inventory. It reviewed every supplied line through authenticated
provider stages and mechanically investigated every material allegation. Ledger
`cannot_verify` values remain unchanged where model evidence was incomplete.
Raw provider bytes stay ignored and local; their secured paths and immutable
hashes are recorded above.
