export type SpatialPoint = {
  x: number;
  y: number;
  z: number;
};

export type SpatialScoreBreakdown = {
  cartesian: number;
  azimuth: number;
  vertical: number;
  distance: number;
};

export type SpatialTrial = {
  id: number;
  target: SpatialPoint;
  cueTimbreId: number;
  user?: SpatialPoint;
  score?: number;
  breakdown?: SpatialScoreBreakdown;
  submitted?: boolean;
};

export type SpatialPlane = "xy" | "xz" | "zy";
export type SpatialMode = "2d" | "3d";
export type SpatialSceneProfile = "standard" | "speaker2d";

export const SPATIAL_TRIAL_COUNT = 8;
export const SPATIAL_CUE_TIMBRE_COUNT = 8;
const MAX_CART_DISTANCE = Math.sqrt(12);
const MAX_PLANE_DISTANCE = Math.sqrt(8);
const MAX_RADIUS_2D = Math.sqrt(2);
const MAX_RADIUS_3D = Math.sqrt(3);
const SPATIAL_REFERENCE_FREQ_HZ = 392;
const SPATIAL_NOTE_INTERVALS = [0, 4, 7, 12, 7, 4];
const SPATIAL_NOTE_DURATION_SEC = 0.11;
const SPATIAL_MOTIF_ATTACK_SEC = 0.02;
const SPATIAL_MOTIF_RELEASE_SEC = 0.08;
export const SPATIAL_SCHEDULE_LEAD_SEC = 0.03;
export const SPATIAL_BASELINE_POINT_GAP_SEC = 0.12;

type SpatialAudioSource = OscillatorNode | AudioBufferSourceNode;

type SpatialCuePatch = {
  output: AudioNode;
  sources: SpatialAudioSource[];
  nodes: AudioNode[];
  endAt: number;
};

const spatialNoiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveSpatialSeed(input: string): number {
  const parsed = Number.parseInt(input, 10);
  if (Number.isFinite(parsed)) {
    return parsed >>> 0;
  }
  return Date.now() >>> 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function scoreFromError(error: number, maxError: number, toleranceRatio: number, steepness: number): number {
  const normalizedError = error / Math.max(maxError, 1e-9);
  const raw = 1 / (1 + Math.exp(steepness * (normalizedError - toleranceRatio)));
  const zeroErrorRaw = 1 / (1 + Math.exp(-steepness * toleranceRatio));
  return clampScore((raw / Math.max(zeroErrorRaw, 1e-9)) * 100);
}

function angleDelta(a: number, b: number): number {
  const full = Math.PI * 2;
  const diff = Math.abs(a - b) % full;
  return diff > Math.PI ? full - diff : diff;
}

function randomInRange(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function roundPoint(point: SpatialPoint): SpatialPoint {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
    z: Number(point.z.toFixed(2))
  };
}

function pointRadius(mode: SpatialMode, point: SpatialPoint): number {
  return mode === "2d" ? Math.hypot(point.x, point.y) : Math.hypot(point.x, point.y, point.z);
}

function pointDistance(mode: SpatialMode, a: SpatialPoint, b: SpatialPoint): number {
  return mode === "2d" ? Math.hypot(a.x - b.x, a.y - b.y) : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function createRandomPoint(mode: SpatialMode, random: () => number, profile: SpatialSceneProfile): SpatialPoint {
  if (mode === "2d") {
    const yMin = profile === "speaker2d" ? 0.0 : -1.0;
    return {
      x: randomInRange(random, -1.0, 1.0),
      y: randomInRange(random, yMin, 1.0),
      z: 0
    };
  }
  return {
    x: randomInRange(random, -0.94, 0.94),
    y: randomInRange(random, -0.94, 0.94),
    z: randomInRange(random, -0.94, 0.94)
  };
}

export function generateSpatialTargets(
  mode: SpatialMode,
  count: number,
  seed: number,
  profile: SpatialSceneProfile = "standard"
): SpatialPoint[] {
  const random = createSeededRandom(seed ^ (mode === "2d" ? 0x2d2d2d2d : 0x3d3d3d3d));
  const minRadius = mode === "2d" ? 0.12 : 0.42;
  const maxRadius = (mode === "2d" ? MAX_RADIUS_2D : MAX_RADIUS_3D) * (mode === "2d" ? 0.98 : 0.92);
  const gapSchedule = mode === "2d" ? [0.88, 0.74, 0.62, 0.5, 0.38, 0.28] : [0.96, 0.82, 0.68, 0.56, 0.44];
  const points: SpatialPoint[] = [];

  for (const minGap of gapSchedule) {
    for (let attempt = 0; attempt < 5000 && points.length < count; attempt += 1) {
      const candidate = roundPoint(createRandomPoint(mode, random, profile));
      const radius = pointRadius(mode, candidate);
      if (radius < minRadius || radius > maxRadius) {
        continue;
      }
      if (points.some((existing) => pointDistance(mode, existing, candidate) < minGap)) {
        continue;
      }
      points.push(candidate);
    }
    if (points.length >= count) {
      break;
    }
  }

  while (points.length < count) {
    const fallback = roundPoint(createRandomPoint(mode, random, profile));
    const fallbackMinGap = mode === "2d" ? 0.25 : 0.2;
    if (points.some((existing) => pointDistance(mode, existing, fallback) < fallbackMinGap)) {
      continue;
    }
    points.push(fallback);
  }
  return points.slice(0, count);
}

export function computeSpatialBreakdown(
  mode: SpatialMode,
  target: SpatialPoint,
  guess: SpatialPoint
): { score: number; breakdown: SpatialScoreBreakdown } {
  const dx = guess.x - target.x;
  const dy = guess.y - target.y;
  const dz = guess.z - target.z;
  const cartesianError = mode === "2d" ? Math.hypot(dx, dy) : Math.hypot(dx, dy, dz);
  const cartesianScore = scoreFromError(cartesianError, mode === "2d" ? MAX_PLANE_DISTANCE : MAX_CART_DISTANCE, 0.19, 24);

  const targetAzimuth = mode === "2d" ? Math.atan2(target.y, target.x) : Math.atan2(target.z, target.x);
  const guessAzimuth = mode === "2d" ? Math.atan2(guess.y, guess.x) : Math.atan2(guess.z, guess.x);
  const azimuthScore = scoreFromError(angleDelta(targetAzimuth, guessAzimuth), Math.PI, 0.13, 24);

  const verticalScore = scoreFromError(Math.abs(dy), 2, 0.15, 22);

  const radialError = Math.abs(pointRadius(mode, target) - pointRadius(mode, guess));
  const distanceScore = scoreFromError(radialError, mode === "2d" ? MAX_RADIUS_2D : MAX_RADIUS_3D, 0.15, 22);

  const weights =
    mode === "2d"
      ? { cartesian: 0.47, azimuth: 0.28, vertical: 0.23, distance: 0.02 }
      : { cartesian: 0.45, azimuth: 0.25, vertical: 0.25, distance: 0.05 };
  const weightedBlend =
    cartesianScore * weights.cartesian +
      azimuthScore * weights.azimuth +
      verticalScore * weights.vertical +
      distanceScore * weights.distance;
  const cartesianGate = Math.pow(cartesianScore / 100, 2);
  const score = clampScore(weightedBlend * cartesianGate);

  return {
    score,
    breakdown: {
      cartesian: cartesianScore,
      azimuth: azimuthScore,
      vertical: verticalScore,
      distance: distanceScore
    }
  };
}

export function clamp01ToSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function planePointToPercent(point: SpatialPoint, plane: SpatialPlane): { left: string; top: string } {
  if (plane === "xy") {
    return { left: `${((point.x + 1) / 2) * 100}%`, top: `${(1 - (point.y + 1) / 2) * 100}%` };
  }
  if (plane === "xz") {
    return { left: `${((point.x + 1) / 2) * 100}%`, top: `${(1 - (point.z + 1) / 2) * 100}%` };
  }
  return { left: `${((point.z + 1) / 2) * 100}%`, top: `${(1 - (point.y + 1) / 2) * 100}%` };
}

function normalizeDepth(mode: SpatialMode, z: number): number {
  return mode === "2d" ? 0 : z;
}

function spatialPannerPosition(mode: SpatialMode, point: SpatialPoint): { x: number; y: number; z: number } {
  const normalizedDepth = normalizeDepth(mode, point.z);
  const xScale = mode === "2d" ? 2.5 : 1.7;
  const yScale = mode === "2d" ? 2.2 : 1.3;
  return {
    x: point.x * xScale,
    y: point.y * yScale,
    z: -normalizedDepth * 1.8
  };
}

export function baselineReferencePoints(mode: SpatialMode, profile: SpatialSceneProfile = "standard"): SpatialPoint[] {
  const z = 0;
  if (mode === "2d" && profile === "speaker2d") {
    return [
      { x: 0, y: 0, z },
      { x: 0.9, y: 0, z },
      { x: -0.9, y: 0, z },
      { x: 0, y: 0.9, z },
      { x: 0.55, y: 0.55, z },
      { x: -0.55, y: 0.55, z },
      { x: 0.25, y: 0.75, z },
      { x: -0.25, y: 0.75, z },
      { x: 0, y: 0.45, z }
    ];
  }
  return [
    { x: 0, y: 0, z },
    { x: 0.9, y: 0, z },
    { x: -0.9, y: 0, z },
    { x: 0, y: 0.9, z },
    { x: 0, y: -0.9, z },
    { x: 0.55, y: 0.55, z },
    { x: -0.55, y: 0.55, z },
    { x: -0.55, y: -0.55, z },
    { x: 0.55, y: -0.55, z }
  ];
}

function planarLoudness(mode: SpatialMode, point: SpatialPoint): number {
  const depth = normalizeDepth(mode, point.z);
  const normalizationBase = mode === "2d" ? Math.sqrt(2) : Math.sqrt(3);
  const normalizedDistance = Math.min(1, Math.hypot(point.x, point.y, depth) / normalizationBase);
  const maxGain = mode === "2d" ? 0.46 : 0.34;
  const minGain = mode === "2d" ? 0.015 : 0.08;
  const falloff = Math.pow(normalizedDistance, mode === "2d" ? 1.25 : 0.7);
  return maxGain - (maxGain - minGain) * falloff;
}

function createSpatialPanner(ctx: AudioContext, mode: SpatialMode, point: SpatialPoint): PannerNode {
  const mapped = spatialPannerPosition(mode, point);
  return new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    positionX: mapped.x,
    positionY: mapped.y,
    positionZ: mapped.z,
    refDistance: 1,
    maxDistance: 12,
    rolloffFactor: 0
  });
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const existing = spatialNoiseBufferCache.get(ctx);
  if (existing) {
    return existing;
  }
  const durationSec = 1.2;
  const frameCount = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }
  spatialNoiseBufferCache.set(ctx, buffer);
  return buffer;
}

function attachSpatialPlayback(
  ctx: AudioContext,
  mode: SpatialMode,
  point: SpatialPoint,
  startAt: number,
  patch: SpatialCuePatch
): { endAt: number; stop: (at: number) => void } {
  const envelope = ctx.createGain();
  const master = ctx.createGain();
  const panner3d = createSpatialPanner(ctx, mode, point);
  const sustainEnd = Math.max(startAt + 0.01, patch.endAt - 0.025);

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(1, startAt + 0.008);
  envelope.gain.setValueAtTime(1, sustainEnd);
  envelope.gain.exponentialRampToValueAtTime(0.0001, patch.endAt);
  master.gain.setValueAtTime(planarLoudness(mode, point), startAt);

  patch.output.connect(envelope);
  envelope.connect(master);
  master.connect(panner3d);
  panner3d.connect(ctx.destination);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    patch.nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // noop
      }
    });
    try {
      envelope.disconnect();
    } catch {
      // noop
    }
    try {
      master.disconnect();
    } catch {
      // noop
    }
    try {
      panner3d.disconnect();
    } catch {
      // noop
    }
  };

  const cleanupTimer = window.setTimeout(() => {
    cleanup();
  }, Math.max(120, Math.ceil((patch.endAt - ctx.currentTime + 0.18) * 1000)));

  return {
    endAt: patch.endAt,
    stop: (at: number) => {
      if (cleaned) {
        return;
      }
      window.clearTimeout(cleanupTimer);
      const stopAt = Math.max(at, ctx.currentTime);
      envelope.gain.cancelScheduledValues(stopAt);
      envelope.gain.setValueAtTime(Math.max(0.0001, envelope.gain.value), stopAt);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.05);
      patch.sources.forEach((source) => {
        try {
          source.stop(stopAt + 0.06);
        } catch {
          // noop
        }
      });
      window.setTimeout(() => {
        cleanup();
      }, 120);
    }
  };
}

function buildBaselineMotifPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = SPATIAL_REFERENCE_FREQ_HZ * Math.pow(2, SPATIAL_NOTE_INTERVALS[0] / 12);

  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.78;

  const harmonic = ctx.createOscillator();
  harmonic.type = "sine";
  harmonic.frequency.value = SPATIAL_REFERENCE_FREQ_HZ * 2 * Math.pow(2, SPATIAL_NOTE_INTERVALS[0] / 12);

  const harmonicGain = ctx.createGain();
  harmonicGain.gain.value = 0.22;

  const mix = ctx.createGain();
  const timbre = ctx.createBiquadFilter();
  timbre.type = "lowpass";
  timbre.frequency.value = 4600;
  timbre.Q.value = 0.7;

  body.connect(bodyGain);
  bodyGain.connect(mix);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(mix);
  mix.connect(timbre);

  const motifDuration = SPATIAL_NOTE_INTERVALS.length * SPATIAL_NOTE_DURATION_SEC;
  const sustainEnd = startAt + Math.max(SPATIAL_MOTIF_ATTACK_SEC, motifDuration - 0.015);
  const endAt = startAt + motifDuration + SPATIAL_MOTIF_RELEASE_SEC;

  SPATIAL_NOTE_INTERVALS.forEach((semitone, idx) => {
    const t = startAt + idx * SPATIAL_NOTE_DURATION_SEC;
    const freq = SPATIAL_REFERENCE_FREQ_HZ * Math.pow(2, semitone / 12);
    body.frequency.setValueAtTime(freq, t);
    harmonic.frequency.setValueAtTime(freq * 2, t);
  });

  const localEnv = ctx.createGain();
  localEnv.gain.setValueAtTime(0.0001, startAt);
  localEnv.gain.exponentialRampToValueAtTime(1, startAt + SPATIAL_MOTIF_ATTACK_SEC);
  localEnv.gain.setValueAtTime(1, sustainEnd);
  localEnv.gain.exponentialRampToValueAtTime(0.0001, endAt);

  timbre.connect(localEnv);

  body.start(startAt);
  harmonic.start(startAt);
  body.stop(endAt + 0.03);
  harmonic.stop(endAt + 0.03);

  return {
    output: localEnv,
    sources: [body, harmonic],
    nodes: [body, bodyGain, harmonic, harmonicGain, mix, timbre, localEnv],
    endAt
  };
}

export function playSpatialMotifAtPoint(
  ctx: AudioContext,
  mode: SpatialMode,
  point: SpatialPoint,
  startAt: number
): { endAt: number; stop: (at: number) => void } {
  return attachSpatialPlayback(ctx, mode, point, startAt, buildBaselineMotifPatch(ctx, startAt));
}

function buildKickPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, startAt);
  osc.frequency.exponentialRampToValueAtTime(46, startAt + 0.24);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(1, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.29);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.75;

  const mix = ctx.createGain();

  osc.connect(gain);
  gain.connect(filter);
  filter.connect(mix);

  osc.start(startAt);
  osc.stop(startAt + 0.33);

  return {
    output: mix,
    sources: [osc],
    nodes: [osc, gain, filter, mix],
    endAt: startAt + 0.31
  };
}

function buildSnarePatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1300;
  noiseFilter.Q.value = 0.9;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, startAt);
  noiseGain.gain.exponentialRampToValueAtTime(0.95, startAt + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(210, startAt);
  body.frequency.exponentialRampToValueAtTime(140, startAt + 0.12);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, startAt);
  bodyGain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);

  const mix = ctx.createGain();

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(mix);

  body.connect(bodyGain);
  bodyGain.connect(mix);

  noise.start(startAt);
  noise.stop(startAt + 0.24);
  body.start(startAt);
  body.stop(startAt + 0.2);

  return {
    output: mix,
    sources: [noise, body],
    nodes: [noise, noiseFilter, noiseGain, body, bodyGain, mix],
    endAt: startAt + 0.24
  };
}

function buildCymbalPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx);

  const highPass = ctx.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 5600;
  highPass.Q.value = 0.7;

  const shimmer = ctx.createBiquadFilter();
  shimmer.type = "bandpass";
  shimmer.frequency.value = 9800;
  shimmer.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.8, startAt + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42);

  const mix = ctx.createGain();

  noise.connect(highPass);
  highPass.connect(shimmer);
  shimmer.connect(gain);
  gain.connect(mix);

  noise.start(startAt);
  noise.stop(startAt + 0.46);

  return {
    output: mix,
    sources: [noise],
    nodes: [noise, highPass, shimmer, gain, mix],
    endAt: startAt + 0.42
  };
}

function buildStrumPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const mix = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 4200;
  lowpass.Q.value = 0.5;
  lowpass.connect(mix);

  const frequencies = [220, 277.18, 329.63];
  const offsets = [0, 0.05, 0.1];
  const sources: SpatialAudioSource[] = [];
  const nodes: AudioNode[] = [mix, lowpass];

  frequencies.forEach((baseFreq, idx) => {
    const voiceStart = startAt + offsets[idx];
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, voiceStart);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.98, voiceStart + 0.24);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, voiceStart);
    gain.gain.exponentialRampToValueAtTime(0.55, voiceStart + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, voiceStart + 0.32);

    osc.connect(gain);
    gain.connect(lowpass);
    osc.start(voiceStart);
    osc.stop(voiceStart + 0.35);

    sources.push(osc);
    nodes.push(osc, gain);
  });

  return {
    output: mix,
    sources,
    nodes,
    endAt: startAt + 0.5
  };
}

function buildTomPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, startAt);
  osc.frequency.exponentialRampToValueAtTime(95, startAt + 0.27);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.92, startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.33);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  filter.Q.value = 1;

  const mix = ctx.createGain();

  osc.connect(gain);
  gain.connect(filter);
  filter.connect(mix);

  osc.start(startAt);
  osc.stop(startAt + 0.36);

  return {
    output: mix,
    sources: [osc],
    nodes: [osc, gain, filter, mix],
    endAt: startAt + 0.33
  };
}

function buildClapPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx);

  const bandPass = ctx.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.value = 2100;
  bandPass.Q.value = 0.9;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  const burstOffsets = [0, 0.028, 0.056];
  burstOffsets.forEach((offset) => {
    const riseAt = startAt + offset + 0.001;
    const decayAt = startAt + offset + 0.018;
    gain.gain.exponentialRampToValueAtTime(0.8, riseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, decayAt);
  });
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.17);

  const mix = ctx.createGain();

  noise.connect(bandPass);
  bandPass.connect(gain);
  gain.connect(mix);

  noise.start(startAt);
  noise.stop(startAt + 0.22);

  return {
    output: mix,
    sources: [noise],
    nodes: [noise, bandPass, gain, mix],
    endAt: startAt + 0.18
  };
}

function buildBellPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const fundamental = ctx.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.setValueAtTime(660, startAt);

  const overtone = ctx.createOscillator();
  overtone.type = "sine";
  overtone.frequency.setValueAtTime(990, startAt);

  const high = ctx.createOscillator();
  high.type = "triangle";
  high.frequency.setValueAtTime(1320, startAt);

  const gainA = ctx.createGain();
  gainA.gain.setValueAtTime(0.0001, startAt);
  gainA.gain.exponentialRampToValueAtTime(0.85, startAt + 0.004);
  gainA.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.72);

  const gainB = ctx.createGain();
  gainB.gain.setValueAtTime(0.0001, startAt);
  gainB.gain.exponentialRampToValueAtTime(0.52, startAt + 0.006);
  gainB.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.68);

  const gainC = ctx.createGain();
  gainC.gain.setValueAtTime(0.0001, startAt);
  gainC.gain.exponentialRampToValueAtTime(0.35, startAt + 0.006);
  gainC.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.44);

  const shimmer = ctx.createBiquadFilter();
  shimmer.type = "highshelf";
  shimmer.frequency.value = 3500;
  shimmer.gain.value = 4;

  const mix = ctx.createGain();

  fundamental.connect(gainA);
  overtone.connect(gainB);
  high.connect(gainC);
  gainA.connect(shimmer);
  gainB.connect(shimmer);
  gainC.connect(shimmer);
  shimmer.connect(mix);

  fundamental.start(startAt);
  overtone.start(startAt);
  high.start(startAt);

  fundamental.stop(startAt + 0.76);
  overtone.stop(startAt + 0.72);
  high.stop(startAt + 0.48);

  return {
    output: mix,
    sources: [fundamental, overtone, high],
    nodes: [fundamental, overtone, high, gainA, gainB, gainC, shimmer, mix],
    endAt: startAt + 0.72
  };
}

function buildPluckPatch(ctx: AudioContext, startAt: number): SpatialCuePatch {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(330, startAt);
  osc.frequency.exponentialRampToValueAtTime(300, startAt + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.9, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);

  const pickNoise = ctx.createBufferSource();
  pickNoise.buffer = createNoiseBuffer(ctx);
  const pickFilter = ctx.createBiquadFilter();
  pickFilter.type = "bandpass";
  pickFilter.frequency.value = 2700;
  pickFilter.Q.value = 1.6;

  const pickGain = ctx.createGain();
  pickGain.gain.setValueAtTime(0.0001, startAt);
  pickGain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.0015);
  pickGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.06);

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = 3000;
  bodyFilter.Q.value = 0.8;

  const mix = ctx.createGain();

  osc.connect(gain);
  gain.connect(bodyFilter);
  bodyFilter.connect(mix);

  pickNoise.connect(pickFilter);
  pickFilter.connect(pickGain);
  pickGain.connect(mix);

  osc.start(startAt);
  osc.stop(startAt + 0.39);
  pickNoise.start(startAt);
  pickNoise.stop(startAt + 0.09);

  return {
    output: mix,
    sources: [osc, pickNoise],
    nodes: [osc, gain, pickNoise, pickFilter, pickGain, bodyFilter, mix],
    endAt: startAt + 0.36
  };
}

function normalizeCueTimbreId(timbreId: number): number {
  if (!Number.isFinite(timbreId)) {
    return 0;
  }
  const rounded = Math.floor(timbreId);
  const normalized = rounded % SPATIAL_CUE_TIMBRE_COUNT;
  return normalized < 0 ? normalized + SPATIAL_CUE_TIMBRE_COUNT : normalized;
}

function buildCuePatch(ctx: AudioContext, startAt: number, timbreId: number): SpatialCuePatch {
  const normalized = normalizeCueTimbreId(timbreId);
  switch (normalized) {
    case 0:
      return buildKickPatch(ctx, startAt);
    case 1:
      return buildSnarePatch(ctx, startAt);
    case 2:
      return buildCymbalPatch(ctx, startAt);
    case 3:
      return buildStrumPatch(ctx, startAt);
    case 4:
      return buildTomPatch(ctx, startAt);
    case 5:
      return buildClapPatch(ctx, startAt);
    case 6:
      return buildBellPatch(ctx, startAt);
    default:
      return buildPluckPatch(ctx, startAt);
  }
}

export function playSpatialCueAtPoint(
  ctx: AudioContext,
  mode: SpatialMode,
  point: SpatialPoint,
  startAt: number,
  timbreId: number
): { endAt: number; stop: (at: number) => void } {
  return attachSpatialPlayback(ctx, mode, point, startAt, buildCuePatch(ctx, startAt, timbreId));
}
