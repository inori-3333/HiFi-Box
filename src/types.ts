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
