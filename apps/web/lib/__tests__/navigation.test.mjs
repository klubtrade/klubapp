import { describe, expect, it } from "vitest";

import {
  isMoreNavigationActive,
  isNavigationItemActive,
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
    const trade = PRIMARY_NAVIGATION[1];
    expect(trade).toBeDefined();
    expect(isNavigationItemActive("/trade", trade)).toBe(true);
    expect(isNavigationItemActive("/trade/BTC-USD", trade)).toBe(true);
    expect(isNavigationItemActive("/quick-trade", trade)).toBe(true);
    expect(isNavigationItemActive("/pro", trade)).toBe(false);
    expect(isNavigationItemActive("/trader", trade)).toBe(false);
  });

  it("recognizes secondary routes without treating them as primary", () => {
    expect(isMoreNavigationActive("/cash")).toBe(true);
    expect(isMoreNavigationActive("/basis/details")).toBe(true);
    expect(isMoreNavigationActive("/pro")).toBe(true);
    expect(isMoreNavigationActive("/trade")).toBe(false);
  });
});
