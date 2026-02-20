import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter, scoreLowerBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, scoredTrials, summarizeConfidence } from "./helpers";

const PAIRS: Array<{ deep: number; shallow: number }> = [
  { deep: 28, shallow: 55 },
  { deep: 32, shallow: 62 },
  { deep: 35, shallow: 68 },
  { deep: 38, shallow: 75 },
  { deep: 42, shallow: 82 },
  { deep: 46, shallow: 90 },
  { deep: 50, shallow: 95 },
  { deep: 55, shallow: 100 }
];

export const bassConcept: InteractiveConceptDefinition = {
  id: "bass_extension",
  label: "低频下潜",
  short_description: "辨别更深低频并记录是否感知到超低频。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "bass"));
    const scored = PAIRS.map((pair, idx) => {
      const aIsDeeper = rng.next() > 0.5;
      return {
        id: `bass-s-${idx + 1}`,
        concept: "bass_extension",
        phase: "scored",
        prompt: "哪一个片段低频下潜更深、更有共振？",
        instruction: "播放 A/B 后选择更深者，并勾选是否明显感知超低频。",
        expected_choice: aIsDeeper ? "a" : "b",
        payload: {
          a_cutoff_hz: aIsDeeper ? pair.deep : pair.shallow,
          b_cutoff_hz: aIsDeeper ? pair.shallow : pair.deep,
          deep_cutoff_hz: pair.deep
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "bass-p-1",
      concept: "bass_extension",
      phase: "practice",
      prompt: "练习题：A 下潜更深。",
      instruction: "注意更低频段的冲击和尾韵。",
      expected_choice: "a",
      payload: {
        a_cutoff_hz: 32,
        b_cutoff_hz: 82,
        deep_cutoff_hz: 32
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);

    const deepCutoffs = scored
      .map((x) => x.numeric_error)
      .filter((x): x is number => typeof x === "number");
    const f3Proxy = deepCutoffs.length > 0 ? deepCutoffs.reduce((a, b) => a + b, 0) / deepCutoffs.length : 75;

    const subBassAnswers = scored.filter((x) => !x.skipped && x.sensed_sub_bass !== undefined);
    const subBassDetected = subBassAnswers.filter((x) => x.sensed_sub_bass).length;
    const subBassDetectRate = subBassAnswers.length > 0 ? (subBassDetected / subBassAnswers.length) * 100 : 0;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const depthScore = scoreLowerBetter(f3Proxy, 40, 90);
    const subBassScore = scoreHigherBetter(subBassDetectRate, 20, 85);
    const score = conceptScore(accuracyScore, depthScore, subBassScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      f3Proxy <= 40
        ? "低频下潜能力优秀（接近40Hz以内）。"
        : f3Proxy <= 55
          ? "低频下潜表现中等偏好。"
          : "低频下潜偏浅，超低频存在感不足。",
      `深低频辨别率 ${round1(accuracy)}%，超低频感知率 ${round1(subBassDetectRate)}%。`
    ];

    return {
      concept: "bass_extension",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "bass_extension",
        deep_detect_rate_pct: round1(accuracy),
        f3_proxy_hz: round1(f3Proxy),
        sub_bass_detect_rate_pct: round1(subBassDetectRate)
      }
    };
  }
};
