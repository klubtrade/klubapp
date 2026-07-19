"use client";

import { calculate, type Side } from "@klub/calc";
import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useBulkOrder } from "@/hooks/use-bulk-order";
import { useTickers } from "@/hooks/use-tickers";
import { useToast } from "@/components/toast";
import { useActiveAccount } from "@/hooks/use-active-account";
import { useWalletGate } from "@/hooks/use-wallet-gate";
import { RISK_PRESETS, useUserPrefs } from "@/lib/user-prefs";
import type { SubmitOrderResult } from "@/lib/bulk/orders";
import { MARKETS } from "@/lib/markets";
import {
  CollapseRow,
  PercentField,
  QuickTradeOverlays,
  SafetyPreview,
  TradeMath,
  TradeCard,
  WaitingOrderCard,
} from "./components";
import { QuickMarketChart } from "./market-chart";

const FALLBACK_EQUITY = 5_000;

export default function QuickTradePage() {
  const { prefs, ready } = useUserPrefs();
  const toast = useToast();
  const riskPreset = RISK_PRESETS[prefs.riskProfile];

  const { connected, mounted, promptConnect } = useWalletGate();
  const { pubkey: activePubkey } = useActiveAccount();
  const { state: accountState, refresh: refreshAccount } =
    useBulkAccount(activePubkey);
  const equityUsd = accountState.data?.equityUsd ?? FALLBACK_EQUITY;
  const positions = accountState.data?.positions ?? [];
  const openOrders = accountState.data?.openOrders ?? [];

  const { state: orderState, submit } = useBulkOrder();

  const [direction, setDirection] = useState<Side>("long");
  const [market, setMarket] = useState<(typeof MARKETS)[number]>(MARKETS[0]);
  const [amountPct, setAmountPct] = useState(10);
  const [confirming, setConfirming] = useState(false);
  const [leverage, setLeverage] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tpPct, setTpPct] = useState(riskPreset.defaultStopDistancePct * 2);
  const [slPct, setSlPct] = useState(riskPreset.defaultStopDistancePct);
  const [showMath, setShowMath] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [resultModal, setResultModal] = useState<SubmitOrderResult | null>(
    null,
  );

  const allSymbols = useMemo(() => MARKETS.map((m) => m.symbol), []);
  const livePrices = useTickers(allSymbols);
  const livePrice = livePrices[market.symbol]?.mark ?? market.seedPrice;

  useEffect(() => {
    if (ready) setLeverage(riskPreset.defaultLeverage);
  }, [ready, riskPreset.defaultLeverage]);

  useEffect(() => {
    if (leverage > market.defaultLeverage) {
      setLeverage(market.defaultLeverage);
    }
  }, [leverage, market.symbol, market.defaultLeverage]);

  const amountUsd = (equityUsd * amountPct) / 100;
  const notional = amountUsd * leverage;
  const sizeBase = livePrice > 0 ? notional / livePrice : 0;
  const stopPrice =
    direction === "long"
      ? livePrice * (1 - slPct / 100)
      : livePrice * (1 + slPct / 100);
  const targetPrice =
    direction === "long"
      ? livePrice * (1 + tpPct / 100)
      : livePrice * (1 - tpPct / 100);

  const result = useMemo(() => {
    try {
      return calculate({
        side: direction,
        leverage,
        entryPrice: livePrice,
        size: sizeBase,
        targetPrice,
        stopPrice,
        maintenanceMarginFrac: 0.005,
        takerBps: 5,
        funding8hRate: 0.0001,
      });
    } catch {
      return null;
    }
  }, [direction, leverage, livePrice, sizeBase, targetPrice, stopPrice]);

  const liqMovePct = result ? result.liqBufferFrac * 100 : 0;
  const wouldMake = result?.pnlAtTarget ?? 0;
  const couldLose = Math.abs(result?.lossAtStop ?? 0);

  async function handleConfirm() {
    setConfirming(false);

    if (!mounted) return;
    if (!connected) {
      promptConnect();
      return;
    }
    if (sizeBase <= 0 || !Number.isFinite(sizeBase)) {
      toast.error("Invalid size");
      return;
    }

    const outcome = await submit({
      symbol: market.symbol,
      side: direction,
      orderType: "market",
      size: sizeBase,
    });
    setResultModal(outcome);

    if (!outcome.ok) return;
    const closeSide: Side = direction === "long" ? "short" : "long";
    if (tpPct > 0 && Number.isFinite(targetPrice) && targetPrice > 0) {
      const tp = await submit({
        symbol: market.symbol,
        side: closeSide,
        orderType: "trigger",
        size: sizeBase,
        triggerPrice: targetPrice,
        tpSl: "tp",
        reduceOnly: true,
      });
      if (!tp.ok) {
        toast.warning(
          "Main order filled, but take-profit leg failed",
          tp.message,
        );
      }
    }
    if (slPct > 0 && Number.isFinite(stopPrice) && stopPrice > 0) {
      const sl = await submit({
        symbol: market.symbol,
        side: closeSide,
        orderType: "trigger",
        size: sizeBase,
        triggerPrice: stopPrice,
        tpSl: "sl",
        reduceOnly: true,
      });
      if (!sl.ok) {
        toast.warning(
          "Main order filled, but stop-loss leg failed",
          sl.message,
        );
      }
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen px-4 pt-20 md:px-8 md:pt-24">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  const tradesContent = (
    <>
      {positions.length > 0 && (
        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            Your trades
          </h2>
          <div className="space-y-2">
            {positions.map((p) => (
              <TradeCard
                key={p.symbol}
                position={p}
                livePrice={livePrices[p.symbol]?.mark ?? p.fairPrice}
                onAfterClose={refreshAccount}
                onResult={setResultModal}
              />
            ))}
          </div>
        </div>
      )}

      {openOrders.length > 0 && (
        <div className={positions.length > 0 ? "mt-6" : ""}>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            Waiting orders
          </h2>
          <div className="space-y-2">
            {openOrders.map((o) => (
              <WaitingOrderCard
                key={o.orderId || `${o.symbol}-${o.price}-${o.sizeBase}`}
                order={o}
                onAfterCancel={refreshAccount}
                onResult={setResultModal}
              />
            ))}
          </div>
        </div>
      )}

      {positions.length === 0 && openOrders.length === 0 && (
        <EmptyState
          title="No open trades yet"
          description="After you place a trade, positions and waiting orders will appear here."
          primaryCta={{ label: "Keep trading", href: "/trade" }}
          secondaryCta={{ label: "Check cash", href: "/cash" }}
        />
      )}
    </>
  );

  return (
    <main className="min-h-screen bg-bg-base">
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-20 md:px-8 md:pt-24 xl:px-6 xl:pb-8">
        <header className="mb-5">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-fg-primary md:text-[32px]">
            Simple Trade
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Choose up or down. Review the risk. Place the trade.
          </p>
        </header>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(390px,0.72fr)] xl:gap-5">
          <div className="min-w-0 rounded-klub-lg border border-border-subtle bg-bg-surface/30 p-3 md:p-4">
            <QuickMarketChart
              market={market}
              livePrice={livePrice}
              livePrices={livePrices}
              onMarket={setMarket}
            />
          </div>

          <div className="min-w-0 rounded-klub-lg border border-border-subtle bg-bg-surface/30 p-3 md:p-4">
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDirection("long")}
                className={`min-h-14 rounded-klub-lg border py-3 text-center text-[16px] font-semibold transition-colors ${
                  direction === "long"
                    ? "border-pnl-long bg-pnl-long/10 text-pnl-long"
                    : "border-border-subtle bg-bg-surface text-fg-secondary hover:border-border"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <TrendingUp aria-hidden="true" className="h-4 w-4" /> Up
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("short")}
                className={`min-h-14 rounded-klub-lg border py-3 text-center text-[16px] font-semibold transition-colors ${
                  direction === "short"
                    ? "border-pnl-short bg-pnl-short/10 text-pnl-short"
                    : "border-border-subtle bg-bg-surface text-fg-secondary hover:border-border"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <TrendingDown aria-hidden="true" className="h-4 w-4" /> Down
                </span>
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-klub-lg border border-border-subtle bg-bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                    Margin
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    {amountPct}% of account
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[22px] font-semibold text-fg-primary">
                  ${amountUsd.toFixed(0)}
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={amountPct}
                  onChange={(e) => setAmountPct(Number(e.target.value))}
                  className="mt-4 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#E8B647]"
                />
                <div className="mt-2 flex justify-between text-[9px] text-fg-muted">
                  <span>1%</span>
                  <span>25%</span>
                  <span>50%</span>
                </div>
              </div>

              <div className="rounded-klub-lg border border-accent/30 bg-accent/5 p-4 text-center">
                <div className="text-[10px] uppercase tracking-[0.12em] text-accent">
                  Position size
                </div>
                <div className="mt-0.5 font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg-primary">
                  ${notional.toFixed(0)}
                </div>
                <div className="mt-2 text-[10px] text-fg-muted">
                  ${amountUsd.toFixed(0)} × {leverage}× ={" "}
                  <span className="text-accent">${notional.toFixed(0)}</span>
                </div>
                <div className="mt-4 flex items-center justify-center rounded-klub border border-border-subtle bg-bg-base/50 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Decrease leverage"
                      onClick={() => setLeverage(Math.max(1, leverage - 0.5))}
                      className="h-8 w-8 shrink-0 rounded-md bg-bg-elevated text-fg-secondary"
                    >
                      −
                    </button>
                    <span className="min-w-9 text-center font-mono text-[15px] text-fg-primary">
                      {leverage}×
                    </span>
                    <button
                      type="button"
                      aria-label="Increase leverage"
                      onClick={() =>
                        setLeverage(
                          Math.min(market.defaultLeverage, leverage + 0.5),
                        )
                      }
                      className="h-8 w-8 shrink-0 rounded-md bg-bg-elevated text-fg-secondary"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <CollapseRow
                label="Protection"
                hint={`${leverage}× · stop ${slPct.toFixed(1)}% · target ${tpPct.toFixed(1)}%`}
                open={showAdvanced}
                onToggle={() => setShowAdvanced((value) => !value)}
              >
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                      Leverage
                    </span>
                    <span className="font-mono text-[14px] text-accent">
                      {leverage}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={market.defaultLeverage}
                    step={0.5}
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-fg-muted">
                    <span>1×</span>
                    <span>
                      {market.defaultLeverage}× max · {market.label}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <PercentField
                    label="Take profit"
                    value={tpPct}
                    onChange={setTpPct}
                    tone="long"
                    suffix={`+$${Math.abs(wouldMake).toFixed(0)}`}
                  />
                  <PercentField
                    label="Stop loss"
                    value={slPct}
                    onChange={setSlPct}
                    tone="short"
                    suffix={`−$${couldLose.toFixed(0)}`}
                  />
                </div>
              </CollapseRow>
            </div>

            <div className="xl:[&>div]:mt-3 xl:[&>div]:p-3">
              <SafetyPreview
                direction={direction}
                marketLabel={market.label}
                maxLossUsd={couldLose}
                targetPnlUsd={Math.abs(wouldMake)}
                liqMovePct={liqMovePct}
                stopPct={slPct}
                targetPct={tpPct}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!mounted) return;
                if (!connected) {
                  promptConnect();
                  return;
                }
                setConfirming(true);
              }}
              disabled={orderState.status === "submitting" || !mounted}
              className="btn-primary btn-block btn-lg mt-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!mounted
                ? "…"
                : !connected
                  ? "Connect wallet to trade"
                  : orderState.status === "submitting"
                    ? "Submitting…"
                    : `Review ${direction === "long" ? "buy" : "sell"} order`}
            </button>
          </div>

          <div className="space-y-2 xl:col-span-2 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
            <CollapseRow
              label="Math"
              hint={`Liq ${liqMovePct.toFixed(1)}% · Notional $${notional.toFixed(0)}`}
              open={showMath}
              onToggle={() => setShowMath((v) => !v)}
            >
              <TradeMath
                targetPct={tpPct}
                stopPct={slPct}
                targetUsd={wouldMake}
                lossUsd={couldLose}
                liqMovePct={liqMovePct}
                notional={notional}
                leverage={leverage}
              />
            </CollapseRow>
            <CollapseRow
              label="My trades"
              hint={
                positions.length === 0 && openOrders.length === 0
                  ? "No open trades"
                  : `${positions.length} position${positions.length === 1 ? "" : "s"} · ${openOrders.length} order${openOrders.length === 1 ? "" : "s"}`
              }
              open={showTrades}
              onToggle={() => setShowTrades((v) => !v)}
            >
              {tradesContent}
            </CollapseRow>
          </div>

          <div className="text-center xl:col-span-2">
            <Link
              href="/pro"
              className="text-[11px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              Need charts or the order book? Open Pro →
            </Link>
          </div>
        </section>
      </div>

      <QuickTradeOverlays
        confirming={confirming}
        direction={direction}
        market={market}
        amountUsd={amountUsd}
        leverage={leverage}
        couldLose={couldLose}
        result={resultModal}
        onConfirm={handleConfirm}
        onCancelConfirm={() => setConfirming(false)}
        onCloseResult={() => setResultModal(null)}
      />
    </main>
  );
}
