import { createHash } from "node:crypto";

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrityError";
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function deterministicChecksum(value: unknown): string {
  const payload = stableStringify(value);
  return createHash("sha256").update(payload).digest("hex");
}

export function assertIntegrity(expectedChecksum: string, value: unknown, context: string): string {
  const actual = deterministicChecksum(value);
  if (actual !== expectedChecksum.toLowerCase()) {
    throw new IntegrityError(
      `integrity verification failed for ${context}: expected ${expectedChecksum.toLowerCase()}, got ${actual}`,
    );
  }
  return actual;
}
