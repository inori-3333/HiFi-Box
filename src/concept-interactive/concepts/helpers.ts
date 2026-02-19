import type { InteractiveChoice, InteractiveTrial, InteractiveTrialResult } from "../types";
import { confidenceFromTrials, mean } from "../scoring";

export function getNumber(trial: InteractiveTrial, key: string, fallback = 0): number {
  const value = trial.payload[key];
  return typeof value === "number" ? value : fallback;
}

export function getBoolean(trial: InteractiveTrial, key: string, fallback = false): boolean {
  const value = trial.payload[key];
  return typeof value === "boolean" ? value : fallback;
}

export function getString(trial: InteractiveTrial, key: string, fallback = ""): string {
  const value = trial.payload[key];
  return typeof value === "string" ? value : fallback;
}

export function evaluateChoice(
  trial: InteractiveTrial,
  userChoice: InteractiveChoice | undefined,
  skipped: boolean
): boolean | null {
  if (skipped || !userChoice || !trial.expected_choice) {
    return null;
  }
  return userChoice === trial.expected_choice;
}

export function summarizeConfidence(trials: InteractiveTrialResult[]): number {
  const replayCount = trials.reduce((acc, x) => acc + x.replay_count, 0);
  const skippedCount = trials.filter((x) => x.skipped).length;
  return confidenceFromTrials(trials.length, skippedCount, replayCount);
}

export function scoredTrials(trials: InteractiveTrialResult[]): InteractiveTrialResult[] {
  return trials.filter((x) => x.phase === "scored");
}

export function accuracyPercent(trials: InteractiveTrialResult[]): number {
  const usable = trials.filter((x) => !x.skipped && x.correct !== null);
  if (usable.length === 0) {
    return 0;
  }
  const correct = usable.filter((x) => x.correct).length;
  return (correct / usable.length) * 100;
}

export function meanOf(trials: InteractiveTrialResult[], key: keyof InteractiveTrialResult): number {
  const nums = trials
    .map((x) => x[key])
    .filter((x): x is number => typeof x === "number");
  return mean(nums);
}

export function minOf(trials: InteractiveTrialResult[], key: keyof InteractiveTrialResult): number {
  const nums = trials
    .map((x) => x[key])
    .filter((x): x is number => typeof x === "number");
  if (nums.length === 0) {
    return 0;
  }
  return Math.min(...nums);
}

export function maxOf(trials: InteractiveTrialResult[], key: keyof InteractiveTrialResult): number {
  const nums = trials
    .map((x) => x[key])
    .filter((x): x is number => typeof x === "number");
  if (nums.length === 0) {
    return 0;
  }
  return Math.max(...nums);
}
