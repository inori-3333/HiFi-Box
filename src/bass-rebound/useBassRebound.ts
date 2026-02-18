import { useCallback, useEffect, useRef, useState } from "react";
import { startBeatSchedule, currentBpmAtElapsed, BPM_START, BPM_END, TEST_DURATION_SEC } from "./bass-rebound-core";

export type BassReboundController = {
  readonly isRunning: boolean;
  readonly currentBpm: number;
  readonly markedBpm: number | null;
  readonly maxBpmReached: number;
  readonly progress: number;
  readonly volume: number;
  readonly testDurationSec: number;
  setVolume: (value: number) => void;
  startTest: () => Promise<void>;
  stopTest: () => void;
  markLimit: () => void;
  reset: () => void;
};

type UseBassReboundOptions = {
  setStatus: (value: string) => void;
};

export function useBassRebound(options: UseBassReboundOptions): BassReboundController {
  const { setStatus } = options;
  const [isRunning, setIsRunning] = useState(false);
  const [currentBpm, setCurrentBpm] = useState(BPM_START);
  const [markedBpm, setMarkedBpm] = useState<number | null>(null);
  const [maxBpmReached, setMaxBpmReached] = useState(BPM_START);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.35);

  const audioContextRef = useRef<AudioContext | null>(null);
  const scheduleRef = useRef<{ stop: () => void } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const testStartAtRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);

  const stopTest = useCallback(() => {
    // 停止动画帧
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // 停止调度
    if (scheduleRef.current) {
      scheduleRef.current.stop();
      scheduleRef.current = null;
    }

    isRunningRef.current = false;
    testStartAtRef.current = null;
    setIsRunning(false);
    setStatus("测试已停止");
  }, [setStatus]);

  const updateProgress = useCallback(() => {
    const ctx = audioContextRef.current;
    const startAt = testStartAtRef.current;
    if (!ctx || startAt === null) return;

    const elapsed = ctx.currentTime - startAt;
    const newProgress = Math.min((elapsed / TEST_DURATION_SEC) * 100, 100);
    setProgress(newProgress);

    // 更新最大达到的BPM
    const currentMax = currentBpmAtElapsed(elapsed);
    setMaxBpmReached((prev) => Math.max(prev, currentMax));

    if (isRunningRef.current && elapsed < TEST_DURATION_SEC) {
      rafIdRef.current = window.requestAnimationFrame(updateProgress);
    }
  }, []);

  const startTest = useCallback(async () => {
    stopTest();

    // 重置状态
    setMarkedBpm(null);
    setProgress(0);
    setMaxBpmReached(BPM_START);

    // 初始化音频上下文
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const startAt = ctx.currentTime;
    testStartAtRef.current = startAt;

    // 启动鼓点调度
    scheduleRef.current = startBeatSchedule(
      ctx,
      volume,
      (bpm) => {
        setCurrentBpm(bpm);
      },
      () => {
        // 测试完成
        isRunningRef.current = false;
        setIsRunning(false);
        setProgress(100);
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setStatus("测试完成");
      }
    );

    isRunningRef.current = true;
    setIsRunning(true);
    setStatus(`低频回弹测试开始：${BPM_START}BPM → ${BPM_END}BPM（${TEST_DURATION_SEC}秒）`);

    // 启动进度更新
    rafIdRef.current = window.requestAnimationFrame(updateProgress);
  }, [stopTest, volume, setStatus, updateProgress]);

  const markLimit = useCallback(() => {
    if (!isRunning || !audioContextRef.current || testStartAtRef.current === null) {
      return;
    }

    const elapsed = audioContextRef.current.currentTime - testStartAtRef.current;
    const bpm = currentBpmAtElapsed(elapsed);
    setMarkedBpm(Math.round(bpm));
    setStatus(`已标记回弹极限：${Math.round(bpm)} BPM`);
  }, [isRunning, setStatus]);

  const reset = useCallback(() => {
    stopTest();
    setMarkedBpm(null);
    setCurrentBpm(BPM_START);
    setMaxBpmReached(BPM_START);
    setProgress(0);
    setStatus("准备开始测试");
  }, [stopTest, setStatus]);

  // 清理
  useEffect(() => {
    return () => {
      stopTest();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopTest]);

  return {
    isRunning,
    currentBpm,
    markedBpm,
    maxBpmReached,
    progress,
    volume,
    testDurationSec: TEST_DURATION_SEC,
    setVolume,
    startTest,
    stopTest,
    markLimit,
    reset
  };
}
