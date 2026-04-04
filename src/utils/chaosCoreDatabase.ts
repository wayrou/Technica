import type { EditorKind, ExportBundle } from "../types/common";

export const CHAOS_CORE_DATABASE_UPDATE_EVENT = "technica:chaos-core-database-update";
export const CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY = "technica.chaosCoreDatabaseUpdate";

export interface ChaosCoreDatabaseEntry {
  entryKey: string;
  contentId: string;
  title: string;
  runtimeFile: string;
  sourceFile?: string;
  origin: "game" | "technica";
}

export interface LoadedChaosCoreDatabaseEntry {
  entryKey: string;
  contentId: string;
  title: string;
  origin: "game" | "technica";
  runtimeFile: string;
  runtimeContent: string;
  sourceFile?: string;
  sourceContent?: string;
  editorContent?: string;
}

type PublishResult = {
  entryKey: string;
  contentId: string;
  runtimeFile: string;
};

export interface ChaosCoreDatabaseUpdateEvent {
  contentType: EditorKind;
  updatedAt: string;
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<TResponse>(command: string, payload?: Record<string, unknown>): Promise<TResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Chaos Core database publishing is only available in the Technica desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TResponse>(command, payload);
}

function buildSessionUrl(origin: string, path: string) {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

async function fetchSessionDatabaseJson<TResponse>(origin: string, path: string) {
  const response = await fetch(buildSessionUrl(origin, path), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Session request failed with ${response.status}.`);
  }

  return (await response.json()) as TResponse;
}

interface SessionDatabaseListResponse {
  repoPath: string;
  entries: ChaosCoreDatabaseEntry[];
}

interface SessionDatabaseLoadResponse {
  repoPath: string;
  entry: LoadedChaosCoreDatabaseEntry;
}

export async function discoverChaosCoreRepo(): Promise<string | null> {
  return invokeCommand<string | null>("discover_chaos_core_repo");
}

export async function listChaosCoreDatabase(
  repoPath: string,
  contentType: EditorKind
): Promise<ChaosCoreDatabaseEntry[]> {
  return invokeCommand("list_chaos_core_database", {
    repoPath,
    contentType
  });
}

export async function loadChaosCoreDatabaseEntry(
  repoPath: string,
  contentType: EditorKind,
  entryKey: string
): Promise<LoadedChaosCoreDatabaseEntry> {
  return invokeCommand("load_chaos_core_database_entry", {
    repoPath,
    contentType,
    entryKey
  });
}

export async function listChaosCoreDatabaseFromSession(
  sessionOrigin: string,
  pairingToken: string,
  contentType: EditorKind
): Promise<SessionDatabaseListResponse> {
  return fetchSessionDatabaseJson(
    sessionOrigin,
    `/api/database/list?token=${encodeURIComponent(pairingToken)}&contentType=${encodeURIComponent(contentType)}`
  );
}

export async function loadChaosCoreDatabaseEntryFromSession(
  sessionOrigin: string,
  pairingToken: string,
  contentType: EditorKind,
  entryKey: string
): Promise<SessionDatabaseLoadResponse> {
  return fetchSessionDatabaseJson(
    sessionOrigin,
    `/api/database/load?token=${encodeURIComponent(pairingToken)}&contentType=${encodeURIComponent(contentType)}&entryKey=${encodeURIComponent(entryKey)}`
  );
}

export async function publishChaosCoreBundle(
  repoPath: string,
  contentType: EditorKind,
  bundle: ExportBundle,
  targetEntryKey?: string,
  targetSourceFile?: string
): Promise<PublishResult> {
  return invokeCommand("publish_chaos_core_bundle", {
    request: {
      repoPath,
      contentType,
      targetEntryKey,
      targetSourceFile,
      manifest: bundle.manifest,
      files: bundle.files
    }
  });
}

export async function removeChaosCoreDatabaseEntry(
  repoPath: string,
  contentType: EditorKind,
  entryKey: string
): Promise<void> {
  return invokeCommand("remove_chaos_core_database_entry", {
    repoPath,
    contentType,
    entryKey
  });
}

export function emitChaosCoreDatabaseUpdate(contentType: EditorKind) {
  if (typeof window === "undefined") {
    return;
  }

  const update: ChaosCoreDatabaseUpdateEvent = {
    contentType,
    updatedAt: new Date().toISOString()
  };
  const serialized = JSON.stringify(update);
  window.localStorage.setItem(CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY, serialized);
  window.dispatchEvent(
    new CustomEvent<ChaosCoreDatabaseUpdateEvent>(CHAOS_CORE_DATABASE_UPDATE_EVENT, {
      detail: update
    })
  );
}

export function parseChaosCoreDatabaseUpdate(value: string | null): ChaosCoreDatabaseUpdateEvent | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ChaosCoreDatabaseUpdateEvent>;
    if (parsed.contentType && parsed.updatedAt) {
      return {
        contentType: parsed.contentType,
        updatedAt: parsed.updatedAt
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveChaosCoreErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}
