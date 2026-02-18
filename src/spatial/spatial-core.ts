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
  user?: SpatialPoint;
  score?: number;
  breakdown?: SpatialScoreBreakdown;
  revealed: boolean;
};

export type SpatialPlane = "xy" | "xz" | "zy";
export type SpatialMode = "2d" | "3d";

export const SPATIAL_TRIAL_COUNT = 6;
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

function scoreFromError(error: number, maxError: number): number {
  return clampScore(100 - (error / Math.max(maxError, 1e-9)) * 100);
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

function createRandomPoint(mode: SpatialMode, random: () => number): SpatialPoint {
  if (mode === "2d") {
    return {
      x: randomInRange(random, -0.94, 0.94),
      y: randomInRange(random, -0.94, 0.94),
      z: 0
    };
  }
  return {
    x: randomInRange(random, -0.94, 0.94),
    y: randomInRange(random, -0.94, 0.94),
    z: randomInRange(random, -0.94, 0.94)
  };
}

export function generateSpatialTargets(mode: SpatialMode, count: number, seed: number): SpatialPoint[] {
  const random = createSeededRandom(seed ^ (mode === "2d" ? 0x2d2d2d2d : 0x3d3d3d3d));
  const minRadius = mode === "2d" ? 0.3 : 0.42;
  const maxRadius = (mode === "2d" ? MAX_RADIUS_2D : MAX_RADIUS_3D) * 0.92;
  const gapSchedule = mode === "2d" ? [0.72, 0.6, 0.5, 0.4, 0.3] : [0.96, 0.82, 0.68, 0.56, 0.44];
  const points: SpatialPoint[] = [];

  for (const minGap of gapSchedule) {
    for (let attempt = 0; attempt < 5000 && points.length < count; attempt += 1) {
      const candidate = roundPoint(createRandomPoint(mode, random));
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
    const fallback = roundPoint(createRandomPoint(mode, random));
    if (points.some((existing) => pointDistance(mode, existing, fallback) < 0.2)) {
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
  const cartesianScore = scoreFromError(cartesianError, mode === "2d" ? MAX_PLANE_DISTANCE : MAX_CART_DISTANCE);

  const targetAzimuth = mode === "2d" ? Math.atan2(target.y, target.x) : Math.atan2(target.z, target.x);
  const guessAzimuth = mode === "2d" ? Math.atan2(guess.y, guess.x) : Math.atan2(guess.z, guess.x);
  const azimuthScore = scoreFromError(angleDelta(targetAzimuth, guessAzimuth), Math.PI);

  const verticalScore = scoreFromError(Math.abs(dy), 2);

  const radialError = Math.abs(pointRadius(mode, target) - pointRadius(mode, guess));
  const distanceScore = scoreFromError(radialError, mode === "2d" ? MAX_RADIUS_2D : MAX_RADIUS_3D);

  const weights =
    mode === "2d"
      ? { cartesian: 0.4, azimuth: 0.3, vertical: 0.2, distance: 0.1 }
      : { cartesian: 0.35, azimuth: 0.3, vertical: 0.2, distance: 0.15 };
  const score = clampScore(
    cartesianScore * weights.cartesian +
      azimuthScore * weights.azimuth +
      verticalScore * weights.vertical +
      distanceScore * weights.distance
  );

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
  return {
    x: point.x * 1.7,
    y: point.y * 1.3,
    z: -normalizedDepth * 1.8
  };
}

export function baselineReferencePoints(_: SpatialMode): SpatialPoint[] {
  const z = 0;
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
  const normalizedDistance = Math.min(1, Math.hypot(point.x, point.y, depth) / Math.sqrt(3));
  const maxGain = 0.34;
  const minGain = 0.08;
  const falloff = Math.pow(normalizedDistance, 0.7);
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

export function playSpatialMotifAtPoint(
  ctx: AudioContext,
  mode: SpatialMode,
  point: SpatialPoint,
  startAt: number
): { endAt: number; stop: (at: number) => void } {
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

  const envelope = ctx.createGain();
  const master = ctx.createGain();
  const panner3d = createSpatialPanner(ctx, mode, point);

  const motifDuration = SPATIAL_NOTE_INTERVALS.length * SPATIAL_NOTE_DURATION_SEC;
  const sustainEnd = startAt + Math.max(SPATIAL_MOTIF_ATTACK_SEC, motifDuration - 0.015);
  const endAt = startAt + motifDuration + SPATIAL_MOTIF_RELEASE_SEC;

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(1, startAt + SPATIAL_MOTIF_ATTACK_SEC);
  envelope.gain.setValueAtTime(1, sustainEnd);
  envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

  master.gain.setValueAtTime(planarLoudness(mode, point), startAt);

  SPATIAL_NOTE_INTERVALS.forEach((semitone, idx) => {
    const t = startAt + idx * SPATIAL_NOTE_DURATION_SEC;
    const freq = SPATIAL_REFERENCE_FREQ_HZ * Math.pow(2, semitone / 12);
    body.frequency.setValueAtTime(freq, t);
    harmonic.frequency.setValueAtTime(freq * 2, t);
  });

  timbre.connect(envelope);
  envelope.connect(master);
  master.connect(panner3d);
  panner3d.connect(ctx.destination);

  body.start(startAt);
  harmonic.start(startAt);
  body.stop(endAt + 0.03);
  harmonic.stop(endAt + 0.03);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    try {
      body.disconnect();
    } catch {
      // noop
    }
    try {
      bodyGain.disconnect();
    } catch {
      // noop
    }
    try {
      harmonic.disconnect();
    } catch {
      // noop
    }
    try {
      harmonicGain.disconnect();
    } catch {
      // noop
    }
    try {
      mix.disconnect();
    } catch {
      // noop
    }
    try {
      timbre.disconnect();
    } catch {
      // noop
    }
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
  }, Math.max(100, Math.ceil((endAt - ctx.currentTime + 0.12) * 1000)));

  return {
    endAt,
    stop: (at: number) => {
      if (cleaned) {
        return;
      }
      window.clearTimeout(cleanupTimer);
      const stopAt = Math.max(at, ctx.currentTime);
      envelope.gain.cancelScheduledValues(stopAt);
      envelope.gain.setValueAtTime(Math.max(0.0001, envelope.gain.value), stopAt);
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.05);
      try {
        body.stop(stopAt + 0.06);
      } catch {
        // noop
      }
      try {
        harmonic.stop(stopAt + 0.06);
      } catch {
        // noop
      }
      window.setTimeout(() => {
        cleanup();
      }, 120);
    }
  };
}
