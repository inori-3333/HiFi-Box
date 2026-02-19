import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, dPrimeFromAccuracy, round1, scoreHigherBetter, scoreLowerBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, scoredTrials, summarizeConfidence } from "./helpers";

const SNR_LEVELS_DB = [6, 3, 0, -3, -6, -9];

export const resolutionConcept: InteractiveConceptDefinition = {
  id: "resolution",
  label: "解析",
  short_description: "ABX 识别细节与掩蔽噪声差异。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "resolution"));
    const scored = SNR_LEVELS_DB.map((snr, idx) => {
      const xRef = rng.pick(["a", "b"] as const);
      return {
        id: `resolution-s-${idx + 1}`,
        concept: "resolution",
        phase: "scored",
        prompt: "ABX：X 与 A 或 B 之一相同，请判断 X 属于哪一个。",
        instruction: "先听 A、B，再听 X；选择“X= A”或“X= B”。",
        expected_choice: xRef,
        payload: {
          snr_db: snr,
          x_ref: xRef,
          a_detail_ratio: 1,
          b_detail_ratio: 0.5
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "resolution-p-1",
      concept: "resolution",
      phase: "practice",
      prompt: "练习题：X 等于 A。",
      instruction: "练习 ABX 操作，不计入总分。",
      expected_choice: "a",
      payload: {
        snr_db: 6,
        x_ref: "a",
        a_detail_ratio: 1,
        b_detail_ratio: 0.4
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);
    const dPrime = dPrimeFromAccuracy(Math.max(0.5, accuracy / 100));

    const detectedSnr = scored
      .filter((x) => x.correct)
      .map((x) => x.numeric_error)
      .filter((x): x is number => typeof x === "number");
    const minSnr = detectedSnr.length > 0 ? Math.min(...detectedSnr) : 6;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 95);
    const dPrimeScore = scoreHigherBetter(dPrime, 0.5, 2.5);
    const snrScore = scoreLowerBetter(minSnr, -3, 6);
    const score = conceptScore(dPrimeScore, accuracyScore, snrScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      dPrime >= 1.5
        ? "细节分辨能力良好，复杂段落信息更完整。"
        : "细节分辨能力一般，建议降低环境噪声后复测。",
      `ABX 正确率 ${round1(accuracy)}%，d'=${round1(dPrime)}，最小可检 SNR ${round1(minSnr)} dB。`
    ];

    return {
      concept: "resolution",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "resolution",
        detail_detect_rate_pct: round1(accuracy),
        d_prime: round1(dPrime),
        min_detectable_snr_db: round1(minSnr)
      }
    };
  }
};
