import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ImageSizePhase,
  type ImageSizeSession,
  type ImageSizeTrial,
  type ImageSizeOverallResult,
  computeImageSizeScore,
  generateImageSizeSession,
  computeOverallResult,
  playImageSizeTone,
  REFERENCE_SIZE
} from "./image-size-core";

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

  // 方法
  setUserSize: (value: number) => void;
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackStopRef = useRef<(() => void) | null>(null);
  const currentTargetSizeRef = useRef<number>(0);

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
    setStatus("播放基准音（中等大小）...");

    // 播放基准音
    const { stop } = playImageSizeTone(
      ctx,
      REFERENCE_SIZE,
      1.5,
      () => {
        setIsPlayingReference(false);
        const currentPhase = phase;
        if (currentPhase !== "playing-test" && currentPhase !== "completed") {
          setPhase("ready-for-test");
          setStatus("基准音播放完成，可以点击「开始测试」");
        }
      }
    );

    playbackStopRef.current = stop;

    // 设置超时清理状态
    window.setTimeout(() => {
      setIsPlayingReference(false);
    }, 1500);
  }, [stopPlayback, setStatus, phase]);

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
    setStatus(`第 1/${TOTAL_TRIALS} 题：播放测试音，请调整滑杆匹配结像大小`);

    // 播放测试音
    const { stop } = playImageSizeTone(
      ctx,
      newSession.trials[0].targetSize,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      }
    );

    playbackStopRef.current = stop;
  }, [stopPlayback, setStatus]);

  // 重播当前测试音
  const replayTestTone = useCallback(async () => {
    const currentTrial = getCurrentTrial();
    if (!currentTrial) {
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
    setStatus(`第 ${session!.currentTrial + 1}/${TOTAL_TRIALS} 题：重播测试音`);

    // 播放测试音
    const { stop } = playImageSizeTone(
      ctx,
      currentTrial.targetSize,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      }
    );

    playbackStopRef.current = stop;
  }, [getCurrentTrial, session, stopPlayback, setStatus]);

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
    setStatus(`第 ${nextIndex + 1}/${TOTAL_TRIALS} 题：播放测试音...`);

    const { stop } = playImageSizeTone(
      ctx,
      nextTrial.targetSize,
      1.5,
      () => {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
      }
    );

    playbackStopRef.current = stop;
  }, [session, setStatus]);

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
    setUserSize,
    playReference,
    startTest,
    replayTestTone,
    submitAnswer,
    nextTrial,
    resetTest
  };
}
