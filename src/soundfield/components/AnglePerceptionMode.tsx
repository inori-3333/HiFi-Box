import { useState } from "react";
import type { AngleState, AngleRound } from "../soundfield-core";
import { calculateAngleResults } from "../soundfield-core";

type AnglePerceptionModeProps = {
  angle: AngleState;
  isPlaying: boolean;
  onStartRound: () => void;
  onUpdateGuess: (angle: number) => void;
  onSubmitGuess: () => void;
  onReset: () => void;
};

export function AnglePerceptionMode(props: AnglePerceptionModeProps) {
  const {
    angle,
    isPlaying,
    onStartRound,
    onUpdateGuess,
    onSubmitGuess,
    onReset,
  } = props;

  const [showHint, setShowHint] = useState(true);

  const results = angle.phase === "result" && angle.rounds.length > 0
    ? calculateAngleResults(angle.rounds)
    : null;

  const getFeedback = (error: number): string => {
    if (error < 10) return "非常准确！";
    if (error < 20) return "相当准确";
    if (error < 30) return "基本正确";
    if (error < 45) return "有点偏差";
    return "偏差较大";
  };

  return (
    <div className="angle-perception-mode">
      {/* Phase indicator */}
      <div className="phase-indicator">
        {[
          { key: "idle", label: "准备" },
          { key: "playing", label: "播放" },
          { key: "selecting", label: "选择" },
          { key: "result", label: "结果" }
        ].map((phase) => (
          <div
            key={phase.key}
            className={`phase-step ${angle.phase === phase.key ? "current" : ""} ${
              angle.rounds.length > 0 || (angle.phase !== "idle" && angle.phase !== "result") ? "active" : ""
            }`}
          >
            <div className="phase-dot" />
            <span className="phase-label">{phase.label}</span>
          </div>
        ))}
      </div>

      {/* Music file hint */}
      {showHint && (
        <div className="hint-box">
          <p>
            <strong>提示：</strong>会优先读取 <code>public/audio/soundfield/manifest.json</code> 中声明的音频（支持
            <code>.mp3/.flac/.wav/.alac</code>），未找到或解码失败时自动回退为合成音。
          </p>
          <button className="close-hint" onClick={() => setShowHint(false)}>✕</button>
        </div>
      )}

      {/* Progress */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(angle.currentRound / 6) * 100}%` }}
        />
        <span className="progress-text">
          第 {angle.currentRound + (angle.phase === "result" ? 0 : 1)} / 6 轮
        </span>
      </div>

      {/* Main content */}
      <div className="angle-content">
        {angle.phase === "idle" && (
          <div className="start-section">
            <p className="instruction">
              在这个测试中，你将听到不同声场宽度的音乐。
              <br />
              请判断你感知到的声场角度大小（0°-180°）。
            </p>
            <button
              className="primary-btn large"
              onClick={onStartRound}
            >
              开始测试
            </button>
          </div>
        )}

        {angle.phase === "playing" && (
          <div className="playing-section">
            <div className="playing-animation">
              <span />
              <span />
              <span />
              <span />
            </div>
            <p>正在播放音乐，请仔细聆听...</p>
          </div>
        )}

        {(angle.phase === "selecting" || angle.phase === "result") && (
          <div className="selection-section">
            {/* Angle slider */}
            <div className="angle-slider-container">
              <div className="angle-display">
                <span className="angle-value">{angle.userGuess}°</span>
                <span className="angle-label">感知角度</span>
              </div>

              <div className="angle-slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={180}
                  step={5}
                  value={angle.userGuess}
                  onChange={(e) => onUpdateGuess(parseInt(e.target.value))}
                  disabled={angle.phase === "result"}
                  className="angle-slider"
                />
                <div className="angle-marks">
                  <span>0°</span>
                  <span>45°</span>
                  <span>90°</span>
                  <span>135°</span>
                  <span>180°</span>
                </div>
              </div>

              {/* Visual angle indicator */}
              <div className="angle-visual">
                <div
                  className="angle-arc"
                  style={{
                    width: `${(angle.userGuess / 180) * 200}px`,
                    height: `${(angle.userGuess / 180) * 100}px`,
                  }}
                />
              </div>
            </div>

            {/* Submit button */}
            {angle.phase !== "result" && (
              <button
                className="primary-btn"
                onClick={onSubmitGuess}
              >
                提交选择
              </button>
            )}

            {/* Next round button */}
            {angle.phase === "selecting" && angle.currentRound > 0 && angle.currentRound < 6 && (
              <button
                className="secondary-btn"
                onClick={onStartRound}
              >
                下一轮
              </button>
            )}
          </div>
        )}
      </div>

      {/* Round history */}
      {angle.rounds.length > 0 && (
        <div className="round-history">
          <h4>历史记录</h4>
          <table className="round-table">
            <thead>
              <tr>
                <th>轮次</th>
                <th>实际角度</th>
                <th>你的选择</th>
                <th>误差</th>
                <th>评价</th>
              </tr>
            </thead>
            <tbody>
              {angle.rounds.map((round) => (
                <tr key={round.roundNumber}>
                  <td>第{round.roundNumber}轮</td>
                  <td>{round.targetAngle}°</td>
                  <td>{round.guessAngle}°</td>
                  <td>{round.error}°</td>
                  <td className={getFeedbackClass(round.error)}>
                    {getFeedback(round.error)}
                  </td>
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
              <span className="stat-value">{results.averageError.toFixed(1)}°</span>
            </div>
            <div className="stat">
              <span className="stat-label">最大误差:</span>
              <span className="stat-value">{results.maxError}°</span>
            </div>
            <div className="stat">
              <span className="stat-label">最小误差:</span>
              <span className="stat-value">{results.minError}°</span>
            </div>
          </div>

          {/* Performance assessment */}
          <div className="assessment">
            {results.averageError < 15 ? (
              <p className="excellent">🎉 出色的角度感知能力！</p>
            ) : results.averageError < 30 ? (
              <p className="good">👍 良好的角度感知能力</p>
            ) : results.averageError < 50 ? (
              <p className="average">😐 一般的角度感知能力</p>
            ) : (
              <p className="poor">💪 建议多练习以提高角度感知</p>
            )}
          </div>

          <button className="secondary-btn" onClick={onReset}>
            重新开始
          </button>
        </div>
      )}
    </div>
  );
}

function getFeedbackClass(error: number): string {
  if (error < 10) return "excellent";
  if (error < 20) return "good";
  if (error < 30) return "average";
  if (error < 45) return "poor";
  return "bad";
}
