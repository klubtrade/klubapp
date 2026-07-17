// apps/worker/src/notifications/telegram.ts
/* eslint-disable no-console */

/**
 * Telegram alert delivery.
 *
 * Uses the Bot API directly (no SDK dependency) — `sendMessage` is
 * the only endpoint we need. The bot token is a single env var;
 * each user opts in by messaging our bot, at which point we store
 * their `chat_id` on their `alert_preferences` row.
 *
 * Failure mode: we log and return a delivery status. The worker
 * decides whether to retry via BullMQ's built-in exponential backoff.
 */

export interface TelegramDelivery {
  readonly ok: boolean;
  readonly error?: string;
}

export async function sendTelegram(params: {
  readonly chatId: string;
  readonly text: string;
}): Promise<TelegramDelivery> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: params.chatId,
          text: params.text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.warn("[telegram] non-2xx", res.status, body);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[telegram] threw", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Format a tiered liquidation-buffer alert as a Telegram message.
 * Purpose-built for the 25% / 10% / 3% tiers with varying urgency.
 */
export function formatAlertText(alert: {
  readonly tier: 0.25 | 0.1 | 0.03;
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly bufferPct: number;
  readonly liqPrice: number;
  readonly markPrice: number;
}): string {
  const tierLabel =
    alert.tier === 0.25
      ? "Heads up"
      : alert.tier === 0.1
        ? "Close to liq"
        : "ACTION NEEDED";
  const emoji = alert.tier === 0.25 ? "🟡" : alert.tier === 0.1 ? "🟠" : "🔴";
  return [
    `${emoji} *${tierLabel}* · ${alert.symbol}`,
    ``,
    `Your ${alert.side} position is at *${(alert.bufferPct * 100).toFixed(1)}%* buffer.`,
    `Mark: \`$${fmt(alert.markPrice)}\` · Liq: \`$${fmt(alert.liqPrice)}\``,
    ``,
    `Reply /add to add margin, /reduce to trim, /close to exit.`,
  ].join("\n");
}

function fmt(n: number): string {
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
