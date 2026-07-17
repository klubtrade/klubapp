import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BULK_HTTP_URL =
  process.env['BULK_HTTP_URL'] ?? 'https://exchange-api.bulk.trade/api/v1';

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${BULK_HTTP_URL.replace(/\/+$/, '')}/stats`, {
      method: 'GET',
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as BulkStatsResponse | null;
    if (!res.ok) {
      throw new Error(`Bulk stats HTTP ${res.status}`);
    }
    const tickers = normalizeStatsTickers(body);
    return NextResponse.json(
      { tickers, ts: Date.now() },
      { headers: { 'Cache-Control': 's-maxage=2, stale-while-revalidate=8' } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        tickers: [],
        degraded: true,
        error: 'bulk_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'Bulk ticker data is temporarily unavailable.',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

interface BulkStatsResponse {
  readonly timestamp?: number;
  readonly markets?: readonly BulkStatsMarket[];
}

interface BulkStatsMarket {
  readonly symbol?: string;
  readonly volume?: number;
  readonly quoteVolume?: number;
  readonly openInterest?: number;
  readonly fundingRate?: number;
  readonly lastPrice?: number;
  readonly markPrice?: number;
}

function normalizeStatsTickers(body: BulkStatsResponse | null) {
  const rows = Array.isArray(body?.markets) ? body.markets : [];
  const timestamp = body?.timestamp ?? Date.now();

  return rows
    .filter((row) => typeof row.symbol === 'string' && row.symbol.length > 0)
    .map((row) => {
      const lastPrice = finite(row.lastPrice) ?? 0;
      const markPrice = finite(row.markPrice) ?? lastPrice;
      return {
        symbol: row.symbol,
        s: row.symbol,
        priceChange: 0,
        priceChangePercent: 0,
        lastPrice,
        highPrice: lastPrice,
        lowPrice: lastPrice,
        volume: finite(row.volume) ?? 0,
        quoteVolume: finite(row.quoteVolume) ?? 0,
        markPrice,
        oraclePrice: markPrice,
        openInterest: finite(row.openInterest) ?? 0,
        fundingRate: finite(row.fundingRate) ?? 0,
        regime: 0,
        regimeDt: 0,
        regimeVol: 0,
        regimeMv: 0,
        fairBookPx: markPrice,
        fairVol: 0,
        fairBias: 0,
        timestamp,
      };
    });
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
