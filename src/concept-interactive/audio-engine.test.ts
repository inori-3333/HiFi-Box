import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveAudioEngine } from "./audio-engine";
import type { InteractiveTrial } from "./types";
import { loadBuffer } from "../audio/custom-audio";

vi.mock("../audio/custom-audio", () => ({
  loadBuffer: vi.fn()
}));

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

class FakeSourceNode extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;

  start(): void {
    // noop
  }

  stop(): void {
    // noop
  }
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeNode {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();

  start(): void {
    // noop
  }

  stop(): void {
    // noop
  }
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  destination = new FakeNode();

  resume(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new FakeSourceNode() as unknown as AudioBufferSourceNode;
  }

  createChannelSplitter(): ChannelSplitterNode {
    return new FakeNode() as unknown as ChannelSplitterNode;
  }

  createChannelMerger(): ChannelMergerNode {
    return new FakeNode() as unknown as ChannelMergerNode;
  }

  createOscillator(): OscillatorNode {
    return new FakeOscillatorNode() as unknown as OscillatorNode;
  }
}

function makeTrial(): InteractiveTrial {
  return {
    id: "ild-1",
    concept: "ild",
    phase: "scored",
    prompt: "test",
    instruction: "test",
    expected_choice: "left",
    payload: {
      delta_db: 2,
      reference_freq_hz: 900
    }
  };
}

describe("InteractiveAudioEngine custom audio fallback chain", () => {
  beforeEach(() => {
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("prefers explicit variant clip", async () => {
    const mockedLoadBuffer = vi.mocked(loadBuffer);
    mockedLoadBuffer.mockResolvedValueOnce({
      buffer: { duration: 1 } as unknown as AudioBuffer,
      source: null,
      fallbackReason: null,
      manifest: null
    });

    const engine = new InteractiveAudioEngine();
    await engine.playTrial(makeTrial(), "a");

    expect(mockedLoadBuffer).toHaveBeenCalledTimes(1);
    expect(mockedLoadBuffer.mock.calls[0]?.[2]).toEqual(["variant:a", "a"]);
    await engine.close();
  });

  it("falls back to base clip with DSP when explicit variant is missing", async () => {
    const mockedLoadBuffer = vi.mocked(loadBuffer);
    mockedLoadBuffer
      .mockResolvedValueOnce({
        buffer: null,
        source: null,
        fallbackReason: "missing",
        manifest: null
      })
      .mockResolvedValueOnce({
        buffer: { duration: 1 } as unknown as AudioBuffer,
        source: null,
        fallbackReason: null,
        manifest: null
      });

    const engine = new InteractiveAudioEngine();
    await engine.playTrial(makeTrial(), "b");

    expect(mockedLoadBuffer).toHaveBeenCalledTimes(2);
    expect(mockedLoadBuffer.mock.calls[1]?.[2]).toEqual(["base", "default"]);
    await engine.close();
  });

  it("falls back to synthetic path when no custom clip is available", async () => {
    const mockedLoadBuffer = vi.mocked(loadBuffer);
    mockedLoadBuffer.mockResolvedValue({
      buffer: null,
      source: null,
      fallbackReason: "missing",
      manifest: null
    });

    const engine = new InteractiveAudioEngine();
    await engine.playTrial(makeTrial(), "a");

    expect(mockedLoadBuffer).toHaveBeenCalledTimes(2);
    await engine.close();
  });
});
