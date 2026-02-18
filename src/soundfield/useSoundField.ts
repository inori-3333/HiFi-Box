import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SoundFieldDimension,
  SoundFieldMode,
  SoundFieldPoint,
  SoundFieldTrial,
  SoundFieldResult,
  ABXTrial,
  ContinuousRating
} from "./soundfield-core";
import {
  generateSoundFieldTargets,
  computeSoundFieldScore,
  playSoundFieldTone,
  generateABXTrials,
  playABXTone,
  playContinuousTone,
  computeOverallResult,
  SOUNDFIELD_TRIALS_PER_DIMENSION
} from "./soundfield-core";

export type SoundFieldController = {
  // 状态
  mode: SoundFieldMode;
  currentDimension: SoundFieldDimension;
  currentTrial: number;
  totalTrials: number;
  isPlaying: boolean;
  trials: SoundFieldTrial[];
  abxTrials: ABXTrial[];
  currentABXTrial: number;
  abxCorrect: number;
  continuousRatings: ContinuousRating[];
  results: SoundFieldResult | null;
  volume: number;

  // 模式切换
  setMode: (mode: SoundFieldMode) => void;
  setVolume: (volume: number) => void;

  // 定点定位模式
  playTestTone: (point?: SoundFieldPoint) => Promise<void>;
  submitGuess: (guess: SoundFieldPoint) => void;
  currentTarget: SoundFieldPoint | null;

  // AB测试模式
  playABX: (type: "a" | "b") => Promise<void>;
  submitABXChoice: (choice: "a" | "b") => void;

  // 连续听音模式
  playContinuous: () => Promise<void>;
  submitRating: (dimension: SoundFieldDimension, rating: number) => void;

  // 控制
  startTest: () => void;
  reset: () => void;
  nextTrial: () => void;
};

type UseSoundFieldOptions = {
  setStatus: (status: string) => void;
};

const DIMENSIONS: SoundFieldDimension[] = ["width", "depth", "height", "immersion"];

export function useSoundField(options: UseSoundFieldOptions): SoundFieldController {
  const { setStatus } = options;

  // 模式状态
  const [mode, setMode] = useState<SoundFieldMode>("positioning");
  const [volume, setVolumeState] = useState(0.4);

  // 定点定位模式状态
  const [currentDimension, setCurrentDimension] = useState<SoundFieldDimension>("width");
  const [currentTrial, setCurrentTrial] = useState(0);
  const [trials, setTrials] = useState<SoundFieldTrial[]>([]);
  const [currentTarget, setCurrentTarget] = useState<SoundFieldPoint | null>(null);

  // AB测试模式状态
  const [abxTrials, setAbxTrials] = useState<ABXTrial[]>([]);
  const [currentABXTrial, setCurrentABXTrial] = useState(0);
  const [abxCorrect, setAbxCorrect] = useState(0);

  // 连续听音模式状态
  const [continuousRatings, setContinuousRatings] = useState<ContinuousRating[]>([]);
  const [hasPlayedContinuous, setHasPlayedContinuous] = useState(false);

  // 结果
  const [results, setResults] = useState<SoundFieldResult | null>(null);

  // 音频状态
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentPlaybackRef = useRef<{ stop: () => void } | null>(null);

  // 计算总试次数
  const totalTrials = SOUNDFIELD_TRIALS_PER_DIMENSION * DIMENSIONS.length;

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (currentPlaybackRef.current) {
      currentPlaybackRef.current.stop();
      currentPlaybackRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // 初始化音频上下文
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

  // 设置音量
  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0.05, Math.min(0.8, v)));
  }, []);

  // 生成所有试次
  const generateAllTrials = useCallback(() => {
    const allTrials: SoundFieldTrial[] = [];
    let id = 0;

    DIMENSIONS.forEach((dim) => {
      const targets = generateSoundFieldTargets(dim);
      targets.forEach((target) => {
        allTrials.push({
          id: id++,
          dimension: dim,
          target
        });
      });
    });

    // 随机打乱
    for (let i = allTrials.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTrials[i], allTrials[j]] = [allTrials[j], allTrials[i]];
    }

    setTrials(allTrials);
    if (allTrials.length > 0) {
      setCurrentTarget(allTrials[0].target);
      setCurrentDimension(allTrials[0].dimension);
    }
  }, []);

  // 开始测试
  const startTest = useCallback(() => {
    stopPlayback();
    setResults(null);
    setContinuousRatings([]);
    setHasPlayedContinuous(false);
    setAbxCorrect(0);

    if (mode === "positioning") {
      generateAllTrials();
      setCurrentTrial(0);
      setStatus(`声场测试开始 - 第 1/${totalTrials} 试次`);
    } else if (mode === "abx") {
      setAbxTrials(generateABXTrials());
      setCurrentABXTrial(0);
      setStatus("ABX 测试开始 - 辨别哪个声场更开阔");
    } else if (mode === "continuous") {
      setStatus("连续听音模式 - 请先播放测试音，然后对四个维度评分");
    }
  }, [mode, stopPlayback, generateAllTrials, totalTrials, setStatus]);

  // 播放测试音（定点定位）
  const playTestTone = useCallback(
    async (point?: SoundFieldPoint) => {
      const target = point || currentTarget;
      if (!target) return;

      stopPlayback();
      const ctx = await initAudioContext();

      setIsPlaying(true);
      setStatus(`正在播放 ${currentDimension === "width" ? "宽度" : currentDimension === "depth" ? "深度" : currentDimension === "height" ? "高度" : "沉浸感"} 测试音...`);

      const playback = playSoundFieldTone(ctx, target, 1.0);
      currentPlaybackRef.current = playback;

      window.setTimeout(() => {
        setIsPlaying(false);
        currentPlaybackRef.current = null;
      }, 1000);
    },
    [currentTarget, currentDimension, initAudioContext, stopPlayback, setStatus]
  );

  // 提交答案（定点定位）
  const submitGuess = useCallback(
    (guess: SoundFieldPoint) => {
      if (currentTrial >= trials.length || !currentTarget) return;

      const trial = trials[currentTrial];
      const score = computeSoundFieldScore(trial.dimension, trial.target, guess);

      setTrials((prev) => {
        const updated = [...prev];
        updated[currentTrial] = { ...trial, userGuess: guess, score };
        return updated;
      });

      setStatus(`第 ${currentTrial + 1} 试次完成 - 得分: ${Math.round(score)}`);

      // 自动进入下一试次或结束
      if (currentTrial < trials.length - 1) {
        const nextTrialIndex = currentTrial + 1;
        setCurrentTrial(nextTrialIndex);
        setCurrentTarget(trials[nextTrialIndex].target);
        setCurrentDimension(trials[nextTrialIndex].dimension);
      } else {
        // 测试完成
        const finalTrials = trials.map((t, i) =>
          i === currentTrial ? { ...t, userGuess: guess, score } : t
        );
        const result = computeOverallResult(finalTrials);
        setResults(result);
        setStatus(
          `测试完成! 综合得分: ${result.overallScore} | 宽:${result.widthScore} 深:${result.depthScore} 高:${result.heightScore} 沉浸:${result.immersionScore}`
        );
      }
    },
    [currentTrial, trials, currentTarget, setStatus]
  );

  // 下一试次（手动）
  const nextTrial = useCallback(() => {
    if (currentTrial < trials.length - 1) {
      const next = currentTrial + 1;
      setCurrentTrial(next);
      setCurrentTarget(trials[next].target);
      setCurrentDimension(trials[next].dimension);
      setStatus(`第 ${next + 1}/${totalTrials} 试次`);
    }
  }, [currentTrial, trials, totalTrials, setStatus]);

  // 播放 ABX 测试音
  const playABX = useCallback(
    async (type: "a" | "b") => {
      if (currentABXTrial >= abxTrials.length) return;

      stopPlayback();
      const ctx = await initAudioContext();
      const trial = abxTrials[currentABXTrial];

      setIsPlaying(true);
      setStatus(`播放 ${type.toUpperCase()} 音段...`);

      const playback = playABXTone(ctx, type, trial.dimension);
      currentPlaybackRef.current = playback;

      window.setTimeout(() => {
        setIsPlaying(false);
        currentPlaybackRef.current = null;
      }, 1200);
    },
    [currentABXTrial, abxTrials, initAudioContext, stopPlayback, setStatus]
  );

  // 提交 ABX 选择
  const submitABXChoice = useCallback(
    (choice: "a" | "b") => {
      if (currentABXTrial >= abxTrials.length) return;

      const trial = abxTrials[currentABXTrial];
      const isCorrect = (choice === "a") === trial.isAWider;

      if (isCorrect) {
        setAbxCorrect((prev) => prev + 1);
      }

      setAbxTrials((prev) => {
        const updated = [...prev];
        updated[currentABXTrial] = { ...trial, userChoice: choice, correct: isCorrect };
        return updated;
      });

      setStatus(`${choice.toUpperCase()} 选择 ${isCorrect ? "✓ 正确" : "✗ 错误"}`);

      // 进入下一试次
      if (currentABXTrial < abxTrials.length - 1) {
        setCurrentABXTrial((prev) => prev + 1);
      } else {
        // ABX 测试完成
        const finalCorrect = abxCorrect + (isCorrect ? 1 : 0);
        const score = Math.round((finalCorrect / abxTrials.length) * 100);
        setStatus(`ABX 测试完成! 正确率: ${finalCorrect}/${abxTrials.length} (${score}%)`);
      }
    },
    [currentABXTrial, abxTrials, abxCorrect, setStatus]
  );

  // 播放连续听音
  const playContinuous = useCallback(async () => {
    stopPlayback();
    const ctx = await initAudioContext();

    setIsPlaying(true);
    setHasPlayedContinuous(true);
    setStatus("正在播放声场测试音，请仔细聆听...");

    const playback = playContinuousTone(ctx, () => {
      setIsPlaying(false);
      currentPlaybackRef.current = null;
      setStatus("播放结束，请对四个维度进行评分");
    });

    currentPlaybackRef.current = playback;
  }, [initAudioContext, stopPlayback, setStatus]);

  // 提交连续听音评分
  const submitRating = useCallback(
    (dimension: SoundFieldDimension, rating: number) => {
      setContinuousRatings((prev) => {
        const filtered = prev.filter((r) => r.dimension !== dimension);
        return [...filtered, { dimension, rating }];
      });

      const dimensionName =
        dimension === "width"
          ? "宽度"
          : dimension === "depth"
            ? "深度"
            : dimension === "height"
              ? "高度"
              : "沉浸感";
      setStatus(`${dimensionName} 评分: ${rating}/10`);
    },
    [setStatus]
  );

  // 重置
  const reset = useCallback(() => {
    stopPlayback();
    setTrials([]);
    setCurrentTrial(0);
    setCurrentTarget(null);
    setAbxTrials([]);
    setCurrentABXTrial(0);
    setAbxCorrect(0);
    setContinuousRatings([]);
    setHasPlayedContinuous(false);
    setResults(null);
    setStatus("准备开始声场测试");
  }, [stopPlayback, setStatus]);

  // 切换模式时重置
  useEffect(() => {
    reset();
  }, [mode, reset]);

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
    mode,
    currentDimension,
    currentTrial,
    totalTrials,
    isPlaying,
    trials,
    abxTrials,
    currentABXTrial,
    abxCorrect,
    continuousRatings,
    results,
    volume,
    currentTarget,

    setMode,
    setVolume,

    playTestTone,
    submitGuess,

    playABX,
    submitABXChoice,

    playContinuous,
    submitRating,

    startTest,
    reset,
    nextTrial
  };
}
