import type { HealthOutput } from "@klub/calc";

export type PortfolioRiskView =
  | { readonly state: "loading" }
  | { readonly state: "flat" }
  | { readonly state: "unavailable" }
  | {
      readonly state: "active";
      readonly score: number;
      readonly bufferPct: number;
      readonly level: "safe" | "watch" | "risky" | "critical";
      readonly recommendation: string;
    };

export function buildPortfolioRiskView(params: {
  readonly positionCount: number | null;
  readonly result: HealthOutput | null;
}): PortfolioRiskView {
  if (params.positionCount === null) return { state: "loading" };
  if (params.positionCount === 0) return { state: "flat" };
  if (!params.result) return { state: "unavailable" };

  const rawBuffer = params.result.subscores.liquidationProximity.rawValue * 100;
  return {
    state: "active",
    score: params.result.score,
    bufferPct: Number.isFinite(rawBuffer) ? Math.max(0, rawBuffer) : 0,
    level: riskLevel(params.result.band),
    recommendation:
      params.result.recommendations[0] ??
      "Your current risk settings look comfortable.",
  };
}

function riskLevel(
  band: HealthOutput["band"],
): Extract<PortfolioRiskView, { state: "active" }>["level"] {
  if (band === "critical") return "critical";
  if (band === "risky") return "risky";
  if (band === "caution") return "watch";
  return "safe";
}
