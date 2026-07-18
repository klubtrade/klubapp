// apps/web/app/api/portfolio/route.ts
import {
  BulkClient,
  getRiskSurfaces,
  queryFullAccount,
} from "@klub/api-client";
import { calculateBulkPortfolioMaintenanceMargin } from "@klub/calc";
import type {
  BulkMarginPositionInput,
  HealthInput,
  HealthPosition,
} from "@klub/calc";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requireLinkedSolanaWallet,
  requirePrivyAuth,
} from "@/lib/server/privy-auth";

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
 *   (c) the base URL stays off the client
 */

const Body = z.object({
  user: z.string().min(32).max(64),
});

type BulkLambdaBySymbol = Readonly<Record<string, number>>;

export async function POST(request: Request) {
  const auth = await requirePrivyAuth(request);
  if (!auth.ok) return auth.response;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_user" }, { status: 422 });
  }
  const ownershipError = requireLinkedSolanaWallet(
    auth.principal,
    parsed.data.user,
  );
  if (ownershipError) return ownershipError;

  const baseUrl =
    process.env["BULK_HTTP_URL"] ?? process.env["BULK_API_BASE_URL"];

  const client = new BulkClient({
    ...(baseUrl ? { baseUrl } : {}),
  });

  try {
    const [account, lambdaBySymbol] = await Promise.all([
      queryFullAccount(client, parsed.data.user),
      fetchBulkLambdaBySymbol(client),
    ]);

    const bulkMargin = calculateBulkPortfolioMaintenanceMargin({
      positions: account.positions.map((p) => ({
        symbol: p.s,
        size: Number(p.sz),
        markPrice: Number(p.markPx),
        lambda: resolveBulkLambda(p.s, lambdaBySymbol),
      })) satisfies readonly BulkMarginPositionInput[],
    });

    const positions: readonly HealthPosition[] = account.positions.map(
      (p, index) => {
        const marginPosition = bulkMargin.positions[index];
        if (marginPosition === undefined) {
          throw new Error(`missing Bulk margin component for ${p.s}`);
        }

        return {
          symbol: p.s,
          size: Number(p.sz),
          entryPrice: Number(p.entryPx),
          markPrice: Number(p.markPx),
          liqPrice: Number(p.liqPx),
          maintenanceMarginUsd: marginPosition.marginComponentUsd,
          funding8hRate: 0, // TODO: join ticker data for per-symbol rate
        };
      },
    );

    const body: HealthInput = {
      equityUsd: Number(account.equityUsd),
      collateralUsd: Number(account.collateralUsd),
      positions,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    console.error("[portfolio] upstream failure", err);
    return NextResponse.json(
      {
        equityUsd: 0,
        collateralUsd: 0,
        positions: [],
        degraded: true,
        error: "upstream_unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Could not reach Bulk. Try again in a moment.",
      },
      { status: 200 },
    );
  }
}

async function fetchBulkLambdaBySymbol(
  client: BulkClient,
): Promise<BulkLambdaBySymbol> {
  // TODO(week-2): replace this HTTP `riskSurfaces` snapshot with a
  // cached `risk:{symbol}` websocket feed once live Bulk risk updates
  // are threaded into the web app.
  const riskSurfaces = await getRiskSurfaces(client);
  const entries: [string, number][] = [];

  for (const surface of riskSurfaces.surfaces) {
    const lambda = Number(surface.mmFraction);
    if (!Number.isFinite(lambda) || lambda < 0) {
      throw new Error(`invalid Bulk lambda for ${surface.s}`);
    }
    entries.push([surface.s, lambda]);
  }

  return Object.fromEntries(entries);
}

function resolveBulkLambda(
  symbol: string,
  lambdaBySymbol: BulkLambdaBySymbol,
): number {
  const lambda = lambdaBySymbol[symbol];
  if (lambda === undefined) {
    throw new Error(`missing Bulk lambda for ${symbol}`);
  }
  return lambda;
}
