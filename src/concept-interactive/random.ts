export type SeededRandom = {
  readonly seed: number;
  next: () => number;
  nextInt: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
  shuffle: <T>(arr: T[]) => T[];
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: number): SeededRandom {
  const next = mulberry32(seed >>> 0);
  return {
    seed: seed >>> 0,
    next,
    nextInt(min: number, max: number): number {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return Math.floor(next() * (hi - lo + 1)) + lo;
    },
    pick<T>(arr: T[]): T {
      if (arr.length === 0) {
        throw new Error("cannot pick from empty array");
      }
      return arr[Math.floor(next() * arr.length)] as T;
    },
    shuffle<T>(arr: T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    }
  };
}

export function deriveSeed(baseSeed: number, label: string): number {
  let hash = baseSeed >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = Math.imul(hash ^ label.charCodeAt(i), 16777619) >>> 0;
  }
  return hash >>> 0;
}
