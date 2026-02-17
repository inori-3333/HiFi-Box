use super::audio;
use super::models::{
    AbxConfig, AbxResult, CalibrationSession, ChannelMatchConfig, ChannelMatchResult, DeviceInfo,
    ExportResult, ProjectSummary, SaveResult, ScoreInput, ScoreResult, SweepConfig, SweepResult, TestProject,
    ThdConfig, ThdResult,
};
use super::{scoring, storage, testsuite};

#[tauri::command]
pub fn list_audio_devices() -> Vec<DeviceInfo> {
    audio::list_devices()
}

#[tauri::command]
pub fn start_calibration(
    input_device_id: String,
    output_device_id: String,
    sample_rate: u32,
) -> Result<CalibrationSession, String> {
    if input_device_id.is_empty() || output_device_id.is_empty() {
        return Err("input/output device id cannot be empty".to_string());
    }
    if sample_rate < 44_100 {
        return Err("sample_rate must be >= 44100".to_string());
    }
    Ok(audio::calibrate(sample_rate))
}

#[tauri::command]
pub fn run_abx_test(config: AbxConfig) -> AbxResult {
    testsuite::run_abx(config)
}

#[tauri::command]
pub fn run_sweep_test(config: SweepConfig) -> SweepResult {
    testsuite::run_sweep(config)
}

#[tauri::command]
pub fn run_thd_test(config: ThdConfig) -> ThdResult {
    testsuite::run_thd(config)
}

#[tauri::command]
pub fn run_channel_match_test(config: ChannelMatchConfig) -> ChannelMatchResult {
    testsuite::run_channel_match(config)
}

#[tauri::command]
pub fn compute_score(input: ScoreInput) -> ScoreResult {
    scoring::compute(input)
}

#[tauri::command]
pub fn save_project(project: TestProject) -> Result<SaveResult, String> {
    storage::save_project_local(&project)
}

#[tauri::command]
pub fn export_report(project_id: String, format: String) -> Result<ExportResult, String> {
    storage::export_report_local(&project_id, &format)
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectSummary>, String> {
    storage::list_projects_local()
}

#[tauri::command]
pub fn load_project(project_id: String) -> Result<TestProject, String> {
    storage::load_project_local(&project_id)
}
