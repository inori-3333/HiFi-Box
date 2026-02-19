export type InteractiveConceptId =
  | "ild"
  | "bass_extension"
  | "treble_extension"
  | "resolution"
  | "separation"
  | "transient"
  | "dynamic"
  | "density";

export const INTERACTIVE_CONCEPT_ORDER: InteractiveConceptId[] = [
  "ild",
  "bass_extension",
  "treble_extension",
  "resolution",
  "separation",
  "transient",
  "dynamic",
  "density"
];

export type TrialPhase = "practice" | "scored";

export type InteractiveChoice = "a" | "b" | "left" | "right" | "center";

export type TrialPayloadValue = string | number | boolean;

export type InteractiveTrial = {
  id: string;
  concept: InteractiveConceptId;
  phase: TrialPhase;
  prompt: string;
  instruction: string;
  expected_choice?: InteractiveChoice;
  payload: Record<string, TrialPayloadValue>;
};

export type InteractiveAnswerInput = {
  choice?: InteractiveChoice;
  skipped?: boolean;
  ild_estimate_db?: number;
  sensed_sub_bass?: boolean;
  separation_pos_a?: number;
  separation_pos_b?: number;
  dynamic_levels?: number;
  density_rating?: number;
};

export type InteractiveTrialResult = {
  trial_id: string;
  concept: InteractiveConceptId;
  phase: TrialPhase;
  prompt: string;
  expected_choice?: InteractiveChoice;
  user_choice?: InteractiveChoice;
  correct: boolean | null;
  skipped: boolean;
  replay_count: number;
  elapsed_ms: number;
  ild_estimate_db?: number;
  sensed_sub_bass?: boolean;
  separation_pos_a?: number;
  separation_pos_b?: number;
  dynamic_levels?: number;
  density_rating?: number;
  separation_gap?: number;
  overlap_error?: number;
  snr_db?: number;
  numeric_error?: number;
};

export type IldInteractiveMetrics = {
  concept: "ild";
  direction_accuracy_pct: number;
  threshold_db: number;
  estimate_mae_db: number;
};

export type BassInteractiveMetrics = {
  concept: "bass_extension";
  deep_detect_rate_pct: number;
  f3_proxy_hz: number;
  sub_bass_detect_rate_pct: number;
};

export type TrebleInteractiveMetrics = {
  concept: "treble_extension";
  treble_detect_rate_pct: number;
  f3_high_proxy_hz: number;
};

export type ResolutionInteractiveMetrics = {
  concept: "resolution";
  detail_detect_rate_pct: number;
  d_prime: number;
  min_detectable_snr_db: number;
};

export type SeparationInteractiveMetrics = {
  concept: "separation";
  localization_error: number;
  min_resolvable_gap: number;
  overlap_error: number;
};

export type TransientInteractiveMetrics = {
  concept: "transient";
  transient_detect_rate_pct: number;
  max_clean_bpm: number;
};

export type DynamicInteractiveMetrics = {
  concept: "dynamic";
  dynamic_detect_rate_pct: number;
  perceived_range_db_proxy: number;
};

export type DensityInteractiveMetrics = {
  concept: "density";
  density_detect_rate_pct: number;
  consistency_score: number;
  subjective_density_10: number;
};

export type InteractiveConceptMetrics =
  | IldInteractiveMetrics
  | BassInteractiveMetrics
  | TrebleInteractiveMetrics
  | ResolutionInteractiveMetrics
  | SeparationInteractiveMetrics
  | TransientInteractiveMetrics
  | DynamicInteractiveMetrics
  | DensityInteractiveMetrics;

export type InteractiveConceptResult = {
  concept: InteractiveConceptId;
  score: number;
  confidence: number;
  low_confidence: boolean;
  notes: string[];
  metrics: InteractiveConceptMetrics;
  trials: InteractiveTrialResult[];
  duration_ms: number;
};

export type InteractiveConceptDefinition = {
  id: InteractiveConceptId;
  label: string;
  short_description: string;
  build_trials: (seed: number) => InteractiveTrial[];
  summarize: (trials: InteractiveTrialResult[]) => InteractiveConceptResult;
};

export type PlaybackVariant = "a" | "b" | "x" | "single";

export type InteractiveSessionMode = "single" | "suite";

export type InteractiveSuitePhase =
  | "idle"
  | "ready"
  | "practice"
  | "testing"
  | "concept-complete"
  | "completed";

