/**
 * 空间结像大小测试 - 音频合成核心
 * 使用立体声宽度（Stereo Width）模拟结像大小
 * size 0.0 = 单声道（完全居中，点最小）
 * size 1.0 = 最大立体声宽度（声音扩散到两侧，点最大）
 */

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
