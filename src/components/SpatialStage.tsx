import type React from "react";
import { clamp01ToSigned, planePointToPercent, SPATIAL_TRIAL_COUNT } from "../spatial/spatial-core";
import type { SpatialPlane, SpatialPoint } from "../spatial/spatial-core";
import type { SpatialTestController } from "../spatial/useSpatialTest";
import { Spatial3DPositioningMode } from "../spatial/components/Spatial3DPositioningMode";

const timbreNames = ["鼓点声", "军鼓声", "镲片声", "扫弦声", "桶鼓声", "拍手声", "铃铛声", "拨弦声"];

type SpatialStageProps = {
  busy: boolean;
  onBackHome: () => void;
  spatial: SpatialTestController;
};

type PlaneFigureProps = {
  title: string;
  plane: SpatialPlane;
  userPoint?: SpatialPoint;
  targetPoint?: SpatialPoint;
  baselinePoint?: SpatialPoint;
  compact?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

type ArenaFigureProps = {
  userPoint?: SpatialPoint;
  targetPoint?: SpatialPoint;
  baselinePoint?: SpatialPoint;
  compact?: boolean;
  speakerMode?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

function formatPoint(point: SpatialPoint | undefined): string {
  if (!point) {
    return "-";
  }
  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;
}

function arenaPointToPercent(point: SpatialPoint): { left: string; top: string } {
  return {
    left: `${((point.x + 1) / 2) * 100}%`,
    top: `${(1 - (point.y + 1) / 2) * 100}%`
  };
}

function PlaneFigure(props: PlaneFigureProps) {
  const { title, plane, userPoint, targetPoint, baselinePoint, compact = false, onClick } = props;

  return (
    <div className={`plane-wrap${compact ? " plane-wrap-compact" : ""}`}>
      <p className="plane-title">{title}</p>
      <div className={`cartesian-plane${onClick ? "" : " spatial-static-view"}`} onClick={onClick}>
        <div className="plane-axis-x" />
        <div className="plane-axis-y" />
        {targetPoint && <div className="spatial-dot spatial-target" style={planePointToPercent(targetPoint, plane)} />}
        {userPoint && <div className="spatial-dot spatial-user" style={planePointToPercent(userPoint, plane)} />}
        {baselinePoint && <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, plane)} />}
      </div>
    </div>
  );
}

function ArenaFigure(props: ArenaFigureProps) {
  const { userPoint, targetPoint, baselinePoint, compact = false, speakerMode = false, onClick } = props;

  return (
    <div
      className={`spatial-arena2d${compact ? " spatial-arena2d-compact" : ""}${speakerMode ? " spatial-arena2d-speaker" : ""}${onClick ? "" : " spatial-static-view"}`}
      onClick={onClick}
    >
      {speakerMode && <div className="speaker-upper-mask" />}
      {speakerMode && <div className="speaker-divider" />}
      <div className="spatial-self-2d" />
      {targetPoint && <div className="spatial-dot spatial-target" style={arenaPointToPercent(targetPoint)} />}
      {userPoint && <div className="spatial-dot spatial-user" style={arenaPointToPercent(userPoint)} />}
      {baselinePoint && <div className="spatial-dot spatial-baseline" style={arenaPointToPercent(baselinePoint)} />}
      {speakerMode && <div className="speaker-mode-tag">音响模式: 仅第1/2象限</div>}
    </div>
  );
}

export function SpatialStage(props: SpatialStageProps) {
  const { busy, onBackHome, spatial } = props;
  const {
    phase,
    spatialTrials,
    spatialIndex,
    spatialGuess,
    spatialMode,
    speakerMode2d,
    selectedTimbreId,
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    completedSpatialTrials,
    spatialAverageScore,
    spatialAverageBreakdown,
    canGoPrevious,
    // 3D定点定位模式
    positioning3D,
    startPositioning3DBenchmark,
    startPositioning3DRound,
    replayPositioning3DTestTone,
    updatePositioning3DGuess,
    submitPositioning3DGuess,
    resetPositioning3D,
    // 原有方法
    setSpatialGuess,
    setSelectedTimbreId,
    setSpeakerMode2d,
    startAnswering,
    playSpatialCue,
    playBaselineSweep,
    selectAndReplayBaselinePoint,
    submitSpatialGuess,
    goToPreviousTrial,
    resetSpatialGuess
  } = spatial;

  const isTesting = phase === "testing";
  const isPretest = phase === "pretest";
  const isCompleted = phase === "completed";

  function makePointFromPlaneClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane, source: SpatialPoint | null): SpatialPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const horizontal = clamp01ToSigned(px * 2 - 1);
    const vertical = clamp01ToSigned((1 - py) * 2 - 1);
    const base = source ?? { x: 0, y: 0, z: 0 };
    if (plane === "xy") {
      return { ...base, x: horizontal, y: vertical };
    }
    if (plane === "xz") {
      return { ...base, x: horizontal, z: vertical };
    }
    return { ...base, z: horizontal, y: vertical };
  }

  function handleSpatialPlaneClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane) {
    if (!isTesting || !currentSpatialTrial) {
      return;
    }
    const next = makePointFromPlaneClick(event, plane, spatialGuess);
    setSpatialGuess(next);
  }

  function handlePretestPlaneReplayClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane) {
    if (!isPretest || baselineRunning) {
      return;
    }
    const next = makePointFromPlaneClick(event, plane, baselinePoint);
    selectAndReplayBaselinePoint(next);
  }

  function handleSpatialArena2DClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const x = clamp01ToSigned(px * 2 - 1);
    let y = clamp01ToSigned((1 - py) * 2 - 1);
    if (speakerMode2d) {
      y = Math.max(0, y);
    }

    if (isTesting && currentSpatialTrial) {
      setSpatialGuess(() => ({ x, y, z: 0 }));
      return;
    }

    if (isPretest && !baselineRunning) {
      selectAndReplayBaselinePoint({ x, y, z: 0 });
    }
  }

  // 3D模式下使用新的定点定位组件
  if (spatialMode === "3d") {
    return (
      <section className="grid">
        <div className="card">
          <h2>空间结像测试（3D）</h2>
          <div className="row">
            <button onClick={onBackHome}>返回首页</button>
          </div>
          <Spatial3DPositioningMode
            state={positioning3D}
            activeBenchmarkIndex={positioning3D.activeBenchmarkIndex}
            isPlaying={positioning3D.isPlaying}
            totalRounds={spatialTrials.length || SPATIAL_TRIAL_COUNT}
            onStartBenchmark={startPositioning3DBenchmark}
            onStartRound={startPositioning3DRound}
            onReplayTestTone={replayPositioning3DTestTone}
            onUpdateGuess={updatePositioning3DGuess}
            onSubmitGuess={submitPositioning3DGuess}
            onReset={resetPositioning3D}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <div className="card">
        <h2>空间结像测试（2D）</h2>
        <div className="row">
          <button onClick={onBackHome}>返回首页</button>
        </div>

        {isPretest && (
          <>
            <label>
              基准音色（1-8）
              <select
                value={selectedTimbreId}
                disabled={busy || baselineRunning}
                onChange={(e) => setSelectedTimbreId(Number.parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 8 }, (_, idx) => (
                  <option key={`timbre-${idx}`} value={idx}>
                    {timbreNames[idx]}
                  </option>
                ))}
              </select>
            </label>

            <label className="toggle-label">
              <input
                type="checkbox"
                checked={speakerMode2d}
                disabled={busy || baselineRunning}
                onChange={(e) => setSpeakerMode2d(e.target.checked)}
              />
              音响模式（仅第1/2象限，y≥0）
            </label>

            <p>基准音已前置到测试开始前。你可以反复播放整轮基准音，或点击图中任意位置立即重播该点基准音（连放2次）。</p>
            <div className="row">
              <button disabled={busy || baselineRunning} onClick={playBaselineSweep}>
                {baselineRunning ? "基准音播放中..." : "播放基准音（9点单轮）"}
              </button>
              <button disabled={busy || baselineRunning || spatialTrials.length === 0} onClick={startAnswering}>
                开始测试
              </button>
            </div>
            {baselinePoint && <p className="hint">基准点: {formatPoint(baselinePoint)}</p>}
            <p className="hint">{baselineRunning ? "橙点=当前基准音正在播放的位置。" : "可直接点击图中任意点立即重播该点基准音。"}</p>
            <ArenaFigure compact baselinePoint={baselinePoint ?? undefined} speakerMode={speakerMode2d} onClick={handleSpatialArena2DClick} />
          </>
        )}

        {isTesting && (
          <>
            <p>
              第 {spatialIndex + 1}/{spatialTrials.length} 题。播放提示音后，在 2D 区域选点并提交。
            </p>
            <div className="row">
              <button disabled={busy || baselineRunning} onClick={playSpatialCue}>
                播放提示音
              </button>
              <button disabled={busy || !canGoPrevious || baselineRunning} onClick={goToPreviousTrial}>
                返回上一题
              </button>
            </div>
            <label>
              X 坐标（左-右）
              <input
                type="range"
                min={-1}
                max={1}
                step={0.005}
                value={spatialGuess?.x ?? 0}
                onChange={(e) => {
                  const x = Number.parseFloat(e.target.value);
                  setSpatialGuess((old) => ({ x, y: old?.y ?? 0, z: old?.z ?? 0 }));
                }}
              />
            </label>
            <label>
              Y 坐标（下-上）
              <input
                type="range"
                min={-1}
                max={1}
                step={0.005}
                value={spatialGuess?.y ?? 0}
                onChange={(e) => {
                  const next = Number.parseFloat(e.target.value);
                  const y = speakerMode2d ? Math.max(0, next) : next;
                  setSpatialGuess((old) => ({ x: old?.x ?? 0, y, z: old?.z ?? 0 }));
                }}
              />
            </label>
            <button onClick={resetSpatialGuess}>重置到中心点</button>
            <p className="hint">
              当前选择: X {spatialGuess?.x.toFixed(2) ?? "0.00"} / Y {spatialGuess?.y.toFixed(2) ?? "0.00"}
            </p>
          </>
        )}

        {isCompleted && (
          <>
            <p>
              测试已完成，共 {spatialTrials.length} 题。最终总分: {spatialAverageScore.toFixed(1)}
            </p>
          </>
        )}
      </div>

      {isTesting && (
        <div className="card">
          <h2>2D 空间区域{speakerMode2d ? "（音响模式）" : ""}</h2>
          <ArenaFigure userPoint={spatialGuess ?? undefined} speakerMode={speakerMode2d} onClick={handleSpatialArena2DClick} />
          <p className="hint">蓝点=你的选择，中心点=你所在位置。</p>
          <div className="submit-row">
            <button disabled={busy || !spatialGuess || baselineRunning} onClick={submitSpatialGuess}>
              提交并进入下一题
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>{isCompleted ? "最终汇总" : "测试进度"}</h2>
        <p>
          已完成 {completedSpatialTrials.length}/{spatialTrials.length}
        </p>
        <p>当前总分: {spatialAverageScore.toFixed(1)}</p>

        {isCompleted && (
          <>
            {spatialAverageBreakdown && (
              <div className="breakdown-summary">
                <p>平均得分细项：</p>
                <p className="hint">
                  空间距离: {spatialAverageBreakdown.cartesian.toFixed(1)} | 方位角: {spatialAverageBreakdown.azimuth.toFixed(1)} | 垂直: {spatialAverageBreakdown.vertical.toFixed(1)} | 距离: {spatialAverageBreakdown.distance.toFixed(1)}
                </p>
              </div>
            )}
            <table className="spatial-result-table">
              <thead>
                <tr>
                  <th>题号</th>
                  <th>标准落点</th>
                  <th>用户落点</th>
                  <th>总分</th>
                  <th>空间距离</th>
                  <th>方位角</th>
                  <th>垂直</th>
                  <th>距离</th>
                </tr>
              </thead>
              <tbody>
                {spatialTrials.map((trial) => (
                  <tr key={trial.id}>
                    <td>{trial.id}</td>
                    <td>{formatPoint(trial.target)}</td>
                    <td>{formatPoint(trial.user)}</td>
                    <td>{trial.score?.toFixed(1) ?? "-"}</td>
                    <td>{trial.breakdown?.cartesian.toFixed(1) ?? "-"}</td>
                    <td>{trial.breakdown?.azimuth.toFixed(1) ?? "-"}</td>
                    <td>{trial.breakdown?.vertical.toFixed(1) ?? "-"}</td>
                    <td>{trial.breakdown?.distance.toFixed(1) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="result-visuals">
              <p className="hint">落点图示（红点=标准，蓝点=用户）</p>
              <div className="result-trial-grid">
                {spatialTrials.map((trial) => (
                  <div className="result-trial-card" key={`visual-${trial.id}`}>
                    <p className="plane-title">第 {trial.id} 题</p>
                    <ArenaFigure compact targetPoint={trial.target} userPoint={trial.user} speakerMode={speakerMode2d} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <button onClick={onBackHome}>返回首页</button>
      </div>
    </section>
  );
}
