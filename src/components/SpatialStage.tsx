import type React from "react";
import { clamp01ToSigned, planePointToPercent } from "../spatial/spatial-core";
import type { SpatialPlane } from "../spatial/spatial-core";
import type { SpatialTestController } from "../spatial/useSpatialTest";

type SpatialStageProps = {
  busy: boolean;
  onBackHome: () => void;
  spatial: SpatialTestController;
};

export function SpatialStage(props: SpatialStageProps) {
  const { busy, onBackHome, spatial } = props;
  const {
    spatialTrials,
    spatialIndex,
    spatialGuess,
    spatialMode,
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    currentSpatialRevealed,
    completedSpatialTrials,
    spatialAverageScore,
    spatialAverageBreakdown,
    setSpatialGuess,
    playSpatialCue,
    playBaselineSweep,
    submitSpatialGuess,
    gotoNextSpatialTrial,
    resetSpatialGuess
  } = spatial;

  function handleSpatialPlaneClick(event: React.MouseEvent<HTMLDivElement>, plane: SpatialPlane) {
    if (!currentSpatialTrial || currentSpatialTrial.revealed) {
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
    if (!currentSpatialTrial || currentSpatialTrial.revealed) {
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
        <p>
          第 {spatialIndex + 1}/{spatialTrials.length} 题。先播放提示音，
          {spatialMode === "2d" ? "再在 2D 空间区域点击位置。" : "再在三视图直角坐标空间中选点。"}
          提交后揭晓标准答案。
        </p>
        <div className="row">
          <button disabled={busy || baselineRunning} onClick={playBaselineSweep}>
            {baselineRunning ? "基准音播放中..." : "播放基准音"}
          </button>
          <button disabled={busy || baselineRunning} onClick={playSpatialCue}>
            播放提示音
          </button>
          <button disabled={busy || baselineRunning || !currentSpatialRevealed} onClick={gotoNextSpatialTrial}>
            下一题
          </button>
        </div>
        <label>
          X 坐标（左-右）
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={spatialGuess?.x ?? 0}
            disabled={currentSpatialRevealed}
            onChange={(e) => {
              if (currentSpatialRevealed) {
                return;
              }
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
            step={0.01}
            value={spatialGuess?.y ?? 0}
            disabled={currentSpatialRevealed}
            onChange={(e) => {
              if (currentSpatialRevealed) {
                return;
              }
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
              disabled={currentSpatialRevealed}
              onChange={(e) => {
                if (currentSpatialRevealed) {
                  return;
                }
                const z = Number.parseFloat(e.target.value);
                setSpatialGuess((old) => ({ x: old?.x ?? 0, y: old?.y ?? 0, z }));
              }}
            />
          </label>
        )}
        <button disabled={currentSpatialRevealed} onClick={resetSpatialGuess}>
          重置到中心点
        </button>
        <p className="hint">
          当前选择: X {spatialGuess?.x.toFixed(2) ?? "0.00"} / Y {spatialGuess?.y.toFixed(2) ?? "0.00"}
          {spatialMode === "3d" ? ` / Z ${spatialGuess?.z.toFixed(2) ?? "0.00"}` : ""}
        </p>
      </div>

      {spatialMode === "3d" ? (
        <div className="card">
          <h2>直角坐标空间（三视图）</h2>
          <div className="plane-layout">
            <div className="plane-wrap">
              <p className="plane-title">XY 正视图</p>
              <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "xy")}>
                <div className="plane-axis-x" />
                <div className="plane-axis-y" />
                {baselinePoint && <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "xy")} />}
                {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "xy")} />}
                {currentSpatialTrial?.revealed && (
                  <div className="spatial-dot spatial-target" style={planePointToPercent(currentSpatialTrial.target, "xy")} />
                )}
              </div>
            </div>
            <div className="plane-wrap">
              <p className="plane-title">XZ 俯视图</p>
              <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "xz")}>
                <div className="plane-axis-x" />
                <div className="plane-axis-y" />
                {baselinePoint && <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "xz")} />}
                {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "xz")} />}
                {currentSpatialTrial?.revealed && (
                  <div className="spatial-dot spatial-target" style={planePointToPercent(currentSpatialTrial.target, "xz")} />
                )}
              </div>
            </div>
            <div className="plane-wrap">
              <p className="plane-title">ZY 侧视图</p>
              <div className="cartesian-plane" onClick={(e) => handleSpatialPlaneClick(e, "zy")}>
                <div className="plane-axis-x" />
                <div className="plane-axis-y" />
                {baselinePoint && <div className="spatial-dot spatial-baseline" style={planePointToPercent(baselinePoint, "zy")} />}
                {spatialGuess && <div className="spatial-dot spatial-user" style={planePointToPercent(spatialGuess, "zy")} />}
                {currentSpatialTrial?.revealed && (
                  <div className="spatial-dot spatial-target" style={planePointToPercent(currentSpatialTrial.target, "zy")} />
                )}
              </div>
            </div>
          </div>
          <p className="hint">黄点=基准音位置，蓝点=你的选择，红点=标准答案。</p>
          {currentSpatialTrial?.revealed && <p>本题得分: {currentSpatialTrial.score?.toFixed(1)}</p>}
          {currentSpatialTrial?.revealed && currentSpatialTrial.breakdown && (
            <p className="hint">
              分项: 定位 {currentSpatialTrial.breakdown.cartesian.toFixed(1)} / 方位 {currentSpatialTrial.breakdown.azimuth.toFixed(1)} / 高度{" "}
              {currentSpatialTrial.breakdown.vertical.toFixed(1)} / 距离 {currentSpatialTrial.breakdown.distance.toFixed(1)}
            </p>
          )}
          <div className="submit-row">
            <button disabled={busy || !spatialGuess || baselineRunning || currentSpatialRevealed} onClick={submitSpatialGuess}>
              提交并揭晓
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>2D 空间区域</h2>
          <div className="spatial-arena2d" onClick={handleSpatialArena2DClick}>
            <div className="spatial-self-2d" />
            {baselinePoint && (
              <div
                className="spatial-dot spatial-baseline"
                style={{
                  left: `${((baselinePoint.x + 1) / 2) * 100}%`,
                  top: `${(1 - (baselinePoint.y + 1) / 2) * 100}%`
                }}
              />
            )}
            {spatialGuess && (
              <div
                className="spatial-dot spatial-user"
                style={{
                  left: `${((spatialGuess.x + 1) / 2) * 100}%`,
                  top: `${(1 - (spatialGuess.y + 1) / 2) * 100}%`
                }}
              />
            )}
            {currentSpatialTrial?.revealed && (
              <div
                className="spatial-dot spatial-target"
                style={{
                  left: `${((currentSpatialTrial.target.x + 1) / 2) * 100}%`,
                  top: `${(1 - (currentSpatialTrial.target.y + 1) / 2) * 100}%`
                }}
              />
            )}
          </div>
          <p className="hint">黄点=基准音位置，蓝点=你的选择，红点=标准答案，中心点=你所在位置</p>
          {currentSpatialTrial?.revealed && <p>本题得分: {currentSpatialTrial.score?.toFixed(1)}</p>}
          {currentSpatialTrial?.revealed && currentSpatialTrial.breakdown && (
            <p className="hint">
              分项: 定位 {currentSpatialTrial.breakdown.cartesian.toFixed(1)} / 方位 {currentSpatialTrial.breakdown.azimuth.toFixed(1)} / 纵向{" "}
              {currentSpatialTrial.breakdown.vertical.toFixed(1)} / 距离 {currentSpatialTrial.breakdown.distance.toFixed(1)}
            </p>
          )}
          <div className="submit-row">
            <button disabled={busy || !spatialGuess || baselineRunning || currentSpatialRevealed} onClick={submitSpatialGuess}>
              提交并揭晓
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>测试汇总</h2>
        <p>
          已完成 {completedSpatialTrials.length}/{spatialTrials.length}
        </p>
        <p>平均分: {spatialAverageScore.toFixed(1)}</p>
        {spatialAverageBreakdown && (
          <p className="hint">
            分项均分: 定位 {spatialAverageBreakdown.cartesian.toFixed(1)} / 方位 {spatialAverageBreakdown.azimuth.toFixed(1)} /{" "}
            {spatialMode === "3d" ? "高度" : "纵向"} {spatialAverageBreakdown.vertical.toFixed(1)} / 距离{" "}
            {spatialAverageBreakdown.distance.toFixed(1)}
          </p>
        )}
        <button onClick={onBackHome}>返回首页</button>
      </div>
    </section>
  );
}
