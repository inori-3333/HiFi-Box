import { conceptScore, confidenceFromTrials, dPrimeFromAccuracy, scoreHigherBetter, scoreLowerBetter } from "./scoring";

describe("concept-interactive/scoring", () => {
  it("scoreHigherBetter increases with value", () => {
    const low = scoreHigherBetter(10, 0, 100);
    const high = scoreHigherBetter(80, 0, 100);
    expect(high).toBeGreaterThan(low);
  });

  it("scoreLowerBetter decreases with value", () => {
    const good = scoreLowerBetter(1.2, 1, 4);
    const bad = scoreLowerBetter(3.6, 1, 4);
    expect(good).toBeGreaterThan(bad);
  });

  it("confidence penalizes skipped and replayed trials", () => {
    const strong = confidenceFromTrials(6, 0, 3);
    const weak = confidenceFromTrials(6, 3, 24);
    expect(strong).toBeGreaterThan(weak);
  });

  it("dPrime and conceptScore remain bounded", () => {
    const dPrime = dPrimeFromAccuracy(0.88);
    const score = conceptScore(85, 72, 64);
    expect(dPrime).toBeGreaterThanOrEqual(0);
    expect(dPrime).toBeLessThanOrEqual(4);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
