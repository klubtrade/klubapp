"use client";

import { getAccessToken } from "@privy-io/react-auth";

/** Fetch a protected KLUB route with the current short-lived Privy token. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in again to continue.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
