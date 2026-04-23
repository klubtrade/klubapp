// apps/web/app/api/portfolio/route.ts
import { BulkClient, queryFullAccount } from '@klub/api-client';
import type { HealthInput, HealthPosition } from '@klub/calc';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/portfolio
 *
 * Called by /health's "Load my Bulk account" button. Queries the Bulk
 * account endpoint and maps the response into the HealthInput shape
 * that @klub/calc expects.
 *
 * We do this server-side rather than from the browser so:
 *   (a) we can add rate-limiting in one place
 *   (b) we can swap in a cache layer later without client changes
 *   (c) the base URL / integrator ID stay off the client
 */

const Body = z.object({
  user: z.string().min(32).max(64),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_user' },
      { status: 422 },
    );
  }

  const client = new BulkClient({
    baseUrl: process.env['BULK_API_BASE_URL'],
    ...(process.env['BULK_INTEGRATOR_ID']
      ? { integratorId: process.env['BULK_INTEGRATOR_ID'] }
      : {}),
  });

  try {
    const account = await queryFullAccount(client, parsed.data.user);

    const positions: readonly HealthPosition[] = account.positions.map((p) => ({
      symbol: p.s,
      size: Number(p.sz),
      entryPrice: Number(p.entryPx),
      markPrice: Number(p.markPx),
      liqPrice: Number(p.liqPx),
      // Bulk doesn't return per-position maintenance as a single
      // number in the account payload; approximate from leverage. A
      // proper implementation joins risk surfaces. Placeholder here.
      maintenanceMarginUsd: Number(p.sz) * Number(p.markPx) * 0.005,
      funding8hRate: 0, // TODO: join ticker data for per-symbol rate
    }));

    const body: HealthInput = {
      equityUsd: Number(account.equityUsd),
      collateralUsd: Number(account.collateralUsd),
      positions,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error('[portfolio] upstream failure', err);
    return NextResponse.json(
      {
        error: 'upstream_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'Could not reach Bulk. Try again in a moment.',
      },
      { status: 502 },
    );
  }
}
