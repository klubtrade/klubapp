'use client';

import { healthScore, type HealthInput, type HealthOutput } from '@klub/calc';
import { useMemo, useState } from 'react';

/**
 * /health — minimalist portfolio health.
 *
 * Big 0-100 score + one-line band. Subscore breakdown behind
 * "Show breakdown". Recommendations behind "What should I do".
 */

const DEMO_INPUT: HealthInput = {
  equityUsd: 5_000,
  collateralUsd: 5_000,
  positions: [
    {
      symbol: 'BTC-USD',
      size: 0.1,
      entryPrice: 66_100,
      markPrice: 67_420,
      liqPrice: 58_940,
      maintenanceMarginUsd: 25,
      funding8hRate: 0.0001,
    },
  ],
};

const BAND_TONE: Record<HealthOutput['band'], string> = {
  healthy: 'text-pnl-long',
  fine: 'text-pnl-long',
  caution: 'text-accent',
  risky: 'text-alert-orange',
  critical: 'text-pnl-short',
};

const BAND_LABEL: Record<HealthOutput['band'], string> = {
  healthy: 'Healthy',
  fine: 'Fine',
  caution: 'Watch it',
  risky: 'Risky',
  critical: 'Critical',
};

export default function HealthPage() {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);

  const result = useMemo(() => {
    try {
      return healthScore(DEMO_INPUT);
    } catch {
      return null;
    }
  }, []);

  if (!result) {
    return (
      <main className="min-h-screen px-6 pt-28">
        <div className="mx-auto max-w-md text-fg-muted">Unable to compute.</div>
      </main>
    );
  }

  const tone = BAND_TONE[result.band];
  const label = BAND_LABEL[result.band];

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 pb-12 pt-28 md:pt-36">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Portfolio health
        </div>

        <div className="mt-8 flex items-baseline gap-4">
          <div className={`font-mono text-[88px] leading-none tracking-[-0.02em] ${tone}`}>
            {result.score}
          </div>
          <div className="text-[14px] text-fg-muted">/ 100</div>
        </div>

        <div className={`mt-3 text-[18px] font-semibold ${tone}`}>{label}</div>

        <div className="mt-10 space-y-3">
          <button
            type="button"
            onClick={() => {
              setShowBreakdown((v) => !v);
            }}
            aria-expanded={showBreakdown}
            className="block text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
          </button>
          {result.recommendations.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowAdvice((v) => !v);
              }}
              aria-expanded={showAdvice}
              className="block text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              {showAdvice ? 'Hide advice' : 'What should I do?'}
            </button>
          )}
        </div>

        {showBreakdown && (
          <div className="mt-4 space-y-3 border-t border-border-subtle pt-5">
            <SubscoreRow label="Liquidation proximity" sub={result.subscores.liquidationProximity} />
            <SubscoreRow label="Leverage" sub={result.subscores.leverageExposure} />
            <SubscoreRow label="Concentration" sub={result.subscores.concentrationRisk} />
            <SubscoreRow label="Funding burn" sub={result.subscores.fundingBurn} />
          </div>
        )}

        {showAdvice && result.recommendations.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-border-subtle pt-5 text-[13px] leading-relaxed text-fg-secondary">
            {result.recommendations.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SubscoreRow({
  label,
  sub,
}: {
  readonly label: string;
  readonly sub: { readonly score: number; readonly label: string };
}) {
  const tone =
    sub.score >= 75 ? 'text-pnl-long' : sub.score >= 50 ? 'text-fg-primary' : 'text-pnl-short';
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg-muted">{label}</span>
        <span className={`font-mono ${tone}`}>{sub.score}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-fg-muted">{sub.label}</div>
    </div>
  );
}
