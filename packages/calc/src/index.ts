// packages/calc/src/index.ts
/**
 * @klub/calc — pure math for KLUB's anti-liquidation features.
 *
 *   - Pre-trade calculator (The Math)
 *   - Portfolio Health Score + stress test
 */

export {
  calculate,
  CalcError,
  liqPrice,
  sizeFromMargin,
  sizeFromNotional,
} from './calculator.js';
export type { CalcInput, CalcOutput, Side } from './calculator.js';

export { bandFor, healthScore, stressTest } from './health.js';
export type {
  HealthBand,
  HealthInput,
  HealthOutput,
  HealthPosition,
  StressTestInput,
  StressTestOutput,
  SubScore,
} from './health.js';
