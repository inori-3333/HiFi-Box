import { useMemo, useState } from "react";
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
  DeviceInfo,
  ExportResult,
  ProjectSummary,
  SaveResult,
  ScoreResult,
  TestProject
} from "./types";

const SAMPLE_RATE = 48_000;
const APP_VERSION = "0.1.0";

type Stage = "home" | "wizard" | "result";

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

  const score = project?.score_result;

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
      if (list.length > 0) {
        setSelectedInput(list[0].id);
        setSelectedOutput(list[Math.min(1, list.length - 1)].id);
      }
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
        sample_rate: SAMPLE_RATE
      });
      setStatus("执行 THD... ");
      const thd = await api.runThdTest({ frequencies_hz: [100, 250, 1000, 5000, 10000], level_db: -12 });
      setStatus("执行 Channel Match... ");
      const channel = await api.runChannelMatchTest({ left_gain_db: 0, right_gain_db: 0 });
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
            <p>新建测试，自动完成设备校验、校准、执行测试与报告生成。</p>
            <div className="row">
              <button disabled={busy} onClick={prepareDevices}>
                新建测试
              </button>
              <button disabled={busy} onClick={refreshHistory}>
                刷新历史
              </button>
            </div>
          </div>
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
        </section>
      )}

      {stage === "wizard" && (
        <section className="grid">
          <div className="card">
            <h2>设备状态</h2>
            <label>
              输入设备
              <select value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)}>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              输出设备
              <select value={selectedOutput} onChange={(e) => setSelectedOutput(e.target.value)}>
                {devices.map((d) => (
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
          </div>
        </section>
      )}

      {stage === "result" && project && score && (
        <section className="grid">
          <div className="card">
            <h2>总分</h2>
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
