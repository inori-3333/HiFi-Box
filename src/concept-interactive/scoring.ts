function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, x) => acc + x, 0) / values.length;
}

export function scoreHigherBetter(value: number, badValue: number, goodValue: number): number {
  if (value <= badValue) {
    return 0;
  }
  if (value >= goodValue) {
    return 100;
  }
  return round1(clamp(((value - badValue) / (goodValue - badValue)) * 100, 0, 100));
}

export function scoreLowerBetter(value: number, goodValue: number, badValue: number): number {
  if (value <= goodValue) {
    return 100;
  }
  if (value >= badValue) {
    return 0;
  }
  return round1(clamp(((badValue - value) / (badValue - goodValue)) * 100, 0, 100));
}

export function logisticScore(
  value: number,
  midpoint: number,
  steepness: number,
  invert: boolean = false
): number {
  const exponent = steepness * (value - midpoint);
  const score = 100 / (1 + Math.exp(exponent));
  const adjusted = invert ? 100 - score : score;
  return round1(clamp(adjusted, 0, 100));
}

export function confidenceFromTrials(totalTrials: number, skippedTrials: number, replayCount: number): number {
  if (totalTrials <= 0) {
    return 0;
  }
  const usableRatio = clamp((totalTrials - skippedTrials) / totalTrials, 0, 1);
  const replayPenalty = clamp(replayCount / Math.max(totalTrials * 6, 1), 0, 0.35);
  return round1(clamp((usableRatio - replayPenalty) * 100, 0, 100));
}

export function dPrimeFromAccuracy(accuracy: number): number {
  const clamped = clamp(accuracy, 0.5001, 0.9999);
  return round1(clamp((clamped - 0.5) * 6, 0, 4));
}

export function conceptScore(
  primaryMetricScore: number,
  secondaryMetricScore: number,
  consistencyScore: number
): number {
  return round1(
    clamp(primaryMetricScore * 0.6 + secondaryMetricScore * 0.3 + consistencyScore * 0.1, 0, 100)
  );
}
