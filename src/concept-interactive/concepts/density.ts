import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter, scoreLowerBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, meanOf, scoredTrials, summarizeConfidence } from "./helpers";

const DENSITY_LEVELS = [3.2, 3.8, 4.4, 5.0, 5.6, 6.2, 6.8, 7.4];

export const densityConcept: InteractiveConceptDefinition = {
  id: "density",
  label: "密度",
  short_description: "比较声音实体感，并给出主观密度评分。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "density"));
    const scored = DENSITY_LEVELS.map((density, idx) => {
      const aDenser = rng.next() > 0.5;
      return {
        id: `density-s-${idx + 1}`,
        concept: "density",
        phase: "scored",
        prompt: "哪一个片段更饱满、更有实体感？并给当前片段密度打分(1-10)。",
        instruction: "先选更饱满项，再给整体密度感受打分。",
        expected_choice: aDenser ? "a" : "b",
        payload: {
          a_density_factor: aDenser ? density : Math.max(2.2, density - 1.6),
          b_density_factor: aDenser ? Math.max(2.2, density - 1.6) : density,
          denser_target: density
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "density-p-1",
      concept: "density",
      phase: "practice",
      prompt: "练习题：A 更饱满。",
      instruction: "关注人声厚度和背景黑度。",
      expected_choice: "a",
      payload: {
        a_density_factor: 6,
        b_density_factor: 3.2,
        denser_target: 6
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);

    const subjectiveDensity = meanOf(scored, "density_rating");
    const consistencyValues = scored
      .map((x) => x.density_rating)
      .filter((x): x is number => typeof x === "number");

    const std =
      consistencyValues.length > 0
        ? Math.sqrt(
            consistencyValues.reduce((acc, x) => acc + (x - subjectiveDensity) ** 2, 0) /
              consistencyValues.length
          )
        : 3;
    const consistencyScore = scoreLowerBetter(std, 0.8, 3.2);

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const densityScore = scoreHigherBetter(subjectiveDensity, 3.5, 8.2);
    const score = conceptScore(accuracyScore, densityScore, consistencyScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      subjectiveDensity >= 7
        ? "密度感优秀，声音实体和背景对比明显。"
        : subjectiveDensity >= 5
          ? "密度感中等，整体不薄但厚度有限。"
          : "密度感偏薄，声音骨架感不足。",
      `密度辨别率 ${round1(accuracy)}%，主观密度 ${round1(subjectiveDensity)}/10。`
    ];

    return {
      concept: "density",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "density",
        density_detect_rate_pct: round1(accuracy),
        consistency_score: round1(consistencyScore),
        subjective_density_10: round1(subjectiveDensity)
      }
    };
  }
};
