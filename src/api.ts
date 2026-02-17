import { invoke } from "@tauri-apps/api/core";
import type {
  AbxResult,
  CalibrationSession,
  ChannelAcquisitionConfig,
  ChannelMatchResult,
  DeviceInfo,
  ExportResult,
  ProjectSummary,
  SaveResult,
  ScoreResult,
  SweepAcquisitionConfig,
  SweepResult,
  TestProject,
  ThdAcquisitionConfig,
  ThdResult
} from "./types";

export const api = {
  listAudioDevices: () => invoke<DeviceInfo[]>("list_audio_devices"),
  startCalibration: (inputDeviceId: string, outputDeviceId: string, sampleRate: number) =>
    invoke<CalibrationSession>("start_calibration", {
      inputDeviceId,
      outputDeviceId,
      sampleRate
    }),
  runAbxTest: (config: { trials: number; seed?: number }) =>
    invoke<AbxResult>("run_abx_test", { config }),
  runSweepTest: (config: {
    start_hz: number;
    end_hz: number;
    points: number;
    sample_rate: number;
    acquisition?: SweepAcquisitionConfig;
  }) =>
    invoke<SweepResult>("run_sweep_test", { config }),
  runThdTest: (config: { frequencies_hz: number[]; level_db: number; acquisition?: ThdAcquisitionConfig }) =>
    invoke<ThdResult>("run_thd_test", { config }),
  runChannelMatchTest: (config: {
    left_gain_db: number;
    right_gain_db: number;
    acquisition?: ChannelAcquisitionConfig;
  }) =>
    invoke<ChannelMatchResult>("run_channel_match_test", { config }),
  computeScore: (input: {
    abx_result: AbxResult;
    sweep_result: SweepResult;
    thd_result: ThdResult;
    channel_result: ChannelMatchResult;
  }) => invoke<ScoreResult>("compute_score", { input }),
  saveProject: (project: TestProject) => invoke<SaveResult>("save_project", { project }),
  exportReport: (projectId: string, format: "html" | "json") =>
    invoke<ExportResult>("export_report", { projectId, format }),
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  loadProject: (projectId: string) => invoke<TestProject>("load_project", { projectId })
};
