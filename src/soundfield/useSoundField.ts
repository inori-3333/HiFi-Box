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
  calculateDistance,
  playBenchmarkSequence,
  playTestToneAtPosition,
  playMusicWithAngle,
  playABXVersion,
  calculatePositioningResults,
  calculateAngleResults,
  calculateABXResults,
  BENCHMARK_POINTS,
  delay,
} from "./soundfield-core";
import { loadBuffer } from "../audio/custom-audio";

const TOTAL_ROUNDS = 6;

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
  playABXVersion: (version: "a" | "b") => Promise<void>;
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
  const abxVariantBuffersRef = useRef<{ a: AudioBuffer; b: AudioBuffer } | null>(null);
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
    const durationSec = 6;
    const frameCount = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < frameCount; i += 1) {
      const t = i / ctx.sampleRate;
      const pad = Math.sin(2 * Math.PI * 220 * t) * 0.2 + Math.sin(2 * Math.PI * 440 * t) * 0.1;
      const shimmer = Math.sin(2 * Math.PI * 880 * t) * 0.05;
      const lfo = Math.sin(2 * Math.PI * 0.25 * t);
      left[i] = (pad + shimmer) * (0.85 + 0.15 * lfo);
      right[i] = (pad - shimmer) * (0.85 - 0.15 * lfo);
    }
    fallbackMusicBufferRef.current = buffer;
    return buffer;
  }, []);

  const loadSoundFieldBuffer = useCallback(async (roles: string[]): Promise<AudioBuffer | null> => {
    const ctx = await initAudioContext();
    const result = await loadBuffer(ctx, "soundfield", roles);
    return result.buffer;
  }, [initAudioContext]);

  // ==================== Positioning Mode ====================

  const startBenchmarkPlayback = useCallback(async () => {
    const ctx = await initAudioContext();
    abortControllerRef.current = false;
    if (!positioningBenchmarkBufferRef.current) {
      positioningBenchmarkBufferRef.current = await loadSoundFieldBuffer([
        "positioning:benchmark",
        "positioning",
        "default"
      ]);
    }

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
        setStatus('校准完成！点击"开始测试"开始定位测试');
      },
      volume,
      200,
      positioningBenchmarkBufferRef.current ?? undefined
    );
  }, [initAudioContext, loadSoundFieldBuffer, setStatus, volume]);

  const startPositioningRound = useCallback(async () => {
    if (positioning.currentRound >= TOTAL_ROUNDS) {
      setPositioning(prev => ({ ...prev, phase: "result" }));
      setStatus("定点定位测试完成！");
      return;
    }

    const targetPoint = generateRandomPoint();
    const ctx = await initAudioContext();
    if (!positioningTestBufferRef.current) {
      positioningTestBufferRef.current = await loadSoundFieldBuffer([
        "positioning:test",
        "positioning",
        "default"
      ]);
    }

    setPositioning(prev => ({
      ...prev,
      targetPoint,
      phase: "playing-test",
      isPlaying: true,
      userGuess: { x: 0, y: 0, z: 0 },
    }));
    setStatus(`第 ${positioning.currentRound + 1}/${TOTAL_ROUNDS} 轮 - 正在播放测试音...`);

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
  }, [initAudioContext, loadSoundFieldBuffer, positioning.currentRound, setStatus, volume]);

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
      phase: prev.currentRound + 1 >= TOTAL_ROUNDS ? "result" : "selecting",
      isPlaying: false,
    }));

    if (positioning.currentRound + 1 >= TOTAL_ROUNDS) {
      setStatus(`第 ${positioning.currentRound + 1} 轮完成！误差: ${error.toFixed(3)} - 测试结束`);
    } else {
      setStatus(`第 ${positioning.currentRound + 1} 轮完成！误差: ${error.toFixed(3)} - 点击"下一轮"继续`);
    }
  }, [positioning.targetPoint, positioning.userGuess, positioning.currentRound, setStatus]);

  const resetPositioning = useCallback(() => {
    setPositioning(initialPositioningState);
    setActiveBenchmarkIndex(null);
  }, []);

  // ==================== Angle Mode ====================

  const loadTestMusic = useCallback(async (): Promise<boolean> => {
    try {
      const ctx = await initAudioContext();
      const loaded = await loadBuffer(ctx, "soundfield", ["angle", "default"]);
      if (loaded.buffer) {
        angleMusicBufferRef.current = loaded.buffer;
        setStatus("已加载目录测试音频");
        return true;
      }
      angleMusicBufferRef.current = ensureFallbackMusicBuffer(ctx);
      setStatus("未找到可用目录音频，已回退为合成音");
      return true;
    } catch {
      const ctx = await initAudioContext();
      angleMusicBufferRef.current = ensureFallbackMusicBuffer(ctx);
      setStatus("目录音频加载失败，已回退为合成音");
      return true;
    }
  }, [ensureFallbackMusicBuffer, initAudioContext, setStatus]);

  const startAngleRound = useCallback(async () => {
    if (angle.currentRound >= TOTAL_ROUNDS) {
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

    setAngle(prev => ({
      ...prev,
      currentAngle: targetAngle,
      phase: "playing",
      isPlaying: true,
      userGuess: 90,
    }));
    setStatus(`第 ${angle.currentRound + 1}/${TOTAL_ROUNDS} 轮 - 正在播放音乐...`);

    const playback = await playMusicWithAngle(ctx, angleMusicBufferRef.current!, targetAngle, volume);
    currentPlaybackRef.current = playback;

    // Wait for playback to finish
    const duration = angleMusicBufferRef.current!.duration * 1000;
    await delay(Math.min(duration, 10000)); // Max 10 seconds

    if (!abortControllerRef.current) {
      stopPlayback();
      setAngle(prev => ({ ...prev, phase: "selecting", isPlaying: false }));
      setStatus("请调整滑块选择感知角度，然后提交");
    }
  }, [initAudioContext, angle.currentRound, loadTestMusic, setStatus, volume, stopPlayback]);

  const updateAngleGuess = useCallback((angleValue: number) => {
    setAngle(prev => ({ ...prev, userGuess: angleValue }));
  }, []);

  const submitAngleGuess = useCallback(() => {
    const error = Math.abs(angle.currentAngle - angle.userGuess);
    const round: AngleRound = {
      roundNumber: angle.currentRound + 1,
      targetAngle: angle.currentAngle,
      guessAngle: angle.userGuess,
      error,
    };

    setAngle(prev => ({
      ...prev,
      rounds: [...prev.rounds, round],
      currentRound: prev.currentRound + 1,
      phase: prev.currentRound + 1 >= TOTAL_ROUNDS ? "result" : "selecting",
    }));

    if (angle.currentRound + 1 >= TOTAL_ROUNDS) {
      setStatus(`第 ${angle.currentRound + 1} 轮完成！误差: ${error}° - 测试结束`);
    } else {
      setStatus(`第 ${angle.currentRound + 1} 轮完成！误差: ${error}° - 点击"下一轮"继续`);
    }
  }, [angle.currentAngle, angle.userGuess, angle.currentRound, setStatus]);

  const resetAngle = useCallback(() => {
    setAngle(initialAngleState);
  }, []);

  // ==================== ABX Mode ====================

  const loadABXMusic = useCallback(async (): Promise<boolean> => {
    const ctx = await initAudioContext();
    const explicitA = await loadBuffer(ctx, "soundfield", ["abx:a"]);
    const explicitB = await loadBuffer(ctx, "soundfield", ["abx:b"]);

    if (explicitA.buffer && explicitB.buffer) {
      abxVariantBuffersRef.current = { a: explicitA.buffer, b: explicitB.buffer };
      angleMusicBufferRef.current = null;
      setStatus("已加载 ABX 显式 A/B 音频");
      return true;
    }

    abxVariantBuffersRef.current = null;
    const base = await loadBuffer(ctx, "soundfield", ["abx:base", "abx", "angle", "default"]);
    if (base.buffer) {
      angleMusicBufferRef.current = base.buffer;
      setStatus("已加载 ABX 基础音频，将通过程序生成差异");
      return true;
    }

    angleMusicBufferRef.current = ensureFallbackMusicBuffer(ctx);
    setStatus("未找到 ABX 目录音频，已回退为合成音");
    return true;
  }, [ensureFallbackMusicBuffer, initAudioContext, setStatus]);

  const playABXVersionCallback = useCallback(async (version: "a" | "b") => {
    if (!abxVariantBuffersRef.current && !angleMusicBufferRef.current) {
      const loaded = await loadABXMusic();
      if (!loaded) return;
    }

    const ctx = await initAudioContext();
    const currentTrial = abx.trials[abx.currentTrial];

    stopPlayback();
    setIsPlaying(true);
    setStatus(`正在播放版本 ${version.toUpperCase()}...`);

    const playback = abxVariantBuffersRef.current
      ? await playMusicWithAngle(
        ctx,
        version === "a" ? abxVariantBuffersRef.current.a : abxVariantBuffersRef.current.b,
        90,
        volume
      )
      : await playABXVersion(
        ctx,
        angleMusicBufferRef.current!,
        version,
        currentTrial?.aIsWider ?? true,
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

    const correct = (choice === "a") === currentTrial.aIsWider;
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
        phase: prev.currentTrial + 1 >= TOTAL_ROUNDS ? "result" : "selecting",
      };
    });

    if (abx.currentTrial + 1 >= TOTAL_ROUNDS) {
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
      // Generate 6 random trials
      const trials: ABXTrial[] = [];
      for (let i = 0; i < TOTAL_ROUNDS; i++) {
        trials.push({
          trialNumber: i + 1,
          aIsWider: Math.random() > 0.5,
          userChoice: null,
          correct: false,
        });
      }
      setAbx(prev => ({ ...prev, trials, phase: "selecting" }));
    }
  }, [mode, abx.trials.length]);

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
    abxVariantBuffersRef.current = null;
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
