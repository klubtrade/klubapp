import { describe, expect, it } from "vitest";

import {
  requireAnyLinkedSolanaWallet,
  requireLinkedSolanaWallet,
  type AuthenticatedPrincipal,
} from "../server/privy-auth";

const principal: AuthenticatedPrincipal = {
  privyUserId: "did:privy:test",
  sessionId: "session-test",
  solanaWallets: new Set(["linked-wallet"]),
};

describe("Privy wallet authorization", () => {
  it("accepts the linked wallet", () => {
    expect(requireLinkedSolanaWallet(principal, "linked-wallet")).toBeNull();
  });

  it("rejects an unlinked wallet", async () => {
    const response = requireLinkedSolanaWallet(principal, "attacker-wallet");
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "wallet_forbidden",
    });
  });

  it("accepts a transaction when its signer is linked", () => {
    expect(
      requireAnyLinkedSolanaWallet(principal, [
        "bulk-subaccount",
        "linked-wallet",
      ]),
    ).toBeNull();
  });
});
