import { describe, expect, it } from "vitest";

import {
  canonicalizePathname,
  isMoreNavigationActive,
  isNavigationItemActive,
  MORE_NAVIGATION,
  PRIMARY_NAVIGATION,
} from "../navigation.ts";

describe("navigation", () => {
  it("keeps the primary journey focused on three destinations", () => {
    expect(PRIMARY_NAVIGATION.map(({ label }) => label)).toEqual([
      "Portfolio",
      "Trade",
      "Copy",
    ]);
  });

  it("marks canonical routes, nested routes, and legacy aliases active", () => {
    const portfolio = PRIMARY_NAVIGATION[0];
    const trade = PRIMARY_NAVIGATION[1];
    const copy = PRIMARY_NAVIGATION[2];
    expect(isNavigationItemActive("/portfolio", portfolio)).toBe(true);
    expect(isNavigationItemActive("/home", portfolio)).toBe(true);
    expect(isNavigationItemActive("/health", portfolio)).toBe(true);
    expect(trade).toBeDefined();
    expect(isNavigationItemActive("/trade", trade)).toBe(true);
    expect(isNavigationItemActive("/trade/BTC-USD", trade)).toBe(true);
    expect(isNavigationItemActive("/quick-trade", trade)).toBe(true);
    expect(isNavigationItemActive("/pro", trade)).toBe(false);
    expect(isNavigationItemActive("/trader", trade)).toBe(false);
    expect(isNavigationItemActive("/copy", copy)).toBe(true);
    expect(isNavigationItemActive("/follow/alpha", copy)).toBe(true);
    expect(isNavigationItemActive("/copy-trade", copy)).toBe(true);
  });

  it("recognizes secondary routes without treating them as primary", () => {
    expect(isMoreNavigationActive("/cash")).toBe(true);
    expect(isMoreNavigationActive("/cash/add")).toBe(true);
    expect(isMoreNavigationActive("/ramp")).toBe(true);
    expect(isMoreNavigationActive("/basis/details")).toBe(true);
    expect(isMoreNavigationActive("/more")).toBe(true);
    expect(isMoreNavigationActive("/pro")).toBe(true);
    expect(isMoreNavigationActive("/trade")).toBe(false);
  });

  it("canonicalizes legacy and overlapping routes", () => {
    expect(canonicalizePathname("/home")).toBe("/portfolio");
    expect(canonicalizePathname("/home/positions")).toBe(
      "/portfolio/positions",
    );
    expect(canonicalizePathname("/funding")).toBe("/cash");
    expect(canonicalizePathname("/quick-trade")).toBe("/trade");
    expect(canonicalizePathname("/follow/alpha")).toBe("/copy/alpha");
    expect(canonicalizePathname("/copy-trade")).toBe("/copy");
    expect(canonicalizePathname("/ramp")).toBe("/cash/add");
    expect(canonicalizePathname("/portfolio")).toBeNull();
  });

  it("labels advanced and testnet products explicitly", () => {
    const items = MORE_NAVIGATION.flatMap((group) => group.items);
    expect(items.find(({ href }) => href === "/pro")?.badge).toBe("Advanced");
    expect(items.find(({ href }) => href === "/basis")?.badge).toBe("Testnet");
    expect(items.find(({ href }) => href === "/cash")?.label).toBe("Cash");
  });
});
