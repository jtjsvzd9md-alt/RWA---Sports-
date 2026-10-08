# DEGEN VILLAGE secure file linking and market rotation

## Architecture overview

- `src/linking/registry.ts` defines the approved file-link registry.
  - Each link is explicit (`id`, `source`, `target`, metadata).
  - Unknown ids/path pairs are rejected.
  - Path validation blocks traversal and absolute-path style inputs.
- `src/linking/linker.ts` resolves and activates links only through the approved registry.
  - Sensitive links require owner validation.
  - Links with `expectedChecksum` require deterministic integrity verification before activation.
- `src/security/ownership.ts` enforces owner-only actions via `OWNER_ID`.
- `src/security/integrity.ts` computes deterministic SHA-256 checksums using stable object serialization.
- `src/market/rotation.ts` provides deterministic market selection with:
  - priority weighting
  - interval gating
  - cooldown gating
  - anti-manipulation window limits
  - minimum repeat-gap protection
- `src/config/system.ts` parses and validates owner and rotation configuration from environment variables.

## File-linking flow

1. Register allowed pairs in `APPROVED_FILE_LINKS`.
2. Resolve through `FileLinkerService.resolve` or `activate`.
3. `activate` enforces:
   - registry-only path resolution,
   - owner guard for sensitive links,
   - checksum validation (when configured).
4. On any failure, activation throws and no link is activated (fail closed).

## Ownership and integrity behavior

- Sensitive actions are disabled when `OWNER_ID` is not configured.
- Owner mismatch fails with explicit `OwnershipError`.
- Integrity mismatch fails with explicit `IntegrityError`.
- Checksums use stable key ordering to remain deterministic across runs.

## Market rotation behavior

`MarketRotationEngine.next(candidates, tick)` returns either a deterministic market decision or `null`.

Selection rules:

1. Enforce `intervalTicks` between any two promotions.
2. Exclude markets promoted within `max(cooldownTicks, minRepeatGapTicks)`.
4. Enforce anti-manipulation cap: max promotions per market within
   `antiManipulationWindowTicks`.
5. Pick highest score (`priorityWeight` first, then age), then stable lexical tie-break.

## Configuration

- `OWNER_ID`
- `ROTATION_INTERVAL_TICKS`
- `ROTATION_COOLDOWN_TICKS`
- `ROTATION_MIN_REPEAT_GAP_TICKS`
- `ROTATION_ANTI_MANIPULATION_WINDOW_TICKS`
- `ROTATION_MAX_PROMOTIONS_PER_WINDOW`

`src/run.ts` calls `readSystemConfig(process.env)` during startup to validate these values.
