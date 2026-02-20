import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter, scoreLowerBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { meanOf, scoredTrials, summarizeConfidence } from "./helpers";

const GAPS = [0.9, 0.75, 0.62, 0.5, 0.4, 0.32, 0.26, 0.22];

export const separationConcept: InteractiveConceptDefinition = {
  id: "separation",
  label: "分离",
  short_description: "听双声源并标记两个声像位置。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "separation"));
    const scored = GAPS.map((gap, idx) => {
      const center = rng.next() * 0.6 - 0.3;
      const targetA = Math.max(-1, Math.min(1, center - gap / 2));
      const targetB = Math.max(-1, Math.min(1, center + gap / 2));
      return {
        id: `separation-s-${idx + 1}`,
        concept: "separation",
        phase: "scored",
        prompt: "播放双声源后，用双滑杆标记两个声像位置。",
        instruction: "左滑杆对应声源1，右滑杆对应声源2。",
        payload: {
          target_a: targetA,
          target_b: targetB,
          target_gap: gap,
          crosstalk: 0.05 + idx * 0.02
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "separation-p-1",
      concept: "separation",
      phase: "practice",
      prompt: "练习题：双声源相距较大。",
      instruction: "练习双滑杆输入，不计入总分。",
      payload: {
        target_a: -0.6,
        target_b: 0.6,
        target_gap: 1.2,
        crosstalk: 0.03
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const localizationError = meanOf(scored, "numeric_error");
    const overlapError = meanOf(scored, "overlap_error");

    const resolved = scored.filter((x) => !x.skipped && (x.numeric_error ?? 1) <= 0.2);
    const minGap =
      resolved
        .map((x) => x.separation_gap)
        .filter((x): x is number => typeof x === "number")
        .sort((a, b) => a - b)[0] ?? 1.0;

    const localizationScore = scoreLowerBetter(localizationError, 0.08, 0.45);
    const gapScore = scoreLowerBetter(minGap, 0.28, 0.9);
    const overlapScore = scoreLowerBetter(overlapError, 0.02, 0.3);
    const score = conceptScore(localizationScore, gapScore, overlapScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      minGap <= 0.35
        ? "分离能力优秀，复杂编制下层次感更清晰。"
        : minGap <= 0.55
          ? "分离能力中等，密集段落略有重叠。"
          : "分离能力偏弱，多声部易粘连。",
      `定位误差 ${round1(localizationError)}，最小可分辨间距 ${round1(minGap)}。`
    ];

    return {
      concept: "separation",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "separation",
        localization_error: round1(localizationError),
        min_resolvable_gap: round1(minGap),
        overlap_error: round1(overlapError)
      }
    };
  }
};
