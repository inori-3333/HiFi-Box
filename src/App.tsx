import { useEffect, useMemo, useRef, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { api } from "./api";
import type {
  CalibrationSession,
  ChannelAcquisitionConfig,
  DeviceInfo,
  ExportResult,
  ProjectSummary,
  SaveResult,
  ScoreResult,
  SweepAcquisitionConfig,
  TestProject
} from "./types";

const SAMPLE_RATE = 48_000;
const APP_VERSION = "0.1.0";
const IS_TAURI_RUNTIME = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Stage = "home" | "wizard" | "result" | "spatial";

type SpatialPoint = {
  x: number;
  y: number;
  z: number;
};

type SpatialTrial = {
  id: number;
  target: SpatialPoint;
  user?: SpatialPoint;
  score?: number;
  revealed: boolean;
};

type SpatialPlane = "xy" | "xz" | "zy";
type SpatialMode = "2d" | "3d";

const SPATIAL_TARGETS_3D: SpatialPoint[] = [
  { x: -0.82, y: 0.2, z: 0.78 },
  { x: -0.64, y: -0.68, z: 0.35 },
  { x: 0.16, y: 0.72, z: 0.66 },
  { x: 0.74, y: -0.28, z: 0.44 },
  { x: -0.34, y: 0.46, z: -0.82 },
  { x: 0.57, y: -0.18, z: -0.74 },
  { x: 0.88, y: 0.61, z: -0.22 },
  { x: -0.18, y: -0.74, z: -0.58 }
];

const SPATIAL_TARGETS_2D: SpatialPoint[] = [
  { x: -0.85, y: -0.45, z: 0.2 },
  { x: -0.65, y: 0.2, z: 0.55 },
  { x: -0.4, y: -0.75, z: 0.35 },
  { x: -0.1, y: 0.7, z: 0.8 },
  { x: 0.2, y: -0.5, z: 0.65 },
  { x: 0.45, y: 0.35, z: 0.45 },
  { x: 0.75, y: -0.2, z: 0.25 },
  { x: 0.9, y: 0.55, z: 0.7 }
];

const MAX_CART_DISTANCE = Math.sqrt(12);
const SPATIAL_REFERENCE_FREQ_HZ = 392;

function clamp01ToSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function planePointToPercent(point: SpatialPoint, plane: SpatialPlane): { left: string; top: string } {
  if (plane === "xy") {
    return { left: `${((point.x + 1) / 2) * 100}%`, top: `${(1 - (point.y + 1) / 2) * 100}%` };
  }
  if (plane === "xz") {
    return { left: `${((point.x + 1) / 2) * 100}%`, top: `${(1 - (point.z + 1) / 2) * 100}%` };
  }
  return { left: `${((point.z + 1) / 2) * 100}%`, top: `${(1 - (point.y + 1) / 2) * 100}%` };
}

function normalizeDepth(mode: SpatialMode, z: number): number {
  return mode === "2d" ? z * 2 - 1 : z;
}

function spatialPannerPosition(mode: SpatialMode, point: SpatialPoint): { x: number; y: number; z: number } {
  const normalizedDepth = normalizeDepth(mode, point.z);
  return {
    x: point.x * 1.7,
    y: point.y * 1.3,
    z: -normalizedDepth * 1.8
  };
}

function baselineSweepPoint(progress: number, mode: SpatialMode): SpatialPoint {
  const rows = 7;
  const rowFloat = Math.min(progress * rows, rows - 1e-6);
  const rowIndex = Math.floor(rowFloat);
  const rowT = rowFloat - rowIndex;
  const leftToRight = rowIndex % 2 === 0;
  const x = leftToRight ? rowT * 2 - 1 : 1 - rowT * 2;
  const y = 1 - (rowIndex / (rows - 1)) * 2;
  const z = mode === "2d" ? 0.5 : 0;
  return { x, y, z };
}

function planarLoudness(point: SpatialPoint): number {
  const radial = Math.min(1, Math.hypot(point.x, point.y));
  const centerBoost = (1 - radial) * 0.09;
  const verticalLift = ((point.y + 1) * 0.5) * 0.03;
  return Math.max(0.12, Math.min(0.28, 0.14 + centerBoost + verticalLift));
}

function createSpatialPanner(ctx: AudioContext, mode: SpatialMode, point: SpatialPoint): PannerNode {
  const mapped = spatialPannerPosition(mode, point);
  return new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    positionX: mapped.x,
    positionY: mapped.y,
    positionZ: mapped.z,
    refDistance: 1,
    maxDistance: 12,
    rolloffFactor: 0
  });
}

export default function App() {
  const [stage, setStage] = useState<Stage>("home");
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [calibration, setCalibration] = useState<CalibrationSession | null>(null);
  const [project, setProject] = useState<TestProject | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [history, setHistory] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("准备开始测试");
  const [spatialTrials, setSpatialTrials] = useState<SpatialTrial[]>([]);
  const [spatialIndex, setSpatialIndex] = useState(0);
  const [spatialGuess, setSpatialGuess] = useState<SpatialPoint | null>(null);
  const [spatialMode, setSpatialMode] = useState<SpatialMode>("3d");
  const [baselinePoint, setBaselinePoint] = useState<SpatialPoint | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [baselineTrialId, setBaselineTrialId] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baselineAnimationFrameRef = useRef<number | null>(null);
  const baselineStopRef = useRef<(() => void) | null>(null);
  const [sweepAcq, setSweepAcq] = useState<SweepAcquisitionConfig>({
    tone_duration_ms: 180,
    tone_amplitude: 0.22,
    inter_tone_pause_ms: 20
  });
  const [thdAcq, setThdAcq] = useState({
    tone_duration_ms: 260,
    tone_amplitude: 0.24,
    inter_tone_pause_ms: 20
  });
  const [channelAcq, setChannelAcq] = useState<ChannelAcquisitionConfig>({
    tone_duration_ms: 220,
    tone_amplitude: 0.22,
    inter_channel_pause_ms: 30
  });
  const isWebDemo = !IS_TAURI_RUNTIME;

  const score = project?.score_result;
  const inputDevices = useMemo(() => devices.filter((d) => d.id.startsWith("input::")), [devices]);
  const outputDevices = useMemo(() => devices.filter((d) => d.id.startsWith("output::")), [devices]);

  const radarData = useMemo(() => {
    if (!score) {
      return [];
    }
    return [
      { metric: "ABX", value: score.subscores.abx },
      { metric: "Sweep", value: score.subscores.sweep },
      { metric: "THD", value: score.subscores.thd },
      { metric: "Channel", value: score.subscores.channel }
    ];
  }, [score]);

  function stopBaselineSweep() {
    if (baselineAnimationFrameRef.current !== null) {
      cancelAnimationFrame(baselineAnimationFrameRef.current);
      baselineAnimationFrameRef.current = null;
    }
    if (baselineStopRef.current) {
      baselineStopRef.current();
      baselineStopRef.current = null;
    }
    setBaselineRunning(false);
    setBaselinePoint(null);
  }

  async function prepareDevices() {
    setBusy(true);
    setStatus("正在枚举音频设备...");
    try {
      const list = await api.listAudioDevices();
      setDevices(list);
      const firstInput = list.find((d) => d.id.startsWith("input::"));
      const firstOutput = list.find((d) => d.id.startsWith("output::"));
      setSelectedInput(firstInput?.id ?? "");
      setSelectedOutput(firstOutput?.id ?? "");
      setStage("wizard");
      setStatus("设备就绪，请执行校准");
    } catch (error) {
      setStatus(`设备枚举失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function startSpatialTest(mode: SpatialMode) {
    const source = mode === "2d" ? SPATIAL_TARGETS_2D : SPATIAL_TARGETS_3D;
    const shuffled = [...source].sort(() => Math.random() - 0.5).slice(0, 6);
    const trials = shuffled.map((target, idx) => ({
      id: idx + 1,
      target,
      revealed: false
    }));
    setSpatialTrials(trials);
    setSpatialIndex(0);
    setSpatialMode(mode);
    setSpatialGuess(mode === "2d" ? { x: 0, y: 0, z: 0.5 } : { x: 0, y: 0, z: 0 });
    setBaselinePoint(null);
    setBaselineTrialId(null);
    setStage("spatial");
    setStatus(
      mode === "2d"
        ? "2D 空间测试已开始：请播放提示音并在平面区域中定位，再用滑条设置深度"
        : "3D 空间测试已开始：请播放提示音并在直角坐标三视图中选择声源位置"
    );
  }

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  async function playSpatialCue() {
    if (spatialTrials.length === 0) {
      return;
    }
    const trial = spatialTrials[spatialIndex];
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const start = ctx.currentTime + 0.03;
    const cueDuration = 1.3;
    const panner3d = createSpatialPanner(ctx, spatialMode, trial.target);
    const timbre = ctx.createBiquadFilter();
    timbre.type = "lowpass";
    timbre.frequency.value = 5200;
    timbre.Q.value = 0.9;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.04);
    envelope.gain.setValueAtTime(1, start + cueDuration - 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + cueDuration);

    const master = ctx.createGain();
    master.gain.value = planarLoudness(trial.target);

    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(SPATIAL_REFERENCE_FREQ_HZ, start);

    oscillator.connect(timbre);
    timbre.connect(envelope);
    envelope.connect(master);
    master.connect(panner3d);
    panner3d.connect(ctx.destination);

    oscillator.start(start);
    oscillator.stop(start + cueDuration + 0.03);

    setStatus(`已播放第 ${trial.id} 题提示音，请在空间中点击你感知的位置`);
  }

  async function playBaselineSweep() {
    if (spatialTrials.length === 0) {
      return;
    }
    stopBaselineSweep();
    const trialId = spatialTrials[spatialIndex].id;
    setBaselineTrialId(trialId);
    setBaselineRunning(true);

    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = SPATIAL_REFERENCE_FREQ_HZ;

    const timbre = ctx.createBiquadFilter();
    timbre.type = "lowpass";
    timbre.frequency.value = 5200;
    timbre.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.value = planarLoudness(baselineSweepPoint(0, spatialMode));

    const panner3d = createSpatialPanner(ctx, spatialMode, baselineSweepPoint(0, spatialMode));

    oscillator.connect(timbre);
    timbre.connect(gain);
    gain.connect(panner3d);
    panner3d.connect(ctx.destination);
    oscillator.start();

    baselineStopRef.current = () => {
      try {
        oscillator.stop();
      } catch {
        // noop: oscillator already stopped
      }
      oscillator.disconnect();
      timbre.disconnect();
      gain.disconnect();
      panner3d.disconnect();
    };

    const durationMs = 5400;
    const startedAt = performance.now();
    setStatus(`正在播放第 ${trialId} 题基准音：平滑扫过参考平面...`);

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const point = baselineSweepPoint(progress, spatialMode);
      setBaselinePoint(point);

      const t = ctx.currentTime;
      const mapped = spatialPannerPosition(spatialMode, point);
      gain.gain.setValueAtTime(planarLoudness(point), t);
      panner3d.positionX.setValueAtTime(mapped.x, t);
      panner3d.positionY.setValueAtTime(mapped.y, t);
      panner3d.positionZ.setValueAtTime(mapped.z, t);

      if (progress < 1) {
        baselineAnimationFrameRef.current = requestAnimationFrame(tick);
      } else {
        stopBaselineSweep();
        setStatus(`第 ${trialId} 题基准音播放完成，请开始选择位置`);
      }
    };

    baselineAnimationFrameRef.current = requestAnimationFrame(tick);
  }

  function handleSpatialPlaneClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const horizontal = clamp01ToSigned(px * 2 - 1);
    const vertical = clamp01ToSigned((1 - py) * 2 - 1);
    setSpatialGuess((old) => {
      const base = old ?? { x: 0, y: 0, z: 0 };
      if (plane === "xy") {
        return { ...base, x: horizontal, y: vertical };
      }
      if (plane === "xz") {
        return { ...base, x: horizontal, z: vertical };
      }
      return { ...base, z: horizontal, y: vertical };
    });
  }

  function handleSpatialArena2DClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const x = clamp01ToSigned(px * 2 - 1);
    const y = clamp01ToSigned((1 - py) * 2 - 1);
    setSpatialGuess((old) => ({ x, y, z: old?.z ?? 0.5 }));
  }

  function submitSpatialGuess() {
    if (!spatialGuess) {
      setStatus("请先在三视图中选择一个空间位置后再提交");
      return;
    }
    const trial = spatialTrials[spatialIndex];
    const dx = spatialGuess.x - trial.target.x;
    const dy = spatialGuess.y - trial.target.y;
    const dz = spatialGuess.z - trial.target.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const denominator = spatialMode === "2d" ? 3 : MAX_CART_DISTANCE;
    const scoreValue = Math.max(0, Math.min(100, 100 - (distance / denominator) * 100));

    const nextTrials = spatialTrials.map((item, idx) =>
      idx === spatialIndex ? { ...item, user: spatialGuess, score: scoreValue, revealed: true } : item
    );
    setSpatialTrials(nextTrials);
    setStatus(`第 ${trial.id} 题已揭晓，空间结像得分 ${scoreValue.toFixed(1)}`);
  }

  function gotoNextSpatialTrial() {
    if (spatialIndex >= spatialTrials.length - 1) {
      setStatus("空间测试已完成，可查看汇总分数");
      return;
    }
    setSpatialIndex((v) => v + 1);
    setSpatialGuess(spatialMode === "2d" ? { x: 0, y: 0, z: 0.5 } : { x: 0, y: 0, z: 0 });
    setBaselinePoint(null);
    setBaselineTrialId(null);
    setStatus(
      spatialMode === "2d"
        ? `进入第 ${spatialIndex + 2} 题，请播放提示音并在 2D 区域定位`
        : `进入第 ${spatialIndex + 2} 题，请播放提示音并在三视图中定位`
    );
  }

  useEffect(() => {
    if (stage !== "spatial" || spatialTrials.length === 0) {
      return;
    }
    const currentTrialId = spatialTrials[spatialIndex].id;
    if (baselineTrialId === currentTrialId) {
      return;
    }
    void playBaselineSweep();
  }, [baselineTrialId, spatialIndex, spatialMode, spatialTrials, stage]);

  useEffect(() => {
    if (stage !== "spatial") {
      stopBaselineSweep();
      setBaselinePoint(null);
    }
    return () => {
      stopBaselineSweep();
    };
  }, [stage]);

  async function refreshHistory() {
    setBusy(true);
    setStatus("正在加载历史项目...");
    try {
      const projects = await api.listProjects();
      setHistory(projects);
      setStatus(`已加载 ${projects.length} 个历史项目`);
    } catch (error) {
      setStatus(`加载历史项目失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openHistoryProject(projectId: string) {
    setBusy(true);
    setStatus("正在加载项目详情...");
    try {
      const loaded = await api.loadProject(projectId);
      setProject(loaded);
      setStage("result");
      setStatus(`已加载项目 ${projectId}`);
    } catch (error) {
      setStatus(`加载项目失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runCalibration() {
    if (!selectedInput || !selectedOutput) {
      setStatus("请选择输入和输出设备");
      return;
    }
    setBusy(true);
    setStatus("正在校准参考电平...");
    try {
      const result = await api.startCalibration(selectedInput, selectedOutput, SAMPLE_RATE);
      setCalibration(result);
      setStatus("校准完成，可以开始执行测试");
    } catch (error) {
      setStatus(`校准失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runFullSuite() {
    if (!calibration) {
      setStatus("请先完成校准");
      return;
    }
    setBusy(true);
    setStatus("执行 ABX... ");
    try {
      const abx = await api.runAbxTest({ trials: 12, seed: Date.now() });
      setStatus("执行 Sweep... ");
      const sweep = await api.runSweepTest({
        start_hz: 20,
        end_hz: 20_000,
        points: 24,
        sample_rate: SAMPLE_RATE,
        acquisition: sweepAcq
      });
      setStatus("执行 THD... ");
      const thd = await api.runThdTest({
        frequencies_hz: [100, 250, 1000, 5000, 10000],
        level_db: -12,
        acquisition: thdAcq
      });
      setStatus("执行 Channel Match... ");
      const channel = await api.runChannelMatchTest({ left_gain_db: 0, right_gain_db: 0, acquisition: channelAcq });
      setStatus("计算评分... ");
      const scoreResult: ScoreResult = await api.computeScore({
        abx_result: abx,
        sweep_result: sweep,
        thd_result: thd,
        channel_result: channel
      });

      const payload: TestProject = {
        metadata: {
          test_id: crypto.randomUUID(),
          input_device_id: selectedInput,
          output_device_id: selectedOutput,
          sample_rate: SAMPLE_RATE,
          gain_db: 0,
          created_at: new Date().toISOString(),
          app_version: APP_VERSION
        },
        calibration,
        raw_results: { abx, sweep, thd, channel },
        normalized_metrics: scoreResult.subscores,
        score_result: scoreResult,
        report_assets: {
          radar_values: [
            scoreResult.subscores.abx,
            scoreResult.subscores.sweep,
            scoreResult.subscores.thd,
            scoreResult.subscores.channel
          ],
          notes: scoreResult.explanations
        }
      };

      setProject(payload);
      setStage("result");
      setStatus("测试完成，可保存并导出报告");
    } catch (error) {
      setStatus(`测试失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentProject() {
    if (!project) {
      return;
    }
    setBusy(true);
    try {
      const result = await api.saveProject(project);
      setSaveResult(result);
      await refreshHistory();
      setStatus(`项目已保存到 ${result.saved_path}`);
    } catch (error) {
      setStatus(`保存失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportCurrentReport() {
    if (!project) {
      return;
    }
    setBusy(true);
    try {
      const result = await api.exportReport(project.metadata.test_id, "html");
      setExportResult(result);
      setStatus(`报告已导出到 ${result.output_path}`);
    } catch (error) {
      setStatus(`导出失败: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>HiFi-Box</h1>
        <p>耳机测试与量化工具箱 V1</p>
      </header>

      {stage === "home" && (
        <section className="grid">
          <div className="card">
            <h2>首页</h2>
            <p>
              {isWebDemo
                ? "当前为 GitHub Pages 版本：可使用空间结像测试（2D/3D）。硬件采集类测试需在 Tauri 桌面版运行。"
                : "新建测试，自动完成设备校验、校准、执行测试与报告生成。"}
            </p>
            <div className="row">
              {!isWebDemo && (
                <button disabled={busy} onClick={prepareDevices}>
                  新建测试
                </button>
              )}
              <button disabled={busy} onClick={() => startSpatialTest("2d")}>
                空间结像测试(2D)
              </button>
              <button disabled={busy} onClick={() => startSpatialTest("3d")}>
                空间结像测试(3D)
              </button>
              {!isWebDemo && (
                <button disabled={busy} onClick={refreshHistory}>
                  刷新历史
                </button>
              )}
            </div>
          </div>
          {!isWebDemo && (
            <div className="card">
              <h2>历史项目</h2>
              {history.length === 0 && <p className="hint">暂无历史记录，先完成一次测试并保存。</p>}
              {history.map((item) => (
                <div key={item.project_id} className="history-item">
                  <div>
                    <strong>{item.project_id}</strong>
                    <p className="hint">
                      score {item.total_score.toFixed(1)} | {item.sample_rate} Hz
                    </p>
                  </div>
                  <button disabled={busy} onClick={() => openHistoryProject(item.project_id)}>
                    打开
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {stage === "spatial" && spatialTrials.length > 0 && (
        <section className="grid">
          <div className="card">
            <h2>空间结像测试（{spatialMode.toUpperCase()}）</h2>
            <div className="row">
              <button onClick={() => setStage("home")}>返回首页</button>
            </div>
            <p>
              第 {spatialIndex + 1}/{spatialTrials.length} 题。先播放提示音，
              {spatialMode === "2d"
                ? "再在 2D 空间区域点击位置并设置深度。"
                : "再在三视图直角坐标空间中选点。"}
              提交后揭晓标准答案。
            </p>
            <div className="row">
              <button disabled={busy || baselineRunning} onClick={playBaselineSweep}>
                {baselineRunning ? "基准音播放中..." : "播放基准音"}
              </button>
              <button disabled={busy || baselineRunning} onClick={playSpatialCue}>
                播放提示音
              </button>
              <button disabled={busy || baselineRunning} onClick={gotoNextSpatialTrial}>
                下一题
              </button>
            </div>
            <label>
              X 坐标（左-右）
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={spatialGuess?.x ?? 0}
                onChange={(e) => {
                  const x = Number.parseFloat(e.target.value);
                  setSpatialGuess((old) => ({ x, y: old?.y ?? 0, z: old?.z ?? 0 }));
                }}
              />
            </label>
            <label>
              Y 坐标（下-上）
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={spatialGuess?.y ?? 0}
                onChange={(e) => {
                  const y = Number.parseFloat(e.target.value);
                  setSpatialGuess((old) => ({ x: old?.x ?? 0, y, z: old?.z ?? 0 }));
                }}
              />
            </label>
            <label>
              Z 坐标（后-前）
              <input
                type="range"
                min={spatialMode === "2d" ? 0 : -1}
                max={1}
                step={0.01}
                value={spatialGuess?.z ?? (spatialMode === "2d" ? 0.5 : 0)}
                onChange={(e) => {
                  const z = Number.parseFloat(e.target.value);
                  setSpatialGuess((old) => ({ x: old?.x ?? 0, y: old?.y ?? 0, z }));
                }}
              />
            </label>
            <button onClick={() => setSpatialGuess({ x: 0, y: 0, z: spatialMode === "2d" ? 0.5 : 0 })}>
              重置到中心点
            </button>
            <p className="hint">
              当前选择: X {spatialGuess?.x.toFixed(2) ?? "0.00"} / Y {spatialGuess?.y.toFixed(2) ?? "0.00"} / Z{" "}
              {spatialGuess?.z.toFixed(2) ?? "0.00"}
            </p>
          </div>

          {spatialMode === "3d" ? (
            <div className="card">
              <h2>直角坐标空间（三视图）</h2>
              <div className="plane-layout">
                <div className="plane-wrap">
                  <p className="plane-title">XY 正视图</p>
                  <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "xy")}>
                    <div className="plane-axis-x" />
                    <div className="plane-axis-y" />
                    {baselinePoint && (
                      <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "xy")} />
                    )}
                    {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "xy")} />}
                    {spatialTrials[spatialIndex].revealed && (
                      <div
                        className="spatial-dot spatial-target"
                        style={planePointToPercent(spatialTrials[spatialIndex].target, "xy")}
                      />
                    )}
                  </div>
                </div>
                <div className="plane-wrap">
                  <p className="plane-title">XZ 俯视图</p>
                  <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "xz")}>
                    <div className="plane-axis-x" />
                    <div className="plane-axis-y" />
                    {baselinePoint && (
                      <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "xz")} />
                    )}
                    {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "xz")} />}
                    {spatialTrials[spatialIndex].revealed && (
                      <div
                        className="spatial-dot spatial-target"
                        style={planePointToPercent(spatialTrials[spatialIndex].target, "xz")}
                      />
                    )}
                  </div>
                </div>
                <div className="plane-wrap">
                  <p className="plane-title">ZY 侧视图</p>
                  <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "zy")}>
                    <div className="plane-axis-x" />
                    <div className="plane-axis-y" />
                    {baselinePoint && (
                      <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "zy")} />
                    )}
                    {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "zy")} />}
                    {spatialTrials[spatialIndex].revealed && (
                      <div
                        className="spatial-dot spatial-target"
                        style={planePointToPercent(spatialTrials[spatialIndex].target, "zy")}
                      />
                    )}
                  </div>
                </div>
              </div>
              <p className="hint">黄点=基准音位置，蓝点=你的选择，红点=标准答案。</p>
              {spatialTrials[spatialIndex].revealed && <p>本题得分: {spatialTrials[spatialIndex].score?.toFixed(1)}</p>}
              <div className="submit-row">
                <button disabled={busy || !spatialGuess || baselineRunning} onClick={submitSpatialGuess}>
                  提交并揭晓
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2>2D 空间区域（旧版）</h2>
              <div className="spatial-arena2d" onClick={handleSpatialArena2DClick}>
                <div className="spatial-self-2d" />
                {baselinePoint && (
                  <div
                    className="spatial-dot spatial-baseline"
                    style={{
                      left: `${((baselinePoint.x + 1) / 2) * 100}%`,
                      top: `${(1 - (baselinePoint.y + 1) / 2) * 100}%`
                    }}
                  />
                )}
                {spatialGuess && (
                  <div
                    className="spatial-dot spatial-user"
                    style={{
                      left: `${((spatialGuess.x + 1) / 2) * 100}%`,
                      top: `${(1 - (spatialGuess.y + 1) / 2) * 100}%`
                    }}
                  />
                )}
                {spatialTrials[spatialIndex].revealed && (
                  <div
                    className="spatial-dot spatial-target"
                    style={{
                      left: `${((spatialTrials[spatialIndex].target.x + 1) / 2) * 100}%`,
                      top: `${(1 - (spatialTrials[spatialIndex].target.y + 1) / 2) * 100}%`
                    }}
                  />
                )}
              </div>
              <p className="hint">黄点=基准音位置，蓝点=你的选择，红点=标准答案，中心点=你所在位置</p>
              {spatialTrials[spatialIndex].revealed && <p>本题得分: {spatialTrials[spatialIndex].score?.toFixed(1)}</p>}
              <div className="submit-row">
                <button disabled={busy || !spatialGuess || baselineRunning} onClick={submitSpatialGuess}>
                  提交并揭晓
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <h2>测试汇总</h2>
            <p>
              已完成 {spatialTrials.filter((t) => t.revealed).length}/{spatialTrials.length}
            </p>
            <p>
              平均分:{" "}
              {(
                spatialTrials.filter((t) => t.score !== undefined).reduce((acc, t) => acc + (t.score ?? 0), 0) /
                Math.max(1, spatialTrials.filter((t) => t.score !== undefined).length)
              ).toFixed(1)}
            </p>
            <button onClick={() => setStage("home")}>返回首页</button>
          </div>
        </section>
      )}

      {stage === "wizard" && (
        <section className="grid">
          <div className="card">
            <h2>设备状态</h2>
            <div className="row">
              <button onClick={() => setStage("home")}>返回首页</button>
            </div>
            <label>
              输入设备
              <select value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)}>
                {inputDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              输出设备
              <select value={selectedOutput} onChange={(e) => setSelectedOutput(e.target.value)}>
                {outputDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button disabled={busy} onClick={runCalibration}>
                参考电平校准
              </button>
              <button disabled={busy || !calibration} onClick={runFullSuite}>
                执行四项测试
              </button>
            </div>
            {calibration && (
              <div className="hint">
                <p>ref_level_db: {calibration.ref_level_db.toFixed(2)}</p>
                <p>noise_floor_db: {calibration.noise_floor_db.toFixed(2)}</p>
                <p>status: {calibration.status}</p>
              </div>
            )}
            <h3>采集参数</h3>
            <label>
              Sweep 时长(ms)
              <input
                type="number"
                min={80}
                max={2000}
                value={sweepAcq.tone_duration_ms}
                onChange={(e) =>
                  setSweepAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                }
              />
            </label>
            <label>
              Sweep 幅度(0-1)
              <input
                type="number"
                min={0.02}
                max={0.85}
                step={0.01}
                value={sweepAcq.tone_amplitude}
                onChange={(e) => setSweepAcq((v) => ({ ...v, tone_amplitude: Number.parseFloat(e.target.value) }))}
              />
            </label>
            <label>
              THD 时长(ms)
              <input
                type="number"
                min={100}
                max={2000}
                value={thdAcq.tone_duration_ms}
                onChange={(e) =>
                  setThdAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                }
              />
            </label>
            <label>
              THD 幅度(0-1)
              <input
                type="number"
                min={0.02}
                max={0.85}
                step={0.01}
                value={thdAcq.tone_amplitude}
                onChange={(e) => setThdAcq((v) => ({ ...v, tone_amplitude: Number.parseFloat(e.target.value) }))}
              />
            </label>
            <label>
              声道测试时长(ms)
              <input
                type="number"
                min={100}
                max={2000}
                value={channelAcq.tone_duration_ms}
                onChange={(e) =>
                  setChannelAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                }
              />
            </label>
            <label>
              声道测试幅度(0-1)
              <input
                type="number"
                min={0.02}
                max={0.85}
                step={0.01}
                value={channelAcq.tone_amplitude}
                onChange={(e) =>
                  setChannelAcq((v) => ({ ...v, tone_amplitude: Number.parseFloat(e.target.value) }))
                }
              />
            </label>
          </div>
        </section>
      )}

      {stage === "result" && project && score && (
        <section className="grid">
          <div className="card">
            <h2>总分</h2>
            <div className="row">
              <button onClick={() => setStage("home")}>返回首页</button>
            </div>
            <div className="score">{score.total_score.toFixed(1)}</div>
            <div className="subscores">
              <span>ABX {score.subscores.abx.toFixed(1)}</span>
              <span>Sweep {score.subscores.sweep.toFixed(1)}</span>
              <span>THD {score.subscores.thd.toFixed(1)}</span>
              <span>Channel {score.subscores.channel.toFixed(1)}</span>
            </div>
            <div className="row">
              <button disabled={busy} onClick={saveCurrentProject}>
                保存项目
              </button>
              <button disabled={busy} onClick={exportCurrentReport}>
                导出 HTML 报告
              </button>
            </div>
            {saveResult && <p className="hint">project_id: {saveResult.project_id}</p>}
            {exportResult && <p className="hint">export: {exportResult.output_path}</p>}
          </div>

          <div className="card chart-card">
            <h2>子项雷达图</h2>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart outerRadius="80%" data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" />
                <PolarRadiusAxis domain={[0, 100]} />
                <Tooltip />
                <Radar name="score" dataKey="value" stroke="#1f6d2f" fill="#7ccf8a" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2>原始指标</h2>
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>关键值</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ABX</td>
                  <td>
                    {project.raw_results.abx.correct}/{project.raw_results.abx.trials}, p=
                    {project.raw_results.abx.p_value.toFixed(4)}
                  </td>
                </tr>
                <tr>
                  <td>Sweep</td>
                  <td>deviation {project.raw_results.sweep.deviation_to_target.toFixed(2)} dB</td>
                </tr>
                <tr>
                  <td>THD</td>
                  <td>total {project.raw_results.thd.total_thd_percent.toFixed(3)}%</td>
                </tr>
                <tr>
                  <td>Channel</td>
                  <td>
                    delta {project.raw_results.channel.level_delta_db.toFixed(2)} dB, corr
                    {project.raw_results.channel.phase_correlation.toFixed(3)}
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>解释</h3>
            <ul>
              {score.explanations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <footer className="statusbar">{status}</footer>
    </div>
  );
}
