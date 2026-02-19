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
    #[serde(default)]
    pub acquisition: Option<SweepAcquisitionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThdConfig {
    pub frequencies_hz: Vec<f32>,
    pub level_db: f32,
    #[serde(default)]
    pub acquisition: Option<ThdAcquisitionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMatchConfig {
    pub left_gain_db: f32,
    pub right_gain_db: f32,
    #[serde(default)]
    pub acquisition: Option<ChannelAcquisitionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SweepAcquisitionConfig {
    pub tone_duration_ms: u64,
    pub tone_amplitude: f32,
    pub inter_tone_pause_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThdAcquisitionConfig {
    pub tone_duration_ms: u64,
    pub tone_amplitude: f32,
    pub inter_tone_pause_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelAcquisitionConfig {
    pub tone_duration_ms: u64,
    pub tone_amplitude: f32,
    pub inter_channel_pause_ms: u64,
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
pub struct ConceptTestResult {
    pub concept: String,
    pub score: f32,
    pub low_confidence: bool,
    pub notes: Vec<String>,
    pub metrics: ConceptMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConceptMetrics {
    Ild(IldMetrics),
    Bass(BassMetrics),
    Treble(TrebleMetrics),
    Resolution(ResolutionMetrics),
    Separation(SeparationMetrics),
    Transient(TransientMetrics),
    Dynamic(DynamicMetrics),
    Density(DensityMetrics),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IldBandPoint {
    pub frequency_hz: f32,
    pub delta_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IldMetrics {
    pub delta_db_avg: f32,
    pub delta_db_max: f32,
    pub by_band: Vec<IldBandPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BassMetrics {
    pub f_3db_hz: f32,
    pub f_5db_hz: f32,
    pub spl_30hz: f32,
    pub spl_40hz: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrebleMetrics {
    pub f_3db_high_hz: f32,
    pub rolloff_db_per_oct: f32,
    pub peak_8k_12k_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionMetrics {
    pub detail_detect_rate: f32,
    pub d_prime: f32,
    pub min_detectable_snr_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeparationMetrics {
    pub crosstalk_1khz_db: f32,
    pub crosstalk_avg_db: f32,
    pub imaging_error_deg: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransientMetrics {
    pub rise_ms: f32,
    pub overshoot_pct: f32,
    pub settle_ms: f32,
    pub decay_30db_ms: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicMetrics {
    pub noise_floor_db_spl: f32,
    pub max_clean_spl_db: f32,
    pub dynamic_range_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DensityMetrics {
    pub mid_high_energy_ratio: f32,
    pub hnr_db: f32,
    pub subjective_density_10: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IldTestConfig {
    #[serde(default)]
    pub repeats: Option<u32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub inter_tone_pause_ms: Option<u64>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BassExtensionTestConfig {
    #[serde(default)]
    pub repeats: Option<u32>,
    #[serde(default)]
    pub points: Option<usize>,
    #[serde(default)]
    pub start_hz: Option<f32>,
    #[serde(default)]
    pub end_hz: Option<f32>,
    #[serde(default)]
    pub reference_hz: Option<f32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub inter_tone_pause_ms: Option<u64>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrebleExtensionTestConfig {
    #[serde(default)]
    pub repeats: Option<u32>,
    #[serde(default)]
    pub points: Option<usize>,
    #[serde(default)]
    pub start_hz: Option<f32>,
    #[serde(default)]
    pub end_hz: Option<f32>,
    #[serde(default)]
    pub reference_hz: Option<f32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub inter_tone_pause_ms: Option<u64>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolutionTestConfig {
    #[serde(default)]
    pub trials_per_snr: Option<u32>,
    #[serde(default)]
    pub snr_levels_db: Option<Vec<f32>>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SeparationTestConfig {
    #[serde(default)]
    pub repeats: Option<u32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub inter_tone_pause_ms: Option<u64>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TransientTestConfig {
    #[serde(default)]
    pub repeats: Option<u32>,
    #[serde(default)]
    pub pulse_hz: Option<f32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DynamicRangeTestConfig {
    #[serde(default)]
    pub noise_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub thdn_limit_percent: Option<f32>,
    #[serde(default)]
    pub step_levels_db: Option<Vec<f32>>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DensityTestConfig {
    #[serde(default)]
    pub subjective_density_10: Option<f32>,
    #[serde(default)]
    pub tone_duration_ms: Option<u64>,
    #[serde(default)]
    pub tone_amplitude: Option<f32>,
    #[serde(default)]
    pub seed: Option<u64>,
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
