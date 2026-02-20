import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, scoredTrials, summarizeConfidence } from "./helpers";

const TREBLE_PAIRS: Array<{ bright: number; dull: number }> = [
  { bright: 14000, dull: 8500 },
  { bright: 15500, dull: 9500 },
  { bright: 16800, dull: 10500 },
  { bright: 17800, dull: 11200 },
  { bright: 18800, dull: 11800 },
  { bright: 19800, dull: 12500 },
  { bright: 20800, dull: 13200 },
  { bright: 21800, dull: 14000 }
];

export const trebleConcept: InteractiveConceptDefinition = {
  id: "treble_extension",
  label: "高频延伸",
  short_description: "比较高频空气感与亮度延伸能力。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "treble"));
    const scored = TREBLE_PAIRS.map((pair, idx) => {
      const aIsBrighter = rng.next() > 0.5;
      return {
        id: `treble-s-${idx + 1}`,
        concept: "treble_extension",
        phase: "scored",
        prompt: "哪一个片段更有空气感、延伸更好？",
        instruction: "播放 A/B 后选择高频更延伸的一项。",
        expected_choice: aIsBrighter ? "a" : "b",
        payload: {
          a_cutoff_hz: aIsBrighter ? pair.bright : pair.dull,
          b_cutoff_hz: aIsBrighter ? pair.dull : pair.bright,
          bright_cutoff_hz: pair.bright
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "treble-p-1",
      concept: "treble_extension",
      phase: "practice",
      prompt: "练习题：A 高频延伸更好。",
      instruction: "关注镲片与泛音尾部的空气感。",
      expected_choice: "a",
      payload: {
        a_cutoff_hz: 19000,
        b_cutoff_hz: 10000,
        bright_cutoff_hz: 19000
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);

    const brightCutoff = scored
      .map((x) => x.numeric_error)
      .filter((x): x is number => typeof x === "number");
    const f3High = brightCutoff.length > 0 ? brightCutoff.reduce((a, b) => a + b, 0) / brightCutoff.length : 10000;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const extensionScore = scoreHigherBetter(f3High, 12000, 20000);
    const consistencyScore = scoreHigherBetter(accuracy, 55, 90);
    const score = conceptScore(accuracyScore, extensionScore, consistencyScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      f3High >= 18000
        ? "高频延伸优秀，空气感充足。"
        : f3High >= 15000
          ? "高频延伸中等，细节表现尚可。"
          : "高频延伸偏早衰，声音可能偏闷。",
      `高频辨别率 ${round1(accuracy)}%，高频延伸代理点 ${round1(f3High)} Hz。`
    ];

    return {
      concept: "treble_extension",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "treble_extension",
        treble_detect_rate_pct: round1(accuracy),
        f3_high_proxy_hz: round1(f3High)
      }
    };
  }
};
