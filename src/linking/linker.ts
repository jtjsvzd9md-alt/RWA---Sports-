import { assertIntegrity } from "../security/integrity.js";
import { assertOwner } from "../security/ownership.js";
import {
  APPROVED_FILE_LINKS,
  type FileLinkEntry,
  type FileLinkRegistry,
} from "./registry.js";

export interface LinkRequest {
  readonly source: string;
  readonly target: string;
  readonly actorId?: string;
  readonly artifact?: unknown;
}

export interface LinkerContext {
  readonly ownerId?: string;
  readonly registry?: FileLinkRegistry;
  readonly onEvent?: (event: { type: "resolved" | "activated"; entryId: string }) => void;
}

export interface ActivatedLink {
  readonly entry: FileLinkEntry;
  readonly checksum?: string;
}

export class FileLinkerService {
  private readonly ownerId?: string;
  private readonly registry: FileLinkRegistry;
  private readonly onEvent?: (event: { type: "resolved" | "activated"; entryId: string }) => void;

  constructor(context: LinkerContext = {}) {
    this.ownerId = context.ownerId;
    this.registry = context.registry ?? APPROVED_FILE_LINKS;
    this.onEvent = context.onEvent;
  }

  resolve(request: Pick<LinkRequest, "source" | "target">): FileLinkEntry {
    const entry = this.registry.resolveByPaths(request.source, request.target);
    this.onEvent?.({ type: "resolved", entryId: entry.id });
    return entry;
  }

  activate(request: LinkRequest): ActivatedLink {
    const entry = this.resolve(request);

    if (entry.metadata.sensitive) {
      assertOwner(request.actorId, this.ownerId, `activate-link:${entry.id}`);
    }

    if (entry.metadata.expectedChecksum) {
      if (request.artifact === undefined) {
        throw new Error(`integrity artifact is required for link: ${entry.id}`);
      }
      const checksum = assertIntegrity(entry.metadata.expectedChecksum, request.artifact, entry.id);
      this.onEvent?.({ type: "activated", entryId: entry.id });
      return { entry, checksum };
    }

    this.onEvent?.({ type: "activated", entryId: entry.id });
    return { entry };
  }
}
