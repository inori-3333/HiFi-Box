/**
 * 低频回弹测试 - 音频合成核心
 * 使用Web Audio API合成Kick鼓声音
 */

const BPM_START = 80;
const BPM_END = 260;
const TEST_DURATION_SEC = 40;
const LOOKAHEAD_SEC = 0.05;

export { BPM_START, BPM_END, TEST_DURATION_SEC };

/**
 * 计算当前BPM（线性增长）
 */
export function currentBpmAtElapsed(elapsedSec: number): number {
  const progress = Math.min(elapsedSec, TEST_DURATION_SEC) / TEST_DURATION_SEC;
  return BPM_START + (BPM_END - BPM_START) * progress;
}

/**
 * 创建Kick鼓声音
 * 使用sine波 + 频率快速下降模拟Kick声音
 */
export function scheduleKickDrum(
  ctx: AudioContext,
  startAt: number,
  volume: number
): AudioNode {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, startAt);
  osc.frequency.exponentialRampToValueAtTime(46, startAt + 0.24);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.29);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.75;

  osc.connect(gain);
  gain.connect(filter);
  filter.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + 0.33);

  // 返回filter以便清理
  return filter;
}

export type BeatSchedule = {
  stop: () => void;
};

/**
 * 开始调度鼓点序列
 * 使用Web Audio API的精确时间调度
 */
export function startBeatSchedule(
  ctx: AudioContext,
  volume: number,
  onBpmChange: (bpm: number) => void,
  onComplete: () => void
): BeatSchedule {
  const startTime = ctx.currentTime;
  let beatIndex = 0;
  let isRunning = true;
  const activeNodes: AudioNode[] = [];
  let timeoutId: number | null = null;

  function cleanup() {
    isRunning = false;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    // 清理已创建的节点
    activeNodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // noop
      }
    });
    activeNodes.length = 0;
  }

  function scheduleNextBeat() {
    if (!isRunning) return;

    const elapsed = ctx.currentTime - startTime;

    // 检查是否完成
    if (elapsed >= TEST_DURATION_SEC) {
      cleanup();
      onComplete();
      return;
    }

    // 计算当前BPM
    const currentBpm = currentBpmAtElapsed(elapsed);
    onBpmChange(currentBpm);

    // 计算下一次beat的时间
    const intervalSec = 60 / currentBpm;
    const nextBeatTime = startTime + (beatIndex + 1) * intervalSec;

    // 调度Kick声音
    const node = scheduleKickDrum(ctx, nextBeatTime, volume);
    activeNodes.push(node);

    // 清理过期节点引用（简单策略：只保留最近的10个）
    if (activeNodes.length > 10) {
      const oldNode = activeNodes.shift();
      if (oldNode) {
        try {
          oldNode.disconnect();
        } catch {
          // noop
        }
      }
    }

    beatIndex++;

    // 使用setTimeout进行下一次调度（提前一点）
    const timeoutMs = (nextBeatTime - ctx.currentTime - LOOKAHEAD_SEC) * 1000;
    timeoutId = window.setTimeout(scheduleNextBeat, Math.max(0, timeoutMs));
  }

  // 立即调度第一个beat
  const firstBeatTime = startTime + 0.05;
  const firstNode = scheduleKickDrum(ctx, firstBeatTime, volume);
  activeNodes.push(firstNode);
  onBpmChange(BPM_START);
  beatIndex++;

  // 启动调度循环
  const firstInterval = 60 / BPM_START;
  const firstTimeoutMs = (firstBeatTime - startTime + firstInterval - LOOKAHEAD_SEC) * 1000;
  timeoutId = window.setTimeout(scheduleNextBeat, Math.max(0, firstTimeoutMs));

  return { stop: cleanup };
}
