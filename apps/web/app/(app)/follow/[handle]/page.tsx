// apps/web/app/(app)/follow/[handle]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { findLeader } from '@/lib/mock-data/leaders';

import { LeaderDetails } from './copy-config';

/**
 * /copy/[handle] - leader profile.
 *
 * Visible by default:
 *   - Small avatar + @handle
 *   - One-line style tag
 *   - 30d PnL headline (big)
 *   - "Follow" button
 *
 * Behind disclosures:
 *   - Bio
 *   - Stats (win rate, DD, followers, favorite markets)
 *   - Recent trades
 */
export default function LeaderProfile({
  params,
}: {
  readonly params: { readonly handle: string };
}) {
  const leader = findLeader(params.handle.toLowerCase());
  if (!leader) notFound();

  const pnlTone = leader.pnl30dUsd >= 0 ? 'text-pnl-long' : 'text-pnl-short';

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <Link
          href="/copy"
          className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          ← Copy
        </Link>

        {/* Header */}
        <div className="mt-4 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold uppercase text-bg-base"
            style={{ backgroundColor: `hsl(${leader.avatarHue}, 62%, 70%)` }}
          >
            {leader.handle.slice(0, 2)}
          </span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[32px]">
              @{leader.handle}
            </h1>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-fg-muted">
              {leader.styleLabel}
            </div>
          </div>
        </div>

        {/* Headline PnL */}
        <div className="mt-10">
          <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
            30-day PnL · net of fees
          </div>
          <div className={`mt-2 font-mono text-[44px] leading-none tracking-[-0.02em] ${pnlTone}`}>
            {leader.pnl30dUsd >= 0 ? '+' : '−'}$
            {Math.abs(leader.pnl30dUsd).toLocaleString()}
          </div>
        </div>

        {/* Follow button + disclosures - client component */}
        <LeaderDetails leader={leader} />
      </section>
    </main>
  );
}
