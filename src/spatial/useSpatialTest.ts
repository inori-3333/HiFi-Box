import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  SPATIAL_BASELINE_POINT_GAP_SEC,
  SPATIAL_SCHEDULE_LEAD_SEC,
  SPATIAL_TRIAL_COUNT,
  baselineReferencePoints,
  computeSpatialBreakdown,
  generateSpatialTargets,
  playSpatialMotifAtPoint,
  resolveSpatialSeed
} from "./spatial-core";
import type { SpatialMode, SpatialPoint, SpatialTrial } from "./spatial-core";

const SPATIAL_NOTE_INTERVALS = [0, 4, 7, 12, 7, 4];
const SPATIAL_NOTE_DURATION_SEC = 0.11;

type UseSpatialTestOptions = {
  isSpatialStage: boolean;
  onEnterSpatialStage: () => void;
  setStatus: (status: string) => void;
};

type SpatialAverageBreakdown = {
  cartesian: number;
  azimuth: number;
  vertical: number;
  distance: number;
};

export type SpatialTestController = {
  spatialTrials: SpatialTrial[];
  spatialIndex: number;
  spatialGuess: SpatialPoint | null;
  spatialMode: SpatialMode;
  spatialSeedInput: string;
  spatialSeed: number | null;
  baselinePoint: SpatialPoint | null;
  baselineRunning: boolean;
  currentSpatialTrial: SpatialTrial | undefined;
  currentSpatialRevealed: boolean;
  completedSpatialTrials: SpatialTrial[];
  spatialAverageScore: number;
  spatialAverageBreakdown: SpatialAverageBreakdown | null;
  setSpatialSeedInput: (value: string) => void;
  setSpatialGuess: Dispatch<SetStateAction<SpatialPoint | null>>;
  startSpatialTest: (mode: SpatialMode) => void;
  playSpatialCue: () => Promise<void>;
  playBaselineSweep: () => Promise<void>;
  submitSpatialGuess: () => void;
  gotoNextSpatialTrial: () => void;
  resetSpatialGuess: () => void;
};

export function useSpatialTest(options: UseSpatialTestOptions): SpatialTestController {
  const { isSpatialStage, onEnterSpatialStage, setStatus } = options;
  const [spatialTrials, setSpatialTrials] = useState<SpatialTrial[]>([]);
  const [spatialIndex, setSpatialIndex] = useState(0);
  const [spatialGuess, setSpatialGuess] = useState<SpatialPoint | null>(null);
  const [spatialMode, setSpatialMode] = useState<SpatialMode>("3d");
  const [spatialSeedInput, setSpatialSeedInput] = useState("");
  const [spatialSeed, setSpatialSeed] = useState<number | null>(null);
  const [baselinePoint, setBaselinePoint] = useState<SpatialPoint | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [baselineTrialId, setBaselineTrialId] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baselineStopRef = useRef<(() => void) | null>(null);

  const currentSpatialTrial = spatialTrials[spatialIndex];
  const currentSpatialRevealed = currentSpatialTrial?.revealed ?? false;
  const completedSpatialTrials = useMemo(
    () => spatialTrials.filter((trial) => trial.revealed && trial.score !== undefined),
    [spatialTrials]
  );
  const spatialAverageScore = useMemo(() => {
    if (completedSpatialTrials.length === 0) {
      return 0;
    }
    return completedSpatialTrials.reduce((acc, trial) => acc + (trial.score ?? 0), 0) / completedSpatialTrials.length;
  }, [completedSpatialTrials]);
  const spatialAverageBreakdown = useMemo(() => {
    if (completedSpatialTrials.length === 0) {
      return null;
    }
    const totals = completedSpatialTrials.reduce(
      (acc, trial) => {
        const breakdown = trial.breakdown;
        if (!breakdown) {
          return acc;
        }
        return {
          count: acc.count + 1,
          cartesian: acc.cartesian + breakdown.cartesian,
          azimuth: acc.azimuth + breakdown.azimuth,
          vertical: acc.vertical + breakdown.vertical,
          distance: acc.distance + breakdown.distance
        };
      },
      { count: 0, cartesian: 0, azimuth: 0, vertical: 0, distance: 0 }
    );
    if (totals.count === 0) {
      return null;
    }
    return {
      cartesian: totals.cartesian / totals.count,
      azimuth: totals.azimuth / totals.count,
      vertical: totals.vertical / totals.count,
      distance: totals.distance / totals.count
    };
  }, [completedSpatialTrials]);

  function stopBaselineSweep() {
    if (baselineStopRef.current) {
      baselineStopRef.current();
      baselineStopRef.current = null;
    }
    setBaselineRunning(false);
    setBaselinePoint(null);
  }

  function startSpatialTest(mode: SpatialMode) {
    const seed = resolveSpatialSeed(spatialSeedInput);
    const targets = generateSpatialTargets(mode, SPATIAL_TRIAL_COUNT, seed);
    const trials = targets.map((target, idx) => ({
      id: idx + 1,
      target,
      revealed: false
    }));
    setSpatialSeed(seed);
    setSpatialTrials(trials);
    setSpatialIndex(0);
    setSpatialMode(mode);
    setSpatialGuess({ x: 0, y: 0, z: 0 });
    setBaselinePoint(null);
    setBaselineTrialId(null);
    onEnterSpatialStage();
    setStatus(
      mode === "2d"
        ? `2D 空间测试已开始（seed ${seed}）：请播放提示音并在平面区域中定位`
        : `3D 空间测试已开始（seed ${seed}）：请播放提示音并在直角坐标三视图中选择声源位置`
    );
  }

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  async function playSpatialCue() {
    if (!currentSpatialTrial) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const start = ctx.currentTime + SPATIAL_SCHEDULE_LEAD_SEC;
    playSpatialMotifAtPoint(ctx, spatialMode, currentSpatialTrial.target, start);
    setStatus(`已播放第 ${currentSpatialTrial.id} 题提示音，请在空间中点击你感知的位置`);
  }

  async function playBaselineSweep() {
    if (spatialTrials.length === 0) {
      return;
    }
    stopBaselineSweep();
    const trialId = spatialTrials[spatialIndex].id;
    setBaselineTrialId(trialId);
    setBaselineRunning(true);

    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const points = baselineReferencePoints(spatialMode);
    const pointSlotSec = SPATIAL_NOTE_INTERVALS.length * SPATIAL_NOTE_DURATION_SEC + SPATIAL_BASELINE_POINT_GAP_SEC;
    const timeoutIds: number[] = [];
    const activeStops: Array<(at: number) => void> = [];
    const sequenceStartAt = ctx.currentTime + SPATIAL_SCHEDULE_LEAD_SEC;
    let cancelled = false;

    baselineStopRef.current = () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      const stopAt = ctx.currentTime;
      activeStops.forEach((stop) => stop(stopAt));
    };

    setStatus(`正在播放第 ${trialId} 题基准音：依次播报 ${points.length} 个参考点...`);

    let sequenceEndAt = sequenceStartAt;
    points.forEach((point, idx) => {
      const pointStartAt = sequenceStartAt + idx * pointSlotSec;
      const playback = playSpatialMotifAtPoint(ctx, spatialMode, point, pointStartAt);
      activeStops.push(playback.stop);
      sequenceEndAt = Math.max(sequenceEndAt, playback.endAt);

      const visualDelayMs = Math.max(0, Math.round((pointStartAt - ctx.currentTime) * 1000));
      const timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setBaselinePoint(point);
      }, visualDelayMs);
      timeoutIds.push(timeoutId);
    });

    const totalMs = Math.max(0, Math.round((sequenceEndAt - ctx.currentTime) * 1000));
    const finishTimeout = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      stopBaselineSweep();
      setStatus(`第 ${trialId} 题基准音播放完成，请开始选择位置`);
    }, totalMs);
    timeoutIds.push(finishTimeout);
  }

  function submitSpatialGuess() {
    if (!currentSpatialTrial) {
      return;
    }
    if (currentSpatialTrial.revealed) {
      setStatus(`第 ${currentSpatialTrial.id} 题已提交，请进入下一题`);
      return;
    }
    if (!spatialGuess) {
      setStatus(spatialMode === "2d" ? "请先在 2D 区域选择位置后再提交" : "请先在三视图中选择一个空间位置后再提交");
      return;
    }
    const result = computeSpatialBreakdown(spatialMode, currentSpatialTrial.target, spatialGuess);
    const scoreValue = result.score;

    const nextTrials = spatialTrials.map((item, idx) =>
      idx === spatialIndex
        ? { ...item, user: spatialGuess, score: scoreValue, breakdown: result.breakdown, revealed: true }
        : item
    );
    setSpatialTrials(nextTrials);
    setStatus(
      `第 ${currentSpatialTrial.id} 题已揭晓，得分 ${scoreValue.toFixed(1)}（方位 ${result.breakdown.azimuth.toFixed(1)} / ${
        spatialMode === "3d" ? "高度" : "纵向"
      } ${result.breakdown.vertical.toFixed(1)} / 距离 ${result.breakdown.distance.toFixed(1)}）`
    );
  }

  function resetSpatialGuess() {
    setSpatialGuess({ x: 0, y: 0, z: 0 });
  }

  function gotoNextSpatialTrial() {
    if (!currentSpatialTrial?.revealed) {
      setStatus("请先提交并揭晓当前题，再进入下一题");
      return;
    }
    if (spatialIndex >= spatialTrials.length - 1) {
      setStatus("空间测试已完成，可查看汇总分数");
      return;
    }
    setSpatialIndex((v) => v + 1);
    resetSpatialGuess();
    setBaselinePoint(null);
    setBaselineTrialId(null);
    setStatus(
      spatialMode === "2d"
        ? `进入第 ${spatialIndex + 2} 题，请播放提示音并在 2D 区域定位`
        : `进入第 ${spatialIndex + 2} 题，请播放提示音并在三视图中定位`
    );
  }

  useEffect(() => {
    if (!isSpatialStage || spatialTrials.length === 0) {
      return;
    }
    const currentTrialId = spatialTrials[spatialIndex].id;
    if (baselineTrialId === currentTrialId) {
      return;
    }
    void playBaselineSweep();
  }, [baselineTrialId, isSpatialStage, spatialIndex, spatialMode, spatialTrials]);

  useEffect(() => {
    if (!isSpatialStage) {
      stopBaselineSweep();
      setBaselinePoint(null);
    }
    return () => {
      stopBaselineSweep();
    };
  }, [isSpatialStage]);

  return {
    spatialTrials,
    spatialIndex,
    spatialGuess,
    spatialMode,
    spatialSeedInput,
    spatialSeed,
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    currentSpatialRevealed,
    completedSpatialTrials,
    spatialAverageScore,
    spatialAverageBreakdown,
    setSpatialSeedInput,
    setSpatialGuess,
    startSpatialTest,
    playSpatialCue,
    playBaselineSweep,
    submitSpatialGuess,
    gotoNextSpatialTrial,
    resetSpatialGuess
  };
}
