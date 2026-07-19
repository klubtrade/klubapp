import { createDbClient, leaders } from "@klub/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { leaderLabel, type VerifiedLeader } from "@/lib/copy-trade/leaders";

import { LeaderDetails } from "./copy-config";

export const dynamic = "force-dynamic";

export default async function LeaderProfile({
  params,
}: {
  readonly params: Promise<{ readonly handle: string }>;
}) {
  const { handle } = await params;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) notFound();
  const db = createDbClient({ connectionString, maxConnections: 2 });
  const [row] = await db
    .select()
    .from(leaders)
    .where(eq(leaders.pubkey, handle))
    .limit(1);
  if (!row) notFound();

  const leader: VerifiedLeader = {
    pubkey: row.pubkey,
    label: leaderLabel(row.handle, row.pubkey),
    netPnl24hUsd: row.netPnl24hUsd,
    netPnl7dUsd: row.netPnl7dUsd,
    netPnl30dUsd: row.netPnl30dUsd,
    unrealizedPnlUsd: row.unrealizedPnlUsd,
    winRate: row.winRate,
    closedTradesCount: row.closedTradesCount,
    maxDrawdownPct: row.maxDrawdownPct,
    sharpeRatio: row.sharpeRatio,
    fillsLast24h: row.fillsLast24h,
    fillsLast7d: row.fillsLast7d,
    fillsLast30d: row.fillsLast30d,
    updatedAt: row.updatedAt.toISOString(),
  };

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <Link
          href="/copy"
          className="text-[12px] text-fg-muted hover:text-fg-primary"
        >
          Back to copy trading
        </Link>
        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-[0.12em] text-pnl-long">
            Verified testnet account
          </div>
          <h1 className="mt-2 truncate text-[28px] font-semibold tracking-tight text-fg-primary">
            {leader.label}
          </h1>
          <div className="mt-1 break-all font-mono text-[10px] text-fg-muted">
            {leader.pubkey}
          </div>
        </div>
        <div className="mt-10 text-[11px] uppercase tracking-[0.08em] text-fg-muted">
          Calculated 24-hour net PnL
        </div>
        <div
          className={`mt-2 font-mono text-[44px] leading-none ${leader.netPnl24hUsd >= 0 ? "text-pnl-long" : "text-pnl-short"}`}
        >
          {leader.netPnl24hUsd >= 0 ? "+" : "−"}$
          {Math.abs(leader.netPnl24hUsd).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}
        </div>
        <LeaderDetails leader={leader} />
      </section>
    </main>
  );
}
