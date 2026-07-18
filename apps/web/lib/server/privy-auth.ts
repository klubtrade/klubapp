import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";

export interface AuthenticatedPrincipal {
  readonly privyUserId: string;
  readonly sessionId: string;
  readonly solanaWallets: ReadonlySet<string>;
}

export type PrivyAuthResult =
  | { readonly ok: true; readonly principal: AuthenticatedPrincipal }
  | { readonly ok: false; readonly response: NextResponse };

let client: PrivyClient | null = null;

function getClient(): PrivyClient | null {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;
  client ??= new PrivyClient({ appId, appSecret });
  return client;
}

function accessToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const value = authorization.slice("Bearer ".length).trim();
    if (value) return value;
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("privy-token="));
  return cookie
    ? decodeURIComponent(cookie.slice("privy-token=".length))
    : null;
}

/**
 * Verify the Privy access token and resolve wallet ownership from Privy itself.
 * Browser-supplied user IDs and wallet lists are never trusted.
 */
export async function requirePrivyAuth(
  request: Request,
): Promise<PrivyAuthResult> {
  const privy = getClient();
  if (!privy) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "auth_unavailable",
          message: "Authentication is unavailable.",
        },
        { status: 503 },
      ),
    };
  }

  const token = accessToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", message: "Sign in to continue." },
        { status: 401 },
      ),
    };
  }

  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const user = await privy.users()._get(claims.user_id);
    const solanaWallets = new Set(
      user.linked_accounts
        .filter(
          (
            account,
          ): account is Extract<
            (typeof user.linked_accounts)[number],
            { type: "wallet" }
          > => account.type === "wallet" && account.chain_type === "solana",
        )
        .map((account) => account.address),
    );
    return {
      ok: true,
      principal: {
        privyUserId: claims.user_id,
        sessionId: claims.session_id,
        solanaWallets,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", message: "Your session has expired." },
        { status: 401 },
      ),
    };
  }
}

export function requireLinkedSolanaWallet(
  principal: AuthenticatedPrincipal,
  wallet: string,
): NextResponse | null {
  if (principal.solanaWallets.has(wallet)) return null;
  return NextResponse.json(
    {
      error: "wallet_forbidden",
      message: "This wallet is not linked to your authenticated account.",
    },
    { status: 403 },
  );
}

export function requireAnyLinkedSolanaWallet(
  principal: AuthenticatedPrincipal,
  wallets: readonly string[],
): NextResponse | null {
  if (wallets.some((wallet) => principal.solanaWallets.has(wallet)))
    return null;
  return NextResponse.json(
    {
      error: "wallet_forbidden",
      message:
        "The transaction account is not linked to your authenticated account.",
    },
    { status: 403 },
  );
}
