import type { TestMode } from "../soundfield-core";
import { useSoundField } from "../useSoundField";
import { PositioningMode } from "./PositioningMode";
import { AnglePerceptionMode } from "./AnglePerceptionMode";
import { ABXMode } from "./ABXMode";

type SoundFieldStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
};

export function SoundFieldStage(props: SoundFieldStageProps) {
  const { busy, setStatus, onBackHome } = props;

  const controller = useSoundField({ setStatus });
  const {
    mode,
    setMode,
    volume,
    setVolume,
    isPlaying,
    activeBenchmarkIndex,

    positioning,
    startBenchmarkPlayback,
    startPositioningRound,
    replayPositioningTestTone,
    updatePositioningGuess,
    submitPositioningGuess,
    resetPositioning,

    angle,
    startAngleRound,
    updateAngleGuess,
    submitAngleGuess,
    resetAngle,

    abx,
    playABXVersion,
    submitABXChoice,
    resetABX,

    reset,
  } = controller;

  const handleBackHome = () => {
    reset();
    onBackHome();
  };

  const handleModeChange = (newMode: TestMode) => {
    reset();
    setMode(newMode);
  };

  return (
    <section className="grid">
      <div className="card soundfield-card">
        <h2>声场测试</h2>
        <p>评估耳机空间声场表现，包括定点定位、对称开角感知和标准 ABX（A/B/X）三种模式。</p>

        {/* Back button */}
        <div className="row">
          <button onClick={handleBackHome}>返回首页</button>
          <button disabled={busy || isPlaying} onClick={reset}>
            重置
          </button>
        </div>

        {/* Mode tabs */}
        <div className="soundfield-mode-tabs">
          {[
            { key: "positioning", label: "定点定位", desc: "在3D空间中标记声音位置" },
            { key: "angle", label: "角度感知", desc: "判断左右对称声场开角（0°-180°）" },
            { key: "abx", label: "ABX测试", desc: "播放 A/B/X，判断 X 属于 A 还是 B" },
          ].map((m) => (
            <button
              key={m.key}
              className={`soundfield-mode-tab ${mode === m.key ? "active" : ""}`}
              onClick={() => handleModeChange(m.key as TestMode)}
              disabled={isPlaying}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Volume control */}
        <label className="volume-control" style={{ marginTop: 16 }}>
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

        {/* Mode-specific content */}
        <div className="mode-content" style={{ marginTop: 24 }}>
          {mode === "positioning" && (
            <PositioningMode
              positioning={positioning}
              activeBenchmarkIndex={activeBenchmarkIndex}
              isPlaying={isPlaying}
              onStartBenchmark={startBenchmarkPlayback}
              onStartRound={startPositioningRound}
              onReplayTestTone={replayPositioningTestTone}
              onUpdateGuess={updatePositioningGuess}
              onSubmitGuess={submitPositioningGuess}
              onReset={resetPositioning}
            />
          )}

          {mode === "angle" && (
            <AnglePerceptionMode
              angle={angle}
              isPlaying={isPlaying}
              onStartRound={startAngleRound}
              onUpdateGuess={updateAngleGuess}
              onSubmitGuess={submitAngleGuess}
              onReset={resetAngle}
            />
          )}

          {mode === "abx" && (
            <ABXMode
              abx={abx}
              isPlaying={isPlaying}
              onPlayVersion={playABXVersion}
              onSubmitChoice={submitABXChoice}
              onReset={resetABX}
            />
          )}
        </div>
      </div>

      <style>{`
        /* SoundField specific styles */
        .soundfield-card {
          max-width: 900px;
        }

        .soundfield-mode-tabs {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 8px;
        }

        .soundfield-mode-tab {
          padding: 10px 20px;
          border: none;
          background: #f7fafc;
          border-radius: 8px 8px 0 0;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .soundfield-mode-tab:hover:not(:disabled) {
          background: #edf2f7;
        }

        .soundfield-mode-tab.active {
          background: var(--primary, #2f7142);
          color: white;
        }

        .soundfield-mode-tab:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .volume-control {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .volume-control input {
          width: 100%;
        }

        /* Common component styles */
        .phase-indicator {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-bottom: 20px;
          padding: 12px;
          background: #f7fafc;
          border-radius: 8px;
        }

        .phase-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          opacity: 0.4;
          transition: opacity 0.3s;
        }

        .phase-step.active,
        .phase-step.current {
          opacity: 1;
        }

        .phase-step.current .phase-dot {
          background: var(--primary, #2f7142);
          transform: scale(1.2);
        }

        .phase-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #a0aec0;
          transition: all 0.3s;
        }

        .phase-label {
          font-size: 12px;
          color: #4a5568;
        }

        .progress-bar {
          position: relative;
          height: 24px;
          background: #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .progress-fill {
          height: 100%;
          background: var(--primary, #2f7142);
          transition: width 0.3s ease;
        }

        .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12px;
          font-weight: 600;
          color: #2d3748;
        }

        .control-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin: 20px 0;
          flex-wrap: wrap;
        }

        .primary-btn {
          padding: 12px 24px;
          background: var(--primary, #2f7142);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .primary-btn:hover:not(:disabled) {
          background: #276636;
        }

        .primary-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .primary-btn.large {
          padding: 16px 32px;
          font-size: 16px;
        }

        .secondary-btn {
          padding: 12px 24px;
          background: #e2e8f0;
          color: #2d3748;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .secondary-btn:hover {
          background: #cbd5e0;
        }

        /* Results and history */
        .results-section {
          background: #f7fafc;
          border-radius: 12px;
          padding: 20px;
          margin-top: 20px;
        }

        .results-section h4 {
          margin-top: 0;
          color: #2d3748;
        }

        .result-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
          margin: 16px 0;
        }

        .stat {
          text-align: center;
          padding: 12px;
          background: white;
          border-radius: 8px;
        }

        .stat-label {
          display: block;
          font-size: 12px;
          color: #718096;
          margin-bottom: 4px;
        }

        .stat-value {
          display: block;
          font-size: 24px;
          font-weight: 700;
          color: #2d3748;
        }

        .round-table,
        .trial-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
          font-size: 14px;
        }

        .round-table th,
        .round-table td,
        .trial-table th,
        .trial-table td {
          padding: 10px;
          text-align: center;
          border-bottom: 1px solid #e2e8f0;
        }

        .round-table th,
        .trial-table th {
          background: #edf2f7;
          font-weight: 600;
          color: #4a5568;
        }

        .trial-table tr.correct {
          background: #c6f6d5;
        }

        .trial-table tr.incorrect {
          background: #fed7d7;
        }

        .assessment {
          margin: 20px 0;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
          font-weight: 600;
        }

        .assessment .excellent {
          color: #276749;
          background: #c6f6d5;
        }

        .assessment .good {
          color: #2c5282;
          background: #bee3f8;
        }

        .assessment .average {
          color: #744210;
          background: #fefcbf;
        }

        .assessment .poor {
          color: #c53030;
          background: #fed7d7;
        }

        .excellent { color: #276749; }
        .good { color: #2c5282; }
        .average { color: #744210; }
        .poor { color: #c53030; }
        .bad { color: #742a2a; }

        /* Hint box */
        .hint-box {
          position: relative;
          background: #ebf8ff;
          border-left: 4px solid #4299e1;
          padding: 12px 16px;
          margin-bottom: 16px;
          border-radius: 0 8px 8px 0;
        }

        .hint-box code {
          background: #bee3f8;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
        }

        .close-hint {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          opacity: 0.5;
        }

        .close-hint:hover {
          opacity: 1;
        }

        /* Animation for playing */
        .playing-animation {
          display: flex;
          gap: 4px;
          justify-content: center;
          margin: 20px 0;
        }

        .playing-animation span {
          width: 8px;
          height: 24px;
          background: var(--primary, #2f7142);
          animation: sound 1s ease-in-out infinite;
        }

        .playing-animation span:nth-child(1) { animation-delay: 0s; }
        .playing-animation span:nth-child(2) { animation-delay: 0.1s; }
        .playing-animation span:nth-child(3) { animation-delay: 0.2s; }
        .playing-animation span:nth-child(4) { animation-delay: 0.3s; }

        @keyframes sound {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }

        /* Additional styles for new soundfield components */
        /* Base dot style - must use transform-style to work in 3D */
        .sf-dot {
          position: absolute;
          transform-style: preserve-3d;
          pointer-events: none;
        }

        .user-guess-dot {
          width: 16px;
          height: 16px;
          background: #2196f3;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(33, 150, 243, 0.6);
          z-index: 10;
        }

        .target-dot {
          width: 16px;
          height: 16px;
          background: #f44336;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(244, 67, 54, 0.6);
          z-index: 10;
        }

        .ref-point {
          width: 10px;
          height: 10px;
          background: #9e9e9e;
          border-radius: 50%;
          opacity: 0.5;
          transition: all 0.2s;
        }

        .ref-point.playing {
          background: #ffeb3b;
          box-shadow: 0 0 20px rgba(255, 235, 59, 0.9), 0 0 40px rgba(255, 235, 59, 0.5);
          opacity: 1;
          width: 14px;
          height: 14px;
        }

        .round-history-dot {
          width: 10px;
          height: 10px;
          background: var(--round-color, #9e9e9e);
          border-radius: 50%;
          opacity: 0.6;
        }

        /* ABX specific styles */
        .abx-play-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 40px;
          background: #f7fafc;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .abx-play-btn:hover:not(:disabled) {
          background: #edf2f7;
          border-color: #cbd5e0;
        }

        .abx-play-btn.last-played {
          border-color: var(--primary, #2f7142);
          background: #f0fff4;
        }

        .abx-play-btn .version-label {
          font-size: 24px;
          font-weight: 700;
          color: #2d3748;
        }

        .abx-play-btn .play-icon {
          font-size: 20px;
          color: var(--primary, #2f7142);
          margin-top: 8px;
        }

        .choice-buttons {
          display: flex;
          gap: 20px;
          justify-content: center;
          margin-top: 20px;
        }

        .choice-btn {
          padding: 16px 32px;
          font-size: 16px;
          background: var(--primary, #2f7142);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }

        .choice-btn:hover:not(:disabled) {
          background: #276636;
        }

        .accuracy-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
          color: white;
        }

        .accuracy-value {
          font-size: 36px;
          font-weight: 700;
        }

        .accuracy-label {
          font-size: 12px;
          opacity: 0.9;
        }

        /* Angle perception styles */
        .angle-slider-container {
          margin: 24px 0;
          padding: 24px;
          background: #f7fafc;
          border-radius: 12px;
        }

        .angle-display {
          text-align: center;
          margin-bottom: 16px;
        }

        .angle-value {
          display: block;
          font-size: 48px;
          font-weight: 700;
          color: var(--primary, #2f7142);
        }

        .angle-label {
          font-size: 14px;
          color: #718096;
        }

        .angle-slider-wrapper {
          margin: 16px 0;
        }

        .angle-slider {
          width: 100%;
          height: 10px;
          background: #e2e8f0;
          border-radius: 5px;
          outline: none;
          -webkit-appearance: none;
        }

        .angle-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 24px;
          background: var(--primary, #2f7142);
          border-radius: 50%;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }

        .angle-marks {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 12px;
          color: #718096;
        }

        .angle-visual {
          margin-top: 24px;
          display: flex;
          justify-content: center;
        }

        .angle-arc {
          height: 100px;
          background: linear-gradient(to bottom, rgba(47, 113, 66, 0.3), rgba(47, 113, 66, 0.1));
          border-radius: 100px 100px 0 0;
          border-top: 3px solid var(--primary, #2f7142);
          border-left: 3px solid var(--primary, #2f7142);
          border-right: 3px solid var(--primary, #2f7142);
          transition: all 0.3s ease;
        }

        .instruction {
          text-align: center;
          color: #4a5568;
          margin-bottom: 24px;
        }

        .legend {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 16px;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #4a5568;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .legend-dot.benchmark {
          background: #9e9e9e;
          opacity: 0.5;
        }

        .legend-dot.user {
          background: #2196f3;
        }

        .legend-dot.target {
          background: #f44336;
        }

        .legend-dot.active {
          background: #ffeb3b;
        }
      `}</style>
    </section>
  );
}
