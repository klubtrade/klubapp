'use client';

import {
  BulkWebSocket,
  type ConnectionState,
  type FrontendContextRow,
  type RiskStream,
  type TradeUpdate,
} from '@klub/api-client';
import type { Ticker } from '@klub/api-client';

/**
 * Singleton market-data client for the browser.
 *
 * Wraps `BulkWebSocket` with:
 *   - lazy init (only connects when the first subscriber shows up)
 *   - demo-mode fallback (simulated ticks when WS URL is missing)
 *   - shared instance so multiple hooks don't open multiple sockets
 *
 * Dashboard pages (/home, /desk, /pro watchlist) use `onFrontendContext()`
 * — ONE subscription for all markets, updated every 2s. Per-symbol
 * `onTicker()` is for the active market on a trade page where 200ms
 * resolution matters.
 *
 * Pages + hooks consume this via the `marketData` singleton; they
 * never instantiate `BulkWebSocket` directly.
 */

type Listener<T> = (payload: T) => void;

// Seed prices for demo-mode. Matches the mocks used in /pro and /desk.
const DEMO_SEED: Record<string, { price: number; fundingRate: number; oi: number; vol24h: number }> = {
  'BTC-USD': { price: 67_420, fundingRate: 0.0000118, oi: 412_000_000, vol24h: 8_400_000_000 },
  'ETH-USD': { price: 3_284, fundingRate: 0.0000094, oi: 248_000_000, vol24h: 3_200_000_000 },
  'SOL-USD': { price: 178.4, fundingRate: 0.0000172, oi: 88_000_000, vol24h: 1_400_000_000 },
  'HYPE-USD': { price: 31.22, fundingRate: -0.000006, oi: 42_000_000, vol24h: 520_000_000 },
  'DOGE-USD': { price: 0.1842, fundingRate: 0.0000205, oi: 36_000_000, vol24h: 480_000_000 },
  'AVAX-USD': { price: 42.68, fundingRate: 0.0000038, oi: 19_000_000, vol24h: 220_000_000 },
  'LINK-USD': { price: 14.88, fundingRate: 0.0000061, oi: 12_000_000, vol24h: 140_000_000 },
  'ARB-USD': { price: 0.84, fundingRate: 0.0000012, oi: 8_000_000, vol24h: 86_000_000 },
  'OP-USD': { price: 1.94, fundingRate: -0.0000004, oi: 6_000_000, vol24h: 52_000_000 },
  'NEAR-USD': { price: 5.62, fundingRate: 0.0000081, oi: 5_000_000, vol24h: 44_000_000 },
  'APT-USD': { price: 8.24, fundingRate: 0.0000028, oi: 3_200_000, vol24h: 28_000_000 },
  'SUI-USD': { price: 1.68, fundingRate: 0.0000094, oi: 2_800_000, vol24h: 22_000_000 },
};

class MarketDataClient {
  private ws: BulkWebSocket | null = null;
  private demoMode = false;
  private state: ConnectionState = 'idle';
  private stateListeners = new Set<Listener<ConnectionState>>();
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private demoCtxListeners = new Set<Listener<readonly FrontendContextRow[]>>();
  private demoTickerListeners = new Map<string, Set<Listener<Ticker>>>();
  private demoTradesListeners = new Map<string, Set<Listener<readonly TradeUpdate[]>>>();
  private demoRiskListeners = new Map<string, Set<Listener<RiskStream>>>();

  private readonly wsUrl: string;

  constructor() {
    this.wsUrl = process.env['NEXT_PUBLIC_BULK_WS_URL'] ?? '';
  }

  // -------------------------------------------------------------------
  // Public subscribe API — one method per stream type
  // -------------------------------------------------------------------

  /**
   * Subscribe to the aggregated market context (all markets at once,
   * every 2s). Prefer this over per-symbol tickers for dashboards —
   * one subscription instead of N.
   */
  onFrontendContext(handler: Listener<readonly FrontendContextRow[]>): () => void {
    if (!this.wsUrl) {
      this.demoCtxListeners.add(handler);
      this.ensureDemoMode();
      return () => {
        this.demoCtxListeners.delete(handler);
        this.maybeStopDemoMode();
      };
    }
    this.ensureWs();
    return this.ws!.onFrontendContext(handler);
  }

  /**
   * Per-symbol ticker stream (200ms resolution). Use on active trade
   * pages where you need tight pricing. Counts against the 100-sub
   * limit — batch via `onFrontendContext` on dashboards.
   */
  onTicker(symbol: string, handler: Listener<Ticker>): () => void {
    if (!this.wsUrl) {
      let bucket = this.demoTickerListeners.get(symbol);
      if (!bucket) {
        bucket = new Set();
        this.demoTickerListeners.set(symbol, bucket);
      }
      bucket.add(handler);
      this.ensureDemoMode();
      return () => {
        bucket?.delete(handler);
        if (bucket?.size === 0) this.demoTickerListeners.delete(symbol);
        this.maybeStopDemoMode();
      };
    }
    this.ensureWs();
    return this.ws!.onTicker(symbol, handler);
  }

  /**
   * Trade stream for a market.
   */
  onTrades(symbol: string, handler: Listener<readonly TradeUpdate[]>): () => void {
    if (!this.wsUrl) {
      let bucket = this.demoTradesListeners.get(symbol);
      if (!bucket) {
        bucket = new Set();
        this.demoTradesListeners.set(symbol, bucket);
      }
      bucket.add(handler);
      this.ensureDemoMode();
      return () => {
        bucket?.delete(handler);
        if (bucket?.size === 0) this.demoTradesListeners.delete(symbol);
        this.maybeStopDemoMode();
      };
    }
    this.ensureWs();
    return this.ws!.onTrades(symbol, handler);
  }

  /**
   * Per-symbol risk surface stream. Published event-driven when
   * Bulk's underlying regime / lambda grid changes — NOT a
   * continuous feed. Expect long gaps between updates on quiet
   * markets and a flurry during volatility transitions.
   *
   * Used by `/health` and the bulk-margin math (Week 2) to replace
   * the naive `maintenanceMarginFrac: 0.005` placeholder with
   * per-market, regime-aware figures.
   *
   * Note: we don't simulate risk surfaces in demo mode (no WS URL).
   * The consuming hook should gracefully fall back to the existing
   * naive maintenance-margin placeholder when no data has arrived —
   * same honest-empty-state pattern as other streams.
   */
  onRisk(symbol: string, handler: Listener<RiskStream>): () => void {
    if (!this.wsUrl) {
      // Demo mode: accept the subscription but never emit. The hook
      // reads its own seeded fallback. We still track the listener
      // so stateful callers can see subscription bookkeeping is
      // consistent across streams.
      let bucket = this.demoRiskListeners.get(symbol);
      if (!bucket) {
        bucket = new Set();
        this.demoRiskListeners.set(symbol, bucket);
      }
      bucket.add(handler);
      this.ensureDemoMode();
      return () => {
        bucket?.delete(handler);
        if (bucket?.size === 0) this.demoRiskListeners.delete(symbol);
        this.maybeStopDemoMode();
      };
    }
    this.ensureWs();
    return this.ws!.onRisk(symbol, handler);
  }

  // -------------------------------------------------------------------

  onStateChange(listener: Listener<ConnectionState>): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  isDemoMode(): boolean {
    return this.demoMode || !this.wsUrl;
  }

  // -------------------------------------------------------------------

  private ensureWs(): void {
    if (this.ws) return;
    this.ws = new BulkWebSocket({
      url: this.wsUrl,
      log: (msg, meta) => {
        if (process.env['NODE_ENV'] !== 'production') {
          // eslint-disable-next-line no-console
          console.log(`[market-data] ${msg}`, meta ?? '');
        }
      },
    });
    this.ws.onStateChange((s) => {
      this.setState(s);
    });
    this.ws.connect();
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of this.stateListeners) l(next);
  }

  // -------------------------------------------------------------------
  // Demo-mode simulator — emits payloads matching the REAL Bulk shape
  // -------------------------------------------------------------------

  private ensureDemoMode(): void {
    if (this.demoMode) return;
    this.demoMode = true;
    this.setState('open');
    this.demoTimer = setInterval(() => {
      this.emitDemoTick();
    }, 2_000);
    // Emit an initial tick immediately so UIs don't wait 2s on mount
    setTimeout(() => this.emitDemoTick(), 50);
  }

  private maybeStopDemoMode(): void {
    const stillInUse =
      this.demoCtxListeners.size > 0 ||
      this.demoTickerListeners.size > 0 ||
      this.demoTradesListeners.size > 0 ||
      this.demoRiskListeners.size > 0;
    if (stillInUse) return;
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
    this.demoMode = false;
  }

  private emitDemoTick(): void {
    // drift every seed price slightly
    const rows: FrontendContextRow[] = [];
    for (const [symbol, seed] of Object.entries(DEMO_SEED)) {
      const drift = (Math.random() - 0.5) * seed.price * 0.0006;
      seed.price = Math.max(0.0001, seed.price + drift);
      seed.fundingRate += (Math.random() - 0.5) * 1e-6;

      rows.push({
        symbol,
        volume: seed.vol24h,
        funding: seed.fundingRate,
        oi: seed.oi,
        lastPrice: seed.price,
        priceChange: drift * 40,
        priceChangePercent: (drift * 40) / seed.price,
      });
    }

    // fan out to ctx subscribers
    for (const l of this.demoCtxListeners) l(rows);

    // fan out per-symbol ticker subs (build a full Ticker from the seed)
    for (const [symbol, bucket] of this.demoTickerListeners) {
      const seed = DEMO_SEED[symbol];
      if (!seed) continue;
      const ticker: Ticker = {
        priceChange: seed.price * 0.02,
        priceChangePercent: 0.02,
        lastPrice: seed.price,
        highPrice: seed.price * 1.03,
        lowPrice: seed.price * 0.97,
        volume: seed.vol24h / seed.price,
        quoteVolume: seed.vol24h,
        markPrice: seed.price,
        oraclePrice: seed.price * 1.0001,
        openInterest: seed.oi,
        fundingRate: seed.fundingRate,
        regime: 0,
        regimeDt: 12,
        regimeVol: 0.4,
        regimeMv: seed.price,
        fairBookPx: seed.price,
        fairVol: 0.4,
        fairBias: 0,
        timestamp: Date.now() * 1_000_000,
      };
      for (const l of bucket) l(ticker);
    }

    // fan out per-symbol trades subs
    for (const [symbol, bucket] of this.demoTradesListeners) {
      const seed = DEMO_SEED[symbol];
      if (!seed) continue;
      const trades: TradeUpdate[] = [
        {
          s: symbol,
          px: seed.price,
          sz: 0.05 + Math.random() * 0.5,
          time: Date.now(),
          side: Math.random() > 0.5,
          maker: 'demo_maker',
          taker: 'demo_taker',
        },
      ];
      for (const l of bucket) l(trades);
    }
  }
}

/**
 * Shared singleton — import this, don't `new` anything.
 */
export const marketData = new MarketDataClient();
