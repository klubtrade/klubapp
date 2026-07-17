import { BulkClient, getAllTickers } from '@klub/api-client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BULK_HTTP_URL =
  process.env['BULK_HTTP_URL'] ?? 'https://exchange-api.bulk.trade/api/v1';

export async function GET(): Promise<NextResponse> {
  const client = new BulkClient({ baseUrl: BULK_HTTP_URL });

  try {
    const tickers = await getAllTickers(client);
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
