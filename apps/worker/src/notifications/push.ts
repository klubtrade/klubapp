// apps/worker/src/notifications/push.ts

/**
 * Web / mobile push notifications.
 *
 * Signature committed so the alerts worker compiles. Implementation
 * pending a decision on push provider:
 *   - Web Push (native browser API) — no vendor lock-in, requires VAPID keys
 *   - Firebase Cloud Messaging — ecosystem polish, Google dependency
 *   - OneSignal — fastest to ship, vendor-proprietary
 *
 * Decision owner: founder. Default-recommended: Web Push for V1 (no
 * vendor), swap to FCM or OneSignal when/if mobile apps ship.
 */
export async function sendPush(
  userId: string,
  message: {
    readonly title: string;
    readonly body: string;
    readonly severity: 'info' | 'warning' | 'critical';
  },
): Promise<void> {
  // TODO(phase-3.5): look up active push subscriptions for userId in Postgres,
  // sign a VAPID payload, POST to each subscription endpoint, handle 410s
  // (expired subscriptions) by removing them.
  void userId;
  void message;
}
