import type React from "react";
import { useSoundField } from "../soundfield/useSoundField";
import type { SoundFieldPoint, SoundFieldDimension } from "../soundfield/soundfield-core";

type SoundFieldStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
};

const DIMENSION_NAMES: Record<SoundFieldDimension, string> = {
  width: "宽度",
  depth: "深度",
  height: "高度",
  immersion: "沉浸感"
};

export function SoundFieldStage(props: SoundFieldStageProps) {
  const { busy, setStatus, onBackHome } = props;
  const test = useSoundField({ setStatus });
  const {
    mode,
    currentDimension,
    currentTrial,
    totalTrials,
    isPlaying,
    trials,
    abxTrials,
    currentABXTrial,
    abxCorrect,
    continuousRatings,
    results,
    volume,
    currentTarget,

    setMode,
    setVolume,

    playTestTone,
    submitGuess,

    playABX,
    submitABXChoice,

    playContinuous,
    submitRating,

    startTest,
    reset
  } = test;

  // 处理返回
  function handleBackHome() {
    reset();
    onBackHome();
  }

  // 处理点击声场区域
  function handleArenaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "positioning") return;
    if (!currentTarget) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = -(e.clientY - rect.top) / rect.height * 2 + 1;

    const guess: SoundFieldPoint = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      z: 0
    };

    submitGuess(guess);
  }

  // 获取当前维度颜色
  function getDimensionColor(dim: SoundFieldDimension): string {
    switch (dim) {
      case "width":
        return "#2f7142";
      case "depth":
        return "#1976d2";
      case "height":
        return "#7b1fa2";
      case "immersion":
        return "#c62828";
    }
  }

  // 渲染模式选择标签
  function renderModeTabs() {
    const modes: { key: typeof mode; label: string; desc: string }[] = [
      { key: "positioning", label: "定点定位", desc: "在2D平面上标记声音来源位置" },
      { key: "abx", label: "AB测试", desc: "辨别哪个声场更开阔" },
      { key: "continuous", label: "连续听音", desc: "聆听后对各维度评分" }
    ];

    return (
      <div className="soundfield-mode-tabs">
        {modes.map((m) => (
          <button
            key={m.key}
            className={`soundfield-mode-tab ${mode === m.key ? "active" : ""}`}
            onClick={() => setMode(m.key)}
            disabled={isPlaying}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>
    );
  }

  // 渲染维度进度条
  function renderDimensionBar() {
    const dimensions: SoundFieldDimension[] = ["width", "depth", "height", "immersion"];

    return (
      <div className="soundfield-dimension-bar">
        {dimensions.map((dim) => (
          <div
            key={dim}
            className={`soundfield-dimension-item ${currentDimension === dim && mode === "positioning" ? "active" : ""}`}
            style={{
              borderColor: currentDimension === dim ? getDimensionColor(dim) : undefined,
              backgroundColor: currentDimension === dim ? `${getDimensionColor(dim)}20` : undefined
            }}
          >
            <div style={{ fontWeight: 600, color: getDimensionColor(dim) }}>{DIMENSION_NAMES[dim]}</div>
            {results && (
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                {dim === "width"
                  ? results.widthScore
                  : dim === "depth"
                    ? results.depthScore
                    : dim === "height"
                      ? results.heightScore
                      : results.immersionScore}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 渲染定点定位模式
  function renderPositioningMode() {
    return (
      <div className="soundfield-positioning">
        <div className="soundfield-info">
          {currentTarget ? (
            <p>
              第 <strong>{currentTrial + 1}</strong> / {totalTrials} 试次 | 当前维度:
              <span
                style={{
                  color: getDimensionColor(currentDimension),
                  fontWeight: 700,
                  marginLeft: 4
                }}
              >
                {DIMENSION_NAMES[currentDimension]}
              </span>
            </p>
          ) : (
            <p>点击"开始测试"开始声场定位测试</p>
          )}
        </div>

        <div
          className="spatial-arena2d soundfield-arena"
          onClick={handleArenaClick}
          style={{ cursor: currentTarget ? "crosshair" : "default" }}
        >
          <div className="spatial-self-2d" />
          <div className="plane-axis-x" />
          <div className="plane-axis-y" />

          {/* 显示历史点 */}
          {trials.map(
            (trial, idx) =>
              trial.userGuess &&
              idx < currentTrial && (
                <div
                  key={trial.id}
                  className="spatial-dot spatial-user"
                  style={{
                    left: `${((trial.userGuess.x + 1) / 2) * 100}%`,
                    top: `${(1 - (trial.userGuess.y + 1) / 2) * 100}%`,
                    opacity: 0.4,
                    transform: "translate(-50%, -50%) scale(0.7)"
                  }}
                  title={`${DIMENSION_NAMES[trial.dimension]}: ${Math.round(trial.score || 0)}分`}
                />
              )
          )}
        </div>

        <div className="soundfield-controls row">
          <button disabled={busy || isPlaying || !currentTarget} onClick={() => playTestTone()}>
            {isPlaying ? "播放中..." : "播放测试音"}
          </button>
        </div>

        <p className="hint">点击上方区域标记您感知到的声音位置</p>
      </div>
    );
  }

  // 渲染 ABX 模式
  function renderABXMode() {
    const currentTrialData = abxTrials[currentABXTrial];

    return (
      <div className="soundfield-abx">
        <div className="soundfield-info">
          {abxTrials.length > 0 ? (
            <p>
              第 <strong>{currentABXTrial + 1}</strong> / {abxTrials.length} 试次 | 测试维度:
              <span
                style={{
                  color: currentTrialData ? getDimensionColor(currentTrialData.dimension) : undefined,
                  fontWeight: 700,
                  marginLeft: 4
                }}
              >
                {currentTrialData ? DIMENSION_NAMES[currentTrialData.dimension] : ""}
              </span>
            </p>
          ) : (
            <p>点击"开始测试"开始 ABX 辨别测试</p>
          )}
        </div>

        <div className="soundfield-abx-buttons row" style={{ justifyContent: "center", gap: 20 }}>
          <button
            className="soundfield-abx-btn"
            disabled={busy || isPlaying || abxTrials.length === 0}
            onClick={() => playABX("a")}
          >
            播放 A
          </button>
          <button
            className="soundfield-abx-btn"
            disabled={busy || isPlaying || abxTrials.length === 0}
            onClick={() => playABX("b")}
          >
            播放 B
          </button>
        </div>

        <div className="soundfield-abx-choice row" style={{ justifyContent: "center", gap: 20, marginTop: 20 }}>
          <button
            disabled={busy || isPlaying || abxTrials.length === 0 || currentABXTrial >= abxTrials.length}
            onClick={() => submitABXChoice("a")}
            style={{ padding: "16px 32px", fontSize: 16 }}
          >
            选 A (更开阔)
          </button>
          <button
            disabled={busy || isPlaying || abxTrials.length === 0 || currentABXTrial >= abxTrials.length}
            onClick={() => submitABXChoice("b")}
            style={{ padding: "16px 32px", fontSize: 16 }}
          >
            选 B (更开阔)
          </button>
        </div>

        {currentABXTrial >= abxTrials.length && abxTrials.length > 0 && (
          <div className="soundfield-result" style={{ marginTop: 20, textAlign: "center" }}>
            <h3>ABX 测试完成!</h3>
            <div className="score" style={{ fontSize: 48 }}>
              {Math.round((abxCorrect / abxTrials.length) * 100)}%
            </div>
            <p>
              正确率: {abxCorrect} / {abxTrials.length}
            </p>
          </div>
        )}
      </div>
    );
  }

  // 渲染连续听音模式
  function renderContinuousMode() {
    const dimensions: SoundFieldDimension[] = ["width", "depth", "height", "immersion"];
    const hasCompletedRatings = continuousRatings.length === 4;

    return (
      <div className="soundfield-continuous">
        <div className="soundfield-controls row" style={{ justifyContent: "center" }}>
          <button
            disabled={busy || isPlaying}
            onClick={playContinuous}
            style={{ padding: "14px 28px", fontSize: 16 }}
          >
            {isPlaying ? "播放中..." : "播放测试音 (8秒)"}
          </button>
        </div>

        <div className="soundfield-ratings" style={{ marginTop: 24 }}>
          <h4>请对以下维度进行评分 (1-10):</h4>
          {dimensions.map((dim) => {
            const rating = continuousRatings.find((r) => r.dimension === dim)?.rating || 0;
            return (
              <div key={dim} className="soundfield-rating-row" style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: getDimensionColor(dim),
                      minWidth: 60
                    }}
                  >
                    {DIMENSION_NAMES[dim]}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{rating || "-"}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={rating || 5}
                  onChange={(e) => submitRating(dim, parseInt(e.target.value))}
                  disabled={isPlaying}
                  style={{ width: "100%" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: "#666",
                    marginTop: 4
                  }}
                >
                  <span>弱</span>
                  <span>强</span>
                </div>
              </div>
            );
          })}
        </div>

        {hasCompletedRatings && (
          <div className="soundfield-result" style={{ marginTop: 20 }}>
            <h4>评分结果:</h4>
            <div className="soundfield-dimension-bar" style={{ marginTop: 12 }}>
              {continuousRatings.map((r) => (
                <div key={r.dimension} className="soundfield-dimension-item">
                  <div style={{ fontWeight: 600, color: getDimensionColor(r.dimension) }}>
                    {DIMENSION_NAMES[r.dimension]}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{r.rating}</div>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              平均得分: {(continuousRatings.reduce((a, b) => a + b.rating, 0) / 4).toFixed(1)} / 10
            </p>
          </div>
        )}
      </div>
    );
  }

  // 渲染结果
  function renderResults() {
    if (!results) return null;

    return (
      <div className="soundfield-results">
        <div className="soundfield-overall-score" style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "#666" }}>综合声场得分</div>
          <div className="score" style={{ fontSize: 56 }}>
            {results.overallScore}
          </div>
        </div>

        {renderDimensionBar()}

        <div className="soundfield-result-details" style={{ marginTop: 20 }}>
          <h4>各维度得分详情:</h4>
          <table className="soundfield-result-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>维度</th>
                <th>得分</th>
                <th>评价</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: getDimensionColor("width") }}>宽度</td>
                <td>{results.widthScore}</td>
                <td>{getScoreAssessment(results.widthScore)}</td>
              </tr>
              <tr>
                <td style={{ color: getDimensionColor("depth") }}>深度</td>
                <td>{results.depthScore}</td>
                <td>{getScoreAssessment(results.depthScore)}</td>
              </tr>
              <tr>
                <td style={{ color: getDimensionColor("height") }}>高度</td>
                <td>{results.heightScore}</td>
                <td>{getScoreAssessment(results.heightScore)}</td>
              </tr>
              <tr>
                <td style={{ color: getDimensionColor("immersion") }}>沉浸感</td>
                <td>{results.immersionScore}</td>
                <td>{getScoreAssessment(results.immersionScore)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 获取评分评价
  function getScoreAssessment(score: number): string {
    if (score >= 90) return "优秀";
    if (score >= 80) return "良好";
    if (score >= 70) return "中等";
    if (score >= 60) return "一般";
    return "较弱";
  }

  return (
    <section className="grid">
      <div className="card soundfield-card">
        <h2>声场测试</h2>
        <p>评估耳机的空间声场表现，包括宽度、深度、高度和沉浸感四个维度。</p>

        <div className="row">
          <button onClick={handleBackHome}>返回首页</button>
          <button disabled={busy || isPlaying} onClick={reset}>
            重置
          </button>
        </div>

        {renderModeTabs()}

        {/* 音量控制 */}
        <label style={{ marginTop: 16 }}>
          测试音量（0.05 - 0.80）
          <input
            type="range"
            min={0.05}
            max={0.8}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            disabled={isPlaying}
          />
          <span className="hint">当前音量：{volume.toFixed(2)}</span>
        </label>

        {/* 开始测试按钮 */}
        {(mode === "positioning" ? trials.length === 0 : mode === "abx" ? abxTrials.length === 0 : true) && (
          <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button
              disabled={busy || isPlaying}
              onClick={startTest}
              style={{ padding: "14px 32px", fontSize: 16 }}
            >
              开始测试
            </button>
          </div>
        )}

        {/* 模式特定内容 */}
        {mode === "positioning" && renderPositioningMode()}
        {mode === "abx" && renderABXMode()}
        {mode === "continuous" && renderContinuousMode()}

        {/* 结果展示 */}
        {results && mode === "positioning" && renderResults()}
      </div>
    </section>
  );
}
