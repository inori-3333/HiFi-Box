import type React from "react";
import { useHearingSweep } from "../sweep/useHearingSweep";

type HearingSweepStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
};

function formatHz(value: number | null): string {
  if (value === null) {
    return "未记录";
  }
  return `${value} Hz`;
}

export function HearingSweepStage(props: HearingSweepStageProps) {
  const { busy, setStatus, onBackHome } = props;
  const sweep = useHearingSweep({ setStatus });
  const {
    isRunning,
    currentFrequencyHz,
    capturedMinHz,
    capturedMaxHz,
    volume,
    setVolume,
    startSweep,
    replaySweep,
    stopSweep,
    captureMin,
    captureMax
  } = sweep;

  const spanHz = capturedMinHz !== null && capturedMaxHz !== null ? Math.max(0, capturedMaxHz - capturedMinHz) : null;

  async function handleStart() {
    await startSweep();
  }

  async function handleReplay() {
    await replaySweep();
  }

  function handleBackHome() {
    stopSweep();
    onBackHome();
  }

  return (
    <section className="grid">
      <div className="card hearing-sweep-card">
        <h2>扫频可听范围测试</h2>
        <p>从 15Hz 平滑扫到 20500Hz（20秒）。播放中点击按钮记录最低/最高可听频率。</p>
        <div className="row">
          <button onClick={handleBackHome}>返回首页</button>
        </div>

        <label>
          扫频音量（0.01 - 0.40）
          <input
            type="range"
            min={0.01}
            max={0.4}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number.parseFloat(e.target.value))}
          />
          <span className="hint">当前音量：{volume.toFixed(2)}</span>
        </label>

        <div className="row">
          <button disabled={busy || isRunning} onClick={handleStart}>
            开始扫频
          </button>
          <button disabled={busy || isRunning} onClick={handleReplay}>
            重播
          </button>
        </div>

        <div className="hearing-sweep-live">
          <p className="hint">{isRunning ? "扫频进行中" : "未播放"}</p>
          <div className="hearing-sweep-frequency">{Math.round(currentFrequencyHz)} Hz</div>
        </div>

        <div className="row">
          <button disabled={busy || !isRunning} onClick={captureMin}>
            记录最低可听频率
          </button>
          <button disabled={busy || !isRunning} onClick={captureMax}>
            记录最高可听频率
          </button>
        </div>

        <div className="hearing-sweep-result">
          <p>
            最低可听频率: <strong>{formatHz(capturedMinHz)}</strong>
          </p>
          <p>
            最高可听频率: <strong>{formatHz(capturedMaxHz)}</strong>
          </p>
          <p>
            可听跨度: <strong>{spanHz === null ? "未记录" : `${spanHz} Hz`}</strong>
          </p>
          <p className="hint">提示：建议先记录最低，再记录最高；多次点击会覆盖为最近一次记录。</p>
        </div>
      </div>
    </section>
  );
}

