"use client";

import type { CandleInterval } from "@klub/api-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useActiveAccount } from "@/hooks/use-active-account";
import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useTickers } from "@/hooks/use-tickers";
import { MARKETS } from "@/lib/markets";
import type { SubmitOrderResult } from "@/lib/bulk/orders";
import { useTradingWallet } from "@/lib/trading-wallet";

import {
  CommandPalette,
  PanelChart,
  PanelOrderForm,
  PanelOrderbook,
  PanelPositions,
  PanelTape,
  PanelWatchlist,
  ProHeader,
  ProMarketStrip,
  ProStatusBar,
  ResultModal,
} from "./components";

/**
 * /pro — KLUB Pro. Advanced trading terminal.
 *
 * This is intentionally not the default retail flow. /trade is the
 * primary path for most users; Pro is for people who want chart,
 * book, tape, positions, and order entry on one desktop screen.
 *
 * Six panels in a persistent 4-column grid:
 *   1. Watchlist  — canonical 10 markets, real mark + 24h chg
 *   2. Chart      — lightweight-charts v5 with timeframe selector
 *   3. Positions  — real positions from /api/bulk/account, Close button
 *   4. Order book — L2 ladder, REST polled at 1Hz
 *   5. Tape       — recent trades, WS-streamed
 *   6. Order form — real submit via useBulkOrder
 *
 * ⌘K palette opens a command list (symbol jumps + nav).
 *
 * Session 1 wires real data. Sessions 2+ add hotkey order entry,
 * saved layouts (react-grid-layout), and click-to-trade L2 ladder.
 */

const ALL_SYMBOLS = MARKETS.map((m) => m.symbol);

export default function ProPage() {
  const [symbol, setSymbol] = useState<string>(MARKETS[0]?.symbol ?? "BTC-USD");
  const [interval, setInterval] = useState<CandleInterval>("15m");
  const [showPalette, setShowPalette] = useState(false);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);

  const { connected } = useTradingWallet();
  // Active account drives positions, orders, and the trading account
  // on every signed action.
  const { pubkey } = useActiveAccount();

  const livePrices = useTickers(ALL_SYMBOLS);
  const { state: accountState, refresh: refreshAccount } =
    useBulkAccount(pubkey);

  const mark = livePrices[symbol]?.mark ?? 0;

  // ⌘K opens palette; Esc closes palette/result.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if (e.key === "Escape") {
        setShowPalette(false);
        setResult(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleResult = useCallback(
    (r: SubmitOrderResult) => {
      setResult(r);
      if (r.ok) refreshAccount();
    },
    [refreshAccount],
  );

  return (
    <>
      {/* Small-screen gate — terminals don't work on phones */}
      <div className="flex min-h-screen items-center justify-center px-6 lg:hidden">
        <div className="max-w-sm rounded-klub-lg border border-border-subtle bg-bg-surface p-8 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            KLUB Pro
          </div>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
            Best on a real screen.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">
            Pro is advanced. On mobile, Simple Trade is better — clearer, safer,
            same markets.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Link href="/trade" className="btn-primary btn-compact">
              Open Trade
            </Link>
            <Link
              href="/portfolio"
              className="text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              Back to portfolio
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop advanced terminal */}
      <main className="hidden h-screen min-h-0 overflow-hidden bg-bg-base lg:flex lg:flex-col">
        <ProHeader
          symbol={symbol}
          mark={mark}
          onOpenPalette={() => setShowPalette(true)}
        />
        <ProMarketStrip
          symbol={symbol}
          onSelect={setSymbol}
          livePrices={livePrices}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_320px] gap-2 overflow-hidden p-2 xl:grid-cols-[220px_minmax(0,1fr)_250px_330px] min-[1750px]:grid-cols-[230px_minmax(0,1fr)_270px_350px]">
          <PanelWatchlist
            symbol={symbol}
            onSelect={setSymbol}
            livePrices={livePrices}
          />

          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_190px] gap-2 overflow-hidden">
            <PanelChart
              symbol={symbol}
              interval={interval}
              onInterval={setInterval}
            />
            <div className="min-h-0 overflow-hidden">
              <PanelPositions
                positions={accountState.data?.positions ?? []}
                openOrders={accountState.data?.openOrders ?? []}
                livePrices={livePrices}
                accountStatus={accountState.status}
                connected={connected}
                onResult={handleResult}
              />
            </div>
          </div>

          <div className="hidden min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(180px,0.75fr)] gap-2 overflow-hidden xl:grid">
            <PanelOrderbook symbol={symbol} mark={mark} />
            <PanelTape symbol={symbol} />
          </div>

          <div className="min-h-0 min-w-0 overflow-hidden">
            <PanelOrderForm
              symbol={symbol}
              mark={mark}
              connected={connected}
              onResult={handleResult}
            />
          </div>
        </div>

        <ProStatusBar
          accountState={accountState}
          connected={connected}
          onOpenPalette={() => setShowPalette(true)}
        />

        {showPalette && (
          <CommandPalette
            livePrices={livePrices}
            onClose={() => setShowPalette(false)}
            onSymbol={(s) => {
              setSymbol(s);
              setShowPalette(false);
            }}
          />
        )}

        {result && (
          <ResultModal result={result} onClose={() => setResult(null)} />
        )}
      </main>
    </>
  );
}
