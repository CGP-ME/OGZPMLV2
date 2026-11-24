# Card identity: evidence exchange

This supplements the first independent Mercury review; the three candidate production files are unchanged.

## Prior reviewer position
The first review returned found_break. Its interpretation is that this card must identify the actively traded session, based on April comments and CHANGELOG entries. It acknowledged that the old listener can pair an unfiltered symbol with the selected asset price, but judged removal to conflict with that historic intent. The complete answer is retained privately and in the review answer artifact; this is a faithful summary, not a replacement verdict.

## Author position and observations
The implementation treats this card as the label for the chart price and timeframe it displays. The current chart asset selector, timeframe pills, and price source are independent of which assets the paper bot is trading. This is the disputed interpretation, not a requested conclusion.
The running session is stocks with Alpaca and active symbols TSLA, NVDA, COIN, MARA and RIOT. The public dashboard also receives price messages for BTC-USD, ETH-USD and SOL-USD while that stock session is active. These are observed facts; receiving a price message does not establish that the bot trades that asset.
The served legacy page selected NVDA while showing SOL-USD above NVDA's $151.85 price. Its actual chart title/selection was NVIDIA (NVDA). A subsequent paired Chromium observation visited NVDA, COIN and TSLA with the same served pages and live WebSocket source. Candidate source was overridden in the observer browser only; no production source or process was changed.

baseline: NVDA: 100 samples, 100 label mismatches, 0 price-mirror mismatches, last label SOL-USD, last price $150.895; COIN: 100 samples, 100 label mismatches, 0 price-mirror mismatches, last label BTC-USD, last price $103.045; TSLA: 100 samples, 100 label mismatches, 0 price-mirror mismatches, last label BTC-USD, last price $377.755.

candidate: NVDA: 100 samples, 0 label mismatches, 0 price-mirror mismatches, last label NVDA, last price $150.895; COIN: 100 samples, 0 label mismatches, 0 price-mirror mismatches, last label COIN, last price $103.045; TSLA: 100 samples, 0 label mismatches, 0 price-mirror mismatches, last label TSLA, last price $377.755.

Both contexts received live messages for five stocks plus BTC-USD, ETH-USD and SOL-USD. Both timeframe-pill checks selected and marked 5m. There were no page exceptions or blocked write commands. The contexts lacked a dashboard operator session, so session-ticket and supervisor-notice HTTP endpoints returned 401; the market-data WebSocket authenticated.
The observations prove which identity and price the card displayed. They do not measure profit, test order execution, or independently settle a product-intent conflict. No request is made to agree with the author. Review both positions against current source and the dated evidence.
