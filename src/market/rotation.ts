import type { RotationConfig } from "../config/system.js";

export interface RotationCandidate {
  readonly marketId: string;
  readonly priorityWeight: number;
}

export interface RotationDecision {
  readonly marketId: string;
  readonly tick: number;
  readonly score: number;
}

export interface RotationEvent {
  readonly type: "skipped" | "rotated";
  readonly reason?: string;
  readonly tick: number;
  readonly marketId?: string;
}

interface RotationState {
  lastRotationTick: number;
  lastMarketId?: string;
  marketTicks: Map<string, number[]>;
}

function scoreCandidate(priorityWeight: number, age: number): number {
  return priorityWeight * 1_000_000 + age;
}

export class MarketRotationEngine {
  private readonly state: RotationState = {
    lastRotationTick: Number.NEGATIVE_INFINITY,
    lastMarketId: undefined,
    marketTicks: new Map(),
  };

  constructor(
    private readonly config: RotationConfig,
    private readonly onEvent?: (event: RotationEvent) => void,
  ) {}

  next(candidates: readonly RotationCandidate[], tick: number): RotationDecision | null {
    if (tick - this.state.lastRotationTick < this.config.intervalTicks) {
      this.onEvent?.({ type: "skipped", tick, reason: "interval-gate" });
      return null;
    }

    const eligible = candidates
      .filter((candidate) => candidate.priorityWeight > 0)
      .map((candidate) => {
        const promotions = this.state.marketTicks.get(candidate.marketId) ?? [];
        const unseenBaselineTick = tick - this.config.cooldownTicks - this.config.minRepeatGapTicks;
        const lastTick = promotions[promotions.length - 1] ?? unseenBaselineTick;
        const age = tick - lastTick;

        if (age < this.config.cooldownTicks) return null;

        if (candidate.marketId === this.state.lastMarketId && age < this.config.minRepeatGapTicks) {
          return null;
        }

        const recentCount = promotions.filter(
          (t) => tick - t < this.config.antiManipulationWindowTicks,
        ).length;
        if (recentCount >= this.config.maxPromotionsPerWindow) return null;

        return {
          marketId: candidate.marketId,
          score: scoreCandidate(candidate.priorityWeight, age),
        };
      })
      .filter((candidate): candidate is { marketId: string; score: number } => candidate !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.marketId.localeCompare(b.marketId);
      });

    const selected = eligible[0];
    if (!selected) {
      this.onEvent?.({ type: "skipped", tick, reason: "no-eligible-market" });
      return null;
    }

    this.state.lastRotationTick = tick;
    this.state.lastMarketId = selected.marketId;

    const history = this.state.marketTicks.get(selected.marketId) ?? [];
    history.push(tick);
    this.state.marketTicks.set(
      selected.marketId,
      history.filter((t) => tick - t < this.config.antiManipulationWindowTicks),
    );

    this.onEvent?.({ type: "rotated", tick, marketId: selected.marketId });
    return {
      marketId: selected.marketId,
      tick,
      score: selected.score,
    };
  }
}
