import { useCallback, useEffect, useRef, useState } from "react";
import {
  startBeatSchedule,
  currentBpmAtElapsed,
  BPM_START,
  BPM_END,
  TEST_DURATION_SEC,
  type BeatTestConfig
} from "./bass-rebound-core";
import { getManifestNumberParam, loadBuffer } from "../audio/custom-audio";

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
  const [testDurationSec, setTestDurationSec] = useState(TEST_DURATION_SEC);

  const audioContextRef = useRef<AudioContext | null>(null);
  const scheduleRef = useRef<{ stop: () => void } | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const testStartAtRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const runtimeConfigRef = useRef<BeatTestConfig>({
    bpmStart: BPM_START,
    bpmEnd: BPM_END,
    durationSec: TEST_DURATION_SEC
  });

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

    if (bufferSourceRef.current) {
      try {
        bufferSourceRef.current.stop();
      } catch {
        // noop
      }
      try {
        bufferSourceRef.current.disconnect();
      } catch {
        // noop
      }
      bufferSourceRef.current = null;
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
    const runtimeConfig = runtimeConfigRef.current;

    const elapsed = ctx.currentTime - startAt;
    const newProgress = Math.min((elapsed / runtimeConfig.durationSec) * 100, 100);
    setProgress(newProgress);

    // 更新最大达到的BPM
    const currentMax = currentBpmAtElapsed(elapsed, runtimeConfig);
    setCurrentBpm(currentMax);
    setMaxBpmReached((prev) => Math.max(prev, currentMax));

    if (isRunningRef.current && elapsed < runtimeConfig.durationSec) {
      rafIdRef.current = window.requestAnimationFrame(updateProgress);
    } else if (elapsed >= runtimeConfig.durationSec) {
      isRunningRef.current = false;
      setIsRunning(false);
      setProgress(100);
      setStatus("测试完成");
    }
  }, [setStatus]);

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

    const loaded = await loadBuffer(ctx, "bass-rebound", ["sequence", "default"]);
    const runtimeConfig: BeatTestConfig = {
      bpmStart: getManifestNumberParam(loaded.manifest, "bass.bpm_start", BPM_START),
      bpmEnd: getManifestNumberParam(loaded.manifest, "bass.bpm_end", BPM_END),
      durationSec: getManifestNumberParam(loaded.manifest, "bass.duration_sec", TEST_DURATION_SEC)
    };
    runtimeConfigRef.current = {
      bpmStart: Math.max(30, Math.min(600, runtimeConfig.bpmStart)),
      bpmEnd: Math.max(30, Math.min(600, runtimeConfig.bpmEnd)),
      durationSec: Math.max(5, Math.min(180, runtimeConfig.durationSec))
    };
    setTestDurationSec(runtimeConfigRef.current.durationSec);

    const startAt = ctx.currentTime;
    testStartAtRef.current = startAt;
    setCurrentBpm(runtimeConfigRef.current.bpmStart);
    setMaxBpmReached(runtimeConfigRef.current.bpmStart);

    if (loaded.buffer) {
      const source = ctx.createBufferSource();
      source.buffer = loaded.buffer;
      source.loop = loaded.buffer.duration < runtimeConfigRef.current.durationSec + 0.05;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(startAt);
      source.stop(startAt + runtimeConfigRef.current.durationSec + 0.03);
      bufferSourceRef.current = source;
    } else {
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
        },
        runtimeConfigRef.current
      );
    }

    isRunningRef.current = true;
    setIsRunning(true);
    setStatus(
      `低频回弹测试开始：${Math.round(runtimeConfigRef.current.bpmStart)}BPM → ${Math.round(runtimeConfigRef.current.bpmEnd)}BPM（${runtimeConfigRef.current.durationSec.toFixed(1)}秒）`
    );

    // 启动进度更新
    rafIdRef.current = window.requestAnimationFrame(updateProgress);
  }, [stopTest, volume, setStatus, updateProgress]);

  const markLimit = useCallback(() => {
    if (!isRunning || !audioContextRef.current || testStartAtRef.current === null) {
      return;
    }

    const elapsed = audioContextRef.current.currentTime - testStartAtRef.current;
    const bpm = currentBpmAtElapsed(elapsed, runtimeConfigRef.current);
    setMarkedBpm(Math.round(bpm));
    setStatus(`已标记回弹极限：${Math.round(bpm)} BPM`);
  }, [isRunning, setStatus]);

  const reset = useCallback(() => {
    stopTest();
    setMarkedBpm(null);
    setCurrentBpm(runtimeConfigRef.current.bpmStart);
    setMaxBpmReached(runtimeConfigRef.current.bpmStart);
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
    testDurationSec,
    setVolume,
    startTest,
    stopTest,
    markLimit,
    reset
  };
}
