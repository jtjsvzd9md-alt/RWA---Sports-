import { describe, expect, it } from "vitest";
import { FileLinkerService } from "../src/linking/linker.js";
import { createFileLinkRegistry } from "../src/linking/registry.js";
import { MarketRotationEngine } from "../src/market/rotation.js";
import { readSystemConfig } from "../src/config/system.js";
import { assertIntegrity, deterministicChecksum, IntegrityError } from "../src/security/integrity.js";
import { assertOwner, OwnershipError } from "../src/security/ownership.js";

const ROTATION_CONFIG = {
  intervalTicks: 2,
  cooldownTicks: 6,
  minRepeatGapTicks: 4,
  antiManipulationWindowTicks: 10,
  maxPromotionsPerWindow: 2,
};

describe("file linking registry", () => {
  it("resolves only approved path pairs", () => {
    const registry = createFileLinkRegistry([
      {
        id: "approved",
        source: "src/a.ts",
        target: "src/b.ts",
        metadata: { description: "Allowed mapping" },
      },
    ]);

    expect(registry.resolveByPaths("src/a.ts", "src/b.ts").id).toBe("approved");
    expect(() => registry.resolveByPaths("src/a.ts", "src/unknown.ts")).toThrow(/unapproved/);
  });

  it("rejects unsafe path entries", () => {
    expect(() =>
      createFileLinkRegistry([
        {
          id: "bad",
          source: "../etc/passwd",
          target: "src/b.ts",
          metadata: { description: "unsafe" },
        },
      ])
    ).toThrow(/invalid source path/);
  });
});

describe("ownership and integrity guards", () => {
  it("enforces owner-only access for sensitive actions", () => {
    expect(() => assertOwner("operator-1", "owner-1", "rotate-market")).toThrow(OwnershipError);
    expect(() => assertOwner(undefined, "owner-1", "rotate-market")).toThrow(/actor id is required/);
    expect(() => assertOwner("owner-1", "owner-1", "rotate-market")).not.toThrow();
  });

  it("validates deterministic checksums and fails closed", () => {
    const artifact = { id: "module-A", revision: 7, enabled: true };
    const checksum = deterministicChecksum(artifact);

    expect(assertIntegrity(checksum, artifact, "artifact-A")).toBe(checksum);
    expect(() => assertIntegrity(checksum, { ...artifact, enabled: false }, "artifact-A")).toThrow(IntegrityError);
  });

  it("requires owner and checksum for sensitive link activation", () => {
    const artifact = { module: "secure" };
    const checksum = deterministicChecksum(artifact);
    const registry = createFileLinkRegistry([
      {
        id: "secure-link",
        source: "src/live/router.ts",
        target: "src/live/providers.ts",
        metadata: {
          description: "Sensitive link",
          sensitive: true,
          expectedChecksum: checksum,
        },
      },
    ]);

    const linker = new FileLinkerService({ ownerId: "owner-1", registry });

    expect(() =>
      linker.activate({
        source: "src/live/router.ts",
        target: "src/live/providers.ts",
        actorId: "intruder",
        artifact,
      })
    ).toThrow(OwnershipError);

    expect(() =>
      linker.activate({
        source: "src/live/router.ts",
        target: "src/live/providers.ts",
        actorId: "owner-1",
      })
    ).toThrow(/integrity artifact is required/);

    const activated = linker.activate({
      source: "src/live/router.ts",
      target: "src/live/providers.ts",
      actorId: "owner-1",
      artifact,
    });
    expect(activated.checksum).toBe(checksum);
  });
});

describe("market rotation engine", () => {
  it("applies deterministic priority weighting and interval scheduling", () => {
    const engine = new MarketRotationEngine(ROTATION_CONFIG);
    const candidates = [
      { marketId: "SOL-ETH", priorityWeight: 2 },
      { marketId: "ADA-ETH", priorityWeight: 1 },
    ];

    expect(engine.next(candidates, 0)?.marketId).toBe("SOL-ETH");
    expect(engine.next(candidates, 1)).toBeNull();
    expect(engine.next(candidates, 2)?.marketId).toBe("ADA-ETH");
  });

  it("prevents rapid repeated promotions through cooldown and anti-manipulation", () => {
    const engine = new MarketRotationEngine(ROTATION_CONFIG);
    const candidates = [
      { marketId: "SOL-ETH", priorityWeight: 5 },
      { marketId: "ADA-ETH", priorityWeight: 4 },
      { marketId: "LINK-ETH", priorityWeight: 3 },
    ];

    expect(engine.next(candidates, 0)?.marketId).toBe("SOL-ETH");
    expect(engine.next(candidates, 2)?.marketId).toBe("ADA-ETH");
    expect(engine.next(candidates, 4)?.marketId).toBe("LINK-ETH");
    expect(engine.next(candidates, 6)?.marketId).toBe("SOL-ETH");
    expect(engine.next(candidates, 8)?.marketId).toBe("ADA-ETH");
    expect(engine.next(candidates, 10)?.marketId).toBe("LINK-ETH");
  });

  it("expires anti-manipulation history exactly at the configured window boundary", () => {
    const engine = new MarketRotationEngine({
      intervalTicks: 1,
      cooldownTicks: 1,
      minRepeatGapTicks: 1,
      antiManipulationWindowTicks: 10,
      maxPromotionsPerWindow: 1,
    });
    const candidates = [{ marketId: "SOL-ETH", priorityWeight: 10 }];

    expect(engine.next(candidates, 0)?.marketId).toBe("SOL-ETH");
    expect(engine.next(candidates, 9)).toBeNull();
    expect(engine.next(candidates, 10)?.marketId).toBe("SOL-ETH");
  });
});

describe("system config schema", () => {
  it("parses OWNER_ID and rotation settings", () => {
    const cfg = readSystemConfig({
      OWNER_ID: "owner-42",
      ROTATION_INTERVAL_TICKS: "5",
      ROTATION_COOLDOWN_TICKS: "10",
      ROTATION_MIN_REPEAT_GAP_TICKS: "7",
      ROTATION_ANTI_MANIPULATION_WINDOW_TICKS: "20",
      ROTATION_MAX_PROMOTIONS_PER_WINDOW: "3",
    });

    expect(cfg.ownerId).toBe("owner-42");
    expect(cfg.rotation.intervalTicks).toBe(5);
    expect(cfg.rotation.maxPromotionsPerWindow).toBe(3);
  });

  it("fails on invalid numeric settings", () => {
    expect(() => readSystemConfig({ ROTATION_INTERVAL_TICKS: "0" })).toThrow(/ROTATION_INTERVAL_TICKS/);
  });

  it("normalizes whitespace-only OWNER_ID to undefined", () => {
    const cfg = readSystemConfig({ OWNER_ID: "   " });
    expect(cfg.ownerId).toBeUndefined();
  });

  it("rejects anti-manipulation windows smaller than repeat-gap", () => {
    expect(() =>
      readSystemConfig({
        ROTATION_MIN_REPEAT_GAP_TICKS: "20",
        ROTATION_ANTI_MANIPULATION_WINDOW_TICKS: "10",
      })
    ).toThrow(/ROTATION_ANTI_MANIPULATION_WINDOW_TICKS/);
  });

  it("rejects incompatible cooldown and anti-manipulation window for multi-promotion mode", () => {
    expect(() =>
      readSystemConfig({
        ROTATION_COOLDOWN_TICKS: "50",
        ROTATION_ANTI_MANIPULATION_WINDOW_TICKS: "20",
        ROTATION_MAX_PROMOTIONS_PER_WINDOW: "2",
      })
    ).toThrow(/ROTATION_ANTI_MANIPULATION_WINDOW_TICKS/);
  });
});
