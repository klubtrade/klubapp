// apps/web/app/api/risk-surfaces/route.ts
import { NextResponse } from 'next/server';

/**
 * GET /api/risk-surfaces
 *
 * Proxies Bulk's risk surfaces per-market and returns the full
 * maintenance-margin GRID (not just a single mm floor like Day 2).
 * Each market's grid has:
 *   - leverageKnots[]   e.g. [1, 2, ..., 50]
 *   - notionalKnots[]   e.g. [50_000, ..., 100_000_000]
 *   - buy[notional_idx][leverage_idx]  : mmrO for long side
 *   - sell[notional_idx][leverage_idx] : mmrO for short side
 *
 * Consumers (`buildHealthInput`) do a nearest-knot lookup using each
 * position's notional + implicit leverage to get a position-specific
 * mmFraction. This replaces the Day-2 conservative "2% floor" — the
 * numbers going into /health math are now position-aware.
 *
 * Response shape:
 *   { surfaces: [{ s, mmFraction, leverageKnots, notionalKnots, buy, sell }, ...], ts }
 *
 * The `mmFraction` field is retained for back-compat: it's the
 * lowest-corner buy[0][0].mmrO value (typically 0.02 = 2%). If the
 * grid lookup fails for any reason, consumers can fall back to this.
 */

export const dynamic = 'force-dynamic';

const MARKETS = [
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'BNB-USD',
  'XRP-USD',
  'DOGE-USD',
  'SUI-USD',
  'ZEC-USD',
  'GOLD-USD',
  'FARTCOIN-USD',
] as const;

const BULK_HTTP_URL = process.env['BULK_HTTP_URL'] ?? 'https://exchange-api.bulk.trade/api/v1';
const FALLBACK_LEVERAGE_KNOTS = [1, 2, 3, 5, 10, 20, 50] as const;
const FALLBACK_NOTIONAL_KNOTS = [0, 50_000, 250_000, 1_000_000, 5_000_000] as const;

interface GridPoint {
  readonly mmrO?: number;
  readonly mmrE?: number;
}

interface BulkRegime {
  readonly regime?: number;
  readonly leverage?: readonly number[];
  readonly notionals?: readonly number[];
  readonly buy?: readonly (readonly GridPoint[])[];
  readonly sell?: readonly (readonly GridPoint[])[];
}

interface MarketGridOut {
  readonly s: string;
  readonly mmFraction: number | null;
  readonly imFraction: number | null;
  readonly adlRank: number;
  readonly leverageKnots: readonly number[] | null;
  readonly notionalKnots: readonly number[] | null;
  readonly buy: readonly (readonly number[])[] | null;
  readonly sell: readonly (readonly number[])[] | null;
}

/**
 * Pick the first regime from the Bulk response, probing top-level
 * shape candidates (Day 2 discovered the response is a top-level
 * array of regime objects). Returns null if no regime has the
 * `buy`/`sell` grid we need.
 */
function findFirstRegime(body: unknown): BulkRegime | null {
  if (Array.isArray(body)) {
    const first = body[0];
    if (first && typeof first === 'object' && 'buy' in first) return first as BulkRegime;
  }
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (Array.isArray(rec['regimes']) && rec['regimes'].length > 0) {
      const first = rec['regimes'][0];
      if (first && typeof first === 'object' && 'buy' in first) return first as BulkRegime;
    }
    if ('buy' in rec && Array.isArray(rec['buy'])) {
      return rec as unknown as BulkRegime;
    }
    for (const [key, val] of Object.entries(rec)) {
      if (key === 'corrs') continue;
      if (Array.isArray(val) && val.length > 0) {
        const first = val[0];
        if (first && typeof first === 'object' && 'buy' in first) {
          return first as BulkRegime;
        }
      }
    }
  }
  return null;
}

/**
 * Flatten Bulk's grid-of-GridPoint into a grid of plain numbers
 * (just the mmrO). Bulk ships mmrO + mmrE + p per cell; we only need
 * mmrO for margin math (the conservative "regime origin" value).
 * Dropping mmrE and p shrinks the payload by ~3x.
 */
function flattenGrid(
  sideGrid: readonly (readonly GridPoint[])[] | undefined,
): readonly (readonly number[])[] | null {
  if (!sideGrid || sideGrid.length === 0) return null;
  return sideGrid.map((row) =>
    row.map((cell) =>
      typeof cell?.mmrO === 'number' && Number.isFinite(cell.mmrO) ? cell.mmrO : 0.02,
    ),
  );
}

export async function GET() {
  const root = BULK_HTTP_URL.replace(/\/+$/, '');

  const results = await Promise.allSettled(
    MARKETS.map(async (market) => {
      const res = await fetch(
        `${root}/riskSurfaces?market=${encodeURIComponent(market)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`${market}: HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      const regime = findFirstRegime(body);
      if (!regime) return { market, out: null as MarketGridOut | null };

      const buy = flattenGrid(regime.buy);
      const sell = flattenGrid(regime.sell);
      const mmFraction =
        typeof regime.buy?.[0]?.[0]?.mmrO === 'number' &&
        Number.isFinite(regime.buy[0][0].mmrO)
          ? regime.buy[0][0].mmrO
          : null;

      const out: MarketGridOut = {
        s: market,
        mmFraction,
        imFraction: null,
        adlRank: 0,
        leverageKnots: regime.leverage ?? null,
        notionalKnots: regime.notionals ?? null,
        buy,
        sell,
      };
      return { market, out };
    }),
  );

  const surfaces: MarketGridOut[] = [];
  const errors: string[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.out) surfaces.push(r.value.out);
      else errors.push(`${r.value.market}: no regime data`);
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  if (surfaces.length === 0) {
    return NextResponse.json(
      {
        surfaces: MARKETS.map((market) => fallbackSurface(market)),
        ts: Date.now(),
        degraded: true,
        errors,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' },
      },
    );
  }

  return NextResponse.json(
    { surfaces, ts: Date.now(), errors: errors.length > 0 ? errors : undefined },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' } },
  );
}

function fallbackSurface(market: string): MarketGridOut {
  const buy = FALLBACK_NOTIONAL_KNOTS.map((_, notionalIdx) =>
    FALLBACK_LEVERAGE_KNOTS.map((_, leverageIdx) => {
      const tierAdd = Math.min(0.015, notionalIdx * 0.0025 + leverageIdx * 0.001);
      return 0.02 + tierAdd;
    }),
  );
  return {
    s: market,
    mmFraction: 0.02,
    imFraction: 0.02,
    adlRank: 0,
    leverageKnots: FALLBACK_LEVERAGE_KNOTS,
    notionalKnots: FALLBACK_NOTIONAL_KNOTS,
    buy,
    sell: buy,
  };
}
