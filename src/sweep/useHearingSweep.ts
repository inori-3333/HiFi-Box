import { useCallback, useEffect, useRef, useState } from "react";
import { getManifestNumberParam, getManifestStringParam, loadBuffer } from "../audio/custom-audio";
import type { AudioManifest } from "../audio/custom-audio-types";

const DEFAULT_FREQ_START = 15;
const DEFAULT_FREQ_END = 20_500;
const DEFAULT_SWEEP_DURATION_SEC = 30;
const SWEEP_TAIL_SEC = 0.03;

type SweepCurve = "log" | "linear";

type SweepConfig = {
  startHz: number;
  endHz: number;
  durationSec: number;
  curve: SweepCurve;
};

const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  startHz: DEFAULT_FREQ_START,
  endHz: DEFAULT_FREQ_END,
  durationSec: DEFAULT_SWEEP_DURATION_SEC,
  curve: "log"
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toSweepCurve(value: string): SweepCurve {
  return value.toLowerCase() === "linear" ? "linear" : "log";
}

function readSweepConfig(manifest: AudioManifest | null): SweepConfig {
  const startHz = getManifestNumberParam(manifest, "sweep.start_hz", DEFAULT_FREQ_START);
  const endHz = getManifestNumberParam(manifest, "sweep.end_hz", DEFAULT_FREQ_END);
  const durationSec = getManifestNumberParam(manifest, "sweep.duration_sec", DEFAULT_SWEEP_DURATION_SEC);
  const curve = toSweepCurve(getManifestStringParam(manifest, "sweep.curve", "log"));
  return {
    startHz: clamp(startHz, 10, 96_000),
    endHz: clamp(endHz, 10, 96_000),
    durationSec: clamp(durationSec, 1, 120),
    curve
  };
}

function frequencyAtElapsed(elapsedSec: number, config: SweepConfig): number {
  const ratio = clamp(elapsedSec, 0, config.durationSec) / config.durationSec;
  if (config.curve === "linear") {
    return config.startHz + (config.endHz - config.startHz) * ratio;
  }
  const safeStart = Math.max(1, config.startHz);
  const safeEnd = Math.max(safeStart + 1, config.endHz);
  return safeStart * Math.pow(safeEnd / safeStart, ratio);
}

export type HearingSweepController = {
  readonly isRunning: boolean;
  readonly currentFrequencyHz: number;
  readonly capturedMinHz: number | null;
  readonly capturedMaxHz: number | null;
  readonly volume: number;
  setVolume: (value: number) => void;
  startSweep: () => Promise<void>;
  replaySweep: () => Promise<void>;
  stopSweep: () => void;
  captureMin: () => void;
  captureMax: () => void;
};

type UseHearingSweepOptions = {
  setStatus: (value: string) => void;
};

export function useHearingSweep(options: UseHearingSweepOptions): HearingSweepController {
  const { setStatus } = options;
  const [isRunning, setIsRunning] = useState(false);
  const [currentFrequencyHz, setCurrentFrequencyHz] = useState(DEFAULT_FREQ_START);
  const [capturedMinHz, setCapturedMinHz] = useState<number | null>(null);
  const [capturedMaxHz, setCapturedMaxHz] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.18);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sweepStartAtRef = useRef<number | null>(null);
  const sweepEndAtRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const sweepConfigRef = useRef<SweepConfig>(DEFAULT_SWEEP_CONFIG);

  const stopSweep = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const osc = oscillatorRef.current;
    oscillatorRef.current = null;
    if (osc) {
      try {
        osc.stop();
      } catch {
        // noop
      }
      try {
        osc.disconnect();
      } catch {
        // noop
      }
    }

    const source = bufferSourceRef.current;
    bufferSourceRef.current = null;
    if (source) {
      try {
        source.stop();
      } catch {
        // noop
      }
      try {
        source.disconnect();
      } catch {
        // noop
      }
    }

    const gain = gainRef.current;
    gainRef.current = null;
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // noop
      }
    }

    sweepStartAtRef.current = null;
    sweepEndAtRef.current = null;
    setIsRunning(false);
  }, []);

  const startSweep = useCallback(async () => {
    stopSweep();

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const sweepTrack = await loadBuffer(ctx, "hearing-sweep", ["sweep", "default"]);
    const config = readSweepConfig(sweepTrack.manifest);
    sweepConfigRef.current = config;

    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);

    const startAt = ctx.currentTime + 0.03;
    const endAt = startAt + config.durationSec;

    if (sweepTrack.buffer) {
      const source = ctx.createBufferSource();
      source.buffer = sweepTrack.buffer;
      source.loop = sweepTrack.buffer.duration < config.durationSec + 0.05;
      source.connect(gain);
      source.start(startAt);
      source.stop(endAt + SWEEP_TAIL_SEC);
      bufferSourceRef.current = source;
      setStatus(
        `扫频开始：${Math.round(config.startHz)}Hz -> ${Math.round(config.endHz)}Hz（${config.durationSec.toFixed(1)}秒，目录音频）`
      );
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.connect(gain);
      osc.frequency.setValueAtTime(config.startHz, startAt);
      if (config.curve === "linear") {
        osc.frequency.linearRampToValueAtTime(config.endHz, endAt);
      } else {
        osc.frequency.exponentialRampToValueAtTime(Math.max(config.endHz, 1), endAt);
      }
      osc.start(startAt);
      osc.stop(endAt + SWEEP_TAIL_SEC);
      oscillatorRef.current = osc;
      setStatus(
        `扫频开始：${Math.round(config.startHz)}Hz -> ${Math.round(config.endHz)}Hz（${config.durationSec.toFixed(1)}秒，合成音）`
      );
    }

    gainRef.current = gain;
    sweepStartAtRef.current = startAt;
    sweepEndAtRef.current = endAt;

    setCapturedMinHz(null);
    setCapturedMaxHz(null);
    setCurrentFrequencyHz(config.startHz);
    setIsRunning(true);

    const tick = () => {
      const runCtx = audioContextRef.current;
      const sweepStartAt = sweepStartAtRef.current;
      const sweepEndAt = sweepEndAtRef.current;
      const liveConfig = sweepConfigRef.current;
      if (!runCtx || sweepStartAt === null || sweepEndAt === null) {
        return;
      }

      const now = runCtx.currentTime;
      const elapsed = clamp(now - sweepStartAt, 0, liveConfig.durationSec);
      setCurrentFrequencyHz(frequencyAtElapsed(elapsed, liveConfig));

      if (now >= sweepEndAt) {
        stopSweep();
        setCurrentFrequencyHz(liveConfig.endHz);
        setStatus("扫频结束。可重播或返回首页。");
        return;
      }
      rafIdRef.current = window.requestAnimationFrame(tick);
    };
    rafIdRef.current = window.requestAnimationFrame(tick);
  }, [setStatus, stopSweep, volume]);

  const captureAtCurrentTime = useCallback(
    (setter: (hz: number) => void, label: "最低" | "最高") => {
      if (!isRunning || !audioContextRef.current || sweepStartAtRef.current === null) {
        return;
      }
      const liveConfig = sweepConfigRef.current;
      const elapsed = clamp(audioContextRef.current.currentTime - sweepStartAtRef.current, 0, liveConfig.durationSec);
      const hz = Math.round(frequencyAtElapsed(elapsed, liveConfig));
      setter(hz);
      setStatus(`已记录${label}可听频率：${hz} Hz`);
    },
    [isRunning, setStatus]
  );

  const captureMin = useCallback(() => {
    captureAtCurrentTime((hz) => setCapturedMinHz(hz), "最低");
  }, [captureAtCurrentTime]);

  const captureMax = useCallback(() => {
    captureAtCurrentTime((hz) => setCapturedMaxHz(hz), "最高");
  }, [captureAtCurrentTime]);

  const replaySweep = useCallback(async () => {
    await startSweep();
  }, [startSweep]);

  useEffect(() => {
    return () => {
      stopSweep();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopSweep]);

  return {
    isRunning,
    currentFrequencyHz,
    capturedMinHz,
    capturedMaxHz,
    volume,
    setVolume,
    startSweep,
    replaySweep,
    stopSweep,
    captureMin,
    captureMax
  };
}
