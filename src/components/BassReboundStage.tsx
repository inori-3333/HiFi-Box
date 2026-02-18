import type React from "react";
import { useBassRebound } from "../bass-rebound/useBassRebound";

type BassReboundStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
};

export function BassReboundStage(props: BassReboundStageProps) {
  const { busy, setStatus, onBackHome } = props;
  const test = useBassRebound({ setStatus });
  const {
    isRunning,
    currentBpm,
    markedBpm,
    maxBpmReached,
    progress,
    volume,
    testDurationSec,
    setVolume,
    startTest,
    stopTest,
    markLimit,
    reset
  } = test;

  async function handleStart() {
    await startTest();
  }

  function handleStop() {
    stopTest();
  }

  function handleBackHome() {
    stopTest();
    onBackHome();
  }

  function handleMarkLimit() {
    markLimit();
  }

  function handleReset() {
    reset();
  }

  // 格式化BPM显示
  function formatBpm(value: number | null): string {
    if (value === null) return "未标记";
    return `${Math.round(value)} BPM`;
  }

  // 获取回弹评价
  function getReboundAssessment(bpm: number | null): string {
    if (bpm === null) return "";
    if (bpm >= 220) return "优秀 - 低频响应非常快";
    if (bpm >= 190) return "良好 - 低频响应较快";
    if (bpm >= 160) return "一般 - 低频响应中等";
    if (bpm >= 130) return "较差 - 低频偏慢";
    return "很差 - 低频响应慢";
  }

  return (
    <section className="grid">
      <div className="card bass-rebound-card">
        <h2>低频回弹测试</h2>
        <p>
          测试耳机/音箱的低频瞬态响应能力。鼓点节奏会逐渐加快（80BPM → 360BPM），
          当您感觉低音开始"糊成一团"、无法分辨单个鼓点时，点击"标记极限"。
        </p>

        <div className="row">
          <button onClick={handleBackHome}>返回首页</button>
          <button disabled={busy || isRunning} onClick={handleReset}>
            重置
          </button>
        </div>

        <label>
          鼓点音量（0.05 - 0.60）
          <input
            type="range"
            min={0.05}
            max={0.6}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number.parseFloat(e.target.value))}
            disabled={isRunning}
          />
          <span className="hint">当前音量：{volume.toFixed(2)}</span>
        </label>

        <div className="row">
          <button disabled={busy || isRunning} onClick={handleStart}>
            开始测试
          </button>
          <button disabled={busy || !isRunning} onClick={handleStop}>
            停止测试
          </button>
        </div>

        <div className="bass-rebound-live">
          <p className="hint">{isRunning ? "测试进行中" : "未开始"}</p>
          <div className="bass-rebound-bpm">{Math.round(currentBpm)} BPM</div>
          <div className="bass-rebound-progress-bar">
            <div
              className="bass-rebound-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="hint">进度: {Math.round(progress)}% | 时长: {testDurationSec}秒</p>
        </div>

        <div className="row bass-rebound-mark-row">
          <button
            className="bass-rebound-mark-btn"
            disabled={busy || !isRunning}
            onClick={handleMarkLimit}
          >
            标记极限
            <span className="mark-hint">低音开始糊了</span>
          </button>
        </div>

        <div className="bass-rebound-result">
          <p>
            标记的回弹极限: <strong>{formatBpm(markedBpm)}</strong>
          </p>
          <p>
            达到的最大BPM: <strong>{Math.round(maxBpmReached)} BPM</strong>
          </p>
          {markedBpm !== null && (
            <p className="assessment">{getReboundAssessment(markedBpm)}</p>
          )}
          <p className="hint">
            提示：建议先进行预测试熟悉节奏变化；可以多次标记，会记录为最近一次。
          </p>
        </div>
      </div>
    </section>
  );
}
