import { INTERACTIVE_CONCEPTS } from "./index";
import type { InteractiveConceptId, InteractiveTrial, InteractiveTrialResult } from "../types";

function makeResult(trial: InteractiveTrial, good: boolean): InteractiveTrialResult {
  const base: InteractiveTrialResult = {
    trial_id: trial.id,
    concept: trial.concept,
    phase: trial.phase,
    prompt: trial.prompt,
    expected_choice: trial.expected_choice,
    user_choice: trial.expected_choice,
    correct: good,
    skipped: false,
    replay_count: good ? 1 : 4,
    elapsed_ms: good ? 2600 : 5200
  };

  switch (trial.concept) {
    case "ild":
      return {
        ...base,
        ild_estimate_db: good ? 0.6 : 3.2,
        numeric_error: typeof trial.payload.delta_db === "number" ? Math.abs(trial.payload.delta_db) : 2
      };
    case "bass_extension":
      return {
        ...base,
        sensed_sub_bass: good,
        numeric_error: typeof trial.payload.deep_cutoff_hz === "number" ? trial.payload.deep_cutoff_hz : 70
      };
    case "treble_extension":
      return {
        ...base,
        numeric_error:
          typeof trial.payload.bright_cutoff_hz === "number" ? trial.payload.bright_cutoff_hz : 12000
      };
    case "resolution":
      return {
        ...base,
        snr_db: typeof trial.payload.snr_db === "number" ? trial.payload.snr_db : 0,
        numeric_error: good && typeof trial.payload.snr_db === "number" ? trial.payload.snr_db : undefined
      };
    case "separation":
      return {
        ...base,
        separation_gap: typeof trial.payload.target_gap === "number" ? trial.payload.target_gap : 0.5,
        numeric_error: good ? 0.1 : 0.38,
        overlap_error: good ? 0.02 : 0.22
      };
    case "transient":
      return {
        ...base,
        numeric_error: typeof trial.payload.clean_bpm === "number" ? trial.payload.clean_bpm : 140
      };
    case "dynamic":
      return {
        ...base,
        dynamic_levels: good ? 5 : 2,
        numeric_error: typeof trial.payload.wide_range_db === "number" ? trial.payload.wide_range_db : 16
      };
    case "density":
      return {
        ...base,
        density_rating: good ? 8 : 4,
        numeric_error: typeof trial.payload.denser_target === "number" ? trial.payload.denser_target : 4
      };
  }
}

describe("interactive concepts summarize", () => {
  const conceptIds = Object.keys(INTERACTIVE_CONCEPTS) as InteractiveConceptId[];

  it.each(conceptIds)("%s builds practice + scored trials", (id) => {
    const concept = INTERACTIVE_CONCEPTS[id];
    const trials = concept.build_trials(12345);
    const practice = trials.filter((x) => x.phase === "practice");
    const scored = trials.filter((x) => x.phase === "scored");

    expect(practice.length).toBe(1);
    expect(scored.length).toBeGreaterThanOrEqual(4);
  });

  it.each(conceptIds)("%s gives better score for better answers", (id) => {
    const concept = INTERACTIVE_CONCEPTS[id];
    const scoredTrials = concept.build_trials(7).filter((x) => x.phase === "scored");
    const good = scoredTrials.map((trial) => makeResult(trial, true));
    const bad = scoredTrials.map((trial) => makeResult(trial, false));

    const goodSummary = concept.summarize(good);
    const badSummary = concept.summarize(bad);

    expect(goodSummary.metrics.concept).toBe(id);
    expect(goodSummary.score).toBeGreaterThanOrEqual(badSummary.score);
    expect(goodSummary.score).toBeGreaterThanOrEqual(0);
    expect(goodSummary.score).toBeLessThanOrEqual(100);
  });
});
