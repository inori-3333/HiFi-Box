/**
 * 空间结像大小测试 - 音频合成核心
 * 支持三种算法：
 * 1. 通道去相关（Decorrelation）- 使用全通滤波器级联
 * 2. 频率相关延迟（ICTD）- Zotter方法
 * 3. 双耳HRTF - 模拟多虚拟声源
 *
 * size 0.0 = 单声道（完全居中，点最小）
 * size 1.0 = 最大立体声宽度（声音扩散到两侧，点最大）
 */

// ===== 算法类型定义 =====

export type ImageSizeAlgorithm = 'stereo-width' | 'decorrelation' | 'ictd' | 'hrtf';

export type AlgorithmConfig = {
  type: ImageSizeAlgorithm;
  name: string;
  description: string;
  reference: string;
};

// 算法配置列表
export const ALGORITHM_CONFIGS: AlgorithmConfig[] = [
  {
    type: 'stereo-width',
    name: '立体声宽度',
    description: '基础算法：通过调节左右声道增益差控制结像大小',
    reference: '传统立体声展宽技术'
  },
  {
    type: 'decorrelation',
    name: '通道去相关',
    description: '使用全通滤波器级联降低声道间相关性，产生自然展宽感',
    reference: 'Viste et al., Allpass-based Decorrelation'
  },
  {
    type: 'ictd',
    name: '频率相关延迟',
    description: 'Zotter方法：对不同频率施加不同的通道间时间差（ICTD）',
    reference: 'Zotter et al., Phantom Source Widening'
  },
  {
    type: 'hrtf',
    name: '双耳HRTF',
    description: '模拟多个虚拟声源位置，使用ITD和ILD产生空间弥散感',
    reference: 'Binaural HRTF-based Spatial Audio'
  }
];

export type ImageSizePhase = 'idle' | 'playing-reference' | 'ready-for-test' | 'playing-test' | 'completed';

export type ImageSizeTrial = {
  id: number;
  targetSize: number;      // 正确答案 (0.0 - 1.0)
  userSize?: number;       // 用户选择
  score?: number;          // 得分 (0-100)
  error?: number;          // 误差值
};

// 多道题目的会话
export type ImageSizeSession = {
  sessionId: string;
  trials: ImageSizeTrial[];    // 所有题目
  currentTrial: number;        // 当前题目索引
  totalTrials: number;         // 总题数
  isCompleted: boolean;        // 是否全部完成
};

// 多题结果汇总
export type ImageSizeOverallResult = {
  averageScore: number;
  totalError: number;
  bestTrial: number;
  worstTrial: number;
  trials: ImageSizeTrial[];
};

const REFERENCE_SIZE = 0.5;  // 基准音固定为中等大小
const TONE_DURATION_SEC = 1.5;  // 每个音持续1.5秒
const FADE_IN_SEC = 0.05;
const FADE_OUT_SEC = 0.1;

/**
 * 使用S型曲线将误差映射为得分
 * toleranceRatio: 误差容忍度（在此范围内得分较高）
 * steepness: 曲线陡峭程度
 */
function scoreFromError(error: number, maxError: number, toleranceRatio: number, steepness: number): number {
  const normalizedError = error / maxError;
  const raw = 1 / (1 + Math.exp(steepness * (normalizedError - toleranceRatio)));
  const zeroErrorRaw = 1 / (1 + Math.exp(-steepness * toleranceRatio));
  return (raw / zeroErrorRaw) * 100;
}

/**
 * 计算结像大小得分
 * @param targetSize 目标大小 (0.0 - 1.0)
 * @param userSize 用户选择的大小 (0.0 - 1.0)
 * @returns 得分 (0-100)
 */
export function computeImageSizeScore(targetSize: number, userSize: number): number {
  const error = Math.abs(targetSize - userSize);
  const maxError = 1.0; // 最大可能误差
  return scoreFromError(error, maxError, 0.15, 24);
}

/**
 * 生成随机目标大小
 * 范围 0.15 - 0.85，避免极端值
 */
export function generateTargetSize(): number {
  return 0.15 + Math.random() * 0.7;
}

/**
 * 生成多道题目的会话
 * @param totalTrials 题目数量（默认5道）
 */
export function generateImageSizeSession(totalTrials: number = 5): ImageSizeSession {
  const trials: ImageSizeTrial[] = [];
  for (let i = 0; i < totalTrials; i++) {
    trials.push({
      id: i + 1,
      targetSize: generateTargetSize()
    });
  }

  return {
    sessionId: Date.now().toString(),
    trials,
    currentTrial: 0,
    totalTrials,
    isCompleted: false
  };
}

/**
 * 计算多道题的综合结果
 */
export function computeOverallResult(trials: ImageSizeTrial[]): ImageSizeOverallResult {
  const completedTrials = trials.filter(t => t.score !== undefined);

  if (completedTrials.length === 0) {
    return {
      averageScore: 0,
      totalError: 0,
      bestTrial: 0,
      worstTrial: 0,
      trials
    };
  }

  const scores = completedTrials.map(t => t.score!);
  const errors = completedTrials.map(t => t.error!);

  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const totalError = errors.reduce((a, b) => a + b, 0);

  const bestScore = Math.max(...scores);
  const worstScore = Math.min(...scores);
  const bestTrial = completedTrials.find(t => t.score === bestScore)?.id || 1;
  const worstTrial = completedTrials.find(t => t.score === worstScore)?.id || 1;

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    totalError: Math.round(totalError * 100) / 100,
    bestTrial,
    worstTrial,
    trials
  };
}

/**
 * 创建带有指定结像大小的音频
 * @param ctx AudioContext
 * @param size 结像大小 (0.0 - 1.0)
 * @param durationSec 持续时间（秒）
 * @returns 音频节点和停止函数
 */
export function createImageSizeTone(
  ctx: AudioContext,
  size: number,
  durationSec: number
): { nodes: AudioNode[]; stop: () => void } {
  const now = ctx.currentTime;
  const endTime = now + durationSec;

  // 使用三角波 + 正弦波合成温暖音色
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = 440; // A4

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 442; // 轻微失谐增加宽度感

  // 增益控制
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();

  // 立体声合并器
  const merger = ctx.createChannelMerger(2);

  // 立体声宽度控制
  // size 0.0 = 单声道（左右相等）
  // size 1.0 = 最大宽度（左右差异最大）
  const width = Math.max(0, Math.min(1, size));

  // 计算左右声道增益
  // 当 width=0: left=0.5, right=0.5（单声道）
  // 当 width=1: left=0.9, right=0.1（最大宽度，但保留一些交叉避免完全分离）
  const leftGain1 = 0.5 + width * 0.4;
  const rightGain1 = 0.5 - width * 0.4;
  const leftGain2 = 0.5 - width * 0.4;
  const rightGain2 = 0.5 + width * 0.4;

  // 设置增益值
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.3, now + FADE_IN_SEC);
  gain1.gain.setValueAtTime(0.3, endTime - FADE_OUT_SEC);
  gain1.gain.linearRampToValueAtTime(0, endTime);

  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.2, now + FADE_IN_SEC);
  gain2.gain.setValueAtTime(0.2, endTime - FADE_OUT_SEC);
  gain2.gain.linearRampToValueAtTime(0, endTime);

  // 创建左右声道增益节点
  const leftGainNode = ctx.createGain();
  const rightGainNode = ctx.createGain();

  leftGainNode.gain.value = leftGain1;
  rightGainNode.gain.value = rightGain1;

  // 第二个振荡器的左右增益（反相）
  const leftGainNode2 = ctx.createGain();
  const rightGainNode2 = ctx.createGain();

  leftGainNode2.gain.value = leftGain2;
  rightGainNode2.gain.value = rightGain2;

  // 连接：osc1 -> gain1 -> 左右增益 -> merger
  osc1.connect(gain1);
  gain1.connect(leftGainNode);
  gain1.connect(rightGainNode);
  leftGainNode.connect(merger, 0, 0);
  rightGainNode.connect(merger, 0, 1);

  // 连接：osc2 -> gain2 -> 左右增益2 -> merger
  osc2.connect(gain2);
  gain2.connect(leftGainNode2);
  gain2.connect(rightGainNode2);
  leftGainNode2.connect(merger, 0, 0);
  rightGainNode2.connect(merger, 0, 1);

  // 连接到输出
  merger.connect(ctx.destination);

  // 启动振荡器
  osc1.start(now);
  osc2.start(now);
  osc1.stop(endTime);
  osc2.stop(endTime);

  const nodes: AudioNode[] = [
    osc1, osc2, gain1, gain2,
    leftGainNode, rightGainNode, leftGainNode2, rightGainNode2,
    merger
  ];

  const stop = () => {
    try {
      osc1.stop();
      osc2.stop();
    } catch {
      // noop
    }
    nodes.forEach(node => {
      try {
        node.disconnect();
      } catch {
        // noop
      }
    });
  };

  return { nodes, stop };
}

/**
 * 播放指定结像大小的音频
 * @param ctx AudioContext
 * @param size 结像大小 (0.0 - 1.0)
 * @param durationSec 持续时间（秒）
 * @param onComplete 播放完成回调
 * @returns 停止播放的函数
 */
export function playImageSizeTone(
  ctx: AudioContext,
  size: number,
  durationSec: number = TONE_DURATION_SEC,
  onComplete?: () => void
): { stop: () => void } {
  const { stop } = createImageSizeTone(ctx, size, durationSec);

  // 设置完成回调
  if (onComplete) {
    const timeoutId = window.setTimeout(() => {
      onComplete();
    }, durationSec * 1000);

    const originalStop = stop;
    return {
      stop: () => {
        window.clearTimeout(timeoutId);
        originalStop();
      }
    };
  }

  return { stop };
}

export { REFERENCE_SIZE, TONE_DURATION_SEC };

// ===== 三种结像大小算法实现 =====

/**
 * 算法1：通道去相关（Decorrelation）
 * 使用全通滤波器级联降低声道间相关性
 */
export function createDecorrelationTone(
  ctx: AudioContext,
  size: number,
  durationSec: number
): { nodes: AudioNode[]; stop: () => void } {
  const now = ctx.currentTime;
  const endTime = now + durationSec;
  const width = Math.max(0, Math.min(1, size));

  // 创建主振荡器（三角波作为基础音色）
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 440;

  // 增益控制（ADSR包络）
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + FADE_IN_SEC);
  gain.gain.setValueAtTime(0.4, endTime - FADE_OUT_SEC);
  gain.gain.linearRampToValueAtTime(0, endTime);

  // 立体声合并器
  const merger = ctx.createChannelMerger(2);

  // 全通滤波器频率（按对数分布覆盖听觉范围）
  const allpassFreqs = [200, 400, 800, 1600, 3200, 6400, 10000, 14000];

  // 创建原始信号路径
  const dryGainL = ctx.createGain();
  const dryGainR = ctx.createGain();
  dryGainL.gain.value = 1 - width * 0.7;
  dryGainR.gain.value = 1 - width * 0.7;

  // 创建去相关信号路径（左右声道使用不同的全通链）
  const wetGainL = ctx.createGain();
  const wetGainR = ctx.createGain();
  wetGainL.gain.value = width * 0.7;
  wetGainR.gain.value = width * 0.7;

  // 为左声道构建全通滤波器链
  let leftNode: AudioNode = gain;
  for (let i = 0; i < allpassFreqs.length; i++) {
    const allpass = ctx.createBiquadFilter();
    allpass.type = 'allpass';
    allpass.frequency.value = allpassFreqs[i];
    allpass.Q.value = 0.707;
    leftNode.connect(allpass);
    leftNode = allpass;
  }
  leftNode.connect(wetGainL);

  // 为右声道构建全通滤波器链（使用略微不同的频率）
  let rightNode: AudioNode = gain;
  for (let i = 0; i < allpassFreqs.length; i++) {
    const allpass = ctx.createBiquadFilter();
    allpass.type = 'allpass';
    // 右声道使用略微偏移的频率，产生不同的相位响应
    allpass.frequency.value = allpassFreqs[i] * 1.1;
    allpass.Q.value = 0.707;
    rightNode.connect(allpass);
    rightNode = allpass;
  }
  rightNode.connect(wetGainR);

  // 原始信号也连接到干声增益
  gain.connect(dryGainL);
  gain.connect(dryGainR);

  // 合并到左右声道
  dryGainL.connect(merger, 0, 0);
  wetGainL.connect(merger, 0, 0);
  dryGainR.connect(merger, 0, 1);
  wetGainR.connect(merger, 0, 1);

  // 连接到输出
  merger.connect(ctx.destination);

  // 启动振荡器
  osc.connect(gain);
  osc.start(now);
  osc.stop(endTime);

  const nodes: AudioNode[] = [
    osc, gain, merger, dryGainL, dryGainR, wetGainL, wetGainR
  ];

  const stop = () => {
    try {
      osc.stop();
    } catch { /* noop */ }
    nodes.forEach(node => {
      try { node.disconnect(); } catch { /* noop */ }
    });
  };

  return { nodes, stop };
}

/**
 * 算法2：频率相关延迟（ICTD - Inter-Channel Time Difference）
 * Zotter方法：对不同频率施加不同的通道间时间差
 */
export function createICTDTone(
  ctx: AudioContext,
  size: number,
  durationSec: number
): { nodes: AudioNode[]; stop: () => void } {
  const now = ctx.currentTime;
  const endTime = now + durationSec;
  const width = Math.max(0, Math.min(1, size));

  // 创建主振荡器
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 440;

  // 增益控制
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + FADE_IN_SEC);
  gain.gain.setValueAtTime(0.4, endTime - FADE_OUT_SEC);
  gain.gain.linearRampToValueAtTime(0, endTime);

  // 立体声合并器
  const merger = ctx.createChannelMerger(2);

  // 左声道：直接输出
  gain.connect(merger, 0, 0);

  // 右声道：通过多个带通滤波器分别延迟
  // 分频段：低频、中低频、中频、中高频、高频
  const bands = [
    { freq: 250, delay: 0 },                           // 低频：无延迟
    { freq: 500, delay: width * 0.005 },              // 中低频：0-5ms
    { freq: 1000, delay: width * 0.010 },             // 中频：0-10ms
    { freq: 2000, delay: width * 0.015 },             // 中高频：0-15ms
    { freq: 4000, delay: width * 0.020 }              // 高频：0-20ms
  ];

  const rightNodes: AudioNode[] = [];

  bands.forEach((band, index) => {
    // 带通滤波器
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = band.freq;
    bandpass.Q.value = 1.0;

    // 延迟节点
    const delay = ctx.createDelay();
    delay.delayTime.value = band.delay;

    // 该频段增益
    const bandGain = ctx.createGain();
    bandGain.gain.value = 0.2; // 每个频段较低音量，避免叠加过响

    gain.connect(bandpass);
    bandpass.connect(delay);
    delay.connect(bandGain);
    bandGain.connect(merger, 0, 1);

    rightNodes.push(bandpass, delay, bandGain);
  });

  // 连接到输出
  merger.connect(ctx.destination);

  // 启动振荡器
  osc.connect(gain);
  osc.start(now);
  osc.stop(endTime);

  const nodes: AudioNode[] = [osc, gain, merger, ...rightNodes];

  const stop = () => {
    try {
      osc.stop();
    } catch { /* noop */ }
    nodes.forEach(node => {
      try { node.disconnect(); } catch { /* noop */ }
    });
  };

  return { nodes, stop };
}

/**
 * 算法3：双耳HRTF（Binaural HRTF）
 * 模拟多个虚拟声源位置，使用ITD和ILD产生空间弥散感
 */
export function createHRTFTone(
  ctx: AudioContext,
  size: number,
  durationSec: number
): { nodes: AudioNode[]; stop: () => void } {
  const now = ctx.currentTime;
  const endTime = now + durationSec;
  const width = Math.max(0, Math.min(1, size));

  // 创建振荡器
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 440;

  // 增益控制
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + FADE_IN_SEC);
  gain.gain.setValueAtTime(0.4, endTime - FADE_OUT_SEC);
  gain.gain.linearRampToValueAtTime(0, endTime);

  // 立体声合并器
  const merger = ctx.createChannelMerger(2);

  // 虚拟声源配置
  // 角度分布：中心 + 两侧扩散
  const angles = width === 0
    ? [0]  // width=0时只有正前方
    : [0, -width * 45, width * 45, -width * 90, width * 90];  // width>0时扩散

  const virtualSources: AudioNode[] = [];

  angles.forEach((angle, index) => {
    const radians = (angle * Math.PI) / 180;

    // ITD（时间差）：sin(θ) * 最大0.6ms
    const itd = Math.sin(radians) * 0.0006;  // 秒

    // ILD（强度差）：cos(θ)，侧面声音更弱
    const ildFactor = Math.cos(radians * 0.8);  // 0.8系数避免侧面完全静音

    // 中心声源音量最大，侧面声源音量较小
    const sourceGain = index === 0 ? 0.5 : 0.15;

    // 左声道处理
    const leftDelay = ctx.createDelay();
    leftDelay.delayTime.value = Math.max(0, -itd);

    const leftGain = ctx.createGain();
    leftGain.gain.value = sourceGain * (angle < 0 ? 1 : ildFactor);

    // 右声道处理
    const rightDelay = ctx.createDelay();
    rightDelay.delayTime.value = Math.max(0, itd);

    const rightGain = ctx.createGain();
    rightGain.gain.value = sourceGain * (angle > 0 ? 1 : ildFactor);

    // 连接
    gain.connect(leftDelay);
    leftDelay.connect(leftGain);
    leftGain.connect(merger, 0, 0);

    gain.connect(rightDelay);
    rightDelay.connect(rightGain);
    rightGain.connect(merger, 0, 1);

    virtualSources.push(leftDelay, leftGain, rightDelay, rightGain);
  });

  // 连接到输出
  merger.connect(ctx.destination);

  // 启动振荡器
  osc.connect(gain);
  osc.start(now);
  osc.stop(endTime);

  const nodes: AudioNode[] = [osc, gain, merger, ...virtualSources];

  const stop = () => {
    try {
      osc.stop();
    } catch { /* noop */ }
    nodes.forEach(node => {
      try { node.disconnect(); } catch { /* noop */ }
    });
  };

  return { nodes, stop };
}

/**
 * 原始立体声宽度算法（兼容旧版本）
 */
export function createStereoWidthTone(
  ctx: AudioContext,
  size: number,
  durationSec: number
): { nodes: AudioNode[]; stop: () => void } {
  return createImageSizeTone(ctx, size, durationSec);
}

/**
 * 统一播放接口 - 根据算法类型调用对应的合成函数
 */
export function playImageSizeToneByAlgorithm(
  ctx: AudioContext,
  size: number,
  algorithm: ImageSizeAlgorithm,
  durationSec: number = TONE_DURATION_SEC,
  onComplete?: () => void
): { stop: () => void } {
  let result: { nodes: AudioNode[]; stop: () => void };

  switch (algorithm) {
    case 'decorrelation':
      result = createDecorrelationTone(ctx, size, durationSec);
      break;
    case 'ictd':
      result = createICTDTone(ctx, size, durationSec);
      break;
    case 'hrtf':
      result = createHRTFTone(ctx, size, durationSec);
      break;
    case 'stereo-width':
    default:
      result = createStereoWidthTone(ctx, size, durationSec);
      break;
  }

  // 设置完成回调
  if (onComplete) {
    const timeoutId = window.setTimeout(() => {
      onComplete();
    }, durationSec * 1000);

    const originalStop = result.stop;
    return {
      stop: () => {
        window.clearTimeout(timeoutId);
        originalStop();
      }
    };
  }

  return { stop: result.stop };
}
