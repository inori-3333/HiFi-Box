import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveAudioEngine } from "./audio-engine";
import { getConceptDefinition } from "./concepts";
import { deriveSeed } from "./random";
import type {
  InteractiveAnswerInput,
  InteractiveChoice,
  InteractiveConceptId,
  InteractiveConceptResult,
  InteractiveSessionMode,
  InteractiveSuitePhase,
  InteractiveTrial,
  InteractiveTrialResult,
  PlaybackVariant
} from "./types";
import { INTERACTIVE_CONCEPT_ORDER } from "./types";

export function rotateOrder(startConceptId: InteractiveConceptId | null): InteractiveConceptId[] {
  if (!startConceptId) {
    return [...INTERACTIVE_CONCEPT_ORDER];
  }
  const idx = INTERACTIVE_CONCEPT_ORDER.indexOf(startConceptId);
  if (idx < 0) {
    return [...INTERACTIVE_CONCEPT_ORDER];
  }
  return [...INTERACTIVE_CONCEPT_ORDER.slice(idx), ...INTERACTIVE_CONCEPT_ORDER.slice(0, idx)];
}

function evaluateChoice(
  trial: InteractiveTrial,
  userChoice: InteractiveChoice | undefined,
  skipped: boolean
): boolean | null {
  if (skipped || !userChoice || !trial.expected_choice) {
    return null;
  }
  return trial.expected_choice === userChoice;
}

export function toTrialResult(
  trial: InteractiveTrial,
  answer: InteractiveAnswerInput,
  replayCount: number,
  elapsedMs: number
): InteractiveTrialResult {
  const skipped = Boolean(answer.skipped);
  const userChoice = answer.choice;
  const expectedChoice = trial.expected_choice;
  const choiceCorrect = evaluateChoice(trial, userChoice, skipped);

  const base: InteractiveTrialResult = {
    trial_id: trial.id,
    concept: trial.concept,
    phase: trial.phase,
    prompt: trial.prompt,
    expected_choice: expectedChoice,
    user_choice: userChoice,
    correct: choiceCorrect,
    skipped,
    replay_count: replayCount,
    elapsed_ms: elapsedMs,
    ild_estimate_db: answer.ild_estimate_db,
    sensed_sub_bass: answer.sensed_sub_bass,
    separation_pos_a: answer.separation_pos_a,
    separation_pos_b: answer.separation_pos_b,
    dynamic_levels: answer.dynamic_levels,
    density_rating: answer.density_rating
  };

  if (trial.concept === "ild") {
    const delta = typeof trial.payload.delta_db === "number" ? Math.abs(trial.payload.delta_db) : 0;
    const estimate = typeof answer.ild_estimate_db === "number" ? answer.ild_estimate_db : delta;
    return {
      ...base,
      numeric_error: delta,
      ild_estimate_db: Math.abs(estimate - delta)
    };
  }

  if (trial.concept === "bass_extension") {
    return {
      ...base,
      numeric_error:
        typeof trial.payload.deep_cutoff_hz === "number" ? trial.payload.deep_cutoff_hz : 80
    };
  }

  if (trial.concept === "treble_extension") {
    return {
      ...base,
      numeric_error:
        typeof trial.payload.bright_cutoff_hz === "number" ? trial.payload.bright_cutoff_hz : 12000
    };
  }

  if (trial.concept === "resolution") {
    return {
      ...base,
      numeric_error: choiceCorrect ? (typeof trial.payload.snr_db === "number" ? trial.payload.snr_db : 6) : undefined,
      snr_db: typeof trial.payload.snr_db === "number" ? trial.payload.snr_db : undefined
    };
  }

  if (trial.concept === "separation") {
    const ta = typeof trial.payload.target_a === "number" ? trial.payload.target_a : -0.4;
    const tb = typeof trial.payload.target_b === "number" ? trial.payload.target_b : 0.4;
    const ua = typeof answer.separation_pos_a === "number" ? answer.separation_pos_a : 0;
    const ub = typeof answer.separation_pos_b === "number" ? answer.separation_pos_b : 0;

    const userSorted = [ua, ub].sort((a, b) => a - b);
    const targetSorted = [ta, tb].sort((a, b) => a - b);

    const localizationError = (Math.abs(userSorted[0] - targetSorted[0]) + Math.abs(userSorted[1] - targetSorted[1])) / 2;
    const userGap = Math.abs(userSorted[1] - userSorted[0]);
    const targetGap = Math.abs(targetSorted[1] - targetSorted[0]);
    const overlapError = Math.max(0, 0.22 - userGap);
    const correct = !skipped ? localizationError <= 0.2 && overlapError <= 0.12 : null;

    return {
      ...base,
      correct,
      numeric_error: localizationError,
      separation_gap: targetGap,
      overlap_error: overlapError
    };
  }

  if (trial.concept === "transient") {
    return {
      ...base,
      numeric_error: typeof trial.payload.clean_bpm === "number" ? trial.payload.clean_bpm : 120
    };
  }

  if (trial.concept === "dynamic") {
    return {
      ...base,
      numeric_error: typeof trial.payload.wide_range_db === "number" ? trial.payload.wide_range_db : 16
    };
  }

  if (trial.concept === "density") {
    return {
      ...base,
      numeric_error: typeof trial.payload.denser_target === "number" ? trial.payload.denser_target : 4
    };
  }

  return base;
}

export type InteractiveConceptSuiteController = {
  phase: InteractiveSuitePhase;
  mode: InteractiveSessionMode;
  queue: InteractiveConceptId[];
  queueIndex: number;
  currentConceptId: InteractiveConceptId | null;
  currentTrials: InteractiveTrial[];
  currentTrialIndex: number;
  currentTrial: InteractiveTrial | null;
  currentReplayCount: number;
  trialResults: InteractiveTrialResult[];
  conceptResults: InteractiveConceptResult[];
  overallScore: number;
  audioReady: boolean;
  startSingleConcept: (conceptId: InteractiveConceptId) => void;
  startSuite: (startConceptId?: InteractiveConceptId | null) => void;
  playVariant: (variant: PlaybackVariant, optionDeltaDb?: number) => Promise<void>;
  submitAnswer: (answer: InteractiveAnswerInput) => void;
  skipTrial: () => void;
  moveToNextConcept: () => void;
  restart: () => void;
  stopPlayback: () => void;
};

export function useInteractiveConceptSuite(): InteractiveConceptSuiteController {
  const audioRef = useRef(new InteractiveAudioEngine());
  const trialStartMsRef = useRef<number>(Date.now());

  const [seed, setSeed] = useState<number>(Date.now());
  const [phase, setPhase] = useState<InteractiveSuitePhase>("idle");
  const [mode, setMode] = useState<InteractiveSessionMode>("single");
  const [queue, setQueue] = useState<InteractiveConceptId[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const [currentConceptId, setCurrentConceptId] = useState<InteractiveConceptId | null>(null);
  const [currentTrials, setCurrentTrials] = useState<InteractiveTrial[]>([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [currentReplayCount, setCurrentReplayCount] = useState(0);
  const [trialResults, setTrialResults] = useState<InteractiveTrialResult[]>([]);

  const [conceptResults, setConceptResults] = useState<InteractiveConceptResult[]>([]);
  const [audioReady, setAudioReady] = useState(false);

  const currentTrial = currentTrials[currentTrialIndex] ?? null;

  const overallScore = useMemo(() => {
    if (conceptResults.length === 0) {
      return 0;
    }
    const total = conceptResults.reduce((acc, x) => acc + x.score, 0);
    return Math.round((total / conceptResults.length) * 10) / 10;
  }, [conceptResults]);

  const activateConcept = useCallback(
    (conceptId: InteractiveConceptId, index: number, newSeed: number) => {
      const definition = getConceptDefinition(conceptId);
      const conceptSeed = deriveSeed(newSeed, `${conceptId}:${index}`);
      const trials = definition.build_trials(conceptSeed);

      setCurrentConceptId(conceptId);
      setCurrentTrials(trials);
      setCurrentTrialIndex(0);
      setCurrentReplayCount(0);
      setTrialResults([]);
      trialStartMsRef.current = Date.now();
      setPhase(trials[0]?.phase === "practice" ? "practice" : "testing");
    },
    []
  );

  const startSingleConcept = useCallback(
    (conceptId: InteractiveConceptId) => {
      const nextSeed = Date.now();
      setSeed(nextSeed);
      setMode("single");
      setQueue([conceptId]);
      setQueueIndex(0);
      setConceptResults([]);
      activateConcept(conceptId, 0, nextSeed);
    },
    [activateConcept]
  );

  const startSuite = useCallback(
    (startConceptId?: InteractiveConceptId | null) => {
      const nextSeed = Date.now();
      const order = rotateOrder(startConceptId ?? null);
      setSeed(nextSeed);
      setMode("suite");
      setQueue(order);
      setQueueIndex(0);
      setConceptResults([]);
      activateConcept(order[0] as InteractiveConceptId, 0, nextSeed);
    },
    [activateConcept]
  );

  const playVariant = useCallback(
    async (variant: PlaybackVariant, optionDeltaDb?: number) => {
      if (!currentTrial) {
        return;
      }
      await audioRef.current.playTrial(currentTrial, variant, optionDeltaDb);
      setAudioReady(true);
      setCurrentReplayCount((v) => v + 1);
    },
    [currentTrial]
  );

  const moveToNextConcept = useCallback(() => {
    if (queueIndex >= queue.length - 1) {
      setPhase("completed");
      return;
    }
    const nextIndex = queueIndex + 1;
    const nextConceptId = queue[nextIndex];
    if (!nextConceptId) {
      setPhase("completed");
      return;
    }

    setQueueIndex(nextIndex);
    activateConcept(nextConceptId, nextIndex, seed);
  }, [activateConcept, queue, queueIndex, seed]);

  const submitAnswer = useCallback(
    (answer: InteractiveAnswerInput) => {
      if (!currentTrial || !currentConceptId) {
        return;
      }

      const elapsed = Math.max(0, Date.now() - trialStartMsRef.current);
      const trialResult = toTrialResult(currentTrial, answer, currentReplayCount, elapsed);
      const nextTrialResults = [...trialResults, trialResult];
      setTrialResults(nextTrialResults);

      const hasNextTrial = currentTrialIndex < currentTrials.length - 1;
      if (hasNextTrial) {
        const nextIndex = currentTrialIndex + 1;
        setCurrentTrialIndex(nextIndex);
        setCurrentReplayCount(0);
        trialStartMsRef.current = Date.now();
        const nextTrial = currentTrials[nextIndex];
        setPhase(nextTrial.phase === "practice" ? "practice" : "testing");
        return;
      }

      const definition = getConceptDefinition(currentConceptId);
      const summary = definition.summarize(nextTrialResults);
      setConceptResults((prev) => {
        const filtered = prev.filter((x) => x.concept !== currentConceptId);
        return [...filtered, summary];
      });
      setPhase("concept-complete");

      if (mode === "single") {
        setPhase("completed");
      }
    },
    [currentConceptId, currentReplayCount, currentTrial, currentTrialIndex, currentTrials, mode, trialResults]
  );

  const skipTrial = useCallback(() => {
    submitAnswer({ skipped: true });
  }, [submitAnswer]);

  const restart = useCallback(() => {
    audioRef.current.stopCurrent();
    setPhase("idle");
    setQueue([]);
    setQueueIndex(0);
    setCurrentConceptId(null);
    setCurrentTrials([]);
    setCurrentTrialIndex(0);
    setCurrentReplayCount(0);
    setTrialResults([]);
    setConceptResults([]);
    setAudioReady(false);
  }, []);

  const stopPlayback = useCallback(() => {
    audioRef.current.stopCurrent();
  }, []);

  useEffect(() => {
    if (phase === "concept-complete" && mode === "suite") {
      return;
    }
    if (phase === "completed") {
      audioRef.current.stopCurrent();
    }
  }, [mode, phase]);

  useEffect(() => {
    return () => {
      void audioRef.current.close();
    };
  }, []);

  return {
    phase,
    mode,
    queue,
    queueIndex,
    currentConceptId,
    currentTrials,
    currentTrialIndex,
    currentTrial,
    currentReplayCount,
    trialResults,
    conceptResults,
    overallScore,
    audioReady,
    startSingleConcept,
    startSuite,
    playVariant,
    submitAnswer,
    skipTrial,
    moveToNextConcept,
    restart,
    stopPlayback
  };
}
