// SoundField Test Core - Types and Pure Functions

export type TestMode = "positioning" | "angle" | "abx";

export type Point3D = { x: number; y: number; z: number };

const HEAD_DISTANCE_M = 0.175;
const SPEED_OF_SOUND_MPS = 343;
const ITD_CUTOFF_HZ = 1500;
const ILD_DEG_PER_DB = 7;
const EPSILON = 1e-9;
const DEFAULT_MAX_ANALYSIS_SECONDS = 8;

// 15个基准点：原点(1) + 6个轴端点 + 8个立方体顶点
export const BENCHMARK_POINTS: Array<{ point: Point3D; name: string }> = [
  // 原点
  { point: { x: 0, y: 0, z: 0 }, name: "原点" },
  // X轴端点
  { point: { x: 1, y: 0, z: 0 }, name: "右" },
  { point: { x: -1, y: 0, z: 0 }, name: "左" },
  // Y轴端点
  { point: { x: 0, y: 1, z: 0 }, name: "前" },
  { point: { x: 0, y: -1, z: 0 }, name: "后" },
  // Z轴端点
  { point: { x: 0, y: 0, z: 1 }, name: "上" },
  { point: { x: 0, y: 0, z: -1 }, name: "下" },
  // 立方体8个顶点
  { point: { x: 1, y: 1, z: 1 }, name: "右前上" },
  { point: { x: 1, y: 1, z: -1 }, name: "右前下" },
  { point: { x: 1, y: -1, z: 1 }, name: "右后上" },
  { point: { x: 1, y: -1, z: -1 }, name: "右后下" },
  { point: { x: -1, y: 1, z: 1 }, name: "左前上" },
  { point: { x: -1, y: 1, z: -1 }, name: "左前下" },
  { point: { x: -1, y: -1, z: 1 }, name: "左后上" },
  { point: { x: -1, y: -1, z: -1 }, name: "左后下" },
];

// Round colors for history display
export const ROUND_COLORS = [
  "#e53e3e", // red
  "#dd6b20", // orange
  "#d69e2e", // yellow
  "#38a169", // green
  "#3182ce", // blue
  "#805ad5", // purple
];

// 定点定位模式状态
export type PositioningPhase = "idle" | "playing-benchmark" | "playing-test" | "selecting" | "submitted" | "result";

export type PositioningRound = {
  roundNumber: number;
  target: Point3D;
  guess: Point3D;
  error: number;
};

export type PositioningState = {
  phase: PositioningPhase;
  currentBenchmarkIndex: number;
  targetPoint: Point3D | null;
  userGuess: Point3D;
  rounds: PositioningRound[];
  currentRound: number;
  isPlaying: boolean;
};

export const initialPositioningState: PositioningState = {
  phase: "idle",
  currentBenchmarkIndex: -1,
  targetPoint: null,
  userGuess: { x: 0, y: 0, z: 0 },
  rounds: [],
  currentRound: 0,
  isPlaying: false,
};

// 角度感知模式状态
export type AnglePhase = "idle" | "playing" | "selecting" | "result";

export type BinauralCueMetrics = {
  itdSec: number;
  ildDb: number;
  thetaItdDeg: number;
  thetaIldDeg: number;
  thetaSideDeg: number;
  openingAngleDeg: number;
  itdWeight: number;
  ildWeight: number;
  confidence: number;
};

export type AngleRound = {
  roundNumber: number;
  targetOpeningAngleDeg: number;
  guessOpeningAngleDeg: number;
  errorDeg: number;
  objectiveOpeningAngleDeg: number;
  objectiveSideAzimuthDeg: number;
  cues: BinauralCueMetrics;
};

export type AngleState = {
  phase: AnglePhase;
  currentAngle: number;
  objectiveCurrentAngle: number;
  currentCues: BinauralCueMetrics | null;
  userGuess: number;
  rounds: AngleRound[];
  currentRound: number;
  isPlaying: boolean;
};

export const initialAngleState: AngleState = {
  phase: "idle",
  currentAngle: 0,
  objectiveCurrentAngle: 90,
  currentCues: null,
  userGuess: 90,
  rounds: [],
  currentRound: 0,
  isPlaying: false,
};

// ABX测试模式状态
export type ABXPhase = "idle" | "playing" | "selecting" | "result";

export type ABXTrial = {
  trialNumber: number;
  aOpeningAngleDeg: number;
  bOpeningAngleDeg: number;
  xRef: "a" | "b";
  userChoice: "a" | "b" | null;
  correct: boolean;
  cueDistanceDeg: number;
  aCues: BinauralCueMetrics;
  bCues: BinauralCueMetrics;
  xCues: BinauralCueMetrics;
};

export type ABXState = {
  phase: ABXPhase;
  trials: ABXTrial[];
  currentTrial: number;
  correctCount: number;
  isPlaying: boolean;
};

export const initialABXState: ABXState = {
  phase: "idle",
  trials: [],
  currentTrial: 0,
  correctCount: 0,
  isPlaying: false,
};

// ==================== Utility Functions ====================

export function generateRandomPoint(): Point3D {
  return {
    x: Math.random() * 2 - 1, // -1 to 1
    y: Math.random() * 2 - 1,
    z: Math.random() * 2 - 1,
  };
}

export function generateRandomAngle(): number {
  // Symmetric opening angle for soundstage (20° ~ 160°)
  return Math.floor(Math.random() * 141) + 20;
}

export function generateRandomAbxAnglePair(minGapDeg: number = 30): [number, number] {
  const a = generateRandomAngle();
  let b = generateRandomAngle();
  let attempts = 0;
  while (Math.abs(a - b) < minGapDeg && attempts < 50) {
    b = generateRandomAngle();
    attempts += 1;
  }

  if (Math.abs(a - b) < minGapDeg) {
    b = a > 90 ? Math.max(20, a - minGapDeg) : Math.min(160, a + minGapDeg);
  }
  return [a, b];
}

export function calculateDistance(a: Point3D, b: Point3D): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

// Convert angle (0-180) to stereo width parameter (0-2)
export function angleToWidth(angle: number): number {
  // Map 0° -> 0 (mono), 180° -> 2 (full width)
  return (angle / 180) * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

function meanSquarePair(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || right.length === 0) return 0;
  const size = Math.min(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    sum += (left[i] * left[i] + right[i] * right[i]) * 0.5;
  }
  return sum / size;
}

type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

function createButterworthBiquad(
  type: "lowpass" | "highpass",
  cutoffHz: number,
  sampleRate: number
): BiquadCoefficients {
  const q = Math.SQRT1_2;
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const sinOmega = Math.sin(omega);
  const cosOmega = Math.cos(omega);
  const alpha = sinOmega / (2 * q);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = -2 * cosOmega;
  let a2 = 1 - alpha;

  if (type === "lowpass") {
    b0 = (1 - cosOmega) / 2;
    b1 = 1 - cosOmega;
    b2 = (1 - cosOmega) / 2;
  } else {
    b0 = (1 + cosOmega) / 2;
    b1 = -(1 + cosOmega);
    b2 = (1 + cosOmega) / 2;
  }
  a0 = 1 + alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function applyBiquadFilter(samples: Float32Array, coeffs: BiquadCoefficients): Float32Array {
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i];
    const y0 =
      coeffs.b0 * x0 +
      coeffs.b1 * x1 +
      coeffs.b2 * x2 -
      coeffs.a1 * y1 -
      coeffs.a2 * y2;

    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

function findBestLagByCrossCorrelation(
  left: Float32Array,
  right: Float32Array,
  maxLag: number
): { lag: number; peak: number } {
  const size = Math.min(left.length, right.length);
  if (size <= 1) {
    return { lag: 0, peak: 0 };
  }

  let bestLag = 0;
  let bestCorr = Number.NEGATIVE_INFINITY;
  let bestPeakAbs = 0;

  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let corr = 0;
    let count = 0;
    if (lag >= 0) {
      for (let i = 0; i < size - lag; i += 1) {
        corr += left[i] * right[i + lag];
        count += 1;
      }
    } else {
      const offset = -lag;
      for (let i = 0; i < size - offset; i += 1) {
        corr += left[i + offset] * right[i];
        count += 1;
      }
    }

    if (count > 0) {
      corr /= count;
    }

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
      bestPeakAbs = Math.abs(corr);
    }
  }

  return { lag: bestLag, peak: bestPeakAbs };
}

function neutralCueMetrics(confidence = 0.1): BinauralCueMetrics {
  return {
    itdSec: 0,
    ildDb: 0,
    thetaItdDeg: 45,
    thetaIldDeg: 45,
    thetaSideDeg: 45,
    openingAngleDeg: 90,
    itdWeight: 0.5,
    ildWeight: 0.5,
    confidence: clamp(confidence, 0, 1),
  };
}

type CueExtractionInput = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  ildDegPerDb?: number;
  monoFallbackPenalty?: number;
  isMonoDuplicated?: boolean;
};

export function extractBinauralCuesFromChannels(input: CueExtractionInput): BinauralCueMetrics {
  const {
    left,
    right,
    sampleRate,
    ildDegPerDb = ILD_DEG_PER_DB,
    monoFallbackPenalty = 0.6,
    isMonoDuplicated = false,
  } = input;

  const size = Math.min(left.length, right.length);
  if (size < 128 || sampleRate <= 0) {
    return neutralCueMetrics(0.1);
  }

  const maxSamples = Math.floor(sampleRate * DEFAULT_MAX_ANALYSIS_SECONDS);
  const analysisSize = Math.min(size, maxSamples);
  const leftView = left.subarray(0, analysisSize);
  const rightView = right.subarray(0, analysisSize);

  const lp = createButterworthBiquad("lowpass", ITD_CUTOFF_HZ, sampleRate);
  const hp = createButterworthBiquad("highpass", ITD_CUTOFF_HZ, sampleRate);

  const lowL = applyBiquadFilter(leftView, lp);
  const lowR = applyBiquadFilter(rightView, lp);
  const highL = applyBiquadFilter(leftView, hp);
  const highR = applyBiquadFilter(rightView, hp);

  const lowEnergy = meanSquarePair(lowL, lowR);
  const highEnergy = meanSquarePair(highL, highR);
  const totalEnergy = lowEnergy + highEnergy;

  const maxLag = Math.ceil((HEAD_DISTANCE_M / SPEED_OF_SOUND_MPS) * sampleRate);
  const { lag: lagPeak, peak } = findBestLagByCrossCorrelation(lowL, lowR, maxLag);
  const itdSec = lagPeak / sampleRate;
  const itdArg = clamp((SPEED_OF_SOUND_MPS * Math.abs(itdSec)) / HEAD_DISTANCE_M, 0, 1);
  const thetaItdDeg = (Math.asin(itdArg) * 180) / Math.PI;

  const rmsHighL = rms(highL);
  const rmsHighR = rms(highR);
  const ildDb = 20 * Math.log10((rmsHighR + EPSILON) / (rmsHighL + EPSILON));
  const thetaIldDeg = clamp(Math.abs(ildDb) * ildDegPerDb, 0, 90);

  const itdWeight = totalEnergy > EPSILON ? lowEnergy / (totalEnergy + EPSILON) : 0.5;
  const ildWeight = 1 - itdWeight;
  const thetaSideDeg = clamp(thetaItdDeg * itdWeight + thetaIldDeg * ildWeight, 0, 90);
  const openingAngleDeg = clamp(thetaSideDeg * 2, 0, 180);

  const baseRms = (rms(leftView) + rms(rightView)) * 0.5;
  if (!Number.isFinite(baseRms) || baseRms < 1e-4) {
    return neutralCueMetrics(0.1);
  }

  const energyConfidence = clamp(baseRms / 0.1, 0, 1);
  const peakConfidence = clamp(Math.abs(peak) / 0.1, 0, 1);
  let confidence = clamp(0.55 * energyConfidence + 0.45 * peakConfidence, 0, 1);

  if (isMonoDuplicated) {
    confidence *= monoFallbackPenalty;
  }

  return {
    itdSec,
    ildDb,
    thetaItdDeg,
    thetaIldDeg,
    thetaSideDeg,
    openingAngleDeg,
    itdWeight,
    ildWeight,
    confidence,
  };
}

export function extractBinauralCues(
  audioBuffer: AudioBuffer,
  ildDegPerDb: number = ILD_DEG_PER_DB
): BinauralCueMetrics {
  if (audioBuffer.numberOfChannels <= 0 || audioBuffer.length <= 0) {
    return neutralCueMetrics(0.1);
  }

  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0);
  const monoDuplicated = audioBuffer.numberOfChannels < 2;

  return extractBinauralCuesFromChannels({
    left,
    right,
    sampleRate: audioBuffer.sampleRate,
    ildDegPerDb,
    isMonoDuplicated: monoDuplicated,
  });
}

// ==================== Audio Generation Functions ====================

// Create a spatial panner for 3D positioning using Web Audio API
export function createSpatialPanner(
  audioContext: AudioContext,
  position: Point3D
): PannerNode {
  const panner = audioContext.createPanner();

  // Set panner properties for HRTF-like spatial audio
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10;
  panner.rolloffFactor = 1;

  // Set position
  panner.positionX.value = position.x * 2;
  panner.positionY.value = position.y * 2;
  panner.positionZ.value = position.z * 2;

  // Set orientation (pointing toward listener)
  panner.orientationX.value = -position.x;
  panner.orientationY.value = -position.y;
  panner.orientationZ.value = -position.z;

  return panner;
}

// Play a sine wave tone at a specific 3D position
export function playToneAtPosition(
  audioContext: AudioContext,
  position: Point3D,
  frequency: number,
  duration: number,
  volume: number
): { stop: () => void } {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const panner = createSpatialPanner(audioContext, position);

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  // Envelope to avoid clicks
  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
  gainNode.gain.setValueAtTime(volume, now + duration - 0.05);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  // Connect: oscillator -> panner -> gain -> destination
  oscillator.connect(panner);
  panner.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);

  return {
    stop: () => {
      try {
        oscillator.stop();
      } catch {
        // Already stopped
      }
    },
  };
}

export function playBufferAtPosition(
  audioContext: AudioContext,
  position: Point3D,
  audioBuffer: AudioBuffer,
  duration: number,
  volume: number
): { stop: () => void } {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = audioBuffer.duration < duration + 0.05;

  const gainNode = audioContext.createGain();
  const panner = createSpatialPanner(audioContext, position);

  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
  gainNode.gain.setValueAtTime(volume, now + Math.max(0.06, duration - 0.05));
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  source.connect(panner);
  panner.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(now);
  source.stop(now + duration + 0.02);

  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
  };
}

// Create a piano-like sound using multiple oscillators with envelope
function createPianoTone(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  volume: number
): { source: AudioNode; stop: () => void } {
  const now = audioContext.currentTime;

  // 主振荡器 - 锯齿波模拟钢琴基频
  const osc1 = audioContext.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = frequency;

  // 谐波振荡器 - 方波增加谐波
  const osc2 = audioContext.createOscillator();
  osc2.type = "square";
  osc2.frequency.value = frequency * 2;

  // 低频振荡器 - 增加温暖感
  const osc3 = audioContext.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = frequency * 0.5;

  // 增益节点
  const gain1 = audioContext.createGain();
  const gain2 = audioContext.createGain();
  const gain3 = audioContext.createGain();
  const masterGain = audioContext.createGain();

  // 钢琴包络：快速攻击，指数衰减
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(volume * 0.6, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(volume * 0.1, now + duration);

  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(volume * 0.15, now + 0.02);
  gain2.gain.exponentialRampToValueAtTime(volume * 0.01, now + duration * 0.5);

  gain3.gain.setValueAtTime(0, now);
  gain3.gain.linearRampToValueAtTime(volume * 0.25, now + 0.02);
  gain3.gain.exponentialRampToValueAtTime(volume * 0.05, now + duration);

  masterGain.gain.value = 1;

  // 连接
  osc1.connect(gain1);
  osc2.connect(gain2);
  osc3.connect(gain3);
  gain1.connect(masterGain);
  gain2.connect(masterGain);
  gain3.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
  osc3.stop(now + duration);

  return {
    source: masterGain,
    stop: () => {
      try {
        const stopTime = audioContext.currentTime + 0.05;
        masterGain.gain.setValueAtTime(masterGain.gain.value, audioContext.currentTime);
        masterGain.gain.exponentialRampToValueAtTime(0.001, stopTime);
        osc1.stop(stopTime);
        osc2.stop(stopTime);
        osc3.stop(stopTime);
      } catch {
        // Already stopped
      }
    },
  };
}

// Play a single benchmark tone
export function playBenchmarkTone(
  audioContext: AudioContext,
  point: Point3D,
  volume: number,
  audioBuffer?: AudioBuffer
): { stop: () => void } {
  if (audioBuffer) {
    return playBufferAtPosition(audioContext, point, audioBuffer, 0.8, volume);
  }

  // 钢琴和弦频率映射：C大调和弦
  // 根据位置选择不同的和弦音
  const positionIndex = Math.abs((point.x + point.y + point.z) * 10) % 4;
  const chordFrequencies = [
    [261.63, 329.63, 392.00], // C major (C4, E4, G4)
    [392.00, 493.88, 587.33], // G major (G4, B4, D5)
    [440.00, 554.37, 659.25], // A minor (A4, C#5, E5)
    [349.23, 440.00, 523.25], // F major (F4, A4, C5)
  ];

  const frequencies = chordFrequencies[Math.floor(positionIndex)];
  const duration = 0.8;
  const tones = frequencies.map((freq) => createPianoTone(audioContext, freq, duration, volume * 0.4));

  // 合并所有音
  const merger = audioContext.createChannelMerger(2);
  const panner = createSpatialPanner(audioContext, point);

  tones.forEach((tone) => {
    tone.source.connect(panner);
  });

  panner.connect(audioContext.destination);

  return {
    stop: () => {
      tones.forEach((tone) => tone.stop());
    },
  };
}

// Play test tone at a random position for the positioning test
export function playTestToneAtPosition(
  audioContext: AudioContext,
  position: Point3D,
  volume: number,
  audioBuffer?: AudioBuffer
): { stop: () => void } {
  if (audioBuffer) {
    return playBufferAtPosition(audioContext, position, audioBuffer, 3.5, volume);
  }

  // 测试音使用更长的钢琴和弦 (3.5秒)
  // 根据位置选择不同的和弦音，使不同位置的声音有区别
  const positionHash = Math.abs(position.x * 3 + position.y * 5 + position.z * 7);
  const chordFrequencies = [
    [523.25, 659.25, 783.99], // C major (C5, E5, G5) - 明亮
    [587.33, 739.99, 880.00], // D major (D5, F#5, A5) - 明亮
    [493.88, 622.25, 739.99], // B major (B4, D#5, F#5) - 温暖
    [659.25, 830.61, 987.77], // E minor (E5, G#5, B5) - 柔和
  ];

  const frequencies = chordFrequencies[Math.floor(positionHash) % chordFrequencies.length];
  const duration = 3.5;
  const tones = frequencies.map((freq) => createPianoTone(audioContext, freq, duration, volume * 0.5));

  // 合并所有音
  const panner = createSpatialPanner(audioContext, position);

  tones.forEach((tone) => {
    tone.source.connect(panner);
  });

  panner.connect(audioContext.destination);

  return {
    stop: () => {
      tones.forEach((tone) => tone.stop());
    },
  };
}

// ==================== Angle Simulation ====================

// Apply stereo width to audio buffer using Mid-Side processing
export function applyStereoWidth(
  audioContext: AudioContext,
  sourceNode: AudioNode,
  width: number
): { node: AudioNode; cleanup: () => void } {
  // Create a stereo panner for basic width control
  const splitter = audioContext.createChannelSplitter(2);
  const merger = audioContext.createChannelMerger(2);

  const leftGain = audioContext.createGain();
  const rightGain = audioContext.createGain();

  // Width: 0 = mono, 1 = normal stereo, 2 = wide stereo
  const mid = (2 - width) / 2; // Mid component
  const side = width / 2;      // Side component

  // Convert L/R to Mid/Side and back with width adjustment
  // L = Mid + Side
  // R = Mid - Side

  leftGain.gain.value = mid + side;
  rightGain.gain.value = mid - side;

  sourceNode.connect(splitter);

  // Left channel
  splitter.connect(leftGain, 0);
  leftGain.connect(merger, 0, 0);

  // Right channel
  splitter.connect(rightGain, 1);
  rightGain.connect(merger, 0, 1);

  return {
    node: merger,
    cleanup: () => {
      try {
        sourceNode.disconnect(splitter);
        splitter.disconnect();
        leftGain.disconnect();
        rightGain.disconnect();
        merger.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

export function createStereoWidthVariant(
  audioContext: AudioContext,
  sourceBuffer: AudioBuffer,
  openingAngleDeg: number
): AudioBuffer {
  const width = angleToWidth(clamp(openingAngleDeg, 0, 180));
  const frameCount = sourceBuffer.length;
  const channels = Math.max(2, sourceBuffer.numberOfChannels);
  const output = audioContext.createBuffer(channels, frameCount, sourceBuffer.sampleRate);

  const leftIn = sourceBuffer.getChannelData(0);
  const rightIn =
    sourceBuffer.numberOfChannels > 1 ? sourceBuffer.getChannelData(1) : sourceBuffer.getChannelData(0);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);

  const midGain = (2 - width) / 2;
  const sideGain = width / 2;

  for (let i = 0; i < frameCount; i += 1) {
    const l = leftIn[i];
    const r = rightIn[i];
    const mid = 0.5 * (l + r);
    const side = 0.5 * (l - r);
    leftOut[i] = midGain * mid + sideGain * side;
    rightOut[i] = midGain * mid - sideGain * side;
  }

  for (let ch = 2; ch < channels; ch += 1) {
    output.copyToChannel(sourceBuffer.getChannelData(Math.min(ch, sourceBuffer.numberOfChannels - 1)), ch);
  }
  return output;
}

export function analyzeOpeningAngle(
  audioContext: AudioContext,
  sourceBuffer: AudioBuffer,
  openingAngleDeg: number
): { processedBuffer: AudioBuffer; cues: BinauralCueMetrics } {
  const processedBuffer = createStereoWidthVariant(audioContext, sourceBuffer, openingAngleDeg);
  const cues = extractBinauralCues(processedBuffer);
  return { processedBuffer, cues };
}

// Play music with a specific perceived angle
export async function playMusicWithAngle(
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  angle: number,
  volume: number
): Promise<{ stop: () => void }> {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = volume;

  // Apply stereo width based on angle
  const width = angleToWidth(angle);

  if (width !== 1) {
    const { node, cleanup } = applyStereoWidth(audioContext, source, width);
    node.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start();

    return {
      stop: () => {
        try {
          source.stop();
          cleanup();
        } catch {
          // Already stopped
        }
      },
    };
  } else {
    // Normal stereo
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start();

    return {
      stop: () => {
        try {
          source.stop();
        } catch {
          // Already stopped
        }
      },
    };
  }
}

// ==================== ABX Audio ====================

// Create two versions of the same music with different stereo widths
export async function playABXVersion(
  audioContext: AudioContext,
  audioBuffer: AudioBuffer,
  version: "a" | "b" | "x",
  trial: Pick<ABXTrial, "aOpeningAngleDeg" | "bOpeningAngleDeg" | "xRef">,
  volume: number
): Promise<{ stop: () => void }> {
  const { aOpeningAngleDeg, bOpeningAngleDeg, xRef } = trial;
  const xOpeningAngleDeg = xRef === "a" ? aOpeningAngleDeg : bOpeningAngleDeg;
  const angle =
    version === "a" ? aOpeningAngleDeg : version === "b" ? bOpeningAngleDeg : xOpeningAngleDeg;

  return playMusicWithAngle(audioContext, audioBuffer, angle, volume);
}

export function buildAbxTrial(
  audioContext: AudioContext,
  sourceBuffer: AudioBuffer,
  trialNumber: number,
  aOpeningAngleDeg: number,
  bOpeningAngleDeg: number,
  xRef: "a" | "b"
): ABXTrial {
  const aCues = analyzeOpeningAngle(audioContext, sourceBuffer, aOpeningAngleDeg).cues;
  const bCues = analyzeOpeningAngle(audioContext, sourceBuffer, bOpeningAngleDeg).cues;
  const xCues = xRef === "a" ? aCues : bCues;

  return {
    trialNumber,
    aOpeningAngleDeg,
    bOpeningAngleDeg,
    xRef,
    userChoice: null,
    correct: false,
    cueDistanceDeg: Math.abs(aCues.openingAngleDeg - bCues.openingAngleDeg),
    aCues,
    bCues,
    xCues,
  };
}

// ==================== Results Calculation ====================

export interface PositioningResults {
  totalRounds: number;
  averageError: number;
  maxError: number;
  minError: number;
  rounds: PositioningRound[];
}

export function calculatePositioningResults(rounds: PositioningRound[]): PositioningResults {
  if (rounds.length === 0) {
    return {
      totalRounds: 0,
      averageError: 0,
      maxError: 0,
      minError: 0,
      rounds: [],
    };
  }

  const errors = rounds.map(r => r.error);
  const averageError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxError = Math.max(...errors);
  const minError = Math.min(...errors);

  return {
    totalRounds: rounds.length,
    averageError,
    maxError,
    minError,
    rounds,
  };
}

export interface AngleResults {
  totalRounds: number;
  averageError: number;
  maxError: number;
  minError: number;
  rounds: AngleRound[];
}

export function calculateAngleResults(rounds: AngleRound[]): AngleResults {
  if (rounds.length === 0) {
    return {
      totalRounds: 0,
      averageError: 0,
      maxError: 0,
      minError: 0,
      rounds: [],
    };
  }

  const errors = rounds.map((r) => r.errorDeg);
  const averageError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxError = Math.max(...errors);
  const minError = Math.min(...errors);

  return {
    totalRounds: rounds.length,
    averageError,
    maxError,
    minError,
    rounds,
  };
}

export interface ABXResults {
  totalTrials: number;
  correctCount: number;
  accuracy: number;
  pValue: number;
  dPrime: number;
  significant: boolean;
  trials: ABXTrial[];
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i += 1) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
}

export function calculateBinomialPValue(totalTrials: number, correctCount: number): number {
  if (totalTrials <= 0) return 1;
  const n = Math.floor(totalTrials);
  const k = Math.floor(clamp(correctCount, 0, n));
  let sum = 0;
  for (let i = k; i <= n; i += 1) {
    sum += combination(n, i) * Math.pow(0.5, n);
  }
  return sum;
}

export function calculateABXResults(trials: ABXTrial[]): ABXResults {
  const correctCount = trials.filter((t) => t.correct).length;
  const accuracy = trials.length > 0 ? (correctCount / trials.length) * 100 : 0;
  const pValue = calculateBinomialPValue(trials.length, correctCount);
  const dPrime = clamp((accuracy / 100 - 0.5) * 6, 0, 4);
  const significant = pValue < 0.05;

  return {
    totalTrials: trials.length,
    correctCount,
    accuracy,
    pValue,
    dPrime,
    significant,
    trials,
  };
}

// Delay helper
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sequential delay for playing benchmark tones
export async function playBenchmarkSequence(
  audioContext: AudioContext,
  onPointStart: (index: number) => void,
  onComplete: () => void,
  volume: number,
  delayBetweenTones: number = 300,
  audioBuffer?: AudioBuffer
): Promise<void> {
  for (let i = 0; i < BENCHMARK_POINTS.length; i++) {
    onPointStart(i);
    const { stop } = playBenchmarkTone(audioContext, BENCHMARK_POINTS[i].point, volume, audioBuffer);

    await delay(800); // Play for 800ms
    stop();

    if (i < BENCHMARK_POINTS.length - 1) {
      await delay(delayBetweenTones);
    }
  }
  onComplete();
}
