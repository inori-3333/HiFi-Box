import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  SPATIAL_BASELINE_POINT_GAP_SEC,
  SPATIAL_CUE_TIMBRE_COUNT,
  SPATIAL_SCHEDULE_LEAD_SEC,
  SPATIAL_TRIAL_COUNT,
  baselineReferencePoints,
  computeSpatialBreakdown,
  generateSpatialTargets,
  playSpatialCueAtPoint,
  playSpatialMotifAtPoint,
  resolveSpatialSeed
} from "./spatial-core";
import type { SpatialMode, SpatialPoint, SpatialTrial } from "./spatial-core";

const SPATIAL_NOTE_INTERVALS = [0, 4, 7, 12, 7, 4];
const SPATIAL_NOTE_DURATION_SEC = 0.11;

export type SpatialTestPhase = "pretest" | "testing" | "completed";

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
  phase: SpatialTestPhase;
  spatialTrials: SpatialTrial[];
  spatialIndex: number;
  spatialGuess: SpatialPoint | null;
  spatialMode: SpatialMode;
  spatialSeedInput: string;
  spatialSeed: number | null;
  baselinePoint: SpatialPoint | null;
  baselineRunning: boolean;
  currentSpatialTrial: SpatialTrial | undefined;
  completedSpatialTrials: SpatialTrial[];
  spatialAverageScore: number;
  spatialAverageBreakdown: SpatialAverageBreakdown | null;
  setSpatialSeedInput: (value: string) => void;
  setSpatialGuess: Dispatch<SetStateAction<SpatialPoint | null>>;
  startSpatialTest: (mode: SpatialMode) => void;
  startAnswering: () => void;
  playSpatialCue: () => Promise<void>;
  playBaselineSweep: () => Promise<void>;
  submitSpatialGuess: () => void;
  resetSpatialGuess: () => void;
};

export function useSpatialTest(options: UseSpatialTestOptions): SpatialTestController {
  const { isSpatialStage, onEnterSpatialStage, setStatus } = options;
  const [phase, setPhase] = useState<SpatialTestPhase>("pretest");
  const [spatialTrials, setSpatialTrials] = useState<SpatialTrial[]>([]);
  const [spatialIndex, setSpatialIndex] = useState(0);
  const [spatialGuess, setSpatialGuess] = useState<SpatialPoint | null>(null);
  const [spatialMode, setSpatialMode] = useState<SpatialMode>("3d");
  const [spatialSeedInput, setSpatialSeedInput] = useState("");
  const [spatialSeed, setSpatialSeed] = useState<number | null>(null);
  const [baselinePoint, setBaselinePoint] = useState<SpatialPoint | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [pretestBaselinePlayed, setPretestBaselinePlayed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baselineStopRef = useRef<(() => void) | null>(null);
  const cueStopRef = useRef<(() => void) | null>(null);
  const cueStopTimeoutRef = useRef<number | null>(null);

  const currentSpatialTrial = spatialTrials[spatialIndex];
  const completedSpatialTrials = useMemo(
    () => spatialTrials.filter((trial) => trial.submitted && trial.score !== undefined),
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

  function stopSpatialCue() {
    if (cueStopTimeoutRef.current !== null) {
      window.clearTimeout(cueStopTimeoutRef.current);
      cueStopTimeoutRef.current = null;
    }
    if (cueStopRef.current) {
      cueStopRef.current();
      cueStopRef.current = null;
    }
  }

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
      cueTimbreId: idx % SPATIAL_CUE_TIMBRE_COUNT
    }));

    stopBaselineSweep();
    stopSpatialCue();
    setSpatialSeed(seed);
    setSpatialTrials(trials);
    setSpatialIndex(0);
    setSpatialMode(mode);
    setSpatialGuess({ x: 0, y: 0, z: 0 });
    setPhase("pretest");
    setPretestBaselinePlayed(false);
    onEnterSpatialStage();
    setStatus(
      mode === "2d"
        ? `2D 空间测试已开始（seed ${seed}）：先听基准音，准备好后点击“开始测试”`
        : `3D 空间测试已开始（seed ${seed}）：先听基准音，准备好后点击“开始测试”`
    );
  }

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  async function playTrialCue(trial: SpatialTrial): Promise<void> {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    stopSpatialCue();

    const start = ctx.currentTime + SPATIAL_SCHEDULE_LEAD_SEC;
    const playback = playSpatialCueAtPoint(ctx, spatialMode, trial.target, start, trial.cueTimbreId);
    const stopPlayback = () => {
      playback.stop(ctx.currentTime);
    };
    cueStopRef.current = stopPlayback;
    cueStopTimeoutRef.current = window.setTimeout(() => {
      if (cueStopRef.current === stopPlayback) {
        cueStopRef.current = null;
      }
      cueStopTimeoutRef.current = null;
    }, Math.max(100, Math.ceil((playback.endAt - ctx.currentTime + 0.15) * 1000)));

    setStatus(`已播放第 ${trial.id} 题提示音，请选择位置后提交。可重复点击“播放提示音”重听。`);
  }

  async function playSpatialCue() {
    if (phase !== "testing") {
      setStatus("当前不在答题阶段，只有开始测试后才可播放题目提示音");
      return;
    }
    if (!currentSpatialTrial) {
      return;
    }
    await playTrialCue(currentSpatialTrial);
  }

  async function playBaselineSweep() {
    if (phase !== "pretest") {
      setStatus("开始测试后不允许播放基准音");
      return;
    }
    if (spatialTrials.length === 0) {
      return;
    }

    stopBaselineSweep();
    stopSpatialCue();
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

    setStatus(`正在播放基准音：依次播报 ${points.length} 个参考点...`);

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
      setStatus("基准音播放完成。可重播基准音，准备好后点击“开始测试”。");
    }, totalMs);
    timeoutIds.push(finishTimeout);
  }

  function startAnswering() {
    if (phase === "testing") {
      setStatus("已经在答题阶段");
      return;
    }
    if (phase === "completed") {
      setStatus("本轮测试已结束，请返回首页重新开始");
      return;
    }
    if (spatialTrials.length === 0 || !spatialTrials[0]) {
      return;
    }
    stopBaselineSweep();
    setSpatialIndex(0);
    setSpatialGuess({ x: 0, y: 0, z: 0 });
    setPhase("testing");
    setStatus("已开始测试，正在播放第 1 题提示音...");
    void playTrialCue(spatialTrials[0]);
  }

  function submitSpatialGuess() {
    if (phase !== "testing") {
      setStatus("当前不在答题阶段");
      return;
    }
    if (!currentSpatialTrial) {
      return;
    }
    if (currentSpatialTrial.submitted) {
      setStatus(`第 ${currentSpatialTrial.id} 题已提交`);
      return;
    }
    if (!spatialGuess) {
      setStatus(spatialMode === "2d" ? "请先在 2D 区域选择位置后再提交" : "请先在三视图中选择一个空间位置后再提交");
      return;
    }

    const result = computeSpatialBreakdown(spatialMode, currentSpatialTrial.target, spatialGuess);
    const finishedTrialId = currentSpatialTrial.id;
    const nextTrials = spatialTrials.map((item, idx) =>
      idx === spatialIndex
        ? { ...item, user: spatialGuess, score: result.score, breakdown: result.breakdown, submitted: true }
        : item
    );
    setSpatialTrials(nextTrials);

    if (spatialIndex >= nextTrials.length - 1) {
      stopSpatialCue();
      setPhase("completed");
      setStatus("全部题目已完成，已生成最终得分与每题坐标明细。");
      return;
    }

    const nextIndex = spatialIndex + 1;
    const nextTrial = nextTrials[nextIndex];
    setSpatialIndex(nextIndex);
    resetSpatialGuess();
    setStatus(`第 ${finishedTrialId} 题已提交，正在播放第 ${nextTrial.id} 题提示音...`);
    void playTrialCue(nextTrial);
  }

  function resetSpatialGuess() {
    setSpatialGuess({ x: 0, y: 0, z: 0 });
  }

  useEffect(() => {
    if (!isSpatialStage || phase !== "pretest" || spatialTrials.length === 0 || pretestBaselinePlayed) {
      return;
    }
    setPretestBaselinePlayed(true);
    void playBaselineSweep();
  }, [isSpatialStage, phase, pretestBaselinePlayed, spatialMode, spatialTrials]);

  useEffect(() => {
    if (!isSpatialStage) {
      stopBaselineSweep();
      stopSpatialCue();
      setBaselinePoint(null);
    }
    return () => {
      stopBaselineSweep();
      stopSpatialCue();
    };
  }, [isSpatialStage]);

  return {
    phase,
    spatialTrials,
    spatialIndex,
    spatialGuess,
    spatialMode,
    spatialSeedInput,
    spatialSeed,
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    completedSpatialTrials,
    spatialAverageScore,
    spatialAverageBreakdown,
    setSpatialSeedInput,
    setSpatialGuess,
    startSpatialTest,
    startAnswering,
    playSpatialCue,
    playBaselineSweep,
    submitSpatialGuess,
    resetSpatialGuess
  };
}
