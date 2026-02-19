export type SoundFieldDimension = "width" | "depth" | "height" | "immersion";

export type SoundFieldMode = "positioning" | "abx" | "continuous";

export type SoundFieldPoint = {
  x: number; // 左右: -1 (左) ~ +1 (右)
  y: number; // 前后: -1 (后) ~ +1 (前)
  z: number; // 上下: -1 (下) ~ +1 (上)
};

// 定点定位模式 - 单轮测试结果
export type PositioningRound = {
  roundId: number;
  target: SoundFieldPoint;           // 测试音实际位置
  userGuess: SoundFieldPoint;        // 用户选择的位置
  timestamp: number;                 // 完成时间
  error: number;                     // 误差距离
  isVisible: boolean;                // 是否在3D场景中显示
};

// 定点定位模式 - 会话（一个测试音位置可能有多轮）
export type PositioningSession = {
  sessionId: string;                 // 唯一标识
  target: SoundFieldPoint;           // 当前测试音位置
  rounds: PositioningRound[];        // 所有轮次结果
  currentRound: number;              // 当前进行到哪一轮
};

// 定点定位模式 - 测试阶段
export type PositioningPhase = "idle" | "calibrating" | "playing" | "guessing" | "saved";

export type SoundFieldTrial = {
  id: number;
  dimension: SoundFieldDimension;
  target: SoundFieldPoint;
  userGuess?: SoundFieldPoint;
  score?: number;
};

export type SoundFieldResult = {
  widthScore: number;
  depthScore: number;
  heightScore: number;
  immersionScore: number;
  overallScore: number;
  trials: SoundFieldTrial[];
};

export type ABXTrial = {
  id: number;
  dimension: SoundFieldDimension;
  isAWider: boolean; // A是否更宽/更深/更高/更沉浸
  userChoice?: "a" | "b";
  correct?: boolean;
};

export type ContinuousRating = {
  dimension: SoundFieldDimension;
  rating: number; // 1-10
};

export const SOUNDFIELD_TRIALS_PER_DIMENSION = 3;
export const SOUNDFIELD_TOTAL_TRIALS = 12; // 4 dimensions x 3 trials

const MAX_DISTANCE = Math.sqrt(3); // 3D空间最大距离

// 7个基准点坐标（用于定点定位校准）
export const BENCHMARK_POINTS: { point: SoundFieldPoint; name: string }[] = [
  { point: { x: 0, y: 0, z: 0 }, name: "原点" },
  { point: { x: -1, y: 0, z: 0 }, name: "左" },
  { point: { x: 1, y: 0, z: 0 }, name: "右" },
  { point: { x: 0, y: -1, z: 0 }, name: "后" },
  { point: { x: 0, y: 1, z: 0 }, name: "前" },
  { point: { x: 0, y: 0, z: -1 }, name: "下" },
  { point: { x: 0, y: 0, z: 1 }, name: "上" }
];

// 轮次颜色方案
export const ROUND_COLORS = [
  "#2196f3", // 第1轮 - 蓝色
  "#4caf50", // 第2轮 - 绿色
  "#ff9800", // 第3轮 - 橙色
  "#9c27b0", // 第4轮 - 紫色
  "#00bcd4"  // 第5轮 - 青色
];

// 创建噪声缓冲区（用于混响效果）
const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const existing = noiseBufferCache.get(ctx);
  if (existing) return existing;

  const durationSec = 2.0;
  const frameCount = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channel[i] = Math.random() * 2 - 1;
  }
  noiseBufferCache.set(ctx, buffer);
  return buffer;
}

// 创建空间定位的 PannerNode
function createSpatialPanner(ctx: AudioContext, point: SoundFieldPoint): PannerNode {
  return new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    positionX: point.x * 2,
    positionY: point.y * 2,
    positionZ: point.z * 2,
    refDistance: 1,
    maxDistance: 12,
    rolloffFactor: 1.5
  });
}

// 计算距离
function distance(a: SoundFieldPoint, b: SoundFieldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// 计算评分（基于误差）
function scoreFromError(error: number, maxError: number): number {
  const normalized = error / Math.max(maxError, 1e-9);
  // 使用 S 型曲线映射
  const score = 100 * (1 - normalized);
  return Math.max(0, Math.min(100, score));
}

// 生成测试点
export function generateSoundFieldTargets(dimension: SoundFieldDimension): SoundFieldPoint[] {
  const targets: SoundFieldPoint[] = [];

  for (let i = 0; i < SOUNDFIELD_TRIALS_PER_DIMENSION; i++) {
    switch (dimension) {
      case "width":
        // 主要在 x 轴变化
        targets.push({
          x: (i === 0 ? -0.8 : i === 1 ? 0.8 : 0) + (Math.random() - 0.5) * 0.2,
          y: (Math.random() - 0.5) * 0.4,
          z: (Math.random() - 0.5) * 0.3
        });
        break;
      case "depth":
        // 主要在 y 轴变化
        targets.push({
          x: (Math.random() - 0.5) * 0.4,
          y: (i === 0 ? -0.7 : i === 1 ? 0.7 : 0.3) + (Math.random() - 0.5) * 0.2,
          z: (Math.random() - 0.5) * 0.3
        });
        break;
      case "height":
        // 主要在 z 轴变化
        targets.push({
          x: (Math.random() - 0.5) * 0.3,
          y: (Math.random() - 0.5) * 0.3,
          z: (i === 0 ? -0.6 : i === 1 ? 0.6 : 0) + (Math.random() - 0.5) * 0.2
        });
        break;
      case "immersion":
        // 全方位随机
        const angle = (i / SOUNDFIELD_TRIALS_PER_DIMENSION) * Math.PI * 2;
        const radius = 0.5 + Math.random() * 0.4;
        targets.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: (Math.random() - 0.5) * 0.8
        });
        break;
    }
  }

  return targets;
}

// 计算声场测试得分
export function computeSoundFieldScore(
  dimension: SoundFieldDimension,
  target: SoundFieldPoint,
  guess: SoundFieldPoint
): number {
  const dx = Math.abs(guess.x - target.x);
  const dy = Math.abs(guess.y - target.y);
  const dz = Math.abs(guess.z - target.z);

  // 各维度有不同的权重
  const weights = {
    width: { x: 0.7, y: 0.15, z: 0.15 },
    depth: { x: 0.15, y: 0.7, z: 0.15 },
    height: { x: 0.15, y: 0.15, z: 0.7 },
    immersion: { x: 0.33, y: 0.34, z: 0.33 }
  };

  const w = weights[dimension];
  const weightedError = dx * w.x + dy * w.y + dz * w.z;

  return scoreFromError(weightedError, 2);
}

// 播放声场测试音
export function playSoundFieldTone(
  ctx: AudioContext,
  point: SoundFieldPoint,
  durationSec: number = 0.8
): { endAt: number; stop: () => void } {
  const startAt = ctx.currentTime + 0.05;

  // 创建一个悦耳的测试音
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, startAt);
  osc.frequency.exponentialRampToValueAtTime(330, startAt + durationSec * 0.7);

  // 增益控制
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.05);
  gain.gain.setValueAtTime(0.4, startAt + durationSec * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  // 空间定位
  const panner = createSpatialPanner(ctx, point);

  // 连接
  osc.connect(gain);
  gain.connect(panner);
  panner.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.1);

  const endAt = startAt + durationSec;

  return {
    endAt,
    stop: () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      try {
        osc.stop(now + 0.06);
      } catch {
        // noop
      }
    }
  };
}

// ===== 定点定位模式新函数 =====

// 生成随机测试点（单点）
export function generateRandomTarget(): SoundFieldPoint {
  // 在单位球内生成随机点
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const radius = 0.3 + Math.random() * 0.6; // 半径 0.3 ~ 0.9，避免太中心和太边缘

  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi)
  };
}

// 计算两点之间的欧氏距离
export function calculateDistance(a: SoundFieldPoint, b: SoundFieldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// 计算用户猜测与实际位置的误差（0~1标准化，1表示完全正确，0表示最大错误）
export function calculateError(target: SoundFieldPoint, guess: SoundFieldPoint): number {
  const dist = calculateDistance(target, guess);
  // 最大可能距离是 sqrt(12) ≈ 3.46 (对角线)
  const maxDist = Math.sqrt(12);
  return Math.min(1, dist / maxDist);
}

// 播放定点定位测试音（在指定位置播放短音）
export function playPositioningTone(
  ctx: AudioContext,
  point: SoundFieldPoint,
  durationSec: number = 0.6,
  frequency: number = 440
): { endAt: number; stop: () => void } {
  const startAt = ctx.currentTime + 0.05;

  // 使用正弦波产生纯净音
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);

  // 增益控制（ADSR包络）
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.03);
  gain.gain.setValueAtTime(0.4, startAt + durationSec * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  // 空间定位
  const panner = createSpatialPanner(ctx, point);

  // 连接
  osc.connect(gain);
  gain.connect(panner);
  panner.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.1);

  const endAt = startAt + durationSec;

  return {
    endAt,
    stop: () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      try {
        osc.stop(now + 0.06);
      } catch {
        // noop
      }
    }
  };
}

// 播放测试旋律（在指定3D位置播放连续旋律）
export function playMelodyAtPosition(
  ctx: AudioContext,
  point: SoundFieldPoint,
  duration: number = 3.0
): { stop: () => void } {
  const startAt = ctx.currentTime + 0.05;
  const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 261.63]; // C大调音阶上行+下行
  const noteDuration = duration / notes.length;

  const sources: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx % 2 === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, startAt + idx * noteDuration);

    const gain = ctx.createGain();
    const noteStart = startAt + idx * noteDuration;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.35, noteStart + 0.05);
    gain.gain.setValueAtTime(0.35, noteStart + noteDuration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    // 每个音符都在同一位置
    const panner = createSpatialPanner(ctx, point);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteStart + noteDuration + 0.05);
    sources.push(osc);
    gains.push(gain);
  });

  return {
    stop: () => {
      const now = ctx.currentTime;
      sources.forEach((osc, i) => {
        gains[i].gain.cancelScheduledValues(now);
        gains[i].gain.setValueAtTime(Math.max(0.0001, gains[i].gain.value), now);
        gains[i].gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        try {
          osc.stop(now + 0.06);
        } catch {
          // noop
        }
      });
    }
  };
}

// 延迟辅助函数
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 播放7个基准音（校准阶段）
export async function playCalibrationTones(
  ctx: AudioContext,
  onProgress: (step: number, point: SoundFieldPoint, name: string) => void,
  onComplete: () => void
): Promise<void> {
  for (let i = 0; i < BENCHMARK_POINTS.length; i++) {
    const { point, name } = BENCHMARK_POINTS[i];
    onProgress(i, point, name);

    // 不同位置使用不同频率以便区分
    const frequency = 440 + i * 30;
    const playback = playPositioningTone(ctx, point, 0.5, frequency);

    // 等待音播放完成 + 间隔
    await delay(800);
    playback.stop();
  }
  onComplete();
}

// 计算综合结果
export function computeOverallResult(trials: SoundFieldTrial[]): SoundFieldResult {
  const dimensionScores: Record<SoundFieldDimension, number[]> = {
    width: [],
    depth: [],
    height: [],
    immersion: []
  };

  trials.forEach((trial) => {
    if (trial.score !== undefined) {
      dimensionScores[trial.dimension].push(trial.score);
    }
  });

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const widthScore = avg(dimensionScores.width);
  const depthScore = avg(dimensionScores.depth);
  const heightScore = avg(dimensionScores.height);
  const immersionScore = avg(dimensionScores.immersion);

  const overallScore = (widthScore + depthScore + heightScore + immersionScore) / 4;

  return {
    widthScore: Math.round(widthScore),
    depthScore: Math.round(depthScore),
    heightScore: Math.round(heightScore),
    immersionScore: Math.round(immersionScore),
    overallScore: Math.round(overallScore),
    trials
  };
}

// ABX 测试相关
export function generateABXTrials(): ABXTrial[] {
  const trials: ABXTrial[] = [];
  const dimensions: SoundFieldDimension[] = ["width", "depth", "height", "immersion"];

  let id = 0;
  dimensions.forEach((dim) => {
    for (let i = 0; i < 2; i++) {
      trials.push({
        id: id++,
        dimension: dim,
        isAWider: Math.random() > 0.5
      });
    }
  });

  return trials;
}

// 播放 ABX 测试音（两种不同的声场宽度）
export function playABXTone(
  ctx: AudioContext,
  type: "a" | "b",
  dimension: SoundFieldDimension
): { endAt: number; stop: () => void } {
  const startAt = ctx.currentTime + 0.05;
  const durationSec = 1.2;

  // A 和 B 有不同的空间特性
  const spreadFactor = type === "a" ? 1.5 : 0.8;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(392, startAt);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.03);
  gain.gain.setValueAtTime(0.35, startAt + durationSec * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  // 根据维度调整空间定位
  const panner = new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    refDistance: 1,
    maxDistance: 12,
    rolloffFactor: 1.5
  });

  switch (dimension) {
    case "width":
      panner.positionX.setValueAtTime((type === "a" ? 1.5 : 0.8) * spreadFactor, startAt);
      panner.positionY.setValueAtTime(0, startAt);
      panner.positionZ.setValueAtTime(0, startAt);
      break;
    case "depth":
      panner.positionX.setValueAtTime(0, startAt);
      panner.positionY.setValueAtTime((type === "a" ? 1.2 : 0.6) * spreadFactor, startAt);
      panner.positionZ.setValueAtTime(0, startAt);
      break;
    case "height":
      panner.positionX.setValueAtTime(0, startAt);
      panner.positionY.setValueAtTime(0, startAt);
      panner.positionZ.setValueAtTime((type === "a" ? 1.0 : 0.5) * spreadFactor, startAt);
      break;
    case "immersion":
      panner.positionX.setValueAtTime(0.5 * spreadFactor, startAt);
      panner.positionY.setValueAtTime(0.5 * spreadFactor, startAt);
      panner.positionZ.setValueAtTime(0.3 * spreadFactor, startAt);
      break;
  }

  osc.connect(gain);
  gain.connect(panner);
  panner.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.1);

  return {
    endAt: startAt + durationSec,
    stop: () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      try {
        osc.stop(now + 0.06);
      } catch {
        // noop
      }
    }
  };
}

// 连续听音模式 - 播放一段持续的声场测试音
export function playContinuousTone(
  ctx: AudioContext,
  onEnded?: () => void
): { duration: number; stop: () => void } {
  const startAt = ctx.currentTime + 0.05;
  const durationSec = 8.0;

  // 创建多个振荡器产生和弦
  const frequencies = [261.63, 329.63, 392.0]; // C 大调和弦
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;

  const sources: OscillatorNode[] = [];

  frequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, startAt);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.4, startAt + 1.0);
    gain.gain.setValueAtTime(0.4, startAt + durationSec - 1.0);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

    // 缓慢移动的空间定位
    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 1,
      maxDistance: 12,
      rolloffFactor: 1.5
    });

    // 圆周运动
    const startAngle = (idx / frequencies.length) * Math.PI * 2;
    for (let i = 0; i <= 20; i++) {
      const t = startAt + (durationSec * i) / 20;
      const angle = startAngle + (i / 20) * Math.PI * 2;
      panner.positionX.setValueAtTime(Math.cos(angle) * 1.2, t);
      panner.positionY.setValueAtTime(Math.sin(angle) * 0.8, t);
      panner.positionZ.setValueAtTime(Math.sin(angle * 0.5) * 0.5, t);
    }

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.1);
    sources.push(osc);
  });

  masterGain.connect(ctx.destination);

  // 定时器触发结束回调
  const timer = window.setTimeout(() => {
    onEnded?.();
  }, durationSec * 1000);

  return {
    duration: durationSec,
    stop: () => {
      window.clearTimeout(timer);
      const now = ctx.currentTime;
      sources.forEach((osc) => {
        try {
          osc.stop(now + 0.05);
        } catch {
          // noop
        }
      });
    }
  };
}
