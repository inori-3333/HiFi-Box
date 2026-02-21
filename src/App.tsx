import { useMemo, useState } from "react";
import {
  Cpu,
  History,
  Target,
  AudioWaveform,
  Activity,
  Volume2,
  Maximize,
  Ear,
  Waves,
  Zap,
  Scan,
  GitBranch,
  Timer,
  Gauge,
  Layers,
  ArrowLeft,
  ChevronRight,
  Play,
  Settings2,
  FileText,
  Download,
  Save,
  RotateCcw
} from "lucide-react";
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
import { BassReboundStage } from "./components/BassReboundStage";
import { HearingSweepStage } from "./components/HearingSweepStage";
import { ImageSizeStage } from "./components/ImageSizeStage";
import { InteractiveConceptStage } from "./components/InteractiveConceptStage";
import { SoundFieldStage } from "./soundfield/components/SoundFieldStage";
import { SpatialStage } from "./components/SpatialStage";
import { useSpatialTest } from "./spatial/useSpatialTest";
import type {
  CalibrationSession,
  ChannelAcquisitionConfig,
  DeviceInfo,
  ExportResult,
  InteractiveConceptId,
  ProjectSummary,
  SaveResult,
  ScoreResult,
  SweepAcquisitionConfig,
  TestProject
} from "./types";

const SAMPLE_RATE = 48_000;
const APP_VERSION = "0.1.0";
const IS_TAURI_RUNTIME = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Stage =
  | "home"
  | "wizard"
  | "result"
  | "spatial-select"
  | "spatial"
  | "hearing-sweep"
  | "bass-rebound"
  | "soundfield"
  | "image-size"
  | "concept-tests";

const CONCEPT_LABELS: Record<InteractiveConceptId, string> = {
  ild: "左右耳声压差测试",
  bass_extension: "低频下潜测试",
  treble_extension: "高频延伸测试",
  resolution: "解析测试",
  separation: "分离测试",
  transient: "瞬态测试",
  dynamic: "动态测试",
  density: "密度测试"
};

// Test group definitions
interface TestItem {
  id: InteractiveConceptId | string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
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
  const [conceptInitial, setConceptInitial] = useState<InteractiveConceptId>("ild");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("准备开始测试");
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

  const spatial = useSpatialTest({
    isSpatialStage: stage === "spatial",
    onEnterSpatialStage: () => setStage("spatial"),
    setStatus
  });

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

  function openConceptTests(conceptId: InteractiveConceptId) {
    setConceptInitial(conceptId);
    setStage("concept-tests");
    setStatus(`进入交互式测试：${CONCEPT_LABELS[conceptId]}`);
  }

  // Hardware test items (Tauri only)
  const hardwareTests: TestItem[] = !isWebDemo ? [
    {
      id: "new-test",
      label: "新建测试",
      icon: <Cpu size={18} />,
      action: prepareDevices,
      disabled: busy
    },
    {
      id: "refresh-history",
      label: "刷新历史",
      icon: <History size={18} />,
      action: refreshHistory,
      disabled: busy
    }
  ] : [];

  // Interactive test items (Web + Tauri)
  const interactiveTests: TestItem[] = [
    {
      id: "spatial",
      label: "空间结像位置测试",
      icon: <Target size={18} />,
      action: () => {
        setStage("spatial-select");
        setStatus("请选择空间结像测试模式");
      },
      disabled: busy
    },
    {
      id: "soundfield",
      label: "声场测试",
      icon: <AudioWaveform size={18} />,
      action: () => {
        setStage("soundfield");
        setStatus("进入声场测试");
      },
      disabled: busy
    },
    {
      id: "hearing-sweep",
      label: "扫频可听范围测试",
      icon: <Activity size={18} />,
      action: () => {
        setStage("hearing-sweep");
        setStatus("进入扫频可听范围测试");
      },
      disabled: busy
    },
    {
      id: "bass-rebound",
      label: "低频回弹测试",
      icon: <Volume2 size={18} />,
      action: () => {
        setStage("bass-rebound");
        setStatus("进入低频回弹测试");
      },
      disabled: busy
    },
    {
      id: "image-size",
      label: "空间结像大小测试",
      icon: <Maximize size={18} />,
      action: () => {
        setStage("image-size");
        setStatus("进入空间结像大小测试");
      },
      disabled: busy
    }
  ];

  // Concept test items
  const conceptTests: TestItem[] = [
    { id: "ild", label: "左右耳声压差测试", icon: <Ear size={16} />, action: () => openConceptTests("ild"), disabled: busy },
    { id: "bass_extension", label: "低频下潜测试", icon: <Waves size={16} />, action: () => openConceptTests("bass_extension"), disabled: busy },
    { id: "treble_extension", label: "高频延伸测试", icon: <Zap size={16} />, action: () => openConceptTests("treble_extension"), disabled: busy },
    { id: "resolution", label: "解析测试", icon: <Scan size={16} />, action: () => openConceptTests("resolution"), disabled: busy },
    { id: "separation", label: "分离测试", icon: <GitBranch size={16} />, action: () => openConceptTests("separation"), disabled: busy },
    { id: "transient", label: "瞬态测试", icon: <Timer size={16} />, action: () => openConceptTests("transient"), disabled: busy },
    { id: "dynamic", label: "动态测试", icon: <Gauge size={16} />, action: () => openConceptTests("dynamic"), disabled: busy },
    { id: "density", label: "密度测试", icon: <Layers size={16} />, action: () => openConceptTests("density"), disabled: busy }
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-content">
          <div className="logo-section">
            <div className="logo-icon">
              <AudioWaveform size={28} />
            </div>
            <div className="logo-text">
              <h1>HiFi Box</h1>
              <p>耳机测试与量化工具箱</p>
            </div>
          </div>
          {stage !== "home" && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStage("home")}>
              <ArrowLeft size={16} />
              返回首页
            </button>
          )}
        </div>
      </header>

      {stage === "home" && (
        <section className="home-grid">
          {/* Welcome / Info Card */}
          <div className="card card-welcome">
            <div className="welcome-content">
              <h2>欢迎使用 HiFi Box</h2>
              <p className="welcome-desc">
                {isWebDemo
                  ? "当前为网页演示版本：硬件采集类测试需在 Tauri 桌面版运行。"
                  : "专业的耳机测试与量化分析工具，支持设备校准、多项指标测试与报告生成。"}
              </p>
              <div className="seed-input-row">
                <label className="input-label">
                  空间测试随机种子（可选）
                  <input
                    type="number"
                    placeholder="留空则自动生成"
                    value={spatial.spatialSeedInput}
                    onChange={(e) => spatial.setSpatialSeedInput(e.target.value)}
                    className="input input-sm"
                  />
                </label>
                {spatial.spatialSeed !== null && (
                  <span className="hint">最近一轮空间测试 seed: {spatial.spatialSeed}</span>
                )}
              </div>
            </div>
          </div>

          {/* Hardware Tests Card */}
          {!isWebDemo && hardwareTests.length > 0 && (
            <div className="card card-tests">
              <div className="card-header">
                <div className="card-icon hardware">
                  <Cpu size={20} />
                </div>
                <div className="card-title-group">
                  <h3>硬件测试</h3>
                  <p className="card-subtitle">Tauri 桌面版专属功能</p>
                </div>
              </div>
              <div className="test-buttons-row">
                {hardwareTests.map((test) => (
                  <button
                    key={test.id}
                    className="btn btn-primary"
                    disabled={test.disabled}
                    onClick={test.action}
                  >
                    {test.icon}
                    <span>{test.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Tests Card */}
          <div className="card card-tests">
            <div className="card-header">
              <div className="card-icon interactive">
                <Target size={20} />
              </div>
              <div className="card-title-group">
                <h3>交互测试</h3>
                <p className="card-subtitle">主观听感与空间定位测试</p>
              </div>
            </div>
            <div className="test-buttons-grid cols-2">
              {interactiveTests.map((test) => (
                <button
                  key={test.id}
                  className="btn btn-secondary test-btn"
                  disabled={test.disabled}
                  onClick={test.action}
                >
                  <span className="test-btn-icon">{test.icon}</span>
                  <span className="test-btn-label">{test.label}</span>
                  <ChevronRight size={16} className="test-btn-arrow" />
                </button>
              ))}
            </div>
          </div>

          {/* Concept Tests Card */}
          <div className="card card-tests">
            <div className="card-header">
              <div className="card-icon concept">
                <Layers size={20} />
              </div>
              <div className="card-title-group">
                <h3>概念测试</h3>
                <p className="card-subtitle">8 项音频概念主观评估</p>
              </div>
            </div>
            <div className="test-buttons-grid cols-4">
              {conceptTests.map((test) => (
                <button
                  key={test.id}
                  className="btn btn-ghost concept-btn"
                  disabled={test.disabled}
                  onClick={test.action}
                >
                  <span className="concept-btn-icon">{test.icon}</span>
                  <span className="concept-btn-label">{test.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* History Card */}
          {!isWebDemo && (
            <div className="card card-history">
              <div className="card-header">
                <div className="card-icon history">
                  <History size={20} />
                </div>
                <div className="card-title-group">
                  <h3>历史项目</h3>
                  <p className="card-subtitle">共 {history.length} 个项目</p>
                </div>
              </div>
              {history.length === 0 ? (
                <div className="empty-state">
                  <FileText size={48} className="empty-icon" />
                  <p>暂无历史记录</p>
                  <span className="hint">完成一次测试并保存后将显示在这里</span>
                </div>
              ) : (
                <div className="history-list">
                  {history.map((item) => (
                    <div key={item.project_id} className="history-item">
                      <div className="history-item-info">
                        <span className="history-item-id">{item.project_id}</span>
                        <span className="history-item-meta">
                          评分 {item.total_score.toFixed(1)} · {item.sample_rate} Hz
                        </span>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => openHistoryProject(item.project_id)}
                      >
                        打开
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {stage === "spatial-select" && (
        <section className="page-container">
          <div className="card">
            <div className="card-header">
              <div className="card-icon">
                <Target size={24} />
              </div>
              <div className="card-title-group">
                <h2>空间结像位置测试</h2>
                <p className="card-subtitle">请选择测试模式</p>
              </div>
            </div>
            <div className="mode-selection">
              <button
                className="mode-card"
                disabled={busy}
                onClick={() => spatial.startSpatialTest("2d")}
              >
                <div className="mode-icon">📐</div>
                <h4>2D 模式</h4>
                <p>平面定位测试</p>
                <span className="hint">适合音响摆放位置判断</span>
              </button>
              <button
                className="mode-card"
                disabled={busy}
                onClick={() => spatial.startSpatialTest("3d")}
              >
                <div className="mode-icon">🎯</div>
                <h4>3D 模式</h4>
                <p>立体空间定位</p>
                <span className="hint">适合耳机环绕声定位</span>
              </button>
            </div>
            <div className="hint-box">
              <p><strong>2D 模式：</strong>在 XY 平面进行测试，适合音响摆放位置判断。</p>
              <p><strong>3D 模式：</strong>在 XYZ 立体空间进行测试，适合耳机环绕声定位。</p>
            </div>
          </div>
        </section>
      )}

      {stage === "spatial" && spatial.spatialTrials.length > 0 && (
        <SpatialStage busy={busy} spatial={spatial} onBackHome={() => setStage("home")} />
      )}

      {stage === "hearing-sweep" && (
        <HearingSweepStage busy={busy} setStatus={setStatus} onBackHome={() => setStage("home")} />
      )}

      {stage === "bass-rebound" && (
        <BassReboundStage busy={busy} setStatus={setStatus} onBackHome={() => setStage("home")} />
      )}

      {stage === "soundfield" && (
        <SoundFieldStage busy={busy} setStatus={setStatus} onBackHome={() => setStage("home")} />
      )}

      {stage === "image-size" && (
        <ImageSizeStage busy={busy} setStatus={setStatus} onBackHome={() => setStage("home")} />
      )}

      {stage === "concept-tests" && (
        <InteractiveConceptStage
          busy={busy}
          setStatus={setStatus}
          initialConcept={conceptInitial}
          onBackHome={() => setStage("home")}
        />
      )}

      {stage === "wizard" && (
        <section className="page-container">
          <div className="card">
            <div className="card-header">
              <div className="card-icon">
                <Settings2 size={24} />
              </div>
              <div className="card-title-group">
                <h2>设备配置</h2>
                <p className="card-subtitle">选择音频设备并执行校准</p>
              </div>
            </div>

            <div className="form-section">
              <div className="form-row">
                <label className="form-label">
                  输入设备
                  <select
                    className="select"
                    value={selectedInput}
                    onChange={(e) => setSelectedInput(e.target.value)}
                  >
                    {inputDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  输出设备
                  <select
                    className="select"
                    value={selectedOutput}
                    onChange={(e) => setSelectedOutput(e.target.value)}
                  >
                    {outputDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="action-bar">
              <button className="btn btn-primary" disabled={busy} onClick={runCalibration}>
                <RotateCcw size={16} />
                参考电平校准
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !calibration}
                onClick={runFullSuite}
              >
                <Play size={16} />
                执行四项测试
              </button>
            </div>

            {calibration && (
              <div className="calibration-info">
                <div className="info-row">
                  <span>参考电平</span>
                  <strong>{calibration.ref_level_db.toFixed(2)} dB</strong>
                </div>
                <div className="info-row">
                  <span>噪声底</span>
                  <strong>{calibration.noise_floor_db.toFixed(2)} dB</strong>
                </div>
                <div className="info-row">
                  <span>状态</span>
                  <span className="badge badge-success">{calibration.status}</span>
                </div>
              </div>
            )}

            <div className="divider" />

            <h4 className="section-title">采集参数</h4>
            <div className="form-section">
              <div className="form-row three-col">
                <label className="form-label">
                  Sweep 时长 (ms)
                  <input
                    type="number"
                    className="input"
                    min={80}
                    max={2000}
                    value={sweepAcq.tone_duration_ms}
                    onChange={(e) =>
                      setSweepAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                    }
                  />
                </label>
                <label className="form-label">
                  Sweep 幅度 (0-1)
                  <input
                    type="number"
                    className="input"
                    min={0.02}
                    max={0.85}
                    step={0.01}
                    value={sweepAcq.tone_amplitude}
                    onChange={(e) =>
                      setSweepAcq((v) => ({ ...v, tone_amplitude: Number.parseFloat(e.target.value) }))
                    }
                  />
                </label>
                <label className="form-label">
                  THD 时长 (ms)
                  <input
                    type="number"
                    className="input"
                    min={100}
                    max={2000}
                    value={thdAcq.tone_duration_ms}
                    onChange={(e) =>
                      setThdAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                    }
                  />
                </label>
              </div>
              <div className="form-row three-col">
                <label className="form-label">
                  THD 幅度 (0-1)
                  <input
                    type="number"
                    className="input"
                    min={0.02}
                    max={0.85}
                    step={0.01}
                    value={thdAcq.tone_amplitude}
                    onChange={(e) =>
                      setThdAcq((v) => ({ ...v, tone_amplitude: Number.parseFloat(e.target.value) }))
                    }
                  />
                </label>
                <label className="form-label">
                  声道测试时长 (ms)
                  <input
                    type="number"
                    className="input"
                    min={100}
                    max={2000}
                    value={channelAcq.tone_duration_ms}
                    onChange={(e) =>
                      setChannelAcq((v) => ({ ...v, tone_duration_ms: Number.parseInt(e.target.value || "0", 10) }))
                    }
                  />
                </label>
                <label className="form-label">
                  声道测试幅度 (0-1)
                  <input
                    type="number"
                    className="input"
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
            </div>
          </div>
        </section>
      )}

      {stage === "result" && project && score && (
        <section className="page-container">
          <div className="results-grid">
            {/* Score Card */}
            <div className="card card-score">
              <h2>测试评分</h2>
              <div className="score-display">
                <span className="score-value">{score.total_score.toFixed(1)}</span>
                <span className="score-label">总分</span>
              </div>
              <div className="subscores-grid">
                <div className="subscore-item">
                  <span className="subscore-label">ABX</span>
                  <span className="subscore-value">{score.subscores.abx.toFixed(1)}</span>
                </div>
                <div className="subscore-item">
                  <span className="subscore-label">Sweep</span>
                  <span className="subscore-value">{score.subscores.sweep.toFixed(1)}</span>
                </div>
                <div className="subscore-item">
                  <span className="subscore-label">THD</span>
                  <span className="subscore-value">{score.subscores.thd.toFixed(1)}</span>
                </div>
                <div className="subscore-item">
                  <span className="subscore-label">Channel</span>
                  <span className="subscore-value">{score.subscores.channel.toFixed(1)}</span>
                </div>
              </div>
              <div className="action-bar">
                <button className="btn btn-primary" disabled={busy} onClick={saveCurrentProject}>
                  <Save size={16} />
                  保存项目
                </button>
                <button className="btn btn-secondary" disabled={busy} onClick={exportCurrentReport}>
                  <Download size={16} />
                  导出 HTML 报告
                </button>
              </div>
              {saveResult && <p className="hint">项目 ID: {saveResult.project_id}</p>}
              {exportResult && <p className="hint">导出路径: {exportResult.output_path}</p>}
            </div>

            {/* Radar Chart Card */}
            <div className="card card-chart">
              <h3>子项雷达图</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Radar
                      name="得分"
                      dataKey="value"
                      stroke="#16a34a"
                      fill="#22c55e"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Raw Data Table */}
            <div className="card card-table">
              <h3>原始指标</h3>
              <table className="data-table">
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
                      delta {project.raw_results.channel.level_delta_db.toFixed(2)} dB, corr{' '}
                      {project.raw_results.channel.phase_correlation.toFixed(3)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Explanations Card */}
            <div className="card card-explanations">
              <h3>评分解释</h3>
              <ul className="explanation-list">
                {score.explanations.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <footer className="statusbar">
        <div className="status-content">
          <span className={`status-indicator ${busy ? 'busy' : ''}`} />
          <span className="status-text">{status}</span>
        </div>
        <span className="version">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}
