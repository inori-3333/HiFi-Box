import type React from "react";
import { clamp01ToSigned, planePointToPercent } from "../spatial/spatial-core";
import type { SpatialPlane, SpatialPoint } from "../spatial/spatial-core";
import type { SpatialTestController } from "../spatial/useSpatialTest";

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
  const { userPoint, targetPoint, baselinePoint, compact = false, onClick } = props;

  return (
    <div className={`spatial-arena2d${compact ? " spatial-arena2d-compact" : ""}${onClick ? "" : " spatial-static-view"}`} onClick={onClick}>
      <div className="spatial-self-2d" />
      {targetPoint && <div className="spatial-dot spatial-target" style={arenaPointToPercent(targetPoint)} />}
      {userPoint && <div className="spatial-dot spatial-user" style={arenaPointToPercent(userPoint)} />}
      {baselinePoint && <div className="spatial-dot spatial-baseline" style={arenaPointToPercent(baselinePoint)} />}
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
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    completedSpatialTrials,
    spatialAverageScore,
    setSpatialGuess,
    startAnswering,
    playSpatialCue,
    playBaselineSweep,
    submitSpatialGuess,
    resetSpatialGuess
  } = spatial;

  const isTesting = phase === "testing";
  const isPretest = phase === "pretest";
  const isCompleted = phase === "completed";

  function handleSpatialPlaneClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane) {
    if (!isTesting || !currentSpatialTrial) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const horizontal = clamp01ToSigned(px * 2 - 1);
    const vertical = clamp01ToSigned((1 - py) * 2 - 1);
    setSpatialGuess((old) => {
      const base = old ?? { x: 0, y: 0, z: 0 };
      if (plane === "xy") {
        return { ...base, x: horizontal, y: vertical };
      }
      if (plane === "xz") {
        return { ...base, x: horizontal, z: vertical };
      }
      return { ...base, z: horizontal, y: vertical };
    });
  }

  function handleSpatialArena2DClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isTesting || !currentSpatialTrial) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const x = clamp01ToSigned(px * 2 - 1);
    const y = clamp01ToSigned((1 - py) * 2 - 1);
    setSpatialGuess(() => ({ x, y, z: 0 }));
  }

  return (
    <section className="grid">
      <div className="card">
        <h2>空间结像测试（{spatialMode.toUpperCase()}）</h2>
        <div className="row">
          <button onClick={onBackHome}>返回首页</button>
        </div>

        {isPretest && (
          <>
            <p>基准音已前置到测试开始前。你可以反复播放基准音，准备好后点击“开始测试”。</p>
            <div className="row">
              <button disabled={busy || baselineRunning} onClick={playBaselineSweep}>
                {baselineRunning ? "基准音播放中..." : "播放基准音"}
              </button>
              <button disabled={busy || baselineRunning || spatialTrials.length === 0} onClick={startAnswering}>
                开始测试
              </button>
            </div>
            {baselinePoint && <p className="hint">基准点: {formatPoint(baselinePoint)}</p>}
            <p className="hint">
              {baselineRunning ? "橙点=当前基准音正在播放的位置。" : "点击“播放基准音”后将显示对应空间位置示意。"}
            </p>
            {spatialMode === "3d" ? (
              <div className="plane-layout plane-layout-compact">
                <PlaneFigure compact title="XY 正视图" plane="xy" baselinePoint={baselinePoint ?? undefined} />
                <PlaneFigure compact title="XZ 俯视图" plane="xz" baselinePoint={baselinePoint ?? undefined} />
                <PlaneFigure compact title="ZY 侧视图" plane="zy" baselinePoint={baselinePoint ?? undefined} />
              </div>
            ) : (
              <ArenaFigure compact baselinePoint={baselinePoint ?? undefined} />
            )}
          </>
        )}

        {isTesting && (
          <>
            <p>
              第 {spatialIndex + 1}/{spatialTrials.length} 题。
              {spatialMode === "2d" ? "播放提示音后，在 2D 区域选点并提交。" : "播放提示音后，在三视图中选点并提交。"}
            </p>
            <div className="row">
              <button disabled={busy || baselineRunning} onClick={playSpatialCue}>
                播放提示音
              </button>
            </div>
            <label>
              X 坐标（左-右）
              <input
                type="range"
                min={-1}
                max={1}
                step={spatialMode === "2d" ? 0.005 : 0.01}
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
                step={spatialMode === "2d" ? 0.005 : 0.01}
                value={spatialGuess?.y ?? 0}
                onChange={(e) => {
                  const y = Number.parseFloat(e.target.value);
                  setSpatialGuess((old) => ({ x: old?.x ?? 0, y, z: old?.z ?? 0 }));
                }}
              />
            </label>
            {spatialMode === "3d" && (
              <label>
                Z 坐标（后-前）
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={spatialGuess?.z ?? 0}
                  onChange={(e) => {
                    const z = Number.parseFloat(e.target.value);
                    setSpatialGuess((old) => ({ x: old?.x ?? 0, y: old?.y ?? 0, z }));
                  }}
                />
              </label>
            )}
            <button onClick={resetSpatialGuess}>重置到中心点</button>
            <p className="hint">
              当前选择: X {spatialGuess?.x.toFixed(2) ?? "0.00"} / Y {spatialGuess?.y.toFixed(2) ?? "0.00"}
              {spatialMode === "3d" ? ` / Z ${spatialGuess?.z.toFixed(2) ?? "0.00"}` : ""}
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

      {isTesting &&
        (spatialMode === "3d" ? (
          <div className="card">
            <h2>直角坐标空间（三视图）</h2>
            <div className="plane-layout">
              <PlaneFigure
                title="XY 正视图"
                plane="xy"
                userPoint={spatialGuess ?? undefined}
                onClick={(e) => handleSpatialPlaneClick(e, "xy")}
              />
              <PlaneFigure
                title="XZ 俯视图"
                plane="xz"
                userPoint={spatialGuess ?? undefined}
                onClick={(e) => handleSpatialPlaneClick(e, "xz")}
              />
              <PlaneFigure
                title="ZY 侧视图"
                plane="zy"
                userPoint={spatialGuess ?? undefined}
                onClick={(e) => handleSpatialPlaneClick(e, "zy")}
              />
            </div>
            <p className="hint">蓝点=你的选择。</p>
            <div className="submit-row">
              <button disabled={busy || !spatialGuess || baselineRunning} onClick={submitSpatialGuess}>
                提交并进入下一题
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <h2>2D 空间区域</h2>
            <ArenaFigure userPoint={spatialGuess ?? undefined} onClick={handleSpatialArena2DClick} />
            <p className="hint">蓝点=你的选择，中心点=你所在位置。</p>
            <div className="submit-row">
              <button disabled={busy || !spatialGuess || baselineRunning} onClick={submitSpatialGuess}>
                提交并进入下一题
              </button>
            </div>
          </div>
        ))}

      <div className="card">
        <h2>{isCompleted ? "最终汇总" : "测试进度"}</h2>
        <p>
          已完成 {completedSpatialTrials.length}/{spatialTrials.length}
        </p>
        <p>当前总分: {spatialAverageScore.toFixed(1)}</p>

        {isCompleted && (
          <>
            <table className="spatial-result-table">
              <thead>
                <tr>
                  <th>题号</th>
                  <th>标准落点</th>
                  <th>用户落点</th>
                </tr>
              </thead>
              <tbody>
                {spatialTrials.map((trial) => (
                  <tr key={trial.id}>
                    <td>{trial.id}</td>
                    <td>{formatPoint(trial.target)}</td>
                    <td>{formatPoint(trial.user)}</td>
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
                    {spatialMode === "3d" ? (
                      <div className="plane-layout plane-layout-compact">
                        <PlaneFigure compact title="XY 正视图" plane="xy" targetPoint={trial.target} userPoint={trial.user} />
                        <PlaneFigure compact title="XZ 俯视图" plane="xz" targetPoint={trial.target} userPoint={trial.user} />
                        <PlaneFigure compact title="ZY 侧视图" plane="zy" targetPoint={trial.target} userPoint={trial.user} />
                      </div>
                    ) : (
                      <ArenaFigure compact targetPoint={trial.target} userPoint={trial.user} />
                    )}
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
