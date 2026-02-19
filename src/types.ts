export type DeviceInfo = {
  id: string;
  name: string;
  channels: number;
  supported_sample_rates: number[];
};

export type CalibrationSession = {
  ref_level_db: number;
  noise_floor_db: number;
  status: "ready" | "warning";
  warnings: string[];
};

export type FrPoint = {
  frequency_hz: number;
  deviation_db: number;
};

export type SweepAcquisitionConfig = {
  tone_duration_ms: number;
  tone_amplitude: number;
  inter_tone_pause_ms: number;
};

export type SweepResult = {
  fr_points: FrPoint[];
  deviation_to_target: number;
  confidence: number;
  low_confidence: boolean;
  notes: string[];
};

export type ThdBandPoint = {
  frequency_hz: number;
  thd_percent: number;
};

export type ThdAcquisitionConfig = {
  tone_duration_ms: number;
  tone_amplitude: number;
  inter_tone_pause_ms: number;
};

export type ThdResult = {
  thd_percent_by_band: ThdBandPoint[];
  total_thd_percent: number;
  low_confidence: boolean;
  notes: string[];
};

export type ChannelMatchResult = {
  level_delta_db: number;
  phase_correlation: number;
  match_score: number;
  low_confidence: boolean;
};

export type ChannelAcquisitionConfig = {
  tone_duration_ms: number;
  tone_amplitude: number;
  inter_channel_pause_ms: number;
};

export type AbxResult = {
  trials: number;
  correct: number;
  p_value: number;
  reliability: number;
  low_confidence: boolean;
};

export type Weights = {
  abx: number;
  sweep: number;
  thd: number;
  channel: number;
};

export type Subscores = {
  abx: number;
  sweep: number;
  thd: number;
  channel: number;
};

export type ScoreResult = {
  total_score: number;
  subscores: Subscores;
  weights: Weights;
  explanations: string[];
  low_confidence: boolean;
};

export type TestMetadata = {
  test_id: string;
  input_device_id: string;
  output_device_id: string;
  sample_rate: number;
  gain_db: number;
  created_at: string;
  app_version: string;
};

export type TestProject = {
  metadata: TestMetadata;
  calibration: CalibrationSession;
  raw_results: {
    abx: AbxResult;
    sweep: SweepResult;
    thd: ThdResult;
    channel: ChannelMatchResult;
  };
  normalized_metrics: Subscores;
  score_result: ScoreResult;
  report_assets: {
    radar_values: number[];
    notes: string[];
  };
};

export type SaveResult = {
  project_id: string;
  saved_path: string;
};

export type ExportResult = {
  project_id: string;
  format: "html" | "json";
  output_path: string;
};

export type ProjectSummary = {
  project_id: string;
  created_at: string;
  sample_rate: number;
  total_score: number;
};

export type IldBandPoint = {
  frequency_hz: number;
  delta_db: number;
};

export type IldMetrics = {
  delta_db_avg: number;
  delta_db_max: number;
  by_band: IldBandPoint[];
};

export type BassMetrics = {
  f_3db_hz: number;
  f_5db_hz: number;
  spl_30hz: number;
  spl_40hz: number;
};

export type TrebleMetrics = {
  f_3db_high_hz: number;
  rolloff_db_per_oct: number;
  peak_8k_12k_db: number;
};

export type ResolutionMetrics = {
  detail_detect_rate: number;
  d_prime: number;
  min_detectable_snr_db: number;
};

export type SeparationMetrics = {
  crosstalk_1khz_db: number;
  crosstalk_avg_db: number;
  imaging_error_deg: number;
};

export type TransientMetrics = {
  rise_ms: number;
  overshoot_pct: number;
  settle_ms: number;
  decay_30db_ms: number;
};

export type DynamicMetrics = {
  noise_floor_db_spl: number;
  max_clean_spl_db: number;
  dynamic_range_db: number;
};

export type DensityMetrics = {
  mid_high_energy_ratio: number;
  hnr_db: number;
  subjective_density_10: number;
};

export type ConceptMetrics =
  | IldMetrics
  | BassMetrics
  | TrebleMetrics
  | ResolutionMetrics
  | SeparationMetrics
  | TransientMetrics
  | DynamicMetrics
  | DensityMetrics;

export type ConceptTestResult = {
  concept: string;
  score: number;
  low_confidence: boolean;
  notes: string[];
  metrics: ConceptMetrics;
};

export type IldTestConfig = {
  repeats?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  inter_tone_pause_ms?: number;
  seed?: number;
};

export type BassExtensionTestConfig = {
  repeats?: number;
  points?: number;
  start_hz?: number;
  end_hz?: number;
  reference_hz?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  inter_tone_pause_ms?: number;
  seed?: number;
};

export type TrebleExtensionTestConfig = {
  repeats?: number;
  points?: number;
  start_hz?: number;
  end_hz?: number;
  reference_hz?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  inter_tone_pause_ms?: number;
  seed?: number;
};

export type ResolutionTestConfig = {
  trials_per_snr?: number;
  snr_levels_db?: number[];
  seed?: number;
};

export type SeparationTestConfig = {
  repeats?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  inter_tone_pause_ms?: number;
  seed?: number;
};

export type TransientTestConfig = {
  repeats?: number;
  pulse_hz?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  seed?: number;
};

export type DynamicRangeTestConfig = {
  noise_duration_ms?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  thdn_limit_percent?: number;
  step_levels_db?: number[];
  seed?: number;
};

export type DensityTestConfig = {
  subjective_density_10?: number;
  tone_duration_ms?: number;
  tone_amplitude?: number;
  seed?: number;
};

export type {
  InteractiveAnswerInput,
  InteractiveChoice,
  InteractiveConceptDefinition,
  InteractiveConceptId,
  InteractiveConceptMetrics,
  InteractiveConceptResult,
  InteractiveSessionMode,
  InteractiveSuitePhase,
  InteractiveTrial,
  InteractiveTrialResult,
  PlaybackVariant
} from "./concept-interactive/types";
