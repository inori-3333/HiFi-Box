export type SoundFieldDimension = "width" | "depth" | "height" | "immersion";

export type SoundFieldMode = "positioning" | "abx" | "continuous";

export type SoundFieldPoint = {
  x: number; // 左右: -1 (左) ~ +1 (右)
  y: number; // 前后: -1 (后) ~ +1 (前)
  z: number; // 上下: -1 (下) ~ +1 (上)
};

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
