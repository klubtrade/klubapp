// packages/calc/src/calculator.ts
/**
 * Pre-trade calculator — the math behind "The Math".
 *
 * Every formula below is for isolated-margin linear perpetuals (the Bulk
 * contract type). Cross-margin and inverse perps require different math
 * and are out of scope for V1.
 *
 * Sign conventions:
 *   - Long positions have positive signed size.
 *   - Short positions have negative signed size in downstream Position
 *     objects, but this calculator takes `side: 'long' | 'short'` for
 *     clarity at the pre-trade surface.
 *
 * All monetary values are in quote currency (USDC). All prices are in
 * quote per base. All rates are decimals (e.g. 0.0001 = 1 bp = 0.01%).
 */

// ---------------------------------------------------------------------------
// Inputs & outputs
// ---------------------------------------------------------------------------

export type Side = 'long' | 'short';

/**
 * Everything a trader needs to supply before hitting "place".
 *
 * `size` is specified in **base units** (e.g. 0.1 BTC). Use
 * `sizeFromNotional` to convert from a USD-notional intent.
 */
export interface CalcInput {
  readonly side: Side;
  /** Leverage ratio, e.g. 3 for 3x. Must be > 0. */
  readonly leverage: number;
  /** Entry price in quote per base. */
  readonly entryPrice: number;
  /** Size in base units. */
  readonly size: number;
  /** Target price — for profit scenario. Optional. */
  readonly targetPrice?: number;
  /** Stop price — for loss scenario. Optional. */
  readonly stopPrice?: number;
  /** Maintenance margin fraction (e.g. 0.005 for 0.5%). From Bulk risk surface. */
  readonly maintenanceMarginFrac: number;
  /** Taker fee in basis points (e.g. 5 for 0.05%). From Bulk fee state. */
  readonly takerBps: number;
  /**
   * Current 8h funding rate as a decimal. Positive = longs pay shorts.
   * Optional — if omitted, funding-cost outputs are zero.
   */
  readonly funding8hRate?: number;
}

/**
 * Everything the calculator derives. Undefined fields indicate the
 * input wasn't provided (e.g. no targetPrice → no pnlAtTarget).
 */
export interface CalcOutput {
  /** Notional value of the position at entry, in USDC. */
  readonly notional: number;
  /** Required margin at the chosen leverage, in USDC. */
  readonly requiredMargin: number;
  /**
   * Liquidation price — the mark at which the position is force-closed
   * under isolated margin. Accounts for maintenance margin; ignores
   * accrued funding (runs outside the snapshot).
   */
  readonly liquidationPrice: number;
  /**
   * Distance from entry to liquidation as a fraction of entry
   * (e.g. 0.15 = 15% adverse move before liquidation).
   */
  readonly liqBufferFrac: number;
  /** PnL at the target price, in USDC. Undefined if no target given. */
  readonly pnlAtTarget?: number | undefined;
  /** PnL at the target as a fraction of required margin (ROI). */
  readonly pnlAtTargetRoiFrac?: number | undefined;
  /** Loss at the stop price, in USDC (negative number). */
  readonly lossAtStop?: number | undefined;
  /** Loss at the stop as a fraction of required margin (negative). */
  readonly lossAtStopRoiFrac?: number | undefined;
  /** Reward/risk ratio. Undefined if target or stop missing. */
  readonly rewardToRisk?: number | undefined;
  /** Round-trip fees (entry + exit at target if provided, else at entry). */
  readonly feesRoundTrip: number;
  /** Funding cost per 8h at current rate. Negative = you receive. */
  readonly fundingCostPer8h: number;
  /** Funding cost per 24h (3 periods). */
  readonly fundingCostPer24h: number;
  /**
   * Breakeven move required — the minimum price move in the profitable
   * direction needed to cover round-trip fees and one funding payment.
   * Expressed as a fraction of entry price.
   */
  readonly breakevenFrac: number;
  /** Breakeven price (entry + breakevenFrac * entry, sign-adjusted). */
  readonly breakevenPrice: number;
  /** Whether the chosen stop triggers BEFORE liquidation (good) or AFTER (bad). */
  readonly stopIsSafe?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CalcError extends Error {
  public override readonly name = 'CalcError';
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CalcError(`${label} must be a positive finite number`);
  }
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Run the full pre-trade calculation.
 *
 * Throws `CalcError` on obviously invalid inputs (non-positive leverage,
 * zero size, negative maintenance fraction). Returns a stable shape with
 * optional fields for scenarios the caller didn't request.
 */
export function calculate(input: CalcInput): CalcOutput {
  requirePositive(input.leverage, 'leverage');
  requirePositive(input.entryPrice, 'entryPrice');
  requirePositive(input.size, 'size');
  if (input.maintenanceMarginFrac < 0 || input.maintenanceMarginFrac >= 1) {
    throw new CalcError('maintenanceMarginFrac must be in [0, 1)');
  }
  if (input.takerBps < 0) {
    throw new CalcError('takerBps must be non-negative');
  }

  const takerFrac = input.takerBps / 10_000;
  const notional = input.size * input.entryPrice;
  const requiredMargin = notional / input.leverage;

  const liquidationPrice = liqPrice({
    side: input.side,
    entryPrice: input.entryPrice,
    leverage: input.leverage,
    maintenanceMarginFrac: input.maintenanceMarginFrac,
  });

  const liqBufferFrac =
    input.side === 'long'
      ? (input.entryPrice - liquidationPrice) / input.entryPrice
      : (liquidationPrice - input.entryPrice) / input.entryPrice;

  // Fees assume taker on both legs — worst-case for retail.
  const feesRoundTrip = notional * takerFrac * 2;

  const funding8h = input.funding8hRate ?? 0;
  // Long pays when funding positive; short receives. We report the
  // signed cost from *this* position's perspective.
  const fundingSign = input.side === 'long' ? 1 : -1;
  const fundingCostPer8h = notional * funding8h * fundingSign;
  const fundingCostPer24h = fundingCostPer8h * 3;

  // Breakeven needs to cover fees + one funding period (conservative).
  const breakevenCost = feesRoundTrip + Math.max(0, fundingCostPer8h);
  const breakevenFrac = breakevenCost / notional;
  const breakevenPrice =
    input.side === 'long'
      ? input.entryPrice * (1 + breakevenFrac)
      : input.entryPrice * (1 - breakevenFrac);

  // Optional scenarios
  let pnlAtTarget: number | undefined;
  let pnlAtTargetRoiFrac: number | undefined;
  let lossAtStop: number | undefined;
  let lossAtStopRoiFrac: number | undefined;
  let rewardToRisk: number | undefined;
  let stopIsSafe: boolean | undefined;

  if (input.targetPrice !== undefined) {
    requirePositive(input.targetPrice, 'targetPrice');
    const gross = pnlGross(input.side, input.size, input.entryPrice, input.targetPrice);
    pnlAtTarget = gross - feesRoundTrip;
    pnlAtTargetRoiFrac = pnlAtTarget / requiredMargin;
  }

  if (input.stopPrice !== undefined) {
    requirePositive(input.stopPrice, 'stopPrice');
    const gross = pnlGross(input.side, input.size, input.entryPrice, input.stopPrice);
    lossAtStop = gross - feesRoundTrip;
    lossAtStopRoiFrac = lossAtStop / requiredMargin;

    // Safe if the stop is hit BEFORE the mark reaches liquidation.
    stopIsSafe =
      input.side === 'long'
        ? input.stopPrice > liquidationPrice
        : input.stopPrice < liquidationPrice;
  }

  if (pnlAtTarget !== undefined && lossAtStop !== undefined && lossAtStop < 0) {
    rewardToRisk = pnlAtTarget / Math.abs(lossAtStop);
  }

  return {
    notional,
    requiredMargin,
    liquidationPrice,
    liqBufferFrac,
    pnlAtTarget,
    pnlAtTargetRoiFrac,
    lossAtStop,
    lossAtStopRoiFrac,
    rewardToRisk,
    feesRoundTrip,
    fundingCostPer8h,
    fundingCostPer24h,
    breakevenFrac,
    breakevenPrice,
    stopIsSafe,
  };
}

// ---------------------------------------------------------------------------
// Liquidation price — isolated margin, linear perp
// ---------------------------------------------------------------------------

/**
 * Derivation (long):
 *   At liquidation, equity = maintenance margin requirement.
 *   equity = margin + unrealized_pnl
 *          = (size × entry)/L + size × (mark − entry)
 *   maintenance = size × mark × m
 *
 *   Setting equity = maintenance and dividing by size:
 *       entry/L + (mark − entry) = mark × m
 *       entry/L − entry + mark  = mark × m
 *       mark × (1 − m)          = entry × (1 − 1/L)
 *       mark                    = entry × (1 − 1/L) / (1 − m)
 *
 * Short is symmetric with sign flips:
 *       mark                    = entry × (1 + 1/L) / (1 + m)
 *
 * Fees at entry reduce equity, which pushes liq price closer to entry
 * by ~fees/notional. We ignore this small correction for headline
 * display — the worst-case trader's intuition should be pessimistic
 * anyway. Callers that want to include fees can add a small buffer.
 */
export function liqPrice(params: {
  readonly side: Side;
  readonly entryPrice: number;
  readonly leverage: number;
  readonly maintenanceMarginFrac: number;
}): number {
  const { side, entryPrice, leverage, maintenanceMarginFrac: m } = params;
  if (side === 'long') {
    return (entryPrice * (1 - 1 / leverage)) / (1 - m);
  }
  return (entryPrice * (1 + 1 / leverage)) / (1 + m);
}

// ---------------------------------------------------------------------------
// Sizing helpers
// ---------------------------------------------------------------------------

/**
 * Convert a USD-notional intent (e.g. "$1000 position") to size in base
 * units at the given price.
 */
export function sizeFromNotional(notionalUsd: number, price: number): number {
  requirePositive(notionalUsd, 'notionalUsd');
  requirePositive(price, 'price');
  return notionalUsd / price;
}

/**
 * Convert a margin budget (e.g. "I'll risk $100 of margin at 5x") to
 * size in base units.
 */
export function sizeFromMargin(
  marginUsd: number,
  leverage: number,
  price: number,
): number {
  requirePositive(marginUsd, 'marginUsd');
  requirePositive(leverage, 'leverage');
  requirePositive(price, 'price');
  const notional = marginUsd * leverage;
  return notional / price;
}

// ---------------------------------------------------------------------------
// PnL helper
// ---------------------------------------------------------------------------

/**
 * Gross PnL at an exit price, before fees. Positive for profit, negative
 * for loss, for either side.
 */
function pnlGross(
  side: Side,
  size: number,
  entry: number,
  exit: number,
): number {
  const move = exit - entry;
  return side === 'long' ? size * move : size * -move;
}
