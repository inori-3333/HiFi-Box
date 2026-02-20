import { describe, expect, it } from "vitest";
import {
  buildAbxTrial,
  calculateABXResults,
  calculateBinomialPValue,
  extractBinauralCuesFromChannels,
} from "./soundfield-core";

type FakeAudioBuffer = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
  copyToChannel: (source: Float32Array, channel: number) => void;
};

function makeFakeBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(channel: number): Float32Array {
      return data[channel];
    },
    copyToChannel(source: Float32Array, channel: number): void {
      data[channel].set(source.subarray(0, length));
    },
  };
}

function makeFakeAudioContext(sampleRate: number): AudioContext {
  return {
    createBuffer(channels: number, frameCount: number, sr: number) {
      return makeFakeBuffer(channels, frameCount, sr) as unknown as AudioBuffer;
    },
    sampleRate,
  } as unknown as AudioContext;
}

function fillSine(
  target: Float32Array,
  sampleRate: number,
  frequencyHz: number,
  amplitude: number
): void {
  for (let i = 0; i < target.length; i += 1) {
    target[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * amplitude;
  }
}

describe("soundfield-core binaural cues", () => {
  it("estimates ITD from delayed low-frequency signal", () => {
    const sampleRate = 48_000;
    const length = sampleRate;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    const delaySamples = 14; // ~291.7 us

    fillSine(left, sampleRate, 500, 0.8);
    for (let i = delaySamples; i < length; i += 1) {
      right[i] = left[i - delaySamples];
    }

    const cues = extractBinauralCuesFromChannels({ left, right, sampleRate });
    const expectedTheta = (Math.asin((343 * (delaySamples / sampleRate)) / 0.175) * 180) / Math.PI;

    expect(cues.thetaItdDeg).toBeCloseTo(expectedTheta, 0);
    expect(Math.abs(cues.itdSec)).toBeCloseTo(delaySamples / sampleRate, 4);
  });

  it("estimates ILD with configurable k=7 deg/dB on high-frequency content", () => {
    const sampleRate = 48_000;
    const length = sampleRate;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    const ildDb = 6;
    const ratio = Math.pow(10, ildDb / 20);

    fillSine(left, sampleRate, 4000, 0.3);
    fillSine(right, sampleRate, 4000, 0.3 * ratio);

    const cues = extractBinauralCuesFromChannels({ left, right, sampleRate });
    expect(cues.thetaIldDeg).toBeCloseTo(42, 0);
  });

  it("weights ITD more for low-frequency dominated signals and ILD more for high-frequency dominated signals", () => {
    const sampleRate = 48_000;
    const length = sampleRate;

    const lowLeft = new Float32Array(length);
    const lowRight = new Float32Array(length);
    fillSine(lowLeft, sampleRate, 300, 0.6);
    fillSine(lowRight, sampleRate, 300, 0.6);
    const lowCues = extractBinauralCuesFromChannels({ left: lowLeft, right: lowRight, sampleRate });

    const highLeft = new Float32Array(length);
    const highRight = new Float32Array(length);
    fillSine(highLeft, sampleRate, 6000, 0.6);
    fillSine(highRight, sampleRate, 6000, 0.6);
    const highCues = extractBinauralCuesFromChannels({ left: highLeft, right: highRight, sampleRate });

    expect(lowCues.itdWeight).toBeGreaterThan(lowCues.ildWeight);
    expect(highCues.ildWeight).toBeGreaterThan(highCues.itdWeight);
  });

  it("keeps opening angle mapped to 2 * side azimuth and clamped to [0, 180]", () => {
    const sampleRate = 48_000;
    const length = sampleRate;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    fillSine(left, sampleRate, 2000, 0.5);
    fillSine(right, sampleRate, 2000, 0.1);

    const cues = extractBinauralCuesFromChannels({ left, right, sampleRate });
    expect(cues.openingAngleDeg).toBeCloseTo(cues.thetaSideDeg * 2, 6);
    expect(cues.openingAngleDeg).toBeGreaterThanOrEqual(0);
    expect(cues.openingAngleDeg).toBeLessThanOrEqual(180);
  });
});

describe("soundfield-core ABX statistics", () => {
  it("matches expected one-sided binomial p-values for n=8", () => {
    expect(calculateBinomialPValue(8, 8)).toBeCloseTo(0.0039, 4);
    expect(calculateBinomialPValue(8, 4)).toBeCloseTo(0.6367, 4);
  });

  it("calculates ABX metrics including p-value and d-prime", () => {
    const trialTemplate = {
      aOpeningAngleDeg: 120,
      bOpeningAngleDeg: 60,
      xRef: "a" as const,
      cueDistanceDeg: 40,
      aCues: {
        itdSec: 0,
        ildDb: 0,
        thetaItdDeg: 45,
        thetaIldDeg: 45,
        thetaSideDeg: 45,
        openingAngleDeg: 90,
        itdWeight: 0.5,
        ildWeight: 0.5,
        confidence: 1,
      },
      bCues: {
        itdSec: 0,
        ildDb: 0,
        thetaItdDeg: 30,
        thetaIldDeg: 30,
        thetaSideDeg: 30,
        openingAngleDeg: 60,
        itdWeight: 0.5,
        ildWeight: 0.5,
        confidence: 1,
      },
      xCues: {
        itdSec: 0,
        ildDb: 0,
        thetaItdDeg: 45,
        thetaIldDeg: 45,
        thetaSideDeg: 45,
        openingAngleDeg: 90,
        itdWeight: 0.5,
        ildWeight: 0.5,
        confidence: 1,
      },
    };
    const trials = Array.from({ length: 8 }, (_, i) => ({
      trialNumber: i + 1,
      ...trialTemplate,
      userChoice: "a" as const,
      correct: i < 6,
    }));

    const result = calculateABXResults(trials);
    expect(result.totalTrials).toBe(8);
    expect(result.correctCount).toBe(6);
    expect(result.accuracy).toBeCloseTo(75, 4);
    expect(result.dPrime).toBeCloseTo(1.5, 4);
    expect(result.pValue).toBeCloseTo(0.1445, 4);
    expect(result.significant).toBe(false);
  });

  it("builds ABX trial with required fields and keeps X cues aligned to xRef", () => {
    const sampleRate = 48_000;
    const length = sampleRate;
    const source = makeFakeBuffer(2, length, sampleRate);
    fillSine(source.getChannelData(0), sampleRate, 700, 0.5);
    fillSine(source.getChannelData(1), sampleRate, 700, 0.5);
    const ctx = makeFakeAudioContext(sampleRate);

    const trial = buildAbxTrial(
      ctx,
      source as unknown as AudioBuffer,
      1,
      130,
      70,
      "a"
    );

    expect(trial.trialNumber).toBe(1);
    expect(trial.aOpeningAngleDeg).toBe(130);
    expect(trial.bOpeningAngleDeg).toBe(70);
    expect(trial.xRef).toBe("a");
    expect(trial.xCues.openingAngleDeg).toBeCloseTo(trial.aCues.openingAngleDeg, 6);
    expect(trial.cueDistanceDeg).toBeGreaterThanOrEqual(0);
  });
});
