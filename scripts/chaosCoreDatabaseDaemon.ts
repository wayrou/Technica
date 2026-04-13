import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  CONTENT_TYPES,
  buildSnapshot,
  installNodeStubs,
  listEntries,
  loadEntry,
  type ContentType,
  type DatabaseEntrySummary,
  type LoadedDatabaseEntry
} from "./chaosCoreDatabaseSnapshot";

type SnapshotCacheEntry = {
  signature: string;
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>;
};

type DaemonRequest =
  | {
      command: "list";
      payload: {
        repoPath: string;
        contentType: ContentType;
        force?: boolean;
      };
    }
  | {
      command: "load";
      payload: {
        repoPath: string;
        contentType: ContentType;
        entryKey: string;
        force?: boolean;
      };
    }
  | {
      command: "listAll";
      payload: {
        repoPath: string;
        force?: boolean;
      };
    }
  | {
      command: "invalidate";
      payload: {
        repoPath: string;
        contentType?: ContentType;
      };
    };

type DaemonResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const cache = new Map<string, SnapshotCacheEntry>();

const BUILT_IN_SOURCE_FILES: Record<ContentType, string[]> = {
  dialogue: ["src/field/npcs.ts"],
  quest: ["src/quests/questData.ts"],
  key_item: [],
  chatter: [],
  faction: ["src/content/technica/defaultFactions.ts"],
  map: ["src/field/maps.ts"],
  npc: ["src/field/npcs.ts"],
  item: ["src/core/crafting.ts"],
  gear: ["src/core/equipment.ts", "src/data/weapons.ts", "src/data/armor.ts"],
  card: [
    "src/core/equipment.ts",
    "src/data/modules.ts",
    "src/core/gearWorkbench.ts",
    "src/core/initialState.ts"
  ],
  unit: ["src/core/initialState.ts"],
  operation: ["src/core/initialState.ts"],
  class: ["src/core/classes.ts"],
  schema: ["src/core/schemaSystem.ts"],
  codex: ["src/core/codexSystem.ts"]
};

function getCacheKey(repoPath: string, contentType: ContentType) {
  return `${repoPath}::${contentType}`;
}

async function readPathSignature(targetPath: string): Promise<string> {
  if (!existsSync(targetPath)) {
    return `${targetPath}:missing`;
  }

  const stats = await fs.stat(targetPath);
  if (stats.isDirectory()) {
    const entryNames = await fs.readdir(targetPath);
    const nestedSignatures = await Promise.all(
      entryNames
        .sort((left, right) => left.localeCompare(right))
        .map((entryName) => readPathSignature(path.join(targetPath, entryName)))
    );
    return `${targetPath}:dir:${nestedSignatures.join("|")}`;
  }

  return `${targetPath}:file:${stats.mtimeMs}:${stats.size}`;
}

async function buildSnapshotSignature(repoPath: string, contentType: ContentType) {
  const trackedPaths = [
    path.join(repoPath, "src", "content", "technica", "generated", contentType),
    path.join(repoPath, "src", "content", "technica", "source", contentType),
    path.join(repoPath, "src", "content", "technica", "disabled", contentType),
    ...BUILT_IN_SOURCE_FILES[contentType].map((relativePath) => path.join(repoPath, relativePath))
  ];

  const signatures = await Promise.all(trackedPaths.map((trackedPath) => readPathSignature(trackedPath)));
  return signatures.join("::");
}

async function getSnapshot(repoPath: string, contentType: ContentType, force = false) {
  const cacheKey = getCacheKey(repoPath, contentType);
  const signature = await buildSnapshotSignature(repoPath, contentType);
  const cached = cache.get(cacheKey);

  if (!force && cached && cached.signature === signature) {
    return cached.snapshot;
  }

  const snapshot = await buildSnapshot(repoPath, contentType);
  cache.set(cacheKey, { signature, snapshot });
  return snapshot;
}

function invalidateCache(repoPath: string, contentType?: ContentType) {
  if (contentType) {
    cache.delete(getCacheKey(repoPath, contentType));
    return;
  }

  Array.from(cache.keys()).forEach((cacheKey) => {
    if (cacheKey.startsWith(`${repoPath}::`)) {
      cache.delete(cacheKey);
    }
  });
}

async function handleListRequest(
  repoPath: string,
  contentType: ContentType,
  force = false
): Promise<DatabaseEntrySummary[]> {
  const snapshot = await getSnapshot(repoPath, contentType, force);
  return listEntries(repoPath, contentType, snapshot);
}

async function handleLoadRequest(
  repoPath: string,
  contentType: ContentType,
  entryKey: string,
  force = false
): Promise<LoadedDatabaseEntry> {
  const snapshot = await getSnapshot(repoPath, contentType, force);
  return loadEntry(repoPath, contentType, entryKey, snapshot);
}

async function handleListAllRequest(repoPath: string, force = false) {
  const entriesByType = {} as Record<ContentType, DatabaseEntrySummary[]>;
  for (const contentType of CONTENT_TYPES) {
    try {
      const snapshot = await getSnapshot(repoPath, contentType, force);
      entriesByType[contentType] = await listEntries(repoPath, contentType, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not list '${contentType}' entries: ${message}`);
    }
  }

  return { entriesByType };
}

async function handleRequest(request: DaemonRequest) {
  switch (request.command) {
    case "list":
      return handleListRequest(
        request.payload.repoPath,
        request.payload.contentType,
        request.payload.force
      );
    case "load":
      return handleLoadRequest(
        request.payload.repoPath,
        request.payload.contentType,
        request.payload.entryKey,
        request.payload.force
      );
    case "listAll":
      return handleListAllRequest(request.payload.repoPath, request.payload.force);
    case "invalidate":
      invalidateCache(request.payload.repoPath, request.payload.contentType);
      return { invalidated: true };
  }
}

async function main() {
  installNodeStubs();

  const input = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  for await (const line of input) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    let response: DaemonResponse;
    try {
      const request = JSON.parse(trimmedLine) as DaemonRequest;
      response = {
        ok: true,
        data: await handleRequest(request)
      };
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
