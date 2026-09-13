import { normalizeOwnerId } from "../security/ownership.js";

export interface RotationConfig {
  readonly intervalTicks: number;
  readonly cooldownTicks: number;
  readonly minRepeatGapTicks: number;
  readonly antiManipulationWindowTicks: number;
  readonly maxPromotionsPerWindow: number;
}

export interface SystemConfig {
  readonly ownerId?: string;
  readonly rotation: RotationConfig;
}

const DEFAULT_ROTATION: RotationConfig = Object.freeze({
  intervalTicks: 30,
  cooldownTicks: 120,
  minRepeatGapTicks: 90,
  antiManipulationWindowTicks: 300,
  maxPromotionsPerWindow: 2,
});

function intFromEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

export function readSystemConfig(env: Record<string, string | undefined> = process.env): SystemConfig {
  const rotation: RotationConfig = {
    intervalTicks: intFromEnv(env, "ROTATION_INTERVAL_TICKS", DEFAULT_ROTATION.intervalTicks, 1, 3_600),
    cooldownTicks: intFromEnv(env, "ROTATION_COOLDOWN_TICKS", DEFAULT_ROTATION.cooldownTicks, 1, 86_400),
    minRepeatGapTicks: intFromEnv(env, "ROTATION_MIN_REPEAT_GAP_TICKS", DEFAULT_ROTATION.minRepeatGapTicks, 1, 86_400),
    antiManipulationWindowTicks: intFromEnv(
      env,
      "ROTATION_ANTI_MANIPULATION_WINDOW_TICKS",
      DEFAULT_ROTATION.antiManipulationWindowTicks,
      1,
      86_400,
    ),
    maxPromotionsPerWindow: intFromEnv(
      env,
      "ROTATION_MAX_PROMOTIONS_PER_WINDOW",
      DEFAULT_ROTATION.maxPromotionsPerWindow,
      1,
      20,
    ),
  };

  if (rotation.antiManipulationWindowTicks < rotation.minRepeatGapTicks) {
    throw new Error("ROTATION_ANTI_MANIPULATION_WINDOW_TICKS must be >= ROTATION_MIN_REPEAT_GAP_TICKS");
  }
  if (
    rotation.maxPromotionsPerWindow > 1 &&
    rotation.antiManipulationWindowTicks < rotation.cooldownTicks
  ) {
    throw new Error(
      "ROTATION_ANTI_MANIPULATION_WINDOW_TICKS must be >= ROTATION_COOLDOWN_TICKS when ROTATION_MAX_PROMOTIONS_PER_WINDOW > 1",
    );
  }

  return {
    ownerId: normalizeOwnerId(env.OWNER_ID),
    rotation,
  };
}
