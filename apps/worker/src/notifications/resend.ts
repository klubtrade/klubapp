// apps/worker/src/notifications/resend.ts
import { Resend } from 'resend';

/**
 * Email notification via Resend.
 *
 * Resend takes care of delivery, bounces, and suppression lists. We
 * only need to manage the sender domain (verified in Resend console)
 * and the templates.
 *
 * The sender is intentionally hello@klub.trade rather than a no-reply —
 * founders read replies. Do not change without agreement.
 */

let client: Resend | null = null;

function getClient(): Resend {
  if (client) return client;
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('RESEND_API_KEY not set');
  client = new Resend(key);
  return client;
}

export async function sendAlertEmail(
  email: string,
  message: { readonly title: string; readonly body: string; readonly severity: 'info' | 'warning' | 'critical' },
): Promise<void> {
  const subjectPrefix = message.severity === 'critical' ? '⚠️ ' : '';
  await getClient().emails.send({
    from: 'KLUB Alerts <hello@klub.trade>',
    to: email,
    subject: `${subjectPrefix}${message.title}`,
    text: `${message.body}\n\n—\nManage alerts: https://klub.trade/health\nUnsubscribe: https://klub.trade/settings/alerts`,
    // HTML version intentionally plain; liquidation alerts land on
    // lock screens before they're opened. Keep text crisp.
  });
}

export async function sendWelcomeEmail(email: string, handle?: string): Promise<void> {
  await getClient().emails.send({
    from: 'KLUB <hello@klub.trade>',
    to: email,
    subject: 'you\'re in the klub',
    text: welcomeEmailBody(handle),
  });
}

function welcomeEmailBody(handle?: string): string {
  return `Hey${handle ? ` @${handle}` : ''} —

Thanks for adding yourself to the KLUB waitlist. Two quick things.

1. What KLUB is. A members-only front-end for on-chain perps on Bulk Exchange. Copy trading with a net-of-fees leaderboard. A pre-trade calculator that runs the math before you click. Liquidation alerts.

2. What happens next. Testnet invites go out in batches before mainnet opens. You'll get yours in an email from us; batch 1 ships in the next two weeks.

Reply to this email with the one thing that's gone wrong for you on an on-chain perps exchange. We're building a lot of KLUB around the answers.

— [founder name]
KLUB · klub.trade`;
}
