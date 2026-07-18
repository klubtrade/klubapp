"use client";

import { useEffect, useState } from "react";

interface MarketNewsItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
}

export function MarketNewsTicker() {
  const [items, setItems] = useState<readonly MarketNewsItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/market-news", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { items: [] };
        return (await response.json()) as { items?: readonly MarketNewsItem[] };
      })
      .then((payload) => setItems(payload.items ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const item = items[activeIndex % Math.max(items.length, 1)];

  return (
    <aside className="flex h-[92px] shrink-0 items-center border-t border-border-subtle bg-bg-base/55 px-5">
      {item ? (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group grid w-full animate-fade-in grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4"
        >
          <span className="rounded-full bg-accent/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
            Market pulse
          </span>
          <span className="min-w-0 text-[13px] font-medium leading-snug text-fg-secondary transition-colors group-hover:text-fg-primary">
            {item.title}
          </span>
          <span className="hidden shrink-0 text-right text-[10px] text-fg-muted xl:block">
            {item.source} · {relativeTime(item.publishedAt)} ↗
          </span>
        </a>
      ) : (
        <div className="flex w-full items-center gap-3 text-[11px] text-fg-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Loading market pulse…
        </div>
      )}
    </aside>
  );
}

function relativeTime(value: string): string {
  const elapsedMs = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(elapsedMs / 3_600_000));
  if (hours === 0) return "now";
  return `${hours}h ago`;
}
