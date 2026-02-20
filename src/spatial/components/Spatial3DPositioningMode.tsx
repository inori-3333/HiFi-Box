import type React from "react";
import { useState, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import type { SpatialPoint } from "../spatial-core";
import { BENCHMARK_POINTS, ROUND_COLORS } from "../../soundfield/soundfield-core";

// 3D Scene constants
const CUBE_SIZE = 280;
const HALF_CUBE = CUBE_SIZE / 2;

// Generate transform style for 3D positioning
function toTransformStyle(point: SpatialPoint, extra?: CSSProperties): CSSProperties {
  const x = (point.x + 1) * HALF_CUBE;
  const y = (-point.y + 1) * HALF_CUBE;
  const z = point.z * HALF_CUBE;
  return {
    transform: `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px)`,
    ...extra
  };
}

type Phase = "idle" | "playing-benchmark" | "playing-test" | "selecting" | "submitted" | "result";

export type Spatial3DState = {
  phase: Phase;
  currentRound: number;
  userGuess: SpatialPoint;
  targetPoint: SpatialPoint | null;
  rounds: Array<{
    roundNumber: number;
    target: SpatialPoint;
    guess: SpatialPoint;
    error: number;
  }>;
};

export const initialSpatial3DState: Spatial3DState = {
  phase: "idle",
  currentRound: 0,
  userGuess: { x: 0, y: 0, z: 0 },
  targetPoint: null,
  rounds: [],
};

type Spatial3DPositioningModeProps = {
  state: Spatial3DState;
  activeBenchmarkIndex: number | null;
  isPlaying: boolean;
  totalRounds: number;
  onStartBenchmark: () => void;
  onStartRound: () => void;
  onReplayTestTone: () => void;
  onUpdateGuess: (x: number, y: number, z: number) => void;
  onSubmitGuess: () => void;
  onReset: () => void;
};

export function Spatial3DPositioningMode(props: Spatial3DPositioningModeProps) {
  const {
    state,
    activeBenchmarkIndex,
    isPlaying,
    totalRounds,
    onStartBenchmark,
    onStartRound,
    onReplayTestTone,
    onUpdateGuess,
    onSubmitGuess,
    onReset,
  } = props;

  // 3D Scene state
  const [sceneRotation, setSceneRotation] = useState({ x: -15, y: 25 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 });
  const sceneRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.cube-face')) {
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

  const setPresetView = useCallback((view: string) => {
    switch (view) {
      case 'front': setSceneRotation({ x: 0, y: 0 }); break;
      case 'back': setSceneRotation({ x: 0, y: 180 }); break;
      case 'left': setSceneRotation({ x: 0, y: 90 }); break;
      case 'right': setSceneRotation({ x: 0, y: -90 }); break;
      case 'top': setSceneRotation({ x: -90, y: 0 }); break;
      case 'bottom': setSceneRotation({ x: 90, y: 0 }); break;
      case 'iso': setSceneRotation({ x: -20, y: 45 }); break;
    }
  }, []);

  const calculateResults = () => {
    if (state.rounds.length === 0) return null;
    const errors = state.rounds.map(r => r.error);
    const averageError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const maxError = Math.max(...errors);
    const minError = Math.min(...errors);
    return { averageError, maxError, minError, totalRounds: state.rounds.length };
  };

  const results = state.phase === "result" && state.rounds.length > 0
    ? calculateResults()
    : null;

  return (
    <div className="positioning-mode">
      {/* Phase indicator */}
      <div className="phase-indicator">
        {[
          { key: "idle", label: "准备" },
          { key: "playing-benchmark", label: "基准音" },
          { key: "playing-test", label: "测试音" },
          { key: "selecting", label: "选择" },
          { key: "submitted", label: "已提交" },
          { key: "result", label: "结果" }
        ].map((phase) => {
          const isActive = state.phase === phase.key ||
            (state.phase === "playing-test" && phase.key === "selecting");
          return (
            <div
              key={phase.key}
              className={`phase-step ${isActive ? "active" : ""} ${state.phase === phase.key ? "current" : ""}`}
            >
              <div className="phase-dot" />
              <span className="phase-label">{phase.label}</span>
            </div>
          );
        })}
      </div>

      {/* 3D Scene */}
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
            {/* Cube faces */}
            <div className="cube-face cube-face-front"><span className="cube-face-label front">前 (Y+)</span></div>
            <div className="cube-face cube-face-back"><span className="cube-face-label back">后 (Y-)</span></div>
            <div className="cube-face cube-face-right"><span className="cube-face-label right">右 (X+)</span></div>
            <div className="cube-face cube-face-left"><span className="cube-face-label left">左 (X-)</span></div>
            <div className="cube-face cube-face-top"><span className="cube-face-label top">上 (Z+)</span></div>
            <div className="cube-face cube-face-bottom"><span className="cube-face-label bottom">下 (Z-)</span></div>

            {/* Center listener */}
            <div className="listener-position" />

            {/* Benchmark points - gray dots */}
            {BENCHMARK_POINTS.map(({ point, name }, idx) => (
              <div
                key={`benchmark-${idx}`}
                className={`sf-dot ref-point ${activeBenchmarkIndex === idx ? "playing" : ""}`}
                style={toTransformStyle(point)}
                title={name}
              />
            ))}

            {/* User guess - blue dot */}
            {state.phase !== "idle" && state.phase !== "playing-benchmark" && (
              <div
                className="sf-dot user-guess-dot"
                style={toTransformStyle(state.userGuess)}
                title="你的选择"
              />
            )}

            {/* Target point - only shown after submission or in results */}
            {(state.phase === "submitted" || state.phase === "result") && state.targetPoint && (
              <div
                className="sf-dot target-dot"
                style={toTransformStyle(state.targetPoint)}
                title="目标位置"
              />
            )}

            {/* Round history */}
            {state.rounds.map((round) => (
              <div
                key={`round-${round.roundNumber}`}
                className="sf-dot round-history-dot"
                style={toTransformStyle(round.guess, {
                  "--round-color": ROUND_COLORS[(round.roundNumber - 1) % ROUND_COLORS.length]
                } as CSSProperties)}
                title={`第${round.roundNumber}轮: 误差${round.error.toFixed(3)}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Rotation controls */}
      <div className="soundfield-rotation-controls">
        <button className="rotation-btn" onClick={() => setPresetView("front")}>正视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("back")}>后视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("left")}>左视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("right")}>右视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("top")}>俯视图</button>
        <button className="rotation-btn" onClick={() => setPresetView("iso")}>等轴测</button>
      </div>

      {/* XYZ Sliders */}
      {state.phase !== "idle" && state.phase !== "playing-benchmark" && state.phase !== "result" && (
        <div className="soundfield-xyz-controls">
          <div className="axis-slider-row">
            <span className="axis-label x">X (左右)</span>
            <div className="axis-slider-wrapper">
              <span className="axis-min">-1</span>
              <input
                type="range"
                className="axis-slider x-axis"
                min={-1}
                max={1}
                step={0.05}
                value={state.userGuess.x}
                onChange={(e) => onUpdateGuess(parseFloat(e.target.value), state.userGuess.y, state.userGuess.z)}
                disabled={state.phase !== "selecting"}
              />
              <span className="axis-max">+1</span>
            </div>
            <span className="axis-value">{state.userGuess.x.toFixed(2)}</span>
          </div>

          <div className="axis-slider-row">
            <span className="axis-label y">Y (前后)</span>
            <div className="axis-slider-wrapper">
              <span className="axis-min">-1</span>
              <input
                type="range"
                className="axis-slider y-axis"
                min={-1}
                max={1}
                step={0.05}
                value={state.userGuess.y}
                onChange={(e) => onUpdateGuess(state.userGuess.x, parseFloat(e.target.value), state.userGuess.z)}
                disabled={state.phase !== "selecting"}
              />
              <span className="axis-max">+1</span>
            </div>
            <span className="axis-value">{state.userGuess.y.toFixed(2)}</span>
          </div>

          <div className="axis-slider-row">
            <span className="axis-label z">Z (上下)</span>
            <div className="axis-slider-wrapper">
              <span className="axis-min">-1</span>
              <input
                type="range"
                className="axis-slider z-axis"
                min={-1}
                max={1}
                step={0.05}
                value={state.userGuess.z}
                onChange={(e) => onUpdateGuess(state.userGuess.x, state.userGuess.y, parseFloat(e.target.value))}
                disabled={state.phase !== "selecting"}
              />
              <span className="axis-max">+1</span>
            </div>
            <span className="axis-value">{state.userGuess.z.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div className="control-buttons">
        {state.phase === "idle" && (
          <button
            className="primary-btn"
            disabled={isPlaying}
            onClick={onStartBenchmark}
          >
            {isPlaying && activeBenchmarkIndex !== null ? "播放基准音中..." : "播放基准音"}
          </button>
        )}

        {state.phase === "selecting" && (
          <>
            {!state.targetPoint ? (
              <button
                className="primary-btn"
                onClick={onStartRound}
              >
                开始测试
              </button>
            ) : (
              <>
                <button
                  className="primary-btn"
                  onClick={onSubmitGuess}
                >
                  提交
                </button>
                <button
                  className="secondary-btn"
                  onClick={onReplayTestTone}
                  disabled={isPlaying}
                >
                  {isPlaying ? "播放中..." : "重播测试音"}
                </button>
                {state.currentRound > 0 && (
                  <button
                    className="secondary-btn"
                    onClick={onStartRound}
                  >
                    跳过/下一轮
                  </button>
                )}
              </>
            )}
          </>
        )}

        {state.phase === "playing-test" && (
          <button className="primary-btn" disabled>
            播放中...
          </button>
        )}

        {state.phase === "submitted" && (
          <button
            className="primary-btn"
            onClick={onStartRound}
          >
            下一题
          </button>
        )}

        {state.phase === "result" && (
          <button className="secondary-btn" onClick={onReset}>
            重新开始
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="progress-indicator">
        进度: {state.currentRound} / {totalRounds} 轮
      </div>

      {/* Round history table */}
      {state.rounds.length > 0 && (
        <div className="round-history">
          <h4>历史记录</h4>
          <table className="round-table">
            <thead>
              <tr>
                <th>轮次</th>
                <th>目标位置</th>
                <th>你的选择</th>
                <th>误差</th>
              </tr>
            </thead>
            <tbody>
              {state.rounds.map((round) => (
                <tr key={round.roundNumber}>
                  <td style={{ color: ROUND_COLORS[(round.roundNumber - 1) % ROUND_COLORS.length] }}>
                    第{round.roundNumber}轮
                  </td>
                  <td>({round.target.x.toFixed(2)}, {round.target.y.toFixed(2)}, {round.target.z.toFixed(2)})</td>
                  <td>({round.guess.x.toFixed(2)}, {round.guess.y.toFixed(2)}, {round.guess.z.toFixed(2)})</td>
                  <td>{round.error.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="results-section">
          <h4>测试结果</h4>
          <div className="result-stats">
            <div className="stat">
              <span className="stat-label">平均误差:</span>
              <span className="stat-value">{results.averageError.toFixed(3)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">最大误差:</span>
              <span className="stat-value">{results.maxError.toFixed(3)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">最小误差:</span>
              <span className="stat-value">{results.minError.toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="legend">
        <div className="legend-item">
          <span className="legend-dot benchmark" />
          <span>基准点</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot user" />
          <span>你的选择</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot target" />
          <span>目标位置</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot active" />
          <span>当前播放</span>
        </div>
      </div>
    </div>
  );
}
