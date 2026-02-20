import { useState } from "react";
import type { ABXState, ABXTrial } from "../soundfield-core";
import { calculateABXResults } from "../soundfield-core";

type ABXModeProps = {
  abx: ABXState;
  isPlaying: boolean;
  onPlayVersion: (version: "a" | "b") => void;
  onSubmitChoice: (choice: "a" | "b") => void;
  onReset: () => void;
};

export function ABXMode(props: ABXModeProps) {
  const { abx, isPlaying, onPlayVersion, onSubmitChoice, onReset } = props;

  const [showHint, setShowHint] = useState(true);
  const [lastPlayed, setLastPlayed] = useState<"a" | "b" | null>(null);

  const results = abx.phase === "result" && abx.trials.length > 0
    ? calculateABXResults(abx.trials)
    : null;

  const currentTrial = abx.trials[abx.currentTrial];

  const handlePlayVersion = (version: "a" | "b") => {
    setLastPlayed(version);
    onPlayVersion(version);
  };

  return (
    <div className="abx-mode">
      {/* Progress */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(abx.currentTrial / 6) * 100}%` }}
        />
        <span className="progress-text">
          第 {abx.currentTrial + (abx.phase === "result" ? 0 : 1)} / 6 轮
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
              在这个测试中，你需要辨别哪个版本的声场更开阔。
              <br />
              A和B是同一段音乐，但声场宽度不同。
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
              </div>

              {lastPlayed && (
                <p className="last-played-hint">
                  上次播放: 版本 {lastPlayed.toUpperCase()}
                </p>
              )}
            </div>

            {/* Selection */}
            <div className="selection-section">
              <h4>哪个版本的声场更开阔？</h4>
              <div className="choice-buttons">
                <button
                  className="choice-btn"
                  onClick={() => onSubmitChoice("a")}
                  disabled={isPlaying}
                >
                  选 A (更开阔)
                </button>
                <button
                  className="choice-btn"
                  onClick={() => onSubmitChoice("b")}
                  disabled={isPlaying}
                >
                  选 B (更开阔)
                </button>
              </div>
            </div>

            {/* Tips */}
            <div className="abx-tips">
              <p className="tip">
                💡 提示：可以多次切换播放A和B，仔细比较两者的差异
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
                <th>正确答案是</th>
                <th>你的选择</th>
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
                  <td>{trial.aIsWider ? "A" : "B"}</td>
                  <td>{trial.userChoice?.toUpperCase() || "-"}</td>
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
