# Two-Tier Dip Bot — make.fun btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/vora95/makefun-btc-race-20261117/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/vora95/makefun-btc-race-20261117/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A bot that trades cbBTC/USDC minute by minute in the make.fun 24-hour
paper-money race. Long only, two independent tiers sharing one account.

## Strategy

- **DEEP tier (90% of equity):** BUY when the close is at least 1.2%
  below the close 30 bars ago; SELL at +1.2% vs the buy decision close.
- **SHALLOW tier (10% of equity):** BUY when the close is at least
  0.5% below the close 20 bars ago; SELL at +0.8% vs the buy decision
  close.

No stop-loss, no trailing exit, no trend chasing. See `STRATEGY.md`
for the evidence: the previous race's 0-trade failure, the dev-window
results on two different regimes, and the rejected alternatives
(stop-loss, bounce confirmation, trend hybrids, single-tier variants).

## Dev-window results (grade-local, process driver)

- New dev window (16–17 Nov, flat +0.49%): net PnL **+10.20 USDC**,
  9 fills, max drawdown 1.0%, trades in all four 6-hour blocks.
- Previous dev window (15 Nov, BTC −4.0% grind down, out-of-sample
  cross-check): net PnL **+9.93 USDC**, 5 fills, max drawdown 4.8%,
  trades in all four 6-hour blocks.
- Baselines on the new window: buy-and-hold +1.07, momentum and
  ema-cross lose (see STRATEGY.md).

## Run

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

Only the standard library plus the vendored `vendor/makefun-bars.ts` shim
(a byte-identical copy of the kit SDK) is used. No network, no clock,
no randomness: two runs on the same data produce byte-identical action logs.

## License

MIT. See `LICENSE`.
