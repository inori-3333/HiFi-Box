import type React from "react";
import { useState, useRef, useCallback } from "react";
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

// 3D Scene constants
const CUBE_SIZE = 280; // px
const HALF_CUBE = CUBE_SIZE / 2;

// Convert 3D coordinates to CSS translate3d values
function toCSSPosition(point: SoundFieldPoint): { x: string; y: string; z: string } {
  return {
    x: `${point.x * HALF_CUBE}px`,
    y: `${-point.y * HALF_CUBE}px`, // Y axis in CSS goes down, spatial Y goes up
    z: `${point.z * HALF_CUBE}px`
  };
}

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

  // 3D Scene state
  const [sceneRotation, setSceneRotation] = useState({ x: -15, y: 25 });
  const [isDragging, setIsDragging] = useState(false);
  const [tempZ, setTempZ] = useState(0); // Temporary Z coordinate before submitting
  const dragStartRef = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 });
  const sceneRef = useRef<HTMLDivElement>(null);

  // 处理返回
  function handleBackHome() {
    reset();
    onBackHome();
  }

  // 3D Scene drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.cube-face')) {
      // Don't start drag if clicking on a face (allow click to set position)
      return;
    }
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: sceneRotation.x,
      rotY: sceneRotation.y
    };
  }, [sceneRotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setSceneRotation({
      x: Math.max(-90, Math.min(90, dragStartRef.current.rotX - dy * 0.5)),
      y: dragStartRef.current.rotY + dx * 0.5
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle click on 3D cube face
  const handleCubeFaceClick = useCallback((face: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "positioning") return;
    if (!currentTarget) return;
    if (isDragging) return; // Don't process click if we were dragging

    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width; // 0 to 1 (left to right)
    const v = (e.clientY - rect.top) / rect.height; // 0 to 1 (top to bottom)

    // Convert to -1 to 1 range
    const nu = (u - 0.5) * 2;
    const nv = -(v - 0.5) * 2; // Invert Y so positive is up

    let x = 0, y = 0, z = tempZ;

    switch (face) {
      case 'front': // Y+ plane, Z varies by tempZ
        x = nu;
        y = 1; // Front face is at Y = 1
        z = nv;
        setTempZ(nv);
        break;
      case 'back': // Y- plane
        x = -nu;
        y = -1; // Back face is at Y = -1
        z = nv;
        setTempZ(nv);
        break;
      case 'right': // X+ plane
        x = 1; // Right face is at X = 1
        y = nu;
        z = nv;
        setTempZ(nv);
        break;
      case 'left': // X- plane
        x = -1; // Left face is at X = -1
        y = -nu;
        z = nv;
        setTempZ(nv);
        break;
      case 'top': // Z+ plane
        x = nu;
        y = nv;
        z = 1; // Top face is at Z = 1
        setTempZ(1);
        break;
      case 'bottom': // Z- plane
        x = nu;
        y = nv;
        z = -1; // Bottom face is at Z = -1
        setTempZ(-1);
        break;
    }

    const guess: SoundFieldPoint = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      z: Math.max(-1, Math.min(1, z))
    };

    submitGuess(guess);
  }, [mode, currentTarget, isDragging, tempZ, submitGuess]);

  // Preset rotation views
  const setPresetView = useCallback((view: string) => {
    switch (view) {
      case 'front':
        setSceneRotation({ x: 0, y: 0 });
        break;
      case 'back':
        setSceneRotation({ x: 0, y: 180 });
        break;
      case 'right':
        setSceneRotation({ x: 0, y: -90 });
        break;
      case 'left':
        setSceneRotation({ x: 0, y: 90 });
        break;
      case 'top':
        setSceneRotation({ x: -90, y: 0 });
        break;
      case 'bottom':
        setSceneRotation({ x: 90, y: 0 });
        break;
      case 'iso':
        setSceneRotation({ x: -20, y: 45 });
        break;
    }
  }, []);

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

  // 渲染3D场景
  function render3DScene() {
    const currentTrialData = trials[currentTrial];
    const showTarget = currentTrialData?.target && mode === "positioning";

    return (
      <div className="soundfield-3d-container">
        <div
          ref={sceneRef}
          className={`soundfield-3d-scene ${isDragging ? "dragging" : ""}`}
          style={{
            transform: `rotateX(${sceneRotation.x}deg) rotateY(${sceneRotation.y}deg)`
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="soundfield-cube">
            {/* Front face (Y+) */}
            <div
              className="cube-face cube-face-front"
              onClick={(e) => handleCubeFaceClick("front", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label front">前 (Y+)</span>
            </div>

            {/* Back face (Y-) */}
            <div
              className="cube-face cube-face-back"
              onClick={(e) => handleCubeFaceClick("back", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label back">后 (Y-)</span>
            </div>

            {/* Right face (X+) */}
            <div
              className="cube-face cube-face-right"
              onClick={(e) => handleCubeFaceClick("right", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label right">右 (X+)</span>
            </div>

            {/* Left face (X-) */}
            <div
              className="cube-face cube-face-left"
              onClick={(e) => handleCubeFaceClick("left", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label left">左 (X-)</span>
            </div>

            {/* Top face (Z+) */}
            <div
              className="cube-face cube-face-top"
              onClick={(e) => handleCubeFaceClick("top", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label top">上 (Z+)</span>
            </div>

            {/* Bottom face (Z-) */}
            <div
              className="cube-face cube-face-bottom"
              onClick={(e) => handleCubeFaceClick("bottom", e)}
              title="点击标记位置"
            >
              <div className="cube-grid" />
              <div className="cube-axis-x" />
              <div className="cube-axis-y" />
              <span className="cube-face-label bottom">下 (Z-)</span>
            </div>

            {/* Center listener position */}
            <div className="listener-position" />
            <div className="listener-head" />

            {/* Current target position (shown after guess) */}
            {showTarget && currentTrialData.target && (
              <div
                className="spatial-dot-3d spatial-dot-3d-target"
                style={{
                  ["--x" as string]: toCSSPosition(currentTrialData.target).x,
                  ["--y" as string]: toCSSPosition(currentTrialData.target).y,
                  ["--z" as string]: toCSSPosition(currentTrialData.target).z
                }}
                title="目标位置"
              />
            )}

            {/* History dots from previous trials */}
            {trials.map(
              (trial, idx) =>
                trial.userGuess &&
                idx < currentTrial && (
                  <div
                    key={trial.id}
                    className="spatial-dot-3d spatial-dot-3d-history"
                    style={{
                      ["--x" as string]: toCSSPosition(trial.userGuess).x,
                      ["--y" as string]: toCSSPosition(trial.userGuess).y,
                      ["--z" as string]: toCSSPosition(trial.userGuess).z
                    }}
                    title={`${DIMENSION_NAMES[trial.dimension]}: ${Math.round(trial.score || 0)}分`}
                  />
                )
            )}
          </div>
        </div>
      </div>
    );
  }

  // 渲染旋转控制按钮
  function renderRotationControls() {
    return (
      <div className="soundfield-rotation-controls">
        <button className="rotation-btn" onClick={() => setPresetView("front")}>正视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("back")}>后视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("left")}>左视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("right")}>右视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("top")}>俯视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("bottom")}>仰视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("iso")}>等轴测</button>
      </div>
    );
  }

  // 渲染Z轴滑块控制
  function renderZControl() {
    return (
      <div className="soundfield-z-control">
        <label>
          <span style={{ fontWeight: 600, color: "#2f855a" }}>高度 (Z)</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={tempZ}
            onChange={(e) => setTempZ(parseFloat(e.target.value))}
            disabled={!currentTarget || isPlaying}
          />
          <span className="z-value">{tempZ.toFixed(1)}</span>
        </label>
      </div>
    );
  }

  // 渲染模式选择标签
  function renderModeTabs() {
    const modes: { key: typeof mode; label: string; desc: string }[] = [
      { key: "positioning", label: "定点定位", desc: "在3D空间中标记声音来源位置" },
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

        {/* 3D 空间场景 */}
        {render3DScene()}
        {renderRotationControls()}
        {renderZControl()}

        <div className="soundfield-controls row">
          <button disabled={busy || isPlaying || !currentTarget} onClick={() => playTestTone()}>
            {isPlaying ? "播放中..." : "播放测试音"}
          </button>
        </div>

        <p className="hint">点击立方体表面标记3D位置，或拖拽旋转视角 | 使用高度滑块调整Z轴</p>
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
