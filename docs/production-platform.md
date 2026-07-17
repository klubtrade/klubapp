# KLUB production platform

## Decision

Use Railway for the stateful backend during the MVP and early production phase:

- Next.js can remain on its current edge/CDN host or run on Railway.
- Run the API and BullMQ workers as separate Railway services.
- Use Railway Postgres as the system of record.
- Use Railway Redis only for queues, short-lived cache entries, rate limits, and idempotency locks.
- Connect services over Railway private networking and use `DATABASE_URL` internally.
- Enable automated Postgres backups before inviting real users.

This matches the repository's existing Drizzle/Postgres and BullMQ/Redis boundaries and avoids introducing a second platform model prematurely.

## Identity and onboarding

Privy is the authentication and wallet UX boundary. A successful login must resolve to one canonical Solana wallet session before application routes consider the user connected.

The production server must verify Privy access tokens with the Privy server SDK. Never accept a Privy DID, wallet address, role, or onboarding flag sent by the browser without server verification. Prefer an HTTP-only auth cookie for server-rendered routes.

The canonical first-run state machine is:

1. Authenticate or connect a wallet.
2. Claim a unique username with a wallet signature.
3. Claim test USDC or confirm the wallet is already funded.
4. Mark onboarding complete for the authenticated Privy user and wallet.
5. Land on `/funding`.

The browser may cache this state for instant rendering, but Postgres is authoritative.

## Persistent data model

Add a stable `privy_user_id` to the user record and attach wallets through a separate table so wallet rotation does not create a new account. Persist these domains server-side:

- profile, username, onboarding state, and preferences;
- linked wallets and active account selection;
- follows, copy-trade policies, alerts, and notification destinations;
- journals, saved layouts, watchlists, and product settings;
- idempotency keys and an immutable audit trail for sensitive mutations.

Do not persist live tickers, books, or candles in the user profile. Those belong in short-TTL Redis caches or stream directly from Bulk.

## Signing and secrets

- Never store a private key in localStorage, sessionStorage, ordinary Postgres columns, logs, or analytics.
- Privy embedded wallets should sign through Privy's isolated wallet runtime.
- If silent agent execution is required for copy trading, store the key in KMS/HSM-backed infrastructure or an audited delegated-signing service. Persist only the key identifier and public key in Postgres.
- Workers request a signature through that provider and receive no exportable long-lived secret.
- Encrypt sensitive notification tokens at the application layer and rotate them.
- Keep Bulk, Privy, database, Redis, and notification secrets server-only.

## API controls

Every state-changing route should have:

- verified Privy authentication and wallet ownership where applicable;
- strict Zod input validation;
- per-user and per-IP rate limits;
- idempotency for faucet, transfer, follow, and order orchestration requests;
- structured audit events with secrets and signed payloads redacted;
- explicit authorization checks on every referenced user, wallet, and sub-account.

The Bulk place-order proxy must continue forwarding the exact finalized action list the wallet signed. It must not reconstruct signed actions.

## Performance budget

- Keep public marketing and disconnected product pages static.
- Fetch the initial authenticated dashboard snapshot on the server, then hydrate live market data on the client.
- Cache exchange-wide metadata and risk surfaces with a short TTL; never duplicate one request per component.
- Use one multiplexed market-data connection per browser tab.
- Dynamically import charts, Pro-only modules, and rarely opened modals.
- Paginate histories and virtualize long books, fills, and leader lists.
- Put expensive indexing, alerts, and copy-trade work in BullMQ workers.
- Track Core Web Vitals and set a route budget: under 150 KB initial JavaScript for core mobile screens, excluding wallet SDK code that cannot be split safely.

## Delivery order

1. Verify Privy sessions server-side and persist user/onboarding records.
2. Move follows, preferences, saved layouts, and active-account state to APIs backed by Postgres.
3. Add Redis rate limiting, idempotency, and job queues.
4. Introduce the secure delegated signer before enabling unattended copy trading.
5. Add observability, database restore drills, and incident runbooks before mainnet.
