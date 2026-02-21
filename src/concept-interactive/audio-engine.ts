import type { InteractiveTrial, PlaybackVariant } from "./types";
import { loadBuffer } from "../audio/custom-audio";

type StopHandle = {
  stop: () => void;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function getNum(trial: InteractiveTrial, key: string, fallback: number): number {
  const value = trial.payload[key];
  return typeof value === "number" ? value : fallback;
}

function getStr(trial: InteractiveTrial, key: string, fallback: string): string {
  const value = trial.payload[key];
  return typeof value === "string" ? value : fallback;
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const frameCount = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function scheduleCleanup(ctx: AudioContext, durationSec: number, cleanup: () => void): number {
  return window.setTimeout(cleanup, Math.max(80, Math.ceil((durationSec + 0.1) * 1000)));
}

function playStereoTone(
  ctx: AudioContext,
  freqHz: number,
  durationSec: number,
  leftGain: number,
  rightGain: number,
  waveform: OscillatorType = "sine"
): StopHandle {
  const source = ctx.createOscillator();
  source.type = waveform;
  source.frequency.value = freqHz;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.02);
  amp.gain.setValueAtTime(0.45, ctx.currentTime + durationSec * 0.8);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  const splitter = ctx.createChannelSplitter(1);
  const left = ctx.createGain();
  left.gain.value = leftGain;
  const right = ctx.createGain();
  right.gain.value = rightGain;
  const merger = ctx.createChannelMerger(2);

  source.connect(amp);
  amp.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 0);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(ctx.destination);

  source.start();
  source.stop(ctx.currentTime + durationSec + 0.02);

  const cleanup = () => {
    try {
      source.disconnect();
      amp.disconnect();
      splitter.disconnect();
      left.disconnect();
      right.disconnect();
      merger.disconnect();
    } catch {
      // noop
    }
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);

  return {
    stop: () => {
      window.clearTimeout(tid);
      const now = ctx.currentTime;
      amp.gain.cancelScheduledValues(now);
      amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      try {
        source.stop(now + 0.04);
      } catch {
        // noop
      }
      window.setTimeout(cleanup, 60);
    }
  };
}

function playFilteredNoise(ctx: AudioContext, cutoffHz: number, durationSec: number, hp = false): StopHandle {
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, durationSec + 0.1);

  const filter = ctx.createBiquadFilter();
  filter.type = hp ? "highpass" : "lowpass";
  filter.frequency.value = cutoffHz;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.35, ctx.currentTime + durationSec * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start();
  src.stop(ctx.currentTime + durationSec + 0.02);

  const cleanup = () => {
    try {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      // noop
    }
  };

  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      try {
        src.stop();
      } catch {
        // noop
      }
      cleanup();
    }
  };
}

function playBassClip(ctx: AudioContext, cutoffHz: number, durationSec: number): StopHandle {
  const fundamental = ctx.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.value = 44;
  const harmonic = ctx.createOscillator();
  harmonic.type = "triangle";
  harmonic.frequency.value = 88;

  const mix = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 220;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = cutoffHz;
  highpass.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.015);
  gain.gain.setValueAtTime(0.5, ctx.currentTime + durationSec * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  fundamental.connect(mix);
  harmonic.connect(mix);
  mix.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(ctx.destination);

  fundamental.start();
  harmonic.start();
  fundamental.stop(ctx.currentTime + durationSec + 0.02);
  harmonic.stop(ctx.currentTime + durationSec + 0.02);

  const cleanup = () => {
    try {
      fundamental.disconnect();
      harmonic.disconnect();
      mix.disconnect();
      lowpass.disconnect();
      highpass.disconnect();
      gain.disconnect();
    } catch {
      // noop
    }
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);

  return {
    stop: () => {
      window.clearTimeout(tid);
      try {
        fundamental.stop();
        harmonic.stop();
      } catch {
        // noop
      }
      cleanup();
    }
  };
}

function playTrebleClip(ctx: AudioContext, cutoffHz: number, durationSec: number): StopHandle {
  const src = playFilteredNoise(ctx, cutoffHz, durationSec, false);
  const sparkle = playStereoTone(ctx, 7200, durationSec, 0.2, 0.2, "triangle");
  return {
    stop: () => {
      src.stop();
      sparkle.stop();
    }
  };
}

function playResolutionClip(ctx: AudioContext, snrDb: number, detailRatio: number, durationSec: number): StopHandle {
  const carrier = ctx.createOscillator();
  carrier.type = "triangle";
  const now = ctx.currentTime;
  const notes = [330, 392, 523, 440, 349];
  notes.forEach((freq, idx) => {
    carrier.frequency.setValueAtTime(freq * (1 + (detailRatio - 0.5) * 0.02), now + idx * 0.16);
  });

  const noteGain = ctx.createGain();
  noteGain.gain.setValueAtTime(0.0001, now);
  noteGain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
  noteGain.gain.setValueAtTime(0.4, now + durationSec * 0.75);
  noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec + 0.1);
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = clamp(0.28 * dbToGain(-snrDb), 0.01, 0.6);

  carrier.connect(noteGain);
  noteGain.connect(ctx.destination);

  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  carrier.start(now);
  noise.start(now);
  carrier.stop(now + durationSec + 0.02);
  noise.stop(now + durationSec + 0.02);

  const cleanup = () => {
    try {
      carrier.disconnect();
      noteGain.disconnect();
      noise.disconnect();
      noiseGain.disconnect();
    } catch {
      // noop
    }
  };

  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      try {
        carrier.stop();
        noise.stop();
      } catch {
        // noop
      }
      cleanup();
    }
  };
}

function playSeparationClip(
  ctx: AudioContext,
  targetA: number,
  targetB: number,
  crosstalk: number,
  durationSec: number
): StopHandle {
  const toneA = ctx.createOscillator();
  toneA.type = "sine";
  toneA.frequency.value = 410;
  const toneB = ctx.createOscillator();
  toneB.type = "triangle";
  toneB.frequency.value = 620;

  const gainA = ctx.createGain();
  const gainB = ctx.createGain();
  gainA.gain.value = 0.22;
  gainB.gain.value = 0.2;

  const pannerA = ctx.createStereoPanner();
  const pannerB = ctx.createStereoPanner();
  pannerA.pan.value = clamp(targetA + crosstalk, -1, 1);
  pannerB.pan.value = clamp(targetB - crosstalk, -1, 1);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.02);
  master.gain.setValueAtTime(0.7, ctx.currentTime + durationSec * 0.8);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  toneA.connect(gainA);
  gainA.connect(pannerA);
  pannerA.connect(master);

  toneB.connect(gainB);
  gainB.connect(pannerB);
  pannerB.connect(master);

  master.connect(ctx.destination);

  toneA.start();
  toneB.start();
  toneA.stop(ctx.currentTime + durationSec + 0.02);
  toneB.stop(ctx.currentTime + durationSec + 0.02);

  const cleanup = () => {
    try {
      toneA.disconnect();
      toneB.disconnect();
      gainA.disconnect();
      gainB.disconnect();
      pannerA.disconnect();
      pannerB.disconnect();
      master.disconnect();
    } catch {
      // noop
    }
  };

  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      try {
        toneA.stop();
        toneB.stop();
      } catch {
        // noop
      }
      cleanup();
    }
  };
}

function playTransientClip(ctx: AudioContext, bpm: number, attackMs: number, decayMs: number): StopHandle {
  const durationSec = 1.1;
  const beatInterval = 60 / bpm;
  const start = ctx.currentTime;
  const nodes: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (let t = 0; t < durationSec; t += beatInterval) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, start + t);
    osc.frequency.exponentialRampToValueAtTime(52, start + t + decayMs / 1000);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start + t);
    gain.gain.exponentialRampToValueAtTime(1.0, start + t + attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t + decayMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start + t);
    osc.stop(start + t + decayMs / 1000 + 0.03);

    nodes.push(osc);
    gains.push(gain);
  }

  const cleanup = () => {
    nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        // noop
      }
    });
    gains.forEach((g) => {
      try {
        g.disconnect();
      } catch {
        // noop
      }
    });
  };

  const tid = scheduleCleanup(ctx, durationSec + 0.2, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      nodes.forEach((node) => {
        try {
          node.stop();
        } catch {
          // noop
        }
      });
      cleanup();
    }
  };
}

function playDynamicClip(ctx: AudioContext, rangeDb: number): StopHandle {
  const src = ctx.createOscillator();
  src.type = "triangle";
  src.frequency.value = 392;

  const gain = ctx.createGain();
  const start = ctx.currentTime;
  const durationSec = 1.15;
  const minGain = 0.04;
  const maxGain = clamp(minGain * dbToGain(rangeDb), 0.08, 0.8);

  for (let i = 0; i <= 6; i += 1) {
    const t = start + (durationSec * i) / 6;
    const ratio = i % 2 === 0 ? minGain : maxGain;
    gain.gain.setValueAtTime(ratio, t);
  }

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(start);
  src.stop(start + durationSec + 0.02);

  const cleanup = () => {
    try {
      src.disconnect();
      gain.disconnect();
    } catch {
      // noop
    }
  };

  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      try {
        src.stop();
      } catch {
        // noop
      }
      cleanup();
    }
  };
}

function playDensityClip(ctx: AudioContext, densityFactor: number): StopHandle {
  const durationSec = 1.2;
  const partials = Math.round(clamp(densityFactor, 2, 7));
  const baseFreq = 220;

  const nodes: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
  master.gain.setValueAtTime(0.4, ctx.currentTime + durationSec * 0.75);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  for (let i = 1; i <= partials; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = baseFreq * i;
    const gain = ctx.createGain();
    gain.gain.value = 0.2 / i;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + durationSec + 0.02);
    nodes.push(osc);
    gains.push(gain);
  }

  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3500;
  shelf.gain.value = (densityFactor - 4) * 1.2;

  master.connect(shelf);
  shelf.connect(ctx.destination);

  const cleanup = () => {
    nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        // noop
      }
    });
    gains.forEach((g) => {
      try {
        g.disconnect();
      } catch {
        // noop
      }
    });
    try {
      master.disconnect();
      shelf.disconnect();
    } catch {
      // noop
    }
  };

  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          // noop
        }
      });
      cleanup();
    }
  };
}

function createBufferedSource(ctx: AudioContext, buffer: AudioBuffer, durationSec: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = buffer.duration < durationSec + 0.05;
  const now = ctx.currentTime;
  console.log(`[AudioEngine] Starting audio source: duration=${buffer.duration}s, playing for ${durationSec}s, loop=${source.loop}, currentTime=${now}`);
  source.start(now);
  source.stop(now + durationSec + 0.02);
  return source;
}

function stopAndDisconnect(node: AudioNode | AudioScheduledSourceNode): void {
  try {
    if ("stop" in node && typeof node.stop === "function") {
      node.stop();
    }
  } catch {
    // noop
  }
  try {
    node.disconnect();
  } catch {
    // noop
  }
}

function playDirectBufferClip(ctx: AudioContext, buffer: AudioBuffer, durationSec = 1.05): StopHandle {
  console.log(`[AudioEngine] playDirectBufferClip: buffer duration=${buffer.duration}s, sampleRate=${buffer.sampleRate}, channels=${buffer.numberOfChannels}, ctx.state=${ctx.state}`);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const now = ctx.currentTime;

  // 播放音频的第5-10秒（offset=5, duration=5）
  const startOffset = 5.0;
  const playDuration = 5.0;
  const actualDuration = Math.min(playDuration, buffer.duration - startOffset);

  source.start(now, startOffset, actualDuration + 0.02);
  console.log(`[AudioEngine] Source started at ${now}, offset=${startOffset}s, duration=${actualDuration}s`);

  const gain = ctx.createGain();
  // 增大初始音量和淡入时间，使声音更明显
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.8, now + 0.05);
  gain.gain.setValueAtTime(0.8, now + actualDuration * 0.9);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + actualDuration);

  source.connect(gain);
  gain.connect(ctx.destination);
  console.log(`[AudioEngine] Audio graph connected with higher gain (0.8), scheduled ${now} to ${now + actualDuration}`);

  const cleanup = () => {
    console.log(`[AudioEngine] Cleanup called`);
    stopAndDisconnect(source);
    stopAndDisconnect(gain);
  };
  const tid = scheduleCleanup(ctx, actualDuration, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedIldClip(ctx: AudioContext, buffer: AudioBuffer, deltaDb: number, durationSec: number): StopHandle {
  const source = createBufferedSource(ctx, buffer, durationSec);
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const left = ctx.createGain();
  const right = ctx.createGain();
  const dominant = 0.45;
  const recessive = dominant / dbToGain(Math.abs(deltaDb));
  left.gain.value = deltaDb <= 0 ? dominant : recessive;
  right.gain.value = deltaDb >= 0 ? dominant : recessive;
  source.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(splitter);
    stopAndDisconnect(left);
    stopAndDisconnect(right);
    stopAndDisconnect(merger);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedFilteredClip(
  ctx: AudioContext,
  buffer: AudioBuffer,
  durationSec: number,
  filterType: BiquadFilterType,
  cutoffHz: number
): StopHandle {
  const source = createBufferedSource(ctx, buffer, durationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoffHz;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.45, ctx.currentTime + durationSec * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(filter);
    stopAndDisconnect(gain);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedResolutionClip(
  ctx: AudioContext,
  buffer: AudioBuffer,
  durationSec: number,
  snrDb: number,
  detailRatio: number
): StopHandle {
  const source = createBufferedSource(ctx, buffer, durationSec);
  const detailFilter = ctx.createBiquadFilter();
  detailFilter.type = "lowpass";
  detailFilter.frequency.value = 2600 + detailRatio * 8000;
  detailFilter.Q.value = 0.7;
  const detailGain = ctx.createGain();
  detailGain.gain.value = 0.45;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec + 0.1);
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = clamp(0.22 * dbToGain(-snrDb), 0.01, 0.5);
  source.connect(detailFilter);
  detailFilter.connect(detailGain);
  detailGain.connect(ctx.destination);
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start();
  noise.stop(ctx.currentTime + durationSec + 0.02);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(detailFilter);
    stopAndDisconnect(detailGain);
    stopAndDisconnect(noise);
    stopAndDisconnect(noiseGain);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedSeparationClip(
  ctx: AudioContext,
  buffer: AudioBuffer,
  durationSec: number,
  targetA: number,
  targetB: number,
  crosstalk: number
): StopHandle {
  const sourceA = createBufferedSource(ctx, buffer, durationSec);
  const sourceB = createBufferedSource(ctx, buffer, durationSec);
  const gainA = ctx.createGain();
  const gainB = ctx.createGain();
  gainA.gain.value = 0.22;
  gainB.gain.value = 0.22;
  const pannerA = ctx.createStereoPanner();
  const pannerB = ctx.createStereoPanner();
  pannerA.pan.value = clamp(targetA + crosstalk, -1, 1);
  pannerB.pan.value = clamp(targetB - crosstalk, -1, 1);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.02);
  master.gain.setValueAtTime(0.6, ctx.currentTime + durationSec * 0.82);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  sourceA.connect(gainA);
  gainA.connect(pannerA);
  pannerA.connect(master);
  sourceB.connect(gainB);
  gainB.connect(pannerB);
  pannerB.connect(master);
  master.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(sourceA);
    stopAndDisconnect(sourceB);
    stopAndDisconnect(gainA);
    stopAndDisconnect(gainB);
    stopAndDisconnect(pannerA);
    stopAndDisconnect(pannerB);
    stopAndDisconnect(master);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedTransientClip(
  ctx: AudioContext,
  buffer: AudioBuffer,
  bpm: number,
  attackMs: number,
  decayMs: number
): StopHandle {
  const durationSec = 1.1;
  const source = createBufferedSource(ctx, buffer, durationSec);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  const interval = 60 / bpm;
  for (let t = 0; t < durationSec; t += interval) {
    gain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + t + attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + decayMs / 1000);
  }
  source.connect(gain);
  gain.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(gain);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedDynamicClip(ctx: AudioContext, buffer: AudioBuffer, rangeDb: number): StopHandle {
  const durationSec = 1.15;
  const source = createBufferedSource(ctx, buffer, durationSec);
  const gain = ctx.createGain();
  const start = ctx.currentTime;
  const minGain = 0.04;
  const maxGain = clamp(minGain * dbToGain(rangeDb), 0.08, 0.8);
  for (let i = 0; i <= 6; i += 1) {
    const t = start + (durationSec * i) / 6;
    gain.gain.setValueAtTime(i % 2 === 0 ? minGain : maxGain, t);
  }
  source.connect(gain);
  gain.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(gain);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

function playBufferedDensityClip(ctx: AudioContext, buffer: AudioBuffer, densityFactor: number): StopHandle {
  const durationSec = 1.2;
  const source = createBufferedSource(ctx, buffer, durationSec);
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3500;
  shelf.gain.value = (densityFactor - 4) * 1.2;
  const drive = ctx.createWaveShaper();
  const amount = clamp((densityFactor - 2) / 5, 0, 1);
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = Math.tanh(x * (1 + amount * 3));
  }
  drive.curve = curve;
  drive.oversample = "2x";
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.42, ctx.currentTime + durationSec * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  source.connect(shelf);
  shelf.connect(drive);
  drive.connect(gain);
  gain.connect(ctx.destination);
  const cleanup = () => {
    stopAndDisconnect(source);
    stopAndDisconnect(shelf);
    stopAndDisconnect(drive);
    stopAndDisconnect(gain);
  };
  const tid = scheduleCleanup(ctx, durationSec, cleanup);
  return {
    stop: () => {
      window.clearTimeout(tid);
      cleanup();
    }
  };
}

export class InteractiveAudioEngine {
  private context: AudioContext | null = null;
  private active: StopHandle | null = null;

  async ensureReady(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext();
      console.log(`[AudioEngine] AudioContext created, state: ${this.context.state}`);
    }
    if (this.context.state === "suspended") {
      console.log(`[AudioEngine] Resuming AudioContext...`);
      await this.context.resume();
      console.log(`[AudioEngine] AudioContext resumed, state: ${this.context.state}`);
    }
    return this.context;
  }

  stopCurrent(): void {
    if (this.active) {
      this.active.stop();
      this.active = null;
    }
  }

  private conceptModulePath(trial: InteractiveTrial): string {
    return `concept-interactive/${trial.concept}`;
  }

  private async resolveCustomAudio(
    ctx: AudioContext,
    trial: InteractiveTrial,
    variant: PlaybackVariant
  ): Promise<{ direct: AudioBuffer | null; base: AudioBuffer | null }> {
    const modulePath = this.conceptModulePath(trial);
    console.log(`[AudioEngine] Loading audio for ${trial.concept}, variant: ${variant}, modulePath: ${modulePath}`);
    const roleByVariant: Record<PlaybackVariant, string[]> = {
      a: ["variant:a", "a"],
      b: ["variant:b", "b"],
      x: ["variant:x", "x"],
      single: ["variant:single", "single"]
    };
    const direct = await loadBuffer(ctx, modulePath, roleByVariant[variant]);
    console.log(`[AudioEngine] Direct load result:`, { found: !!direct.buffer, fallbackReason: direct.fallbackReason, source: direct.source });
    if (direct.buffer) {
      return { direct: direct.buffer, base: null };
    }
    const base = await loadBuffer(ctx, modulePath, ["base", "default"]);
    console.log(`[AudioEngine] Base load result:`, { found: !!base.buffer, fallbackReason: base.fallbackReason, source: base.source });
    return { direct: null, base: base.buffer ?? null };
  }

  async playTrial(trial: InteractiveTrial, variant: PlaybackVariant, optionDeltaDb?: number): Promise<void> {
    const ctx = await this.ensureReady();
    this.stopCurrent();
    const custom = await this.resolveCustomAudio(ctx, trial, variant);

    switch (trial.concept) {
      case "ild": {
        const freq = getNum(trial, "reference_freq_hz", 900);
        // 优先使用传入的optionDeltaDb（练习选项），否则从payload获取
        const defaultDeltaDb = optionDeltaDb !== undefined
          ? optionDeltaDb
          : getNum(trial, "delta_db", 0);
        const deltaDb = variant === "a" ? 0 : defaultDeltaDb;
        const gainDelta = dbToGain(Math.abs(deltaDb));
        const dominant = 0.4;
        const recessive = 0.4 / gainDelta;
        const leftGain = deltaDb < 0 ? dominant : recessive;
        const rightGain = deltaDb > 0 ? dominant : recessive;
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 0.95)
          : custom.base
            ? playBufferedIldClip(ctx, custom.base, deltaDb, 0.95)
            : playStereoTone(ctx, freq, 0.95, leftGain, rightGain, "sine");
        break;
      }
      case "bass_extension": {
        const cutoff = getNum(trial, variant === "a" ? "a_cutoff_hz" : "b_cutoff_hz", 60);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.1)
          : custom.base
            ? playBufferedFilteredClip(ctx, custom.base, 1.1, "highpass", cutoff)
            : playBassClip(ctx, cutoff, 1.1);
        break;
      }
      case "treble_extension": {
        const cutoff = getNum(trial, variant === "a" ? "a_cutoff_hz" : "b_cutoff_hz", 12000);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.0)
          : custom.base
            ? playBufferedFilteredClip(ctx, custom.base, 1.0, "lowpass", cutoff)
            : playTrebleClip(ctx, cutoff, 1.0);
        break;
      }
      case "resolution": {
        const snrDb = getNum(trial, "snr_db", 0);
        const xRef = getStr(trial, "x_ref", "a");
        const detailA = getNum(trial, "a_detail_ratio", 1);
        const detailB = getNum(trial, "b_detail_ratio", 0.5);
        const detail =
          variant === "x"
            ? xRef === "a"
              ? detailA
              : detailB
            : variant === "a"
              ? detailA
              : detailB;
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.05)
          : custom.base
            ? playBufferedResolutionClip(ctx, custom.base, 1.05, snrDb, detail)
            : playResolutionClip(ctx, snrDb, detail, 1.05);
        break;
      }
      case "separation": {
        const targetA = getNum(trial, "target_a", -0.4);
        const targetB = getNum(trial, "target_b", 0.4);
        const crosstalk = getNum(trial, "crosstalk", 0.08);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.05)
          : custom.base
            ? playBufferedSeparationClip(ctx, custom.base, 1.05, targetA, targetB, crosstalk)
            : playSeparationClip(ctx, targetA, targetB, crosstalk, 1.05);
        break;
      }
      case "transient": {
        const bpm = getNum(trial, "bpm", 160);
        const attack = getNum(trial, variant === "a" ? "a_attack_ms" : "b_attack_ms", 10);
        const decay = getNum(trial, variant === "a" ? "a_decay_ms" : "b_decay_ms", 80);
        console.log(`[AudioEngine] Transient playback: direct=${!!custom.direct}, base=${!!custom.base}, bpm=${bpm}, attack=${attack}ms, decay=${decay}ms`);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.1)
          : custom.base
            ? playBufferedTransientClip(ctx, custom.base, bpm, attack, decay)
            : playTransientClip(ctx, bpm, attack, decay);
        console.log(`[AudioEngine] Transient playback started, active=`, !!this.active);
        break;
      }
      case "dynamic": {
        const rangeDb = getNum(trial, variant === "a" ? "a_range_db" : "b_range_db", 16);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.15)
          : custom.base
            ? playBufferedDynamicClip(ctx, custom.base, rangeDb)
            : playDynamicClip(ctx, rangeDb);
        break;
      }
      case "density": {
        const density = getNum(trial, variant === "a" ? "a_density_factor" : "b_density_factor", 4.5);
        this.active = custom.direct
          ? playDirectBufferClip(ctx, custom.direct, 1.2)
          : custom.base
            ? playBufferedDensityClip(ctx, custom.base, density)
            : playDensityClip(ctx, density);
        break;
      }
    }
  }

  async close(): Promise<void> {
    this.stopCurrent();
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}
