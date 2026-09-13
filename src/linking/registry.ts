export interface FileLinkMetadata {
  readonly description: string;
  readonly sensitive?: boolean;
  readonly expectedChecksum?: string;
}

export interface FileLinkEntry {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly metadata: FileLinkMetadata;
}

const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

function isSafeRelativePath(value: string): boolean {
  if (!SAFE_PATH.test(value)) return false;
  if (value.startsWith("/") || value.startsWith(".")) return false;
  if (value.includes("\\")) return false;
  return !value.split("/").some((segment) => segment === ".." || segment.length === 0);
}

function normalizeChecksum(checksum?: string): string | undefined {
  if (checksum === undefined) return undefined;
  const normalized = checksum.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("expectedChecksum must be a 64-character hex SHA-256 string");
  }
  return normalized;
}

function validateEntry(entry: FileLinkEntry): FileLinkEntry {
  if (!entry.id || !SAFE_PATH.test(entry.id)) {
    throw new Error(`invalid link id: ${entry.id}`);
  }
  if (!isSafeRelativePath(entry.source)) {
    throw new Error(`invalid source path: ${entry.source}`);
  }
  if (!isSafeRelativePath(entry.target)) {
    throw new Error(`invalid target path: ${entry.target}`);
  }
  if (!entry.metadata?.description?.trim()) {
    throw new Error(`missing metadata description for link: ${entry.id}`);
  }

  return Object.freeze({
    ...entry,
    metadata: Object.freeze({
      ...entry.metadata,
      description: entry.metadata.description.trim(),
      expectedChecksum: normalizeChecksum(entry.metadata.expectedChecksum),
    }),
  });
}

export interface FileLinkRegistry {
  readonly byId: ReadonlyMap<string, FileLinkEntry>;
  resolveById(id: string): FileLinkEntry;
  resolveByPaths(source: string, target: string): FileLinkEntry;
}

export function createFileLinkRegistry(entries: readonly FileLinkEntry[]): FileLinkRegistry {
  const byId = new Map<string, FileLinkEntry>();
  const byPair = new Map<string, FileLinkEntry>();

  for (const raw of entries) {
    const entry = validateEntry(raw);
    const pairKey = `${entry.source}=>${entry.target}`;

    if (byId.has(entry.id)) throw new Error(`duplicate link id: ${entry.id}`);
    if (byPair.has(pairKey)) throw new Error(`duplicate link mapping: ${pairKey}`);

    byId.set(entry.id, entry);
    byPair.set(pairKey, entry);
  }

  return {
    byId,
    resolveById(id: string): FileLinkEntry {
      const hit = byId.get(id);
      if (!hit) throw new Error(`unapproved link id: ${id}`);
      return hit;
    },
    resolveByPaths(source: string, target: string): FileLinkEntry {
      const pairKey = `${source}=>${target}`;
      const hit = byPair.get(pairKey);
      if (!hit) throw new Error(`unapproved link path pair: ${pairKey}`);
      return hit;
    },
  };
}

export const APPROVED_FILE_LINKS = createFileLinkRegistry([
  {
    id: "paper-market-chain-feed",
    source: "src/paper/market.ts",
    target: "src/live/rpc.ts",
    metadata: {
      description: "Paper market reads chain token launches through the RPC feed adapter.",
      sensitive: false,
    },
  },
  {
    id: "live-routing-provider-wire",
    source: "src/live/router.ts",
    target: "src/live/providers.ts",
    metadata: {
      description: "Live mode provider routing and wire adapters must remain explicitly linked.",
      sensitive: true,
    },
  },
]);
