export class OwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnershipError";
  }
}

export function normalizeOwnerId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function assertOwner(actorId: string | undefined, ownerId: string | undefined, action: string): void {
  const normalizedOwner = normalizeOwnerId(ownerId);
  const normalizedActor = normalizeOwnerId(actorId);

  if (!normalizedOwner) {
    throw new OwnershipError(`sensitive action \"${action}\" is disabled: OWNER_ID is not configured`);
  }
  if (!normalizedActor) {
    throw new OwnershipError(`sensitive action \"${action}\" denied: actor id is required`);
  }
  if (normalizedActor !== normalizedOwner) {
    throw new OwnershipError(`sensitive action \"${action}\" denied: owner mismatch`);
  }
}
