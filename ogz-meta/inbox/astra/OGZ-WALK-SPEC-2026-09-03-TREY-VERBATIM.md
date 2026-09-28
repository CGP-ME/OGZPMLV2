# OGZ WALK SPEC — TREY'S WORDS, VERBATIM — 2026-09-03

**Author of PART A:** Trey (Edward Buhidar), spoken/typed in the Fable chat session, Sept 3 2026.
**Recorded by:** Fable. Nothing in Part A is edited, reordered, corrected, or cleaned up. Voice-to-text artifacts are left exactly as they landed. This is the ground truth the walk is checked against.
**Part B** is Fable's notes and is NOT spec. It is marked off by a hard line so nobody confuses the two.
**Destination:** `ogz-meta/inbox/trey/2026-09-03/` — walk transcript header. Committed by Trey. Same file goes to Sol and Codex.

---

# PART A — TREY, VERBATIM

## A0. Anchor statement (Aug 31 2026, recovered from the prior session record)

> it wasnt anything weve done yet i think you need to search for it it wasnt written up So basically we're looking for all of the values that are loaded into the bot at the beginning that all of them are true and all of them are in the right config and only one config that there's no silent overrides anywhere that all of the env bars that are being loaded are the correct ones and coherent and hooked up and working and then signal inception basically walking through the repo through the entire trade path and and through the recording path and any of the state stuff Like everything that's happened alongside the signal as it's tricked as it's traveling through the pipeline that everything's working as it's should be working like I was going to say at the beginning what I thought that the bot should how it how it should run and then we're going to walk against that and you're going to basically translate the code for me while we're walking as we go through all of the modules checking that everything's fucking initialized and called and that it's doing what it's actually supposed to be doing and not something else that it's not silently failed that it's not fucking throwing whatever

## A1. Outer shell

> OK let me glue some groundworks real quick about how the bot is supposed to work in general like as an overview with the exception of an eval the bot is supposed to switch automatically from stocks when the stock markets open it's supposed to switch to the stock market you know by like flattening doing all the stuff for the state and for the Ledger making sure and also the pattern profile which we haven't touched very much like the ML component of this bot is the only thing that we haven't really audited because we've never gotten that far but I have a feeling that we're going to finally be able to audit it pretty soon we finally got the shit all under the hood good to go or at least we think so Like we need to make sure like pattern bank's that that store patterns are being switched like between paper and live and then also between crypto and stocks so that there's no poisonous the pattern banks we need to make sure that all of the states stuff is taking care of during the switch like flattening and making open positions equal to zero before switching in like all of the wind down processes and stuff like that like 30 minutes out not taking any new trades by fifteen minutes h We're intentionally flattening and like selling at market price or whatever and then by 5 minutes it's like 4 sell everything and then once everything's equal to zero and there's no open positions or anything like that then it's good to switch and then whenever the stock market closes it switched back to crypto so the bots gonna be running 24/7 that's the outer shell or like the general overview now let me get down to the nitty gritty

## A2. Pattern bank / ML gets its own stop

> Well we've never even touched it like in general like we've never gotten that far to like even see patterns like at all but I'm down to add it so that we can just fucking nip it in the bud

## A3. Watching, timeframes, direction, assets

> Then we need to find all of the things that add up to create the confidence or confluence like the additive or the multiplicative elements of the confidence for whenever the signals are getting looked at so the bot in general should be watching all time frames whatever tickers are involved in its list so like I think right now we have about 8 different tickers or something like that we create a watch list the bot watches those on every time frame one minute 5 minutes 15 minutes 1 hour like whatever all of them are it watches all of them and it also needs to have the capability to if it sees something on 15 to go up to one hour and 4 hours and confirm what it sees by checking the chart for whatever it needs to see there in the in that's just an example it should be able to be able to do that on all time frames And needs to be able to trade multi direction multi asset but just one trade per asset but it can trade multiple assets at once in both directions on any time frame at any point in time OK so that's the general overview it needs to have the Actually I'm going to get into this later

## A4. Strategies, the referee, receipts, exits, break-even

> Alright so whenever a signal is generated and it's up for debate or it's up for grabs between all of the different strategies everybody everybody has an independent pipeline by the way every strategy has an independent pipeline with its own entry its own exit and its own governing rules right so whichever Tab tab tab tab Whichever strategy has the most confidence for the trade when's the trade If there's a tie it goes to whoever h If there's a tie it goes to whoever has the most confluence but I kind of want to do it like just let it run on both No we can't do that what I said originally now I want to know every single thing that adds up to all of the confidences that made that trade and I want to know what didn't and I want that to be visible in the bot I want receipts I want it in the chain of thought like XXX agrees and why why why are negative confidence in XXX and ZZZZ are plus confidence I want to know everything about it I want to see why it took a trade and why it didn't take a trade I don't know how to say that thenH So say Emma one then it's going to follow the Emma pipeline all the way through until the end and each strategy is going to have exits local to its strategy like if there's not one universal exit like each strategy should play out independently in its own pipeline and I want to know everything about it I want to know why it's deciding to exit why it took a trade why it didn't take a trade why it's going to take an exit and why it took it there and What it's thinking at all times I also feel like there needs to be some kind of break even logic to where the rest of the trade can be free like if it reaches a point that it can sell half and then that means that the rest of the trade is free and you can let it run without trying to taper the exits or without having leave without having to worry about leaving money on the table by shooting for some specific RI think that that's a more better return overall Whenever you can just break even and then let the rest of the money ride as opposed to hitting some arbitrary R or tapering out and and cutting out profit I don't know this is up for discussion but I feel like that that's the way it should go And yet again everything about everything going on in there needs to be on receipts shown recorded outputted

## A5. Dynamic entries, dynamic trailing, two exit styles

> So I want that in my thing and I think that it's already in there dynamic trailing stops and I also want dynamic entries based on you know confidence and previous trades patterns lining up you know like it's seen this trade before and it's one on 80% of them so we're going to go ahead and 1.5 the normal entry kind of thing and then dynamic trailing stops that get closer whenever it approaches any major structure like point of inflection resistance or support lines or the Fib lines and then it opens up in between So maybe those can be the two different exit styles that we can try

## A6. Pattern bank state

> Right there still needs to be heavy work done to the pattern bank system

## A7. Ledgers, receipts, chain of thought, TrAI

> OK furthermore things within the bot any of the ledgers or the trade trade receipts or anything like that need to have everything recorded on them I want the chain of thought pipe through the dash for Trey we need to have a different discussion about trace functionality and honestly Trey in general needs it can be section ten because it needs a major overhaul to it's been turned off this entire time and he's part of the big functionality of the bot

> TrAI

> I think we have a lot of work and we can start on this What what am I missing right now and I'll talk about it I don't want to talk about Tray until the very end

## A8. Answers to Fable's open-item list

*[Context, not spec — Fable's numbered list that Trey is answering: 1 normal size + total cap; 2 loss limits + flatten on breach; 3 entry floor; 4 breaks mid-trade; 5 nevers; 6 eval mode; 7 stock hours + wind-down before close; 8 tie past confluence; 9 books vs broker; 10 paper vs live; 11 candle source.]*

> Number one I don't I don't know the answer to this like can I have to just do whatever is normal I guess normal sizing Maybe something like and this needs to be changeable because whenever we're distributing this to people they need to be able to set this So like a lot of these settings that we're going that we're going to go through they need to all go in the config file or something like that that can be changed and then we'll map all of them to like AUI so that people aren't having the code to change their parameters and stuff so maybe like for me Up to like 5% of the account and then no more than 20 out 20% out at any given time I don't know I don't know what's smart Number two literally always have only run into problems whenever stuff is like this I really don't like stuff shutting my butt down I definitely don't want it flattening on number two I think that the evals the only thing that's going to cause'cause it to stop trading I think that you can put on there a loud warning bot has lost three in a row bot has lost 4 in a row or bot has lost 5% bot has lost 10% but I don't want anything shutting the bot down So this has to do with regimes too like some of the strategies trade better and like Emma Crossover doesn't trade in ranging markets or whatever or sideways markets I can only trades when it's trending or it should only be trading when it's trending and it should naturally do that via the confidence given to it and And from losses on previous trades in the pattern bank like that should just be an inherent thing Broker disconnects with position open data go stale bot restarts with three positions on the books rescue manage Flat number Freeze and scream What is it what is it what is it what does it say With the eval has its own its own config like a heavily modified trading thing like like completely out of the ordinary everything's dropping position sizing dropped it has a drawdown it has all that stuff it's it's completely different a config set and that should also be configurable well that's going to be an entirely different product that's going to be eval trading bot but for me it's just going to be a config flip That's why I built the foundation the way I did stock Will the switch is at the close so yes normally should Tight on Confluence I don't know what do you think I think books versus broker then at that point in the brokers right in the broker's right the bot should quarantine its records and fail loudj This is another thing you broke my back tester I don't know how many fucking phases ago whenever you want to do a two week overhaul of the back tester that worked completely fine and you completely mangled mine in the process the back test needs to share the same code as the production code I don't want diverging code bases on that whatever the main bot does that's how it does it in back testing except the candles come from rest as opposed to the actual market Built from one minute or born frame from the broker what does that even mean

## A9. Stock hours

> No it takes the normal 4 to 9:30 to 4

> Sorry I messed that up The person should be able to choose like if the person doesn't want to trade crypto they should be able to trade 20 45 or whatever all done through the session router all configurable through that file

> Because the crypto bot and the stock spot are different products so the crypto should trade crypto and the stock should trade stocks and whenever you get the upgraded bot then that's whenever you get the session router and the ability to fully automate or whatever

## A10. Launch state

> pPaper on launch always

## A11. Tie past confluence, and the trade packet

> Yeah on number 8 like whatever is looking like it's going to produce the most amount of money and the Botkin decide at that point in time like what's the upside to this trade what's the upside to that trade what's the potential upside or whatever

> Yeah I think that that's part of the the the packet of I want to know everything about the trade what contributed to it what didn't contribute to it how much it can make how much it could lose if it's not a short you know and then like the and then the price moving in real time and and what not

## A12. Confidence math, TrAI timing, pattern banks

> Yo II don't know confidence math like I don't I don't have any fucking clue on that Trey's gonna come at the very end after we do this walk Anything else paper versus live what does that even mean paper live and back testing should be three different pattern banks even though the patterns aren't used in back testing I want to be able to use back testing to harvest pattern packs to sell as a premium like preach train files on the specific actual ticker or stocks or but i'm thinking i'm thinking specialized

> Why can they both not be true Back test back testing should never read a pattern bank that's that's a poison back test But back testing can also harvest from that from the specific instance and then wipe it

> yeah but the back testing has its own thing live has its own pattern bank paper has its own pattern bank OK live crypto paper crypto live stocks paper stocks and back test harvesting pattern five different banks

## A13. Candle source

> If the bot sends if the if the broker sends every time frame of candle then they're all coming from the broker. I thought that one minute was the native thing from the broker but then I heard that the broker actually sends every time frame in which case I don't know why we would not do that

> There's so many different brokers it's gonna be have to be native to the broker so we're gonna have to figure that out and those will have to be coding changes but from what I'd understand Alpaca and Kraken both send all of the candles

## A14. Entry floor and nevers

> I think that whenever we do the confidence math that can be decided then and I don't know what my numbers are never lose Never Not make me money But for real I think never trading I don't know I don't like nevers if for the same reason I don't like fail closed or as people or things stopping my bot

> OK what else did I say they contradicted And then you can commit it all and then I'll distribute it to everybody you can put those in the nevers I just wasn't thinking about it like that

## A15. Boosted size

> idk make boosted like 7.5 and 25

## A16. Faults (Sept 4)

> so anything losing at the time flattens and winners stay open/'?

> flatten everything on disconnect but i have infinite or exponential reconnects i have ack acks andd ping pong and heartbeat it has no business dciong

---
---

# PART B — FABLE'S NOTES. NOT SPEC. NOT TREY'S WORDS.

## B1. The nevers (Trey's rulings tonight, collected at his word "you can put those in the nevers")

1. One trade per asset. Multiple assets at once, both directions, any timeframe. No stacking, no hedging the same asset.
2. Backtest never reads a pattern bank.
3. Nothing shuts the bot down. Nothing flattens on a loss. Warnings only. Eval rules are the one exception.
   On a fault (a confirmed disconnect, after reconnects/heartbeat have actually failed): flatten everything on that broker or symbol, winners included, scream, keep running the rest. Ruling 6 / Fourth Shape stand. Where "confirmed" sits is a stop-2 check.
4. No switch until open positions = 0 and state, ledger, and pattern profile are handled.
5. Five pattern banks, never crossed: live crypto, paper crypto, live stocks, paper stocks, backtest harvest.
6. No candle built locally. Every candle comes from the broker, native to that broker.
7. Every launch starts in paper.

## B2. Rulings closed tonight by Trey's words — lines to amend in the docs commit, on his yes

- **Conflict 1 closed → one trade per asset.** Amend: `TREY-DOCTRINE-FABLE-LANE.md` ("Hedged coexistence is the architecture"); `OGZ-MASTER-ALIGNMENT.md` Part 7 ("one long at a time, one short at a time, per ticker"). May-19 snapshot 6.B is historical; mark superseded.
- **Conflict 2 closed → candles native to the broker, none built locally, TimeframeEngine stays retired.** Amend: `TREY-RULINGS.md` Ruling 2 ("higher frames derive via TimeframeEngine"). Kraken pushes all frames; Alpaca pushes 1m and serves bigger frames on request (REST). Per-broker adapter work = missions after the walk.
- Also owed in the same commit: Ruling 11 (objection ladder) written down; Part E deviation (protected touch stays green, red only for alarm malfunction) written down; ledger pointer pulled from README step 7 and master alignment per Ruling 5; P0 "match to the cent" language removed.

## B3. Open — Trey's word needed, one sentence each

1. **Restart with open positions.** Trey asked "what does it say." Fable reads the code before the walk starts and reports in English; Trey then says what it should do. Prior handoff testimony: bot quarantines, neither manages nor flattens. Unverified by Fable.

## B4. Deferred by Trey's word

- **Confidence math** (additive vs multiplicative, single scale across strategies, entry floor): not spec. Stop 3 reads what the code does today, Fable translates, Trey rules after.
- **TrAI** (`trai_brain`) + trace: stop 10 census only during the walk; overhaul and full discussion after the walk, at the very end.
- **Pattern bank build:** stop 9 census only; heavy build is its own mission after the walk.

## B5. Twin-run board (proofs after the walk, money decides)

- Exit style A (break-even then let the rest ride) vs B (full size, trailing stop tightens near structure, loosens between).
- Sizing numbers (5% normal / 7.5% boosted / 25% total out) vs alternatives.
- Extended-hours stock blocks vs regular hours only.

## B6. Spec implications flagged for the walk (checks, not decisions)

- Tiebreak on make-vs-lose means every strategy's signal must carry its own expected gain and expected loss. Stop 3.
- Fault-flatten must trigger only on a confirmed dead connection, not a heartbeat blip; reconnect/ack/ping-pong/heartbeat logic is a claim until read. Stop 2.
- SessionRouter wind-down must know which session block it is in; "sell at market" only works as written inside 9:30–4:00 ET. Stop 8.
- Pattern-bank read is a setting: on in paper/live, off in backtest. Same code, one switch. Stop 9.
- Backtest runner must call the same modules `run-empire-v2.js` calls, candles from REST. Any divergence fails the station.
- Sizing (stop 4) leans on pattern-bank win stats (stop 9); those stats must be proven true before sizing may trust them.
- DynamicTrailingStop exists as a file name only; whether it tightens near structure is a stop-6 question.

## B7. The stops (the walk's order)

1. Boot
2. Data coming in
3. Deciding (signals born, confidence added up, one wins)
4. Signal to order (sizing, guards, order built)
5. Order to position (broker ack, bot records it)
6. Managing the position (stops, targets, trailing)
7. Exit, closed, written to the books
8. Books vs broker, and the crypto/stocks switch
9. Pattern bank / ML
10. TrAI + trace

## B8. Session defaults recorded (all configurable, per Trey)

- Trey's default: stocks 9:30–4:00 ET regular hours only; crypto the rest of the time and weekends; crypto→stocks at 9:30, stocks→crypto at 4:00; 30/15/5 wind-down before 4:00.
- Three products: crypto-only bot, stock-only bot, upgraded bot with SessionRouter running both. Same code, config decides.
- Normal size up to 5% of account per trade; a boosted (pattern-confirmed) trade up to 7.5%; no more than 25% out at once. All three are config values. (Trey: "I don't know what's smart"; twin-run question.)
- Loud warnings at 3 losses in a row, 4 in a row, 5% down, 10% down. No stop, no flatten.
- Eval: its own full config set, tightened everything; config flip for Trey, separate product for others.
- Books vs broker: broker is right; bot quarantines its records and fails loud.

---
**WHAT I DID:** copied Trey's Sept 3 dictation into Part A character for character from this session, in order; put the Aug 31 anchor statement at the top from the uploaded handoff record; wrote Part B from tonight's exchange only.
**WHAT I DID NOT DO:** edit, reorder, or correct anything in Part A; read any bot code for Part B; commit or push anything.
**WHAT I ASSUMED:** "Trey" in A7 = TrAI (Trey corrected it himself); "the normal 4 to 9:30 to 4" = 9:30–4:00 ET regular hours (Trey confirmed by not objecting, then made it configurable).
