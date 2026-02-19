import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  SPATIAL_CUE_TIMBRE_COUNT,
  SPATIAL_SCHEDULE_LEAD_SEC,
  SPATIAL_TRIAL_COUNT,
  baselineReferencePoints,
  computeSpatialBreakdown,
  generateSpatialTargets,
  playSpatialCueAtPoint,
  resolveSpatialSeed
} from "./spatial-core";
import type { SpatialMode, SpatialPoint, SpatialSceneProfile, SpatialTrial } from "./spatial-core";

const BASELINE_POSITION_CYCLES = 1;

const timbreNames = ["鼓点声", "军鼓声", "镲片声", "扫弦声", "桶鼓声", "拍手声", "铃铛声", "拨弦声"];
const BASELINE_AUTOPLAY_DELAY_MS = 1000;
const BASELINE_INTER_TONE_GAP_SEC = 0.3;
const BASELINE_REPEAT_COUNT_PER_TONE = 2;

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
  speakerMode2d: boolean;
  selectedTimbreId: number;
  spatialSeedInput: string;
  spatialSeed: number | null;
  baselinePoint: SpatialPoint | null;
  baselineRunning: boolean;
  currentSpatialTrial: SpatialTrial | undefined;
  completedSpatialTrials: SpatialTrial[];
  spatialAverageScore: number;
  spatialAverageBreakdown: SpatialAverageBreakdown | null;
  canGoPrevious: boolean;
  setSpatialSeedInput: (value: string) => void;
  setSpatialGuess: Dispatch<SetStateAction<SpatialPoint | null>>;
  setSelectedTimbreId: (value: number) => void;
  setSpeakerMode2d: (enabled: boolean) => void;
  startSpatialTest: (mode: SpatialMode) => void;
  startAnswering: () => void;
  playSpatialCue: () => Promise<void>;
  playBaselineSweep: () => Promise<void>;
  selectAndReplayBaselinePoint: (point: SpatialPoint) => void;
  submitSpatialGuess: () => void;
  goToPreviousTrial: () => void;
  resetSpatialGuess: () => void;
};

function normalizeTimbreId(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.floor(value);
  const normalized = rounded % SPATIAL_CUE_TIMBRE_COUNT;
  return normalized < 0 ? normalized + SPATIAL_CUE_TIMBRE_COUNT : normalized;
}

function resolveSceneProfile(mode: SpatialMode, speakerMode2d: boolean): SpatialSceneProfile {
  return mode === "2d" && speakerMode2d ? "speaker2d" : "standard";
}

function defaultGuess(mode: SpatialMode, speakerMode2d: boolean): SpatialPoint {
  if (mode === "2d" && speakerMode2d) {
    return { x: 0, y: 0.5, z: 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

function buildTrials(mode: SpatialMode, profile: SpatialSceneProfile, count: number, seed: number, timbreId: number): SpatialTrial[] {
  const targets = generateSpatialTargets(mode, count, seed, profile);
  return targets.map((target, idx) => ({
    id: idx + 1,
    target,
    cueTimbreId: timbreId
  }));
}

export function useSpatialTest(options: UseSpatialTestOptions): SpatialTestController {
  const { isSpatialStage, onEnterSpatialStage, setStatus } = options;
  const [phase, setPhase] = useState<SpatialTestPhase>("pretest");
  const [spatialTrials, setSpatialTrials] = useState<SpatialTrial[]>([]);
  const [spatialIndex, setSpatialIndex] = useState(0);
  const [spatialGuess, setSpatialGuess] = useState<SpatialPoint | null>(null);
  const [spatialMode, setSpatialMode] = useState<SpatialMode>("3d");
  const [speakerMode2d, setSpeakerMode2dState] = useState(false);
  const [selectedTimbreId, setSelectedTimbreIdState] = useState(0);
  const [spatialSeedInput, setSpatialSeedInput] = useState("");
  const [spatialSeed, setSpatialSeed] = useState<number | null>(null);
  const [baselinePoint, setBaselinePoint] = useState<SpatialPoint | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [pretestBaselinePlayed, setPretestBaselinePlayed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const baselineStopRef = useRef<(() => void) | null>(null);
  const pretestAutoplayTimeoutRef = useRef<number | null>(null);
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
  const canGoPrevious = phase === "testing" && spatialIndex > 0;

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
    if (pretestAutoplayTimeoutRef.current !== null) {
      window.clearTimeout(pretestAutoplayTimeoutRef.current);
      pretestAutoplayTimeoutRef.current = null;
    }
    if (baselineStopRef.current) {
      baselineStopRef.current();
      baselineStopRef.current = null;
    }
    setBaselineRunning(false);
    setBaselinePoint(null);
  }

  function getAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  async function ensureAudioContextReady(ctx: AudioContext): Promise<boolean> {
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
        // 首次 resume 后等待音频硬件初始化，避免首段音频丢失
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        setStatus("音频初始化失败，请点击页面任意位置后再试");
        return false;
      }
    }
    return true;
  }

  function closeAudioContext() {
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }

  function currentProfile(): SpatialSceneProfile {
    return resolveSceneProfile(spatialMode, speakerMode2d);
  }

  function replaceTrialsForCurrentConfig(nextSpeakerMode2d: boolean, nextTimbreId: number) {
    if (spatialSeed === null) {
      return;
    }
    const profile = resolveSceneProfile(spatialMode, nextSpeakerMode2d);
    const trials = buildTrials(spatialMode, profile, SPATIAL_TRIAL_COUNT, spatialSeed, nextTimbreId);
    setSpatialTrials(trials);
    setSpatialIndex(0);
    setSpatialGuess(defaultGuess(spatialMode, nextSpeakerMode2d));
    setPhase("pretest");
    setPretestBaselinePlayed(false);
    stopBaselineSweep();
    stopSpatialCue();
  }

  function startSpatialTest(mode: SpatialMode) {
    const seed = resolveSpatialSeed(spatialSeedInput);
    const initialSpeakerMode2d = false;
    const timbreId = 0;
    const profile = resolveSceneProfile(mode, initialSpeakerMode2d);
    const trials = buildTrials(mode, profile, SPATIAL_TRIAL_COUNT, seed, timbreId);

    stopBaselineSweep();
    stopSpatialCue();
    setSpatialSeed(seed);
    setSpatialTrials(trials);
    setSpatialIndex(0);
    setSpatialMode(mode);
    setSpeakerMode2dState(initialSpeakerMode2d);
    setSelectedTimbreIdState(timbreId);
    setSpatialGuess(defaultGuess(mode, initialSpeakerMode2d));
    setPhase("pretest");
    setPretestBaselinePlayed(false);
    onEnterSpatialStage();
    setStatus(
      mode === "2d"
        ? `2D 空间测试已开始（seed ${seed}）：先听基准音，准备好后点击“开始测试”`
        : `3D 空间测试已开始（seed ${seed}）：先听基准音，准备好后点击“开始测试”`
    );
  }

  function setSelectedTimbreId(value: number) {
    const next = normalizeTimbreId(value);
    if (phase !== "pretest") {
      setStatus("开始测试后不允许切换基准音色");
      return;
    }
    setSelectedTimbreIdState(next);
    setSpatialTrials((old) => old.map((trial) => ({ ...trial, cueTimbreId: next })));
    setStatus(`已切换基准音色为 ${timbreNames[next]}`);
  }

  function setSpeakerMode2d(enabled: boolean) {
    if (spatialMode !== "2d") {
      return;
    }
    if (phase !== "pretest") {
      setStatus("开始测试后不允许切换音响模式");
      return;
    }
    if (speakerMode2d === enabled) {
      return;
    }
    setSpeakerMode2dState(enabled);
    replaceTrialsForCurrentConfig(enabled, selectedTimbreId);
    setStatus(enabled ? "已开启音响模式（仅第3/4象限）" : "已关闭音响模式（恢复全平面）");
  }

  async function playTrialCue(trial: SpatialTrial): Promise<void> {
    const ctx = getAudioContext();
    const ready = await ensureAudioContextReady(ctx);
    if (!ready) {
      return;
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

    setStatus(`已播放第 ${trial.id} 题提示音（${timbreNames[trial.cueTimbreId]}），请选择位置后提交。`);
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

  async function playSingleBaselinePoint(point: SpatialPoint) {
    if (phase !== "pretest") {
      setStatus("开始测试后不允许播放基准音");
      return;
    }
    stopBaselineSweep();
    stopSpatialCue();
    setBaselineRunning(true);
    setBaselinePoint(point);

    const ctx = getAudioContext();
    const ready = await ensureAudioContextReady(ctx);
    if (!ready) {
      return;
    }

    const timeoutIds: number[] = [];
    const activeStops: Array<(at: number) => void> = [];
    let cancelled = false;
    baselineStopRef.current = () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      const stopAt = ctx.currentTime;
      activeStops.forEach((stop) => stop(stopAt));
    };

    const startAt = ctx.currentTime + SPATIAL_SCHEDULE_LEAD_SEC;
    let endAt = startAt;
    for (let repeatIdx = 0; repeatIdx < BASELINE_REPEAT_COUNT_PER_TONE; repeatIdx += 1) {
      const playback = playSpatialCueAtPoint(ctx, spatialMode, point, endAt, selectedTimbreId);
      activeStops.push(playback.stop);
      endAt = playback.endAt;
    }

    const totalMs = Math.max(0, Math.round((endAt - ctx.currentTime) * 1000));
    const finishTimeout = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      stopBaselineSweep();
      setStatus(`单点基准音播放完成（${timbreNames[selectedTimbreId]}）。`);
    }, totalMs);
    timeoutIds.push(finishTimeout);
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
    const ready = await ensureAudioContextReady(ctx);
    if (!ready) {
      return;
    }

    const points = baselineReferencePoints(spatialMode, currentProfile());
    const baselineToneCount = points.length * BASELINE_POSITION_CYCLES;
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

    setStatus(`正在播放基准音：9 点单轮（每点连放 ${BASELINE_REPEAT_COUNT_PER_TONE} 次，${timbreNames[selectedTimbreId]}）...`);

    let sequenceEndAt = sequenceStartAt;
    let toneStartAt = sequenceStartAt;
    for (let idx = 0; idx < baselineToneCount; idx += 1) {
      const point = points[idx % points.length];
      const firstPlayback = playSpatialCueAtPoint(ctx, spatialMode, point, toneStartAt, selectedTimbreId);
      activeStops.push(firstPlayback.stop);
      sequenceEndAt = Math.max(sequenceEndAt, firstPlayback.endAt);

      const visualDelayMs = Math.max(0, Math.round((toneStartAt - ctx.currentTime) * 1000));
      const timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setBaselinePoint(point);
      }, visualDelayMs);
      timeoutIds.push(timeoutId);

      let repeatEndAt = firstPlayback.endAt;
      for (let repeatIdx = 1; repeatIdx < BASELINE_REPEAT_COUNT_PER_TONE; repeatIdx += 1) {
        const repeatPlayback = playSpatialCueAtPoint(ctx, spatialMode, point, repeatEndAt, selectedTimbreId);
        activeStops.push(repeatPlayback.stop);
        repeatEndAt = repeatPlayback.endAt;
        sequenceEndAt = Math.max(sequenceEndAt, repeatPlayback.endAt);
      }

      toneStartAt = repeatEndAt + BASELINE_INTER_TONE_GAP_SEC;
    }

    const totalMs = Math.max(0, Math.round((sequenceEndAt - ctx.currentTime) * 1000));
    const finishTimeout = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      stopBaselineSweep();
      setStatus("基准音播放完成。可点击图中任意位置立即重播单点基准音，或开始测试。");
    }, totalMs);
    timeoutIds.push(finishTimeout);
  }

  function selectAndReplayBaselinePoint(point: SpatialPoint) {
    void playSingleBaselinePoint(point);
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
    setSpatialGuess(defaultGuess(spatialMode, speakerMode2d));
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
    if (!spatialGuess) {
      setStatus(spatialMode === "2d" ? "请先在 2D 区域选择位置后再提交" : "请先在三视图中选择一个空间位置后再提交");
      return;
    }

    const guess = spatialMode === "2d" && speakerMode2d ? { ...spatialGuess, y: Math.max(0, spatialGuess.y), z: 0 } : spatialGuess;
    const result = computeSpatialBreakdown(spatialMode, currentSpatialTrial.target, guess);
    const finishedTrialId = currentSpatialTrial.id;
    const nextTrials = spatialTrials.map((item, idx) =>
      idx === spatialIndex ? { ...item, user: guess, score: result.score, breakdown: result.breakdown, submitted: true } : item
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

  function goToPreviousTrial() {
    if (phase !== "testing" || spatialIndex <= 0) {
      return;
    }
    stopSpatialCue();
    const previousIndex = spatialIndex - 1;
    const previousTrial = spatialTrials[previousIndex];
    setSpatialIndex(previousIndex);
    setSpatialGuess(previousTrial?.user ?? defaultGuess(spatialMode, speakerMode2d));
    setStatus(`已返回第 ${previousIndex + 1} 题，可重听并修改答案。`);
  }

  function resetSpatialGuess() {
    setSpatialGuess(defaultGuess(spatialMode, speakerMode2d));
  }

  useEffect(() => {
    if (!isSpatialStage || phase !== "pretest" || spatialTrials.length === 0 || pretestBaselinePlayed) {
      return;
    }
    setPretestBaselinePlayed(true);
    pretestAutoplayTimeoutRef.current = window.setTimeout(() => {
      pretestAutoplayTimeoutRef.current = null;
      void playBaselineSweep();
    }, BASELINE_AUTOPLAY_DELAY_MS);
    return () => {
      if (pretestAutoplayTimeoutRef.current !== null) {
        window.clearTimeout(pretestAutoplayTimeoutRef.current);
        pretestAutoplayTimeoutRef.current = null;
      }
    };
  }, [isSpatialStage, phase, pretestBaselinePlayed, spatialMode, speakerMode2d, spatialTrials, selectedTimbreId]);

  useEffect(() => {
    if (!isSpatialStage) {
      stopBaselineSweep();
      stopSpatialCue();
      setBaselinePoint(null);
    }
    return () => {
      stopBaselineSweep();
      stopSpatialCue();
      closeAudioContext();
    };
  }, [isSpatialStage]);

  return {
    phase,
    spatialTrials,
    spatialIndex,
    spatialGuess,
    spatialMode,
    speakerMode2d,
    selectedTimbreId,
    spatialSeedInput,
    spatialSeed,
    baselinePoint,
    baselineRunning,
    currentSpatialTrial,
    completedSpatialTrials,
    spatialAverageScore,
    spatialAverageBreakdown,
    canGoPrevious,
    setSpatialSeedInput,
    setSpatialGuess,
    setSelectedTimbreId,
    setSpeakerMode2d,
    startSpatialTest,
    startAnswering,
    playSpatialCue,
    playBaselineSweep,
    selectAndReplayBaselinePoint,
    submitSpatialGuess,
    goToPreviousTrial,
    resetSpatialGuess
  };
}
