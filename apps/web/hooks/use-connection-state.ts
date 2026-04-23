'use client';

import { useEffect, useState } from 'react';

import { marketData } from '@/lib/market-data/client';
import type { ConnectionState } from '@klub/api-client';

/**
 * useConnectionState — render Live / Demo / Reconnecting indicators.
 *
 *   const { state, isLive, isDemo } = useConnectionState();
 *
 * `isLive` is true only when connected to the real Bulk WS.
 * `isDemo` is true when demo-mode fallback is active (no BULK_WS_URL
 * env var, or the URL is configured but unreachable and we fell back).
 */
export function useConnectionState() {
  const [state, setState] = useState<ConnectionState>(marketData.getState());
  const [demo, setDemo] = useState<boolean>(marketData.isDemoMode());

  useEffect(() => {
    const unsub = marketData.onStateChange((s) => {
      setState(s);
      setDemo(marketData.isDemoMode());
    });
    return unsub;
  }, []);

  return {
    state,
    isLive: state === 'open' && !demo,
    isDemo: demo,
    isReconnecting: state === 'reconnecting' || state === 'connecting',
  } as const;
}
