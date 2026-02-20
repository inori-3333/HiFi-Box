import { useState } from "react";
import type { ABXState } from "../soundfield-core";
import { calculateABXResults } from "../soundfield-core";

const ABX_TRIALS = 8;

type ABXModeProps = {
  abx: ABXState;
  isPlaying: boolean;
  onPlayVersion: (version: "a" | "b" | "x") => void;
  onSubmitChoice: (choice: "a" | "b") => void;
  onReset: () => void;
};

export function ABXMode(props: ABXModeProps) {
  const { abx, isPlaying, onPlayVersion, onSubmitChoice, onReset } = props;

  const [showHint, setShowHint] = useState(true);
  const [lastPlayed, setLastPlayed] = useState<"a" | "b" | "x" | null>(null);

  const results = abx.phase === "result" && abx.trials.length > 0
    ? calculateABXResults(abx.trials)
    : null;

  const currentTrial = abx.trials[abx.currentTrial];

  const handlePlayVersion = (version: "a" | "b" | "x") => {
    setLastPlayed(version);
    onPlayVersion(version);
  };

  return (
    <div className="abx-mode">
      {/* Progress */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(abx.currentTrial / ABX_TRIALS) * 100}%` }}
        />
        <span className="progress-text">
          第 {abx.currentTrial + (abx.phase === "result" ? 0 : 1)} / {ABX_TRIALS} 轮
        </span>
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

      {/* Main content */}
      <div className="abx-content">
        {abx.phase === "idle" && (
          <div className="start-section">
            <p className="instruction">
              在这个测试中，你需要进行标准 ABX 判断。
              <br />
              A 与 B 声场开角不同，请判断 X 属于 A 还是 B。
            </p>
            <button
              className="primary-btn large"
              onClick={() => setShowHint(false)}
            >
              准备开始
            </button>
          </div>
        )}

        {abx.phase !== "idle" && abx.phase !== "result" && currentTrial && (
          <>
            {/* Playback controls */}
            <div className="playback-section">
              <h4>播放控制</h4>
              <div className="abx-buttons">
                <button
                  className={`abx-play-btn ${lastPlayed === "a" ? "last-played" : ""}`}
                  onClick={() => handlePlayVersion("a")}
                  disabled={isPlaying}
                >
                  <span className="version-label">A</span>
                  <span className="play-icon">▶</span>
                  <span className="play-text">{isPlaying ? "播放中..." : "播放"}</span>
                </button>

                <button
                  className={`abx-play-btn ${lastPlayed === "b" ? "last-played" : ""}`}
                  onClick={() => handlePlayVersion("b")}
                  disabled={isPlaying}
                >
                  <span className="version-label">B</span>
                  <span className="play-icon">▶</span>
                  <span className="play-text">{isPlaying ? "播放中..." : "播放"}</span>
                </button>
                <button
                  className={`abx-play-btn ${lastPlayed === "x" ? "last-played" : ""}`}
                  onClick={() => handlePlayVersion("x")}
                  disabled={isPlaying}
                >
                  <span className="version-label">X</span>
                  <span className="play-icon">▶</span>
                  <span className="play-text">{isPlaying ? "播放中..." : "播放"}</span>
                </button>
              </div>

              {lastPlayed && (
                <p className="last-played-hint">
                  上次播放: 版本 {lastPlayed.toUpperCase()}
                </p>
              )}
            </div>

            {/* Selection */}
            <div className="selection-section">
              <h4>X 属于 A 还是 B？</h4>
              <div className="choice-buttons">
                <button
                  className="choice-btn"
                  onClick={() => onSubmitChoice("a")}
                  disabled={isPlaying}
                >
                  选 X = A
                </button>
                <button
                  className="choice-btn"
                  onClick={() => onSubmitChoice("b")}
                  disabled={isPlaying}
                >
                  选 X = B
                </button>
              </div>
            </div>

            {/* Tips */}
            <div className="abx-tips">
              <p className="tip">
                💡 提示：可反复播放 A/B/X；先建立 A、B 参照，再判断 X
              </p>
            </div>
          </>
        )}

        {abx.phase === "result" && results && (
          <div className="results-section">
            <h3>测试完成！</h3>

            <div className="accuracy-display">
              <div className="accuracy-circle">
                <span className="accuracy-value">{results.accuracy.toFixed(0)}%</span>
                <span className="accuracy-label">正确率</span>
              </div>
            </div>

            <div className="result-stats">
              <div className="stat">
                <span className="stat-label">正确次数:</span>
                <span className="stat-value">{results.correctCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">总次数:</span>
                <span className="stat-value">{results.totalTrials}</span>
              </div>
              <div className="stat">
                <span className="stat-label">p-value:</span>
                <span className="stat-value">{results.pValue.toFixed(4)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">d':</span>
                <span className="stat-value">{results.dPrime.toFixed(2)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">显著性:</span>
                <span className="stat-value">{results.significant ? "显著 (p<0.05)" : "未显著"}</span>
              </div>
            </div>

            {/* Assessment */}
            <div className="assessment">
              {results.accuracy >= 80 ? (
                <p className="excellent">🎉 出色的辨别能力！你对声场差异非常敏感</p>
              ) : results.accuracy >= 60 ? (
                <p className="good">👍 良好的辨别能力，能够区分大部分声场差异</p>
              ) : results.accuracy >= 40 ? (
                <p className="average">😐 一般的辨别能力，有些声场差异较难察觉</p>
              ) : (
                <p className="poor">💪 辨别能力有待提高，建议多练习</p>
              )}
            </div>

            <button className="secondary-btn" onClick={onReset}>
              重新开始
            </button>
          </div>
        )}
      </div>

      {/* Trial history */}
      {abx.trials.length > 0 && (
        <div className="trial-history">
          <h4>测试记录</h4>
          <table className="trial-table">
            <thead>
              <tr>
                <th>轮次</th>
                <th>A开角</th>
                <th>B开角</th>
                <th>X来源</th>
                <th>你的选择</th>
                <th>线索差值</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {abx.trials.map((trial) => (
                <tr
                  key={trial.trialNumber}
                  className={trial.userChoice ? (trial.correct ? "correct" : "incorrect") : ""}
                >
                  <td>第{trial.trialNumber}轮</td>
                  <td>{trial.aOpeningAngleDeg.toFixed(0)}°</td>
                  <td>{trial.bOpeningAngleDeg.toFixed(0)}°</td>
                  <td>{trial.xRef.toUpperCase()}</td>
                  <td>{trial.userChoice?.toUpperCase() || "-"}</td>
                  <td>{trial.cueDistanceDeg.toFixed(1)}°</td>
                  <td>
                    {trial.userChoice ? (
                      trial.correct ? "✓" : "✗"
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
