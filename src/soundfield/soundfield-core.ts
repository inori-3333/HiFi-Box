// SoundField Test Core - Types and Pure Functions

export type TestMode = "positioning" | "angle" | "abx";

export type Point3D = { x: number; y: number; z: number };

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
export type PositioningPhase = "idle" | "playing-benchmark" | "playing-test" | "selecting" | "result";

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

export type AngleRound = {
  roundNumber: number;
  targetAngle: number;
  guessAngle: number;
  error: number;
};

export type AngleState = {
  phase: AnglePhase;
  currentAngle: number;
  userGuess: number;
  rounds: AngleRound[];
  currentRound: number;
  isPlaying: boolean;
};

export const initialAngleState: AngleState = {
  phase: "idle",
  currentAngle: 0,
  userGuess: 90,
  rounds: [],
  currentRound: 0,
  isPlaying: false,
};

// ABX测试模式状态
export type ABXPhase = "idle" | "playing" | "selecting" | "result";

export type ABXTrial = {
  trialNumber: number;
  aIsWider: boolean;
  userChoice: "a" | "b" | null;
  correct: boolean;
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
  // Generate random angle between 10 and 170 degrees
  return Math.floor(Math.random() * 160) + 10;
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
  // Different frequencies for different positions to help distinguish
  const baseFreq = 440; // A4
  const freq = baseFreq + (point.x + point.y + point.z) * 50;

  return playToneAtPosition(audioContext, point, freq, 0.8, volume);
}

// Play test tone at a random position for the positioning test
export function playTestToneAtPosition(
  audioContext: AudioContext,
  position: Point3D,
  volume: number,
  audioBuffer?: AudioBuffer
): { stop: () => void } {
  if (audioBuffer) {
    return playBufferAtPosition(audioContext, position, audioBuffer, 1.5, volume);
  }
  // Use a distinct frequency for test tones
  return playToneAtPosition(audioContext, position, 523.25, 1.5, volume); // C5
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
  version: "a" | "b",
  aIsWider: boolean,
  volume: number
): Promise<{ stop: () => void }> {
  // A and B have different widths
  // If aIsWider: A = 150°, B = 60°
  // If !aIsWider: A = 60°, B = 150°

  const aAngle = aIsWider ? 150 : 60;
  const bAngle = aIsWider ? 60 : 150;

  const angle = version === "a" ? aAngle : bAngle;

  return playMusicWithAngle(audioContext, audioBuffer, angle, volume);
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

export interface ABXResults {
  totalTrials: number;
  correctCount: number;
  accuracy: number;
  trials: ABXTrial[];
}

export function calculateABXResults(trials: ABXTrial[]): ABXResults {
  const correctCount = trials.filter(t => t.correct).length;
  const accuracy = trials.length > 0 ? (correctCount / trials.length) * 100 : 0;

  return {
    totalTrials: trials.length,
    correctCount,
    accuracy,
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
