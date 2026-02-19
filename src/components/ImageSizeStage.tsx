import type React from "react";
import { useImageSizeTest } from "../image-size/useImageSizeTest";

type ImageSizeStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
};

export function ImageSizeStage(props: ImageSizeStageProps) {
  const { busy, setStatus, onBackHome } = props;
  const test = useImageSizeTest({ setStatus });
  const {
    phase,
    targetSize,
    userSize,
    score,
    error,
    isPlayingReference,
    isPlayingTest,
    trialCount,
    setUserSize,
    playReference,
    startTest,
    submitAnswer,
    resetTest
  } = test;

  async function handlePlayReference() {
    await playReference();
  }

  async function handleStartTest() {
    await startTest();
  }

  function handleSubmitAnswer() {
    submitAnswer();
  }

  function handleResetTest() {
    resetTest();
  }

  function handleBackHome() {
    resetTest();
    onBackHome();
  }

  // 获取结像大小的描述文字
  function getSizeDescription(size: number): string {
    if (size <= 0.15) return "很小（点状）";
    if (size <= 0.35) return "较小";
    if (size <= 0.5) return "中等";
    if (size <= 0.65) return "较大";
    if (size <= 0.85) return "很大";
    return "最大（弥漫）";
  }

  // 获取得分评价
  function getScoreAssessment(scoreValue: number | null): string {
    if (scoreValue === null) return "";
    if (scoreValue >= 95) return "完美！您对结像大小的感知非常敏锐";
    if (scoreValue >= 85) return "优秀 - 很好的结像感知能力";
    if (scoreValue >= 70) return "良好 - 结像感知能力不错";
    if (scoreValue >= 55) return "一般 - 还有提升空间";
    if (scoreValue >= 40) return "较差 - 建议多加练习";
    return "需要练习 - 结像感知能力有待提高";
  }

  // 计算进度条显示
  const sliderPercentage = Math.round(userSize * 100);

  return (
    <section className="grid">
      <div className="card image-size-card">
        <h2>空间结像大小测试</h2>
        <p>
          测试您对声音"结像大小"的感知能力。结像大小是指声音在大脑中形成的"点"的面积感，
          受音源震动面积、泛音频率衰减等因素影响。
        </p>
        <p className="hint">
          基准音为中等大小，测试音会有不同的大小。请仔细聆听，调整滑杆匹配测试音的结像大小。
        </p>

        <div className="row">
          <button onClick={handleBackHome}>返回首页</button>
          <button disabled={busy || isPlayingReference || isPlayingTest} onClick={handleResetTest}>
            重置测试
          </button>
        </div>

        {/* 控制按钮区 */}
        <div className="row image-size-controls">
          <button
            disabled={busy || isPlayingTest}
            onClick={handlePlayReference}
            className={isPlayingReference ? "active" : ""}
          >
            {isPlayingReference ? "播放中..." : "播放基准音"}
          </button>
          <button
            disabled={busy || isPlayingReference}
            onClick={handleStartTest}
            className={isPlayingTest ? "active" : ""}
          >
            {isPlayingTest ? "测试中..." : trialCount > 0 ? "开始新一轮" : "开始测试"}
          </button>
        </div>

        {/* 状态显示 */}
        <div className="image-size-status">
          <p className="hint">
            当前状态: {phase === "idle" && "等待开始"}
            {phase === "playing-reference" && "播放基准音中..."}
            {phase === "ready-for-test" && "基准音已播放，可以开始测试"}
            {phase === "playing-test" && "播放测试音中，请仔细聆听..."}
            {phase === "completed" && "测试完成"}
          </p>
          {trialCount > 0 && (
            <p className="hint">已进行轮数: {trialCount}</p>
          )}
        </div>

        {/* 滑杆控制（在播放基准音后或测试阶段显示） */}
        {(phase === "ready-for-test" || phase === "playing-test" || phase === "completed") && (
          <div className="image-size-slider-container">
            <label className="image-size-label">
              <span>结像大小</span>
              <span className="image-size-value">
                {sliderPercentage}% - {getSizeDescription(userSize)}
              </span>
            </label>
            <div className="image-size-slider-wrapper">
              <span className="slider-label">小（点状）</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={userSize}
                onChange={(e) => setUserSize(Number.parseFloat(e.target.value))}
                disabled={phase === "completed"}
                className="image-size-slider"
              />
              <span className="slider-label">大（弥漫）</span>
            </div>
            {/* 滑杆视觉指示器 */}
            <div className="image-size-visual-bar">
              <div
                className="image-size-visual-fill"
                style={{ width: `${sliderPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* 提交按钮 */}
        {(phase === "playing-test" || phase === "ready-for-test") && (
          <div className="row">
            <button
              className="image-size-submit-btn"
              disabled={busy || isPlayingTest}
              onClick={handleSubmitAnswer}
            >
              提交答案
            </button>
          </div>
        )}

        {/* 结果显示 */}
        {phase === "completed" && score !== null && (
          <div className="image-size-result">
            <div className="score-display">
              <div className="score-value">{score.toFixed(1)}</div>
              <div className="score-label">得分</div>
            </div>
            <div className="error-display">
              <p>
                误差: <strong>{(error! * 100).toFixed(1)}%</strong>
              </p>
              <p>
                您的选择: <strong>{(userSize * 100).toFixed(0)}%</strong> (
                {getSizeDescription(userSize)})
              </p>
              <p>
                正确答案: <strong>{(targetSize * 100).toFixed(0)}%</strong> (
                {getSizeDescription(targetSize)})
              </p>
            </div>
            <p className="assessment">{getScoreAssessment(score)}</p>
            <div className="row">
              <button onClick={handleResetTest}>再测一次</button>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="image-size-instructions">
          <h3>使用说明</h3>
          <ul>
            <li>点击"播放基准音"听取参考大小（中等）</li>
            <li>点击"开始测试"播放测试音</li>
            <li>调整滑杆使您选择的结像大小与测试音匹配</li>
            <li>点击"提交答案"查看得分</li>
          </ul>
          <p className="hint">
            提示：建议佩戴耳机测试，在安静环境下进行。可以多次播放基准音作为参考。
          </p>
        </div>
      </div>
    </section>
  );
}
