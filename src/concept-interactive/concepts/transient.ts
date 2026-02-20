import { createSeededRandom, deriveSeed } from "../random";
import { conceptScore, round1, scoreHigherBetter } from "../scoring";
import type { InteractiveConceptDefinition, InteractiveConceptResult, InteractiveTrial } from "../types";
import { accuracyPercent, scoredTrials, summarizeConfidence } from "./helpers";

const BPM_STEPS = [100, 130, 160, 190, 220, 250, 280, 310];

export const transientConcept: InteractiveConceptDefinition = {
  id: "transient",
  label: "瞬态",
  short_description: "比较鼓击起音与拖尾控制。",
  build_trials(seed: number): InteractiveTrial[] {
    const rng = createSeededRandom(deriveSeed(seed, "transient"));
    const scored = BPM_STEPS.map((bpm, idx) => {
      const aIsCrisp = rng.next() > 0.5;
      return {
        id: `transient-s-${idx + 1}`,
        concept: "transient",
        phase: "scored",
        prompt: "哪一个片段更干脆、拖尾更短？",
        instruction: "播放 A/B 后选择瞬态更干净的一项。",
        expected_choice: aIsCrisp ? "a" : "b",
        payload: {
          bpm,
          a_attack_ms: aIsCrisp ? 8 : 20,
          b_attack_ms: aIsCrisp ? 20 : 8,
          a_decay_ms: aIsCrisp ? 45 : 120,
          b_decay_ms: aIsCrisp ? 120 : 45,
          clean_bpm: bpm
        }
      } satisfies InteractiveTrial;
    });

    const practice: InteractiveTrial = {
      id: "transient-p-1",
      concept: "transient",
      phase: "practice",
      prompt: "练习题：A 更干脆。",
      instruction: "关注鼓击边缘和尾部拖影。",
      expected_choice: "a",
      payload: {
        bpm: 120,
        a_attack_ms: 8,
        b_attack_ms: 20,
        a_decay_ms: 45,
        b_decay_ms: 120,
        clean_bpm: 120
      }
    };

    return [practice, ...rng.shuffle(scored)];
  },
  summarize(trials): InteractiveConceptResult {
    const scored = scoredTrials(trials);
    const accuracy = accuracyPercent(scored);
    const cleanBpms = scored
      .filter((x) => x.correct)
      .map((x) => x.numeric_error)
      .filter((x): x is number => typeof x === "number");
    const maxCleanBpm = cleanBpms.length > 0 ? Math.max(...cleanBpms) : 100;

    const accuracyScore = scoreHigherBetter(accuracy, 45, 92);
    const bpmScore = scoreHigherBetter(maxCleanBpm, 130, 230);
    const consistencyScore = scoreHigherBetter(accuracy, 55, 90);
    const score = conceptScore(accuracyScore, bpmScore, consistencyScore);

    const confidence = summarizeConfidence(scored);
    const notes = [
      maxCleanBpm >= 220
        ? "瞬态响应优秀，节奏边缘清晰。"
        : maxCleanBpm >= 180
          ? "瞬态响应中等，快速段落略有拖影。"
          : "瞬态响应偏慢，起音边界不够利落。",
      `瞬态辨别率 ${round1(accuracy)}%，可辨清速度上限 ${round1(maxCleanBpm)} BPM。`
    ];

    return {
      concept: "transient",
      score,
      confidence,
      low_confidence: confidence < 70,
      notes,
      duration_ms: scored.reduce((acc, x) => acc + x.elapsed_ms, 0),
      trials: scored,
      metrics: {
        concept: "transient",
        transient_detect_rate_pct: round1(accuracy),
        max_clean_bpm: round1(maxCleanBpm)
      }
    };
  }
};
