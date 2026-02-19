import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ImageSizePhase,
  computeImageSizeScore,
  generateTargetSize,
  playImageSizeTone,
  REFERENCE_SIZE
} from "./image-size-core";

export type ImageSizeController = {
  // 状态
  readonly phase: ImageSizePhase;
  readonly targetSize: number;
  readonly userSize: number;
  readonly score: number | null;
  readonly error: number | null;
  readonly isPlayingReference: boolean;
  readonly isPlayingTest: boolean;
  readonly trialCount: number;

  // 方法
  setUserSize: (value: number) => void;
  playReference: () => Promise<void>;
  startTest: () => Promise<void>;
  submitAnswer: () => void;
  resetTest: () => void;
};

type UseImageSizeTestOptions = {
  setStatus: (value: string) => void;
};

export function useImageSizeTest(options: UseImageSizeTestOptions): ImageSizeController {
  const { setStatus } = options;

  const [phase, setPhase] = useState<ImageSizePhase>("idle");
  const [targetSize, setTargetSize] = useState<number>(0);
  const [userSize, setUserSize] = useState<number>(0.5);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [isPlayingReference, setIsPlayingReference] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [trialCount, setTrialCount] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackStopRef = useRef<(() => void) | null>(null);

  // 停止当前播放
  const stopPlayback = useCallback(() => {
    if (playbackStopRef.current) {
      playbackStopRef.current();
      playbackStopRef.current = null;
    }
  }, []);

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
        if (phase !== "playing-test" && phase !== "completed") {
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

  // 开始测试
  const startTest = useCallback(async () => {
    // 停止当前播放
    stopPlayback();

    // 生成新的目标大小
    const newTargetSize = generateTargetSize();
    setTargetSize(newTargetSize);
    setUserSize(0.5); // 重置用户选择到中间
    setScore(null);
    setError(null);

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
    setTrialCount(prev => prev + 1);
    setStatus("播放测试音，请调整滑杆匹配结像大小");

    // 播放测试音（循环播放3次，让用户有足够时间判断）
    let playCount = 0;
    const maxPlays = 3;

    const playLoop = () => {
      if (playCount >= maxPlays) {
        setIsPlayingTest(false);
        setStatus("测试音播放完成，请提交答案");
        return;
      }

      const { stop } = playImageSizeTone(
        ctx,
        newTargetSize,
        1.5,
        () => {
          playCount++;
          if (playCount < maxPlays) {
            // 间隔0.5秒后再次播放
            window.setTimeout(playLoop, 500);
          } else {
            setIsPlayingTest(false);
            setStatus("测试音播放完成，请提交答案");
          }
        }
      );

      playbackStopRef.current = stop;
    };

    playLoop();
  }, [stopPlayback, setStatus]);

  // 提交答案
  const submitAnswer = useCallback(() => {
    if (phase !== "playing-test" && phase !== "ready-for-test") {
      return;
    }

    const errorValue = Math.abs(targetSize - userSize);
    const scoreValue = computeImageSizeScore(targetSize, userSize);

    setError(errorValue);
    setScore(scoreValue);
    setPhase("completed");
    setStatus(`测试完成！得分: ${scoreValue.toFixed(1)}，误差: ${(errorValue * 100).toFixed(1)}%`);
  }, [phase, targetSize, userSize, setStatus]);

  // 重置测试
  const resetTest = useCallback(() => {
    stopPlayback();
    setPhase("idle");
    setTargetSize(0);
    setUserSize(0.5);
    setScore(null);
    setError(null);
    setIsPlayingReference(false);
    setIsPlayingTest(false);
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
    targetSize,
    userSize,
    score,
    error,
    isPlayingReference,
    isPlayingTest,
    trialCount,
    setUserSize,
    playReference,
    startTest,
    submitAnswer,
    resetTest
  };
}
