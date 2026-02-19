pub mod core;

use core::commands::{
    compute_score, export_report, list_audio_devices, list_projects, load_project, run_abx_test,
    run_bass_extension_test, run_channel_match_test, run_density_test, run_dynamic_range_test,
    run_ild_test, run_resolution_test, run_separation_test, run_sweep_test, run_thd_test,
    run_transient_test, run_treble_extension_test, save_project, start_calibration,
};

pub fn run() {
    tauri::Builder::default()
        .manage(core::audio::AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            start_calibration,
            run_abx_test,
            run_sweep_test,
            run_thd_test,
            run_channel_match_test,
            run_ild_test,
            run_bass_extension_test,
            run_treble_extension_test,
            run_resolution_test,
            run_separation_test,
            run_transient_test,
            run_dynamic_range_test,
            run_density_test,
            compute_score,
            save_project,
            export_report,
            list_projects,
            load_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
