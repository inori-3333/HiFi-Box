import { describe, expect, it } from "vitest";
import { createImageSizeTone, playImageSizeToneByAlgorithm } from "./image-size-core";

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }

  cancelScheduledValues(): void {
    // noop
  }
}

class FakeNode {
  connect(_target?: unknown): void {
    // noop
  }

  disconnect(): void {
    // noop
  }
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;

  start(): void {
    // noop
  }

  stop(): void {
    // noop
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48_000;
  destination = new FakeNode();
  createdBufferCount = 0;
  createdBufferSourceCount = 0;
  createdGainNodes: FakeGainNode[] = [];

  createBuffer(_channels: number, length: number, _sampleRate: number): AudioBuffer {
    this.createdBufferCount += 1;
    const channel = new Float32Array(length);
    return {
      duration: length / this.sampleRate,
      getChannelData: () => channel
    } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    this.createdBufferSourceCount += 1;
    return new FakeBufferSourceNode() as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.createdGainNodes.push(gain);
    return gain as unknown as GainNode;
  }

  createChannelMerger(): ChannelMergerNode {
    return new FakeNode() as unknown as ChannelMergerNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return {
      ...new FakeNode(),
      type: "lowpass",
      frequency: new FakeAudioParam(),
      Q: new FakeAudioParam(),
      gain: new FakeAudioParam()
    } as unknown as BiquadFilterNode;
  }

  createOscillator(): OscillatorNode {
    return {
      ...new FakeNode(),
      type: "triangle",
      frequency: new FakeAudioParam(),
      start: () => undefined,
      stop: () => undefined
    } as unknown as OscillatorNode;
  }

  createDelay(): DelayNode {
    return {
      ...new FakeNode(),
      delayTime: new FakeAudioParam()
    } as unknown as DelayNode;
  }
}

describe("image-size-core custom source buffer", () => {
  it("uses external buffer when provided", () => {
    const ctx = new FakeAudioContext() as unknown as AudioContext;
    const sourceBuffer = {
      duration: 2
    } as unknown as AudioBuffer;
    const playback = playImageSizeToneByAlgorithm(ctx, 0.5, "stereo-width", 1.2, undefined, sourceBuffer);
    playback.stop();
    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.createdBufferSourceCount).toBeGreaterThan(0);
    expect(fake.createdBufferCount).toBe(0);
  });

  it("falls back to synthesized source when no external buffer exists", () => {
    const ctx = new FakeAudioContext() as unknown as AudioContext;
    const playback = playImageSizeToneByAlgorithm(ctx, 0.5, "stereo-width", 1.2);
    playback.stop();
    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.createdBufferSourceCount).toBeGreaterThan(0);
    expect(fake.createdBufferCount).toBeGreaterThan(0);
  });

  it("keeps size-dependent width mapping when using custom source buffer", () => {
    const sourceBuffer = { duration: 2 } as unknown as AudioBuffer;

    const narrowCtx = new FakeAudioContext() as unknown as AudioContext;
    createImageSizeTone(narrowCtx, 0.2, 1.0, sourceBuffer).stop();
    const narrowGains = (narrowCtx as unknown as FakeAudioContext).createdGainNodes;
    const narrowDelta = Math.abs((narrowGains[1]?.gain.value ?? 0) - (narrowGains[2]?.gain.value ?? 0));

    const wideCtx = new FakeAudioContext() as unknown as AudioContext;
    createImageSizeTone(wideCtx, 0.8, 1.0, sourceBuffer).stop();
    const wideGains = (wideCtx as unknown as FakeAudioContext).createdGainNodes;
    const wideDelta = Math.abs((wideGains[1]?.gain.value ?? 0) - (wideGains[2]?.gain.value ?? 0));

    expect(wideDelta).toBeGreaterThan(narrowDelta);
  });
});
