use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub channels: u16,
    pub supported_sample_rates: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalibrationSession {
    pub ref_level_db: f32,
    pub noise_floor_db: f32,
    pub status: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbxConfig {
    pub trials: u32,
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweepConfig {
    pub start_hz: f32,
    pub end_hz: f32,
    pub points: usize,
    pub sample_rate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThdConfig {
    pub frequencies_hz: Vec<f32>,
    pub level_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMatchConfig {
    pub left_gain_db: f32,
    pub right_gain_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrPoint {
    pub frequency_hz: f32,
    pub deviation_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThdBandPoint {
    pub frequency_hz: f32,
    pub thd_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweepResult {
    pub fr_points: Vec<FrPoint>,
    pub deviation_to_target: f32,
    pub confidence: f32,
    pub low_confidence: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThdResult {
    pub thd_percent_by_band: Vec<ThdBandPoint>,
    pub total_thd_percent: f32,
    pub low_confidence: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMatchResult {
    pub level_delta_db: f32,
    pub phase_correlation: f32,
    pub match_score: f32,
    pub low_confidence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbxResult {
    pub trials: u32,
    pub correct: u32,
    pub p_value: f32,
    pub reliability: f32,
    pub low_confidence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreInput {
    pub abx_result: AbxResult,
    pub sweep_result: SweepResult,
    pub thd_result: ThdResult,
    pub channel_result: ChannelMatchResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscores {
    pub abx: f32,
    pub sweep: f32,
    pub thd: f32,
    pub channel: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weights {
    pub abx: f32,
    pub sweep: f32,
    pub thd: f32,
    pub channel: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreResult {
    pub total_score: f32,
    pub subscores: Subscores,
    pub weights: Weights,
    pub explanations: Vec<String>,
    pub low_confidence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestMetadata {
    pub test_id: String,
    pub input_device_id: String,
    pub output_device_id: String,
    pub sample_rate: u32,
    pub gain_db: f32,
    pub created_at: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawResults {
    pub abx: AbxResult,
    pub sweep: SweepResult,
    pub thd: ThdResult,
    pub channel: ChannelMatchResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportAssets {
    pub radar_values: Vec<f32>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestProject {
    pub metadata: TestMetadata,
    pub calibration: CalibrationSession,
    pub raw_results: RawResults,
    pub normalized_metrics: Subscores,
    pub score_result: ScoreResult,
    pub report_assets: ReportAssets,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveResult {
    pub project_id: String,
    pub saved_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub project_id: String,
    pub format: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub project_id: String,
    pub created_at: String,
    pub sample_rate: u32,
    pub total_score: f32,
}
