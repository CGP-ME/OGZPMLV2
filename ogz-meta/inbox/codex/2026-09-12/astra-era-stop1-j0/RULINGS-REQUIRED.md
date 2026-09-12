# STOP 1 rulings required before implementation

These are the policy choices the current source and recorded authority do not settle. Demonstrated producer bugs do not require a ruling to be real.

## K1. Mode owner and persistence

Current code reads `PROFILE` from the environment or falls back to `launchProfiles.defaultProfile`; additional mode readers remain. Historical v4 text alternately places PROFILE in settings and attributes a UI-written `.env` bootstrap selector to Trey. The original controlling quotation for that exact exception is not present in the audited authority files.

Required ruling: name the single durable owner of paper/live selection, whether the UI changes it, and what selection the next process start uses after an operator chooses live.

Already fixed by doctrine regardless of the choice: paper must govern every mutation path, and alternate mode variables cannot disagree.

## K2. Sizing denominator and earned boost qualification

The values 5% normal, 7.5% boosted, and 25% total are recorded. Current code uses available capital, continuous confidence scaling, confluence scaling, a per-order cap, and later share adjustment. Assigning the three numbers to current field names does not implement their meanings.

Required ruling: identify the account measure used for 5/7.5/25 and the exact evidence that earns the 7.5% boost.

Already fixed by doctrine regardless of the choice: the 7.5% ceiling applies after multipliers and rounding, and total existing plus pending exposure cannot exceed the ruled aggregate limit.

## K3. Daily-loss accounting boundary

The current words settle the response: at 50% daily loss, block new entries, sell nothing, preserve exits, and require operator restart. They do not settle the measured account/session boundary or whether the value uses realized PnL, marked equity, or both across broker/session changes and restarts.

Required ruling: name the account/session scope, the daily baseline, the loss measure, and restart-day behavior.

## K4. Paper startup with earlier live positions

Current SessionRouter initial activation rejects any normalized target position/order. Restored local trades are processed separately. Other recovery code can submit broker mutations through independent paths.

Required ruling: when the bot starts in paper while an earlier live position still exists at the broker, state whether that paper process may manage that identified live position and, if so, the exact permitted actions.

No implementation may infer permission to submit a live order from the mere existence of a broker position.

## Footer

WHAT I DID: reduced Astra's seven repeated ruling rows to four distinct policy decisions.

WHAT I DID NOT DO: recommend hidden defaults or turn engineering discovery into policy questions.

WHAT I ASSUMED: newer direct Trey words supersede historical plan attributions once recorded with their exact meaning.
