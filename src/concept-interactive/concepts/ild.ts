import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, mean, round1, scoreHigherBetter, scoreLowerBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, scoredTrials, summarizeConfidence } from "./helpers";

const DELTA_SERIES_DB = [0.4, 0.8, 1.2, 2.0, 3.2];

export const ildConcept: InteractiveConceptDefinition = {
  id: "ild",
  label: "左右耳声压差",
  short_description: "听A/B后判断偏向，并估计声压差（dB）。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "ild"));
    const scored: InteractiveTrial[] = DELTA_SERIES_DB.map((delta, idx) => {
      const direction = rng.pick(["left", "right"] as const);
      const signedDelta = direction === "left" ? -delta : delta;
      return {
        id: `ild-s-${idx + 1}`,
        concept: "ild",
        phase: "scored",
        prompt: "对比 A(居中参考) 与 B，判断 B 的偏向并估计差值。",
        instruction: "先播放 A 与 B，再选择偏向；可用滑杆估计 dB。",
        expected_choice: direction,
        payload: {
          delta_db: signedDelta,
          reference_freq_hz: 900
        }
      };
    });

    const practice: InteractiveTrial = {
      id: "ild-p-1",
      concept: "ild",
      phase: "practice",
      prompt: "练习题：A是居中，B轻微偏左。",
      instruction: "先熟悉操作，练习题不计入最终得分。",
      expected_choice: "left",
      payload: {
        delta_db: -1.2,
        reference_freq_hz: 900
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const usable = scored.filter((x) => !x.skipped);
    const accuracy = accuracyPercent(scored);

    const thresholdCandidates = usable
      .filter((x) => x.correct)
      .map((x) => x.numeric_error)
      .filter((x): x is number => typeof x === "number");
    const thresholdDb = thresholdCandidates.length > 0 ? mean(thresholdCandidates) : 3.5;

    const estimateErrors = usable
      .map((x) => x.ild_estimate_db)
      .filter((x): x is number => typeof x === "number");
    const estimateMae = estimateErrors.length > 0 ? mean(estimateErrors) : 3.0;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const thresholdScore = scoreLowerBetter(thresholdDb, 1, 4);
    const consistencyScore = scoreLowerBetter(estimateMae, 0.6, 3.8);
    const score = conceptScore(accuracyScore, thresholdScore, consistencyScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      thresholdDb <= 1
        ? "左右耳平衡优秀，结像偏移风险低。"
        : thresholdDb <= 3
          ? "左右耳平衡在可接受范围。"
          : "左右耳平衡偏弱，可能出现偏向一侧。",
      `方向正确率 ${round1(accuracy)}%，估计误差 ${round1(estimateMae)} dB。`
    ];

    return {
      concept: "ild",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "ild",
        direction_accuracy_pct: round1(accuracy),
        threshold_db: round1(thresholdDb),
        estimate_mae_db: round1(estimateMae)
      }
    };
  }
};
