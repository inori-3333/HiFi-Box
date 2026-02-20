import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ImageSizePhase,
  type ImageSizeSession,
  type ImageSizeTrial,
  type ImageSizeOverallResult,
  type ImageSizeAlgorithm,
  ALGORITHM_CONFIGS,
  computeImageSizeScore,
  generateImageSizeSession,
  computeOverallResult,
  playImageSizeToneByAlgorithm,
  REFERENCE_SIZE
} from "./image-size-core";
import { loadBuffer } from "../audio/custom-audio";

export type ImageSizeController = {
  // 状态
  readonly phase: ImageSizePhase;
  readonly session: ImageSizeSession | null;
  readonly currentTrial: ImageSizeTrial | null;
  readonly userSize: number;
  readonly score: number | null;
  readonly error: number | null;
  readonly isPlayingReference: boolean;
  readonly isPlayingTest: boolean;
  readonly overallResult: ImageSizeOverallResult | null;
  readonly algorithm: ImageSizeAlgorithm;
  readonly algorithmConfigs: typeof ALGORITHM_CONFIGS;

  // 方法
  setUserSize: (value: number) => void;
  setAlgorithm: (algo: ImageSizeAlgorithm) => void;
  playReference: () => Promise<void>;
  startTest: () => Promise<void>;
  replayTestTone: () => Promise<void>;
  submitAnswer: () => void;
  nextTrial: () => void;
  resetTest: () => void;
};

type UseImageSizeTestOptions = {
  setStatus: (value: string) => void;
};

const TOTAL_TRIALS = 5; // 默认5道题目

export function useImageSizeTest(options: UseImageSizeTestOptions): ImageSizeController {
  const { setStatus } = options;

  const [phase, setPhase] = useState<ImageSizePhase>("idle");
  const [session, setSession] = useState<ImageSizeSession | null>(null);
  const [userSize, setUserSize] = useState<number>(0.5);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [isPlayingReference, setIsPlayingReference] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [overallResult, setOverallResult] = useState<ImageSizeOverallResult | null>(null);
  const [algorithm, setAlgorithmState] = useState<ImageSizeAlgorithm>('decorrelation');

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackStopRef = useRef<(() => void) | null>(null);
  const currentTargetSizeRef = useRef<number>(0);
  const referenceBufferRef = useRef<AudioBuffer | null>(null);
  const testBufferRef = useRef<AudioBuffer | null>(null);

  // 停止当前播放
  const stopPlayback = useCallback(() => {
    if (playbackStopRef.current) {
      playbackStopRef.current();
      playbackStopRef.current = null;
    }
  }, []);

  // 获取当前题目
  const getCurrentTrial = useCallback((): ImageSizeTrial | null => {
    if (!session) return null;
    return session.trials[session.currentTrial] || null;
  }, [session]);

  // 设置算法
  const setAlgorithm = useCallback((algo: ImageSizeAlgorithm) => {
    setAlgorithmState(algo);
    referenceBufferRef.current = null;
    testBufferRef.current = null;
    const algoName = ALGORITHM_CONFIGS.find(c => c.type === algo)?.name || algo;
    setStatus(`已切换到算法: ${algoName}`);
  }, [setStatus]);

  const loadImageSizeSource = useCallback(async (kind: "reference" | "test"): Promise<AudioBuffer | null> => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const cacheRef = kind === "reference" ? referenceBufferRef : testBufferRef;
    if (cacheRef.current) {
      return cacheRef.current;
    }
    const loaded = await loadBuffer(ctx, "image-size", [
      `${kind}:${algorithm}`,
      kind,
      `algorithm:${algorithm}`,
      "default"
    ]);
    cacheRef.current = loaded.buffer ?? null;
    return cacheRef.current;
  }, [algorithm]);

  // 播放基准音
  const playReference = useCallback(async () => {
    // 如果正在播放测试音，先停止
    stopPlayback();

    // 初始化音频上下文
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    setIsPlayingReference(true);
    setPhase("playing-reference");
    const algoName = ALGORITHM_CONFIGS.find(c => c.type === algorithm)?.name || algorithm;
    setStatus(`播放基准音（${algoName}）...`);
    const sourceBuffer = await loadImageSizeSource("reference");

    // 播放基准音（使用当前选择的算法）
    const { stop } = playImageSizeToneByAlgorithm(
      ctx,
      REFERENCE_SIZE,
      algorithm,
      1.5,
      () => {
        setIsPlayingReference(false);
        const currentPhase = phase;
        if (currentPhase !== "playing-test" && currentPhase !== "completed") {
          setPhase("ready-for-test");
          setStatus("基准音播放完成，可以点击「开始测试」");
        }
      },
      sourceBuffer ?? undefined
    );

    playbackStopRef.current = stop;

    // 设置超时清理状态
    window.setTimeout(() => {
      setIsPlayingReference(false);
    }, 1500);
  }, [algorithm, loadImageSizeSource, phase, setStatus, stopPlayback]);

  // 开始测试（生成新的会话）
  const startTest = useCallback(async () => {
    // 停止当前播放
    stopPlayback();

    // 生成新的会话（多道题目）
    const newSession = generateImageSizeSession(TOTAL_TRIALS);
    setSession(newSession);
    currentTargetSizeRef.current = newSession.trials[0].targetSize;
    setUserSize(0.5); // 重置用户选择到中间
    setScore(null);
    setError(null);
    setOverallResult(null);

    // 初始化音频上下文
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    setIsPlayingTest(true);
    setPhase("playing-test");
    const algoName = ALGORITHM_CONFIGS.find(c => c.type === algorithm)?.name || algorithm;
    setStatus(`第 1/${TOTAL_TRIALS} 题（${algoName}）：播放测试音，请调整滑杆匹配结像大小`);
    const sourceBuffer = await loadImageSizeSource("test");

    // 播放测试音（使用选定的算法）
    const { stop } = playImageSizeToneByAlgorithm(
      ctx,
      newSession.trials[0].targetSize,
      algorithm,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      },
      sourceBuffer ?? undefined
    );

    playbackStopRef.current = stop;
  }, [algorithm, loadImageSizeSource, setStatus, stopPlayback]);

  // 重播当前测试音
  const replayTestTone = useCallback(async () => {
    const currentTrialData = getCurrentTrial();
    if (!currentTrialData) {
      setStatus("请先开始测试");
      return;
    }

    // 停止当前播放
    stopPlayback();

    // 初始化音频上下文
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    setIsPlayingTest(true);
    setPhase("playing-test");
    const algoName = ALGORITHM_CONFIGS.find(c => c.type === algorithm)?.name || algorithm;
    setStatus(`第 ${session!.currentTrial + 1}/${TOTAL_TRIALS} 题（${algoName}）：重播测试音`);
    const sourceBuffer = await loadImageSizeSource("test");

    // 播放测试音（使用选定的算法）
    const { stop } = playImageSizeToneByAlgorithm(
      ctx,
      currentTrialData.targetSize,
      algorithm,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      },
      sourceBuffer ?? undefined
    );

    playbackStopRef.current = stop;
  }, [algorithm, getCurrentTrial, loadImageSizeSource, session, setStatus, stopPlayback]);

  // 提交答案
  const submitAnswer = useCallback(() => {
    if (!session) return;
    if (phase !== "playing-test" && phase !== "ready-for-test") return;

    const currentTrial = getCurrentTrial();
    if (!currentTrial) return;

    const errorValue = Math.abs(currentTrial.targetSize - userSize);
    const scoreValue = computeImageSizeScore(currentTrial.targetSize, userSize);

    // 更新当前题目
    const updatedTrials = [...session.trials];
    updatedTrials[session.currentTrial] = {
      ...currentTrial,
      userSize,
      error: errorValue,
      score: scoreValue
    };

    setSession({
      ...session,
      trials: updatedTrials
    });

    setError(errorValue);
    setScore(scoreValue);
    setStatus(`第 ${session.currentTrial + 1}/${TOTAL_TRIALS} 题完成！得分: ${scoreValue.toFixed(1)}`);

    // 检查是否全部完成
    if (session.currentTrial >= TOTAL_TRIALS - 1) {
      // 全部完成
      const result = computeOverallResult(updatedTrials);
      setOverallResult(result);
      setPhase("completed");
      setStatus(`测试完成！综合得分: ${result.averageScore.toFixed(1)}`);
    } else {
      // 进入下一题
      setPhase("ready-for-test");
    }
  }, [phase, session, userSize, getCurrentTrial, setStatus]);

  // 进入下一题
  const nextTrial = useCallback(async () => {
    if (!session) return;
    if (session.currentTrial >= TOTAL_TRIALS - 1) return;

    const nextIndex = session.currentTrial + 1;
    const nextTrial = session.trials[nextIndex];

    setSession({
      ...session,
      currentTrial: nextIndex
    });
    currentTargetSizeRef.current = nextTrial.targetSize;
    setUserSize(0.5); // 重置用户选择
    setScore(null);
    setError(null);

    // 自动播放下一题测试音
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    setIsPlayingTest(true);
    setPhase("playing-test");
    const algoName = ALGORITHM_CONFIGS.find(c => c.type === algorithm)?.name || algorithm;
    setStatus(`第 ${nextIndex + 1}/${TOTAL_TRIALS} 题（${algoName}）：播放测试音...`);
    const sourceBuffer = await loadImageSizeSource("test");

    const { stop } = playImageSizeToneByAlgorithm(
      ctx,
      nextTrial.targetSize,
      algorithm,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      },
      sourceBuffer ?? undefined
    );

    playbackStopRef.current = stop;
  }, [algorithm, loadImageSizeSource, session, setStatus]);

  // 重置测试
  const resetTest = useCallback(() => {
    stopPlayback();
    setPhase("idle");
    setSession(null);
    setUserSize(0.5);
    setScore(null);
    setError(null);
    setIsPlayingReference(false);
    setIsPlayingTest(false);
    setOverallResult(null);
    // 不重置algorithm，保持用户选择
    referenceBufferRef.current = null;
    testBufferRef.current = null;
    setStatus("准备开始测试");
  }, [stopPlayback, setStatus]);

  // 清理
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
    phase,
    session,
    currentTrial: getCurrentTrial(),
    userSize,
    score,
    error,
    isPlayingReference,
    isPlayingTest,
    overallResult,
    algorithm,
    algorithmConfigs: ALGORITHM_CONFIGS,
    setUserSize,
    setAlgorithm,
    playReference,
    startTest,
    replayTestTone,
    submitAnswer,
    nextTrial,
    resetTest
  };
}
