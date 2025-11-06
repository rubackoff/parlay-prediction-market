export interface FairValueRequest {
  baseMarkets: string[]; // Polymarket IDs (optional for now)
  outcomes: boolean[];   // YES/NO for each market
  probs?: number[];      // Optional: per-market YES probability in [0,1]
  covariance?: number;   // Optional: adjustment factor in [-0.5, 0.5]
}

export interface FairValueResult {
  fairValue: number;     // proxy for expected payout per 1 USDC
  probability: number;   // combined probability of parlay
  odds: number;          // decimal odds (1 / probability)
}

// Clamp helper
const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));

// Naive combo probability with simple covariance adjustment
export function calculateFairValue(req: FairValueRequest): FairValueResult {
  const n = req.outcomes.length;
  const probs = (req.probs && req.probs.length === n)
    ? req.probs.map((p) => clamp(p))
    : Array.from({ length: n }, () => 0.5);

  // Base independent probability
  let p = 1;
  for (let i = 0; i < n; i++) {
    const pYes = probs[i];
    const pLeg = req.outcomes[i] ? pYes : (1 - pYes);
    p *= clamp(pLeg, 1e-6, 1 - 1e-6);
  }

  // Simple covariance adjustment (placeholder):
  // If covariance > 0, increase difficulty (reduce prob); if < 0, increase prob.
  const cov = clamp(req.covariance ?? 0, -0.5, 0.5);
  const adjusted = clamp(p * (1 - cov), 1e-6, 1 - 1e-6);

  const probability = adjusted;
  const odds = 1 / probability;
  const fairValue = probability; // For 1 USDC payout baseline

  return { fairValue, probability, odds };
}
