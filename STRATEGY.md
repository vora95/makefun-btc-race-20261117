# Strategy: two-tier dip bot (deep 90% + shallow 10%)

## The problem

The previous race (btc-race-24h-20261115-0828, entry 'Certain Plinth',
ID 01a1dea2) is the diagnosis this bot is built on. Its single rule —
buy a 1.2% drop over 30 bars, sell at +1.2% — made +14.31 USDC on its
dev window (4 fills) but traded ZERO times in the live 24h window:
no 1.2% 30-minute drop ever came, final PnL 0, OUT at #1895/2.828,
non_compliant (partial_usage_lines). A bot that only buys rare
capitulations can sit out the whole race.

The new dev window (16–17 Nov, 1,440 one-minute cbBTC/USDC bars) is
the opposite regime from the old one: flat, +0.49% end to end
($64,461 → $64,776), total range 2.49%, worst 30-min drop −1.80%.
Buy-and-hold makes only +1.07 USDC on it. The race window (17–18 Nov)
is adjacent to this one, so the bot must trade on a quiet day AND
survive a grinding-down day.

## The chosen bot

Two independent tiers, one account, full integer math, deterministic:

- DEEP tier, 90% of equity: BUY when close <= 98.8% of the close
  30 bars ago; SELL when close >= 101.2% of the buy decision close.
- SHALLOW tier, 10% of equity: BUY when close <= 99.5% of the close
  20 bars ago; SELL when close >= 100.8% of the buy decision close.

Each tier tracks its own quantity from the harness's fill reports
(client ids `deep-N` / `shal-N`); a tier's exit target is its own
buy decision close. A sell is only treated as done when its fill
reports back — a rejected sell leaves the holding and its target
intact. A full-size round trip costs ~26 bps (4 bps fee + 2 bps
slippage + ~7 bps impact per leg at ~640k USDC depth), so the 0.8%
shallow target still clears ~0.5% net per winning trade.

## Results (Python backtester replicating the kit fill model)

| bot | new dev (flat +0.49%) | old dev (−4.0% grind) |
| --- | --- | --- |
| **two-tier 90/10 (chosen)** | **+10.20, 9 fills, DD 1.0%** | **+9.93, 5 fills, DD 4.8%** |
| deep-only (previous bot) | +8.87, 2 fills, DD 1.0% | +14.31, 4 fills, DD 4.8% |
| shallow-only (20/0.5%/0.8%) | +12.21, 7 fills, DD 1.5% | −37.98, 1 fill, DD 7.2% |
| buy-and-hold | +1.07, 1 fill, DD 2.1% | −44.01, 1 fill, DD 7.9% |

The chosen bot trades in all four 6-hour blocks on BOTH windows
(new: 3/4/1/2 fills per block; old: 1/3/2/1). Its worst window is
+9.93 — the split is the point: shallow-only wins the flat window
but a single shallow buy traps the whole account in a downtrend
(−37.98, one fill, held to the end); at 10% of equity the same
mistake costs ~a tenth and can never trap the deep tier's capital.
The deep-share sweep is smooth (70% → new +12.21 / old +0.59;
80% → +11.32 / +5.36; 90% → +10.20 / +9.93; 95% → +9.57 /
+12.15): 90% maximises the worse of the two windows.

## What was tested and rejected

- **Stop-loss on dip buys** (0.4–1.2%): worst idea tested. Every
  variant loses on BOTH windows (best with stop: −2.60 new /
  −59.33 old; shallow-only with 0.8% stop: −15.44 / −102.80). It
  exits the winning dip while it is still deepening, then re-buys
  into the same decline — churn, not protection.
- **Max-hold / time-stop exits** (60–240 bars): all negative on
  both windows (best −0.81 new / −60.18 old). Same churn mechanism.
- **Bounce confirmation** (require the last 3–5 min to turn up
  before buying the dip): inconsistent on the old window (best
  −0.20, most variants −26 to −38) — fragile, dropped.
- **V-shape entries** (buy a rebound off the 30-bar low): best
  +9.62 old / +8.90 new but only 2 fills each, no frequency gain.
- **Regime-gated shallow tier** (shallow buys only when the 4h
  trend is flat): helps the old window (−8.54 vs −37.98) but
  still negative there, and adds nothing on the new window.
- **Trend hybrids** (Donchian/EMA/rally-chase): best −33.96 on the
  old window — 1-minute breakouts whipsaw; rejected in the previous
  build and not re-tried.
- **Single-tier shallow** (any threshold 0.3–0.8%): wins the flat
  window, catastrophically loses the grind-down window. Rejected
  as the whole account; kept as the 10% tier only.

## Live-race reasoning

Ranking is by race-window net PnL, top 10 paid ($60 for 1st). The
race window is unknown, but it is adjacent to a flat dev window, and
the previous race window was so quiet the old bot got 0 trades — so
frequency is the binding constraint, not squeezing the last dollar
out of the dev window. This bot is built to trade in every 6-hour
block in either regime (flat or grind-down), with drawdown far under
the 25% guardrail (1.0% / 4.8%). If the race window rises steadily,
dip buyers underperform holders — accepted: no dip bot can win a
melt-up, and chasing breakouts was tested and loses. If it is flat
or choppy, the shallow tier trades; if it capitulates, the deep
tier trades. The residual risk is a race window with no >= 0.5%
20-minute dip at all (then the shallow tier also sits out) — the
new dev window had 49 such trigger bars, so that would need a
markedly quieter day than the one just recorded.
