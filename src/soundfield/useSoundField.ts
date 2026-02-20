import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TestMode,
  Point3D,
  PositioningState,
  PositioningRound,
  AngleState,
  AngleRound,
  ABXState,
  ABXTrial,
} from "./soundfield-core";
import {
  initialPositioningState,
  initialAngleState,
  initialABXState,
  generateRandomPoint,
  generateRandomAngle,
  generateRandomAbxAnglePair,
  calculateDistance,
  playBenchmarkSequence,
  playTestToneAtPosition,
  playMusicWithAngle,
  playABXVersion,
  analyzeOpeningAngle,
  buildAbxTrial,
  calculatePositioningResults,
  calculateAngleResults,
  calculateABXResults,
  BENCHMARK_POINTS,
  delay,
} from "./soundfield-core";
import { buildPublicUrl } from "../audio/custom-audio";

const POSITIONING_ROUNDS = 6;
const ANGLE_ROUNDS = 8;
const ABX_TRIALS = 8;

export type SoundFieldController = {
  // Mode
  mode: TestMode;
  setMode: (mode: TestMode) => void;

  // Common
  volume: number;
  setVolume: (volume: number) => void;
  isPlaying: boolean;
  activeBenchmarkIndex: number | null;

  // Positioning mode
  positioning: PositioningState;
  startBenchmarkPlayback: () => Promise<void>;
  startPositioningRound: () => Promise<void>;
  replayPositioningTestTone: () => Promise<void>;
  updatePositioningGuess: (x: number, y: number, z: number) => void;
  submitPositioningGuess: () => void;
  resetPositioning: () => void;

  // Angle mode
  angle: AngleState;
  loadTestMusic: () => Promise<boolean>;
  startAngleRound: () => Promise<void>;
  updateAngleGuess: (angle: number) => void;
  submitAngleGuess: () => void;
  resetAngle: () => void;

  // ABX mode
  abx: ABXState;
  loadABXMusic: () => Promise<boolean>;
  playABXVersion: (version: "a" | "b" | "x") => Promise<void>;
  submitABXChoice: (choice: "a" | "b") => void;
  resetABX: () => void;

  // Reset all
  reset: () => void;
};

type UseSoundFieldOptions = {
  setStatus: (status: string) => void;
};

export function useSoundField(options: UseSoundFieldOptions): SoundFieldController {
  const { setStatus } = options;

  // Mode
  const [mode, setMode] = useState<TestMode>("positioning");

  // Common state
  const [volume, setVolumeState] = useState(0.4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBenchmarkIndex, setActiveBenchmarkIndex] = useState<number | null>(null);

  // Mode-specific states
  const [positioning, setPositioning] = useState<PositioningState>(initialPositioningState);
  const [angle, setAngle] = useState<AngleState>(initialAngleState);
  const [abx, setAbx] = useState<ABXState>(initialABXState);

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentPlaybackRef = useRef<{ stop: () => void } | null>(null);
  const abortControllerRef = useRef<boolean>(false);

  const positioningBenchmarkBufferRef = useRef<AudioBuffer | null>(null);
  const positioningTestBufferRef = useRef<AudioBuffer | null>(null);
  const angleMusicBufferRef = useRef<AudioBuffer | null>(null);
  const fallbackMusicBufferRef = useRef<AudioBuffer | null>(null);

  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }, []);

  // Stop playback
  const stopPlayback = useCallback(() => {
    if (currentPlaybackRef.current) {
      currentPlaybackRef.current.stop();
      currentPlaybackRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Set volume
  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0.05, Math.min(0.8, v)));
  }, []);

  const ensureFallbackMusicBuffer = useCallback((ctx: AudioContext): AudioBuffer => {
    if (fallbackMusicBufferRef.current) {
      return fallbackMusicBufferRef.current;
    }
    // 15秒更丰富的合成音乐 - 使用和弦进行和变化的音色
    const durationSec = 15;
    const frameCount = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // 和弦进行的基频 (I-V-vi-IV 进行)
    const chordRoots = [261.63, 392.00, 220.00, 349.23]; // C4, G4, A3, F4
    const chordLength = durationSec / chordRoots.length;

    for (let i = 0; i < frameCount; i += 1) {
      const t = i / ctx.sampleRate;
      const chordIndex = Math.min(Math.floor(t / chordLength), chordRoots.length - 1);
      const rootFreq = chordRoots[chordIndex];

      // 构建和弦音 (根音+三度+五度)
      const fundamental = Math.sin(2 * Math.PI * rootFreq * t) * 0.15;
      const third = Math.sin(2 * Math.PI * rootFreq * 1.25 * t) * 0.12; // 大三度
      const fifth = Math.sin(2 * Math.PI * rootFreq * 1.5 * t) * 0.10;  // 纯五度
      const octave = Math.sin(2 * Math.PI * rootFreq * 2 * t) * 0.08;   // 八度

      // 添加一些谐波让声音更温暖
      const harmonic2 = Math.sin(2 * Math.PI * rootFreq * 0.5 * t) * 0.05;

      // 缓慢变化的立体声场
      const lfo = Math.sin(2 * Math.PI * 0.1 * t); // 0.1Hz 缓慢扫频
      const stereoWidth = 0.3 + 0.2 * Math.sin(2 * Math.PI * 0.05 * t);

      // 包络避免爆音
      let envelope = 1;
      const chordTime = t % chordLength;
      if (chordTime < 0.1) envelope = chordTime / 0.1; // 攻击
      if (chordTime > chordLength - 0.3) envelope = (chordLength - chordTime) / 0.3; // 释放

      const mix = (fundamental + third + fifth + octave + harmonic2) * envelope;

      // 立体声输出
      left[i] = mix * (0.85 + stereoWidth * lfo);
      right[i] = mix * (0.85 - stereoWidth * lfo);
    }
    fallbackMusicBufferRef.current = buffer;
    return buffer;
  }, []);

  // Load a specific audio file directly from public folder
  const loadAudioFile = useCallback(async (relativePath: string): Promise<AudioBuffer | null> => {
    const ctx = await initAudioContext();
    const url = buildPublicUrl(relativePath);
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }, [initAudioContext]);

  // ==================== Positioning Mode ====================

  const startBenchmarkPlayback = useCallback(async () => {
    const ctx = await initAudioContext();
    abortControllerRef.current = false;
    // 基准音使用钢琴和弦，不传入音频缓冲区
    setPositioning(prev => ({ ...prev, phase: "playing-benchmark", isPlaying: true }));
    setStatus("正在播放基准音校准...");

    await playBenchmarkSequence(
      ctx,
      (index) => {
        if (abortControllerRef.current) return;
        setActiveBenchmarkIndex(index);
        setStatus(`基准音: ${BENCHMARK_POINTS[index].name} (${index + 1}/${BENCHMARK_POINTS.length})`);
      },
      () => {
        if (abortControllerRef.current) return;
        setActiveBenchmarkIndex(null);
        setPositioning(prev => ({ ...prev, phase: "selecting", isPlaying: false }));
        setStatus('校准完成！点击"开始测试"播放测试音');
      },
      volume,
      200,
      undefined // 不传入音频缓冲区，使用钢琴和弦
    );
  }, [initAudioContext, setStatus, volume]);

  const startPositioningRound = useCallback(async () => {
    if (positioning.currentRound >= POSITIONING_ROUNDS) {
      setPositioning(prev => ({ ...prev, phase: "result" }));
      setStatus("定点定位测试完成！");
      return;
    }

    const targetPoint = generateRandomPoint();
    const ctx = await initAudioContext();
    // 定点定位模式使用合成音
    if (!positioningTestBufferRef.current) {
      positioningTestBufferRef.current = ensureFallbackMusicBuffer(ctx);
    }

    setPositioning(prev => ({
      ...prev,
      targetPoint,
      phase: "playing-test",
      isPlaying: true,
      userGuess: { x: 0, y: 0, z: 0 },
    }));
    setStatus(`第 ${positioning.currentRound + 1}/${POSITIONING_ROUNDS} 轮 - 正在播放测试音...`);

    const playback = playTestToneAtPosition(
      ctx,
      targetPoint,
      volume,
      positioningTestBufferRef.current ?? undefined
    );
    currentPlaybackRef.current = playback;

    await delay(1500);

    if (!abortControllerRef.current) {
      setIsPlaying(false);
      currentPlaybackRef.current = null;
      setPositioning(prev => ({ ...prev, phase: "selecting", isPlaying: false }));
      setStatus("请调整滑块选择声音位置，然后提交");
    }
  }, [initAudioContext, ensureFallbackMusicBuffer, positioning.currentRound, setStatus, volume]);

  const updatePositioningGuess = useCallback((x: number, y: number, z: number) => {
    setPositioning(prev => ({
      ...prev,
      userGuess: {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
        z: Math.max(-1, Math.min(1, z)),
      },
    }));
  }, []);

  const replayPositioningTestTone = useCallback(async () => {
    if (!positioning.targetPoint) return;
    const ctx = await initAudioContext();

    setPositioning(prev => ({ ...prev, isPlaying: true }));
    setStatus("正在重复播放测试音...");

    const playback = playTestToneAtPosition(
      ctx,
      positioning.targetPoint,
      volume,
      positioningTestBufferRef.current ?? undefined
    );
    currentPlaybackRef.current = playback;

    await delay(1500);

    if (!abortControllerRef.current) {
      setIsPlaying(false);
      currentPlaybackRef.current = null;
      setPositioning(prev => ({ ...prev, isPlaying: false }));
      setStatus("请调整滑块选择声音位置，然后提交");
    }
  }, [initAudioContext, positioning.targetPoint, volume, setStatus]);

  const submitPositioningGuess = useCallback(() => {
    if (!positioning.targetPoint) return;

    const error = calculateDistance(positioning.targetPoint, positioning.userGuess);
    const round: PositioningRound = {
      roundNumber: positioning.currentRound + 1,
      target: positioning.targetPoint,
      guess: { ...positioning.userGuess },
      error,
    };

    setPositioning(prev => ({
      ...prev,
      rounds: [...prev.rounds, round],
      currentRound: prev.currentRound + 1,
      phase: prev.currentRound + 1 >= POSITIONING_ROUNDS ? "result" : "submitted",
      isPlaying: false,
    }));

    if (positioning.currentRound + 1 >= POSITIONING_ROUNDS) {
      setStatus(`第 ${positioning.currentRound + 1} 轮完成！误差: ${error.toFixed(3)} - 测试结束`);
    } else {
      setStatus(`第 ${positioning.currentRound + 1} 轮完成！误差: ${error.toFixed(3)} - 点击"下一题"继续`);
    }
  }, [positioning.targetPoint, positioning.userGuess, positioning.currentRound, setStatus]);

  const resetPositioning = useCallback(() => {
    setPositioning(initialPositioningState);
    setActiveBenchmarkIndex(null);
  }, []);

  // ==================== Angle Mode ====================

  const loadTestMusic = useCallback(async (): Promise<boolean> => {
    const ctx = await initAudioContext();
    // 角度模式使用 public/audio/soundfield/test-music.mp3
    const buffer = await loadAudioFile("audio/soundfield/test-music.mp3");
    if (buffer) {
      angleMusicBufferRef.current = buffer;
      setStatus("已加载测试音乐");
      return true;
    }
    angleMusicBufferRef.current = ensureFallbackMusicBuffer(ctx);
    setStatus("未找到测试音乐，已回退为合成音");
    return true;
  }, [ensureFallbackMusicBuffer, initAudioContext, loadAudioFile, setStatus]);

  const startAngleRound = useCallback(async () => {
    if (angle.currentRound >= ANGLE_ROUNDS) {
      setAngle(prev => ({ ...prev, phase: "result" }));
      setStatus("角度感知测试完成！");
      return;
    }

    if (!angleMusicBufferRef.current) {
      const loaded = await loadTestMusic();
      if (!loaded) return;
    }

    const targetAngle = generateRandomAngle();
    const ctx = await initAudioContext();
    const analysis = analyzeOpeningAngle(ctx, angleMusicBufferRef.current!, targetAngle);

    setAngle(prev => ({
      ...prev,
      currentAngle: targetAngle,
      objectiveCurrentAngle: analysis.cues.openingAngleDeg,
      currentCues: analysis.cues,
      phase: "playing",
      isPlaying: true,
      userGuess: 90,
    }));
    setStatus(`第 ${angle.currentRound + 1}/${ANGLE_ROUNDS} 轮 - 正在播放音乐（左右对称开角）...`);

    const playback = await playMusicWithAngle(ctx, analysis.processedBuffer, 90, volume);
    currentPlaybackRef.current = playback;

    // Wait for playback to finish
    const duration = angleMusicBufferRef.current!.duration * 1000;
    await delay(Math.min(duration, 10000)); // Max 10 seconds

    if (!abortControllerRef.current) {
      stopPlayback();
      setAngle(prev => ({ ...prev, phase: "selecting", isPlaying: false }));
      setStatus(
        `请调整滑块选择感知开角后提交（等效单侧方位 ±${analysis.cues.thetaSideDeg.toFixed(1)}°）`
      );
    }
  }, [initAudioContext, angle.currentRound, loadTestMusic, setStatus, volume, stopPlayback]);

  const updateAngleGuess = useCallback((angleValue: number) => {
    setAngle(prev => ({ ...prev, userGuess: angleValue }));
  }, []);

  const submitAngleGuess = useCallback(() => {
    const error = Math.abs(angle.objectiveCurrentAngle - angle.userGuess);
    const round: AngleRound = {
      roundNumber: angle.currentRound + 1,
      targetOpeningAngleDeg: angle.currentAngle,
      guessOpeningAngleDeg: angle.userGuess,
      errorDeg: error,
      objectiveOpeningAngleDeg: angle.objectiveCurrentAngle,
      objectiveSideAzimuthDeg: (angle.currentCues?.thetaSideDeg ?? angle.objectiveCurrentAngle / 2),
      cues: angle.currentCues ?? {
        itdSec: 0,
        ildDb: 0,
        thetaItdDeg: 45,
        thetaIldDeg: 45,
        thetaSideDeg: 45,
        openingAngleDeg: 90,
        itdWeight: 0.5,
        ildWeight: 0.5,
        confidence: 0.1,
      },
    };

    setAngle(prev => ({
      ...prev,
      rounds: [...prev.rounds, round],
      currentRound: prev.currentRound + 1,
      phase: prev.currentRound + 1 >= ANGLE_ROUNDS ? "result" : "selecting",
    }));

    if (angle.currentRound + 1 >= ANGLE_ROUNDS) {
      setStatus(`第 ${angle.currentRound + 1} 轮完成！误差: ${error}° - 测试结束`);
    } else {
      setStatus(`第 ${angle.currentRound + 1} 轮完成！误差: ${error}° - 点击"下一轮"继续`);
    }
  }, [angle.currentAngle, angle.currentCues, angle.objectiveCurrentAngle, angle.userGuess, angle.currentRound, setStatus]);

  const resetAngle = useCallback(() => {
    setAngle(initialAngleState);
  }, []);

  // ==================== ABX Mode ====================

  const loadABXMusic = useCallback(async (): Promise<boolean> => {
    const ctx = await initAudioContext();
    // ABX 模式使用 public/audio/soundfield/test-music.mp3
    const buffer = await loadAudioFile("audio/soundfield/test-music.mp3");
    if (buffer) {
      angleMusicBufferRef.current = buffer;
      setStatus("已加载 ABX 测试音乐");
      return true;
    }

    angleMusicBufferRef.current = ensureFallbackMusicBuffer(ctx);
    setStatus("未找到 ABX 测试音乐，已回退为合成音");
    return true;
  }, [ensureFallbackMusicBuffer, initAudioContext, loadAudioFile, setStatus]);

  const playABXVersionCallback = useCallback(async (version: "a" | "b" | "x") => {
    if (!angleMusicBufferRef.current) {
      const loaded = await loadABXMusic();
      if (!loaded) return;
    }

    const ctx = await initAudioContext();
    const currentTrial = abx.trials[abx.currentTrial];
    if (!currentTrial) {
      setStatus("当前没有可播放的 ABX 轮次");
      return;
    }

    stopPlayback();
    setIsPlaying(true);
    setStatus(`正在播放版本 ${version.toUpperCase()}（标准 ABX）...`);

    const playback = await playABXVersion(
      ctx,
      angleMusicBufferRef.current!,
      version,
      currentTrial,
      volume
    );
    currentPlaybackRef.current = playback;

    // Play for 5 seconds max
    await delay(5000);

    if (!abortControllerRef.current) {
      stopPlayback();
      setStatus(`版本 ${version.toUpperCase()} 播放完成`);
    }
  }, [initAudioContext, abx.trials, abx.currentTrial, loadABXMusic, setStatus, volume, stopPlayback]);

  const submitABXChoice = useCallback((choice: "a" | "b") => {
    const currentTrial = abx.trials[abx.currentTrial];
    if (!currentTrial) return;

    const correct = choice === currentTrial.xRef;
    const updatedTrial: ABXTrial = {
      ...currentTrial,
      userChoice: choice,
      correct,
    };

    setAbx(prev => {
      const newTrials = [...prev.trials];
      newTrials[prev.currentTrial] = updatedTrial;

      return {
        ...prev,
        trials: newTrials,
        correctCount: prev.correctCount + (correct ? 1 : 0),
        currentTrial: prev.currentTrial + 1,
        phase: prev.currentTrial + 1 >= ABX_TRIALS ? "result" : "selecting",
      };
    });

    if (abx.currentTrial + 1 >= ABX_TRIALS) {
      setStatus(`选择 ${choice.toUpperCase()} ${correct ? "正确" : "错误"} - 测试结束`);
    } else {
      setStatus(`选择 ${choice.toUpperCase()} ${correct ? "正确" : "错误"} - 准备下一轮`);
    }
  }, [abx.trials, abx.currentTrial, setStatus]);

  const resetABX = useCallback(() => {
    setAbx(initialABXState);
  }, []);

  // Initialize ABX trials when entering ABX mode
  useEffect(() => {
    if (mode === "abx" && abx.trials.length === 0) {
      let cancelled = false;
      const prepareTrials = async () => {
        if (!angleMusicBufferRef.current) {
          const loaded = await loadABXMusic();
          if (!loaded || !angleMusicBufferRef.current) {
            return;
          }
        }

        const ctx = await initAudioContext();
        const buffer = angleMusicBufferRef.current!;
        const trials: ABXTrial[] = [];
        for (let i = 0; i < ABX_TRIALS; i += 1) {
          const [aOpeningAngleDeg, bOpeningAngleDeg] = generateRandomAbxAnglePair(30);
          const xRef: "a" | "b" = Math.random() > 0.5 ? "a" : "b";
          trials.push(buildAbxTrial(ctx, buffer, i + 1, aOpeningAngleDeg, bOpeningAngleDeg, xRef));
        }

        if (!cancelled) {
          setAbx(prev => ({ ...prev, trials, phase: "selecting", currentTrial: 0, correctCount: 0 }));
          setStatus("ABX 试次已准备：每轮播放 A/B/X，请判断 X 属于 A 或 B");
        }
      };

      void prepareTrials();
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [mode, abx.trials.length, initAudioContext, loadABXMusic, setStatus]);

  // ==================== Reset ====================

  const reset = useCallback(() => {
    abortControllerRef.current = true;
    stopPlayback();
    resetPositioning();
    resetAngle();
    resetABX();
    setActiveBenchmarkIndex(null);
    positioningBenchmarkBufferRef.current = null;
    positioningTestBufferRef.current = null;
    angleMusicBufferRef.current = null;
    fallbackMusicBufferRef.current = null;
    setStatus("准备开始测试");
  }, [stopPlayback, resetPositioning, resetAngle, resetABX, setStatus]);

  // Reset when mode changes
  useEffect(() => {
    abortControllerRef.current = false;
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopPlayback]);

  return {
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
    loadTestMusic,
    startAngleRound,
    updateAngleGuess,
    submitAngleGuess,
    resetAngle,

    abx,
    loadABXMusic,
    playABXVersion: playABXVersionCallback,
    submitABXChoice,
    resetABX,

    reset,
  };
}
