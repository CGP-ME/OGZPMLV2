# Environment archival review

This operation changes private local .env data; no production source code is edited or committed.

Mercury review status: not clean. Two TRAI-chat client calls returned empty-after-cleaning errors; one call using the existing raw-response API returned an answer. This was a supplied-evidence review without repository tools, not a fresh-index adversarial run. Raw answer stays private.

Root assessment of findings:
- Runtime restart and effective process-environment proof are missing: valid and pending. The bot has a new paper position; operator disposition remains unanswered.
- The review claims discarded keys can return through loading the original full .env. The active file has actually been replaced with the 22-key candidate. Installed five-role exact configuration/source/fingerprint comparisons pass.
- It treats credentials absent from both original and candidate as dropped credentials. The retained list is the intersection of present original keys and current role/tool credential owners; no originally present role credential was omitted.
- It claims fingerprints cover source files only. ConfigLoader.js:2189 fingerprints effective config plus sources/revisions, masking credential bytes. Independent exact private config and source equality checks supplement those fingerprints.
- Legacy tuning/pipeline-diagnostic.js still reads retired environment knobs. This is disclosed; its migration is not part of this application-role env archival. No claim of eliminating all environment use throughout the repository.
- Requiring loadDotenv=false would disable the intended credential-file ownership. It is not applied.

Completed checks: retained value round-trip equality, complete original private archive, five-role candidate and installed parity, deliberately poisoned archived process-env values unable to alter those five role snapshots. No new gates, throws, fallbacks, or application defaults introduced. No successful restart claimed.
