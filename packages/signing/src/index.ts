// packages/signing/src/index.ts
//
// Ed25519 signing primitives for KLUB.
//
// Why this package exists:
//   - Bulk uses Ed25519 for every authenticated request (orders,
//     position management, agent-wallet lifecycle).
//   - We want a single, testable wrapper around the primitives so
//     our API routes, worker tasks, and tests all share the same
//     canonical signing path.
//   - The real `bulk-keychain` package (published by the Bulk team)
//     will eventually be a drop-in replacement for our `Ed25519Signer`
//     implementation below. Until then, we use `@noble/ed25519`
//     directly — Bulk's own keychain is built on the same primitives.
//
// Consumers:
//   - `apps/web/app/api/*` — signs user requests to Bulk REST endpoints
//   - `apps/worker/src/workers/copy-trade-worker` — signs order submissions
//     through a follower's agent-wallet key
//   - `apps/worker/src/workers/alerts-worker` — signs account-stream
//     subscriptions (read-only, still authenticated)

export * from "./types.js";
export * from "./signer.js";
export * from "./payloads.js";
export * from "./agent-wallet.js";
