// Two-tier dip bot for make.fun btc-race-24h-20261117-0603.
//
// Lesson from the previous race (btc-race-24h-20261115-0828, entry
// 'Certain Plinth'): a single deep-dip rule (buy on a 1.2% drop over
// 30 bars, sell +1.2%) made +14.31 USDC on its dev window but traded
// ZERO times in the live 24h window — no 1.2% drop ever came — and
// finished OUT at #1895 with PnL 0. A bot that only buys rare
// capitulations can sit out the whole race.
//
// This bot keeps the proven deep-dip tier but adds a small shallow
// tier so it also trades ordinary quiet days, with the capital split
// so a shallow buy can never trap the whole account:
//
//   DEEP tier, 90% of equity: BUY when close <= 98.8% of the close
//     30 bars ago (30-min drop >= 1.2%); SELL at +1.2% vs the buy
//     decision close. The capitulation trade that paid on both dev
//     windows tested (+14.31 on the 15-Nov window, +8.87 on this one).
//   SHALLOW tier, 10% of equity: BUY when close <= 99.5% of the
//     close 20 bars ago (20-min drop >= 0.5%); SELL at +0.8% vs the
//     buy decision close. Small dips bounce often on flat days; at
//     10% of equity a buy that keeps falling costs little and can
//     never trap the deep tier's capital.
//
// The two tiers hold independently (separate quantities, tracked
// from the harness's own fill reports). Long only, no stop-loss
// (tested and REJECTED on both windows: stops exit the winning dip
// while it is still deepening and churn the account — worst variant
// -122.55 on the 15-Nov window), no trailing exit, no trend chasing,
// no clock, no randomness: all integer math, fully deterministic.
//
// Evidence (Python backtester replicating the kit fill model — fee
// 4 bps, slippage 2 bps, constant-product impact vs open depth):
//   new dev window (16-17 Nov, flat +0.49%): +10.20 USDC, 9 fills,
//     max drawdown 1.0%, trades in all four 6h blocks.
//   old dev window (15 Nov, BTC -4.0% grind down): +9.93 USDC,
//     5 fills, max drawdown 4.8%, trades in all four 6h blocks.
//   Single-tier controls: deep-only +8.87 / +14.31 (2-4 fills,
//     trades in 1-2 blocks); shallow-only +11.66 / -37.98 (the
//     shallow buy traps the whole account in a downtrend — that is
//     why it only gets 10% here). The split is the point: the worst
//     of the two windows is +9.93, not -37.98.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 10_000;

/** Deep tier: 30-bar lookback, buy on a >= 1.2% drop, sell at +1.2%. */
const DEEP_LOOKBACK = 30;
const DEEP_DIP_NUM = 9880n;
const DEEP_DIP_DEN = 10000n;
const DEEP_TARGET_NUM = 10120n;
const DEEP_TARGET_DEN = 10000n;
/** Deep tier's share of equity per buy (90%). */
const DEEP_SHARE_NUM = 90n;
const DEEP_SHARE_DEN = 100n;

/** Shallow tier: 20-bar lookback, buy on a >= 0.5% drop, sell at +0.8%. */
const SHALLOW_LOOKBACK = 20;
const SHALLOW_DIP_NUM = 9950n;
const SHALLOW_DIP_DEN = 10000n;
const SHALLOW_TARGET_NUM = 10080n;
const SHALLOW_TARGET_DEN = 10000n;
/** Shallow tier's share of equity per buy (10%). */
const SHALLOW_SHARE_NUM = 10n;
const SHALLOW_SHARE_DEN = 100n;

function fellAtLeast(now: bigint, then: bigint, num: bigint, den: bigint): boolean {
  return now * den <= then * num;
}
function roseAtLeast(now: bigint, ref: bigint, num: bigint, den: bigint): boolean {
  return now * den >= ref * num;
}

interface Tier {
  /** Quantity actually held, confirmed by fill reports. */
  qty: bigint;
  /** Close at the bar on which the current holding's buy was decided. */
  entryClose: bigint | null;
  /** Close of a buy decided last bar whose fill has not reported yet. */
  pendingClose: bigint | null;
  /** True while a sell decided last bar has not reported yet. */
  pendingSell: boolean;
  /** Suffix for client ids of this tier's orders. */
  tag: string;
}

const deep: Tier = { qty: 0n, entryClose: null, pendingClose: null, pendingSell: false, tag: 'deep' };
const shallow: Tier = { qty: 0n, entryClose: null, pendingClose: null, pendingSell: false, tag: 'shal' };
let orderSeq = 0;

/** Fold the previous batch's fill reports into the tiers' confirmed state. */
function applyFills(batch: { fills: readonly { client_id: string; side: string; status: string; qty: string }[] }): void {
  for (const fill of batch.fills) {
    const tier = fill.client_id.startsWith('deep-') ? deep : fill.client_id.startsWith('shal-') ? shallow : null;
    if (tier === null) continue;
    if (fill.side === 'buy') {
      if (fill.status === 'filled') {
        tier.qty += BigInt(fill.qty);
        tier.entryClose = tier.pendingClose;
      }
      tier.pendingClose = null;
    } else if (fill.side === 'sell') {
      if (fill.status === 'filled') {
        tier.qty = 0n;
        tier.entryClose = null;
      }
      tier.pendingSell = false;
    }
  }
}

/** Closes of CBBTC, one per batch, in batch order. */
const closes: bigint[] = [];

await runBars({
  onBatch(state: BarsState, batch): OrderInput[] {
    applyFills(batch);
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    const i = closes.length - 1;
    const orders: OrderInput[] = [];
    const minNotional = BigInt(state.hello.fees.min_notional_quote_units);

    // --- sells: each tier exits on its own target ---
    // Qty/entryClose are only cleared when the sell fill reports back;
    // a rejected sell leaves the holding (and its target) intact.
    if (!deep.pendingSell && deep.qty > 0n && deep.entryClose !== null && roseAtLeast(close, deep.entryClose, DEEP_TARGET_NUM, DEEP_TARGET_DEN)) {
      deep.pendingSell = true;
      orders.push({ side: 'sell', symbol: SYMBOL, qty: deep.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `deep-${++orderSeq}` });
    }
    if (!shallow.pendingSell && shallow.qty > 0n && shallow.entryClose !== null && roseAtLeast(close, shallow.entryClose, SHALLOW_TARGET_NUM, SHALLOW_TARGET_DEN)) {
      shallow.pendingSell = true;
      orders.push({ side: 'sell', symbol: SYMBOL, qty: shallow.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `shal-${++orderSeq}` });
    }

    // --- deep buy: 90% of equity on a 30-min drop >= 1.2% ---
    if (deep.qty === 0n && deep.pendingClose === null && i >= DEEP_LOOKBACK) {
      const then = closes[i - DEEP_LOOKBACK]!;
      if (fellAtLeast(close, then, DEEP_DIP_NUM, DEEP_DIP_DEN)) {
        const notional = (state.equity * DEEP_SHARE_NUM) / DEEP_SHARE_DEN;
        const spend = notional < state.cash ? notional : state.cash;
        if (spend >= minNotional) {
          deep.pendingClose = close;
          orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `deep-${++orderSeq}` });
        }
      }
    }

    // --- shallow buy: 10% of equity on a 20-min drop >= 0.5% ---
    if (shallow.qty === 0n && shallow.pendingClose === null && i >= SHALLOW_LOOKBACK) {
      const then = closes[i - SHALLOW_LOOKBACK]!;
      if (fellAtLeast(close, then, SHALLOW_DIP_NUM, SHALLOW_DIP_DEN)) {
        const notional = (state.equity * SHALLOW_SHARE_NUM) / SHALLOW_SHARE_DEN;
        const spend = notional < state.cash ? notional : state.cash;
        if (spend >= minNotional) {
          shallow.pendingClose = close;
          orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `shal-${++orderSeq}` });
        }
      }
    }

    return orders;
  },
});
