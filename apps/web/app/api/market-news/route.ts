import { NextResponse } from "next/server";

export const revalidate = 300;

const FEEDS = [
  {
    source: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
] as const;

interface MarketNewsItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly publishedMs: number;
}

export async function GET() {
  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "KlubMarketPulse/1.0",
        },
        next: { revalidate },
      });
      if (!response.ok)
        throw new Error(`${feed.source} returned ${response.status}`);
      return parseFeed(await response.text(), feed.source);
    }),
  );

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const items = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => item.publishedMs >= cutoff && isSafeHttpUrl(item.url))
    .sort((a, b) => b.publishedMs - a.publishedMs)
    .filter((item, index, all) => {
      return (
        all.findIndex((candidate) => candidate.title === item.title) === index
      );
    })
    .slice(0, 24)
    .map(({ publishedMs: _publishedMs, ...item }) => item);

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}

function parseFeed(xml: string, source: string): readonly MarketNewsItem[] {
  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).flatMap(
    (match, index) => {
      const item = match[1] ?? "";
      const title = extractTag(item, "title");
      const url = extractTag(item, "link");
      const published =
        extractTag(item, "pubDate") || extractTag(item, "dc:date");
      const publishedMs = Date.parse(published);
      if (!title || !url || !Number.isFinite(publishedMs)) return [];
      return [
        {
          id: `${source}-${publishedMs}-${index}`,
          title,
          url,
          source,
          publishedAt: new Date(publishedMs).toISOString(),
          publishedMs,
        },
      ];
    },
  );
}

function extractTag(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"),
  );
  return decodeXml(
    (match?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim(),
  );
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
