import { describe, expect, it } from "vitest";

import {
  base58Decode,
  base58Encode,
  assertSafeAgentWalletScope,
  createEd25519Signer,
  derivePublicKey,
  shortenPubkey,
  verifyEd25519,
} from "../index.js";
import type { AgentWalletScope } from "../types.js";

describe("base58 encoding", () => {
  it.each([
    new Uint8Array(),
    new Uint8Array([0]),
    new Uint8Array([0, 0]),
    new Uint8Array([0, 1]),
    new Uint8Array([1, 2, 3, 254, 255]),
  ])("round-trips byte arrays", (bytes) => {
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
  });

  it("rejects characters outside the Bitcoin/Solana alphabet", () => {
    expect(() => base58Decode("0OIl")).toThrow("invalid base58 char");
  });
});

describe("Ed25519 signer", () => {
  it("signs verifiable payloads and rejects tampering", async () => {
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const publicKey = derivePublicKey(privateKey);
    const signer = createEd25519Signer({ privateKey, publicKey });
    const payload = new TextEncoder().encode("klub baseline");
    const signature = await signer.sign(payload);

    await expect(
      verifyEd25519({ payload, signature, publicKey }),
    ).resolves.toBe(true);
    await expect(
      verifyEd25519({
        payload: new TextEncoder().encode("tampered"),
        signature,
        publicKey,
      }),
    ).resolves.toBe(false);
  });
});

describe("agent-wallet safeguards", () => {
  const validScope: AgentWalletScope = {
    userPubkey: "user",
    agentPubkey: "agent",
    allowedMarkets: ["BTC-USD"],
    maxNotionalUsd: 1_000,
    expiresAt: Date.now() + 60_000,
    canWithdraw: false,
  };

  it("rejects withdrawal authority even when supplied at runtime", () => {
    const unsafeScope = {
      ...validScope,
      canWithdraw: true,
    } as unknown as AgentWalletScope;

    expect(() => assertSafeAgentWalletScope(unsafeScope)).toThrow(
      "cannot carry withdrawal authority",
    );
  });

  it("rejects expired delegation scopes", () => {
    expect(() =>
      assertSafeAgentWalletScope({
        ...validScope,
        expiresAt: Date.now() - 1,
      }),
    ).toThrow("expiry must be in the future");
  });

  it("shortens public keys for display", () => {
    expect(shortenPubkey("123456789ABCDEFG")).toBe("12…DEFG");
  });
});
