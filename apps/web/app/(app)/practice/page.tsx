'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * /practice - minimalist paper-trading journal.
 *
 * Visible by default:
 *   - List of open paper trades (or empty-state line)
 *   - "Log new trade" button
 *
 * Behind "Log new trade":
 *   - Compact form (symbol, side, entry, size, lev, reason)
 *
 * Behind "Show history":
 *   - Closed trades list
 *
 * No stats dashboard by default - win rate, average, etc. behind
 * "Show stats" when the user asks.
 */

const JOURNAL_STORAGE_KEY = 'klub.practice.journal.v1';

interface JournalEntry {
  readonly id: string;
  readonly createdAt: number;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly entryPrice: number;
  readonly sizeBase: number;
  readonly leverage: number;
  readonly entryReason: string;
  exitPrice?: number;
  closedAt?: number;
  exitReason?: string;
  realizedPnl?: number;
}

export default function PracticePage() {
  const [entries, setEntries] = useState<readonly JournalEntry[]>([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as readonly JournalEntry[];
        if (Array.isArray(parsed)) setEntries(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* ignore */
    }
  }, [entries]);

  const openTrades = useMemo(() => entries.filter((e) => e.exitPrice === undefined), [entries]);
  const closedTrades = useMemo(
    () => entries.filter((e) => e.exitPrice !== undefined),
    [entries],
  );

  const stats = useMemo(() => {
    if (closedTrades.length === 0) return null;
    const wins = closedTrades.filter((t) => (t.realizedPnl ?? 0) > 0).length;
    const total = closedTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    return {
      n: closedTrades.length,
      winRatePct: (wins / closedTrades.length) * 100,
      total,
    };
  }, [closedTrades]);

  function addEntry(draft: Omit<JournalEntry, 'id' | 'createdAt'>) {
    setEntries([{ ...draft, id: cryptoRandom(), createdAt: Date.now() }, ...entries]);
    setShowLogForm(false);
  }

  function closeTrade(id: string, exitPrice: number, exitReason: string) {
    setEntries(
      entries.map((e) => {
        if (e.id !== id) return e;
        const pnlPerUnit = e.side === 'long' ? exitPrice - e.entryPrice : e.entryPrice - exitPrice;
        return {
          ...e,
          exitPrice,
          exitReason,
          closedAt: Date.now(),
          realizedPnl: pnlPerUnit * e.sizeBase,
        };
      }),
    );
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Practice
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Paper-trade journal. No money at risk.
          </p>
        </header>

        {/* Open trades */}
        <div className="mt-8">
          {openTrades.length === 0 ? (
            <div className="text-[14px] leading-relaxed text-fg-muted">
              No open paper trades. Log a trade below to start.
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {openTrades.map((t) => (
                <OpenTradeRow key={t.id} trade={t} onClose={closeTrade} />
              ))}
            </ul>
          )}
        </div>

        {/* Log form (disclosure) */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              setShowLogForm((v) => !v);
            }}
            aria-expanded={showLogForm}
            className="btn-primary btn-compact"
          >
            {showLogForm ? 'Cancel' : 'Log a trade'}
          </button>
          {showLogForm && <LogForm onSubmit={addEntry} />}
        </div>

        {/* Stats disclosure */}
        {stats && (
          <div className="mt-8 border-t border-border-subtle pt-6">
            <button
              type="button"
              onClick={() => {
                setShowStats((v) => !v);
              }}
              aria-expanded={showStats}
              className="text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              {showStats ? 'Hide stats' : 'Show stats'}
            </button>
            {showStats && (
              <div className="mt-4 space-y-2.5 text-[13px]">
                <Row label="Trades closed" value={String(stats.n)} />
                <Row label="Win rate" value={`${stats.winRatePct.toFixed(0)}%`} />
                <Row
                  label="Net PnL"
                  value={`${stats.total >= 0 ? '+' : '−'}$${Math.abs(stats.total).toFixed(0)}`}
                  tone={stats.total >= 0 ? 'long' : 'short'}
                />
              </div>
            )}
          </div>
        )}

        {/* History disclosure */}
        {closedTrades.length > 0 && (
          <div className="mt-8 border-t border-border-subtle pt-6">
            <button
              type="button"
              onClick={() => {
                setShowHistory((v) => !v);
              }}
              aria-expanded={showHistory}
              className="text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              {showHistory ? 'Hide history' : `Show history (${closedTrades.length})`}
            </button>
            {showHistory && (
              <ul className="mt-4 divide-y divide-border-subtle">
                {closedTrades.map((t) => (
                  <ClosedTradeRow key={t.id} trade={t} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

function OpenTradeRow({
  trade,
  onClose,
}: {
  readonly trade: JournalEntry;
  readonly onClose: (id: string, exitPrice: number, exitReason: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState(trade.entryPrice);
  const [reason, setReason] = useState('');

  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[14px] font-medium text-fg-primary">
            <span className={trade.side === 'long' ? 'text-pnl-long' : 'text-pnl-short'}>
              {trade.side === 'long' ? 'Long' : 'Short'}
            </span>{' '}
            {trade.symbol}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
            {trade.sizeBase} @ ${trade.entryPrice} · {trade.leverage}×
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setClosing((v) => !v);
          }}
          className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          {closing ? 'Cancel' : 'Close'}
        </button>
      </div>
      {trade.entryReason && (
        <div className="mt-2 text-[12px] italic text-fg-secondary">“{trade.entryReason}”</div>
      )}
      {closing && (
        <div className="mt-3 space-y-2">
          <input
            type="number"
            step={0.01}
            value={exitPrice}
            placeholder="Exit price"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setExitPrice(n);
            }}
            className="w-full rounded-md border border-border bg-bg-base px-3 py-2 font-mono text-[13px] focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={reason}
            placeholder="What did you learn?"
            onChange={(e) => {
              setReason(e.target.value);
            }}
            className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              onClose(trade.id, exitPrice, reason);
              setClosing(false);
            }}
            className="btn-primary btn-sm btn-block"
          >
            Confirm close
          </button>
        </div>
      )}
    </li>
  );
}

function ClosedTradeRow({ trade }: { readonly trade: JournalEntry }) {
  const pnl = trade.realizedPnl ?? 0;
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[13px] text-fg-primary">
            <span className={trade.side === 'long' ? 'text-pnl-long' : 'text-pnl-short'}>
              {trade.side === 'long' ? 'Long' : 'Short'}
            </span>{' '}
            {trade.symbol}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
            ${trade.entryPrice} → ${trade.exitPrice}
          </div>
        </div>
        <span className={`font-mono text-[13px] ${pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short'}`}>
          {pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)}
        </span>
      </div>
      {trade.exitReason && (
        <div className="mt-1 text-[11px] italic text-fg-muted">“{trade.exitReason}”</div>
      )}
    </li>
  );
}

function LogForm({
  onSubmit,
}: {
  readonly onSubmit: (draft: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
}) {
  const [symbol, setSymbol] = useState('BTC-USD');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [entryPrice, setEntryPrice] = useState(67_000);
  const [sizeBase, setSizeBase] = useState(0.05);
  const [leverage, setLeverage] = useState(5);
  const [reason, setReason] = useState('');

  function submit() {
    onSubmit({
      symbol,
      side,
      entryPrice,
      sizeBase,
      leverage,
      entryReason: reason,
    });
  }

  return (
    <div className="mt-4 space-y-3 rounded-klub border border-border-subtle bg-bg-surface p-4">
      <input
        type="text"
        value={symbol}
        onChange={(e) => {
          setSymbol(e.target.value.toUpperCase());
        }}
        placeholder="BTC-USD"
        className="w-full rounded-md border border-border bg-bg-base px-3 py-2 font-mono text-[13px] focus:border-accent focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setSide('long');
          }}
          className={`rounded-md border py-2 text-[13px] font-medium transition-colors ${
            side === 'long'
              ? 'border-pnl-long bg-pnl-long/10 text-pnl-long'
              : 'border-border-subtle text-fg-secondary'
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => {
            setSide('short');
          }}
          className={`rounded-md border py-2 text-[13px] font-medium transition-colors ${
            side === 'short'
              ? 'border-pnl-short bg-pnl-short/10 text-pnl-short'
              : 'border-border-subtle text-fg-secondary'
          }`}
        >
          Short
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={entryPrice}
          placeholder="Entry"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setEntryPrice(n);
          }}
          className="w-full rounded-md border border-border bg-bg-base px-3 py-2 font-mono text-[13px] focus:border-accent focus:outline-none"
        />
        <input
          type="number"
          step={0.001}
          value={sizeBase}
          placeholder="Size"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setSizeBase(n);
          }}
          className="w-full rounded-md border border-border bg-bg-base px-3 py-2 font-mono text-[13px] focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">Leverage</span>
          <span className="font-mono text-[13px] text-accent">{leverage}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={0.5}
          value={leverage}
          onChange={(e) => {
            setLeverage(Number(e.target.value));
          }}
          className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
        />
      </div>
      <input
        type="text"
        value={reason}
        placeholder="Why? (thesis, setup, edge)"
        onChange={(e) => {
          setReason(e.target.value);
        }}
        className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-[13px] focus:border-accent focus:outline-none"
      />
      <button type="button" onClick={submit} className="btn-primary btn-sm btn-block">
        Save
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'long' | 'short';
}) {
  const color =
    tone === 'long' ? 'text-pnl-long' : tone === 'short' ? 'text-pnl-short' : 'text-fg-primary';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}

function cryptoRandom(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
