import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, meanOf, scoredTrials, summarizeConfidence } from "./helpers";

const RANGE_STEPS = [10, 14, 18, 22, 26, 30, 34, 38];

export const dynamicConcept: InteractiveConceptDefinition = {
  id: "dynamic",
  label: "动态",
  short_description: "比较动态起伏，并估计可感知动态层级。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "dynamic"));
    const scored = RANGE_STEPS.map((rangeDb, idx) => {
      const aWider = rng.next() > 0.5;
      return {
        id: `dynamic-s-${idx + 1}`,
        concept: "dynamic",
        phase: "scored",
        prompt: "哪一个片段动态起伏更大？并选择你能分辨的动态层级。",
        instruction: "A/B 对比后选择更有动态的一项，再选择层级(1-6)。",
        expected_choice: aWider ? "a" : "b",
        payload: {
          a_range_db: aWider ? rangeDb : Math.max(8, rangeDb - 8),
          b_range_db: aWider ? Math.max(8, rangeDb - 8) : rangeDb,
          wide_range_db: rangeDb,
          idx
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "dynamic-p-1",
      concept: "dynamic",
      phase: "practice",
      prompt: "练习题：A 动态更大。",
      instruction: "听强弱对比，练习选择方式。",
      expected_choice: "a",
      payload: {
        a_range_db: 24,
        b_range_db: 12,
        wide_range_db: 24,
        idx: -1
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);

    const levelMean = meanOf(scored, "dynamic_levels");
    const perceivedRange = 8 + Math.max(0, levelMean - 1) * 6;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const rangeScore = scoreHigherBetter(perceivedRange, 14, 32);
    const consistencyScore = scoreHigherBetter(levelMean, 2.5, 5.5);
    const score = conceptScore(accuracyScore, rangeScore, consistencyScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      perceivedRange >= 26
        ? "动态表现优秀，可感知明显强弱层次。"
        : perceivedRange >= 20
          ? "动态表现中等，弱细节有一定压缩感。"
          : "动态表现偏弱，强弱对比不够拉开。",
      `动态辨别率 ${round1(accuracy)}%，感知动态范围代理 ${round1(perceivedRange)} dB。`
    ];

    return {
      concept: "dynamic",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "dynamic",
        dynamic_detect_rate_pct: round1(accuracy),
        perceived_range_db_proxy: round1(perceivedRange)
      }
    };
  }
};
