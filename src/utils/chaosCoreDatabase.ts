import type { DatabaseContentType, ExportBundle } from "../types/common";

export const CHAOS_CORE_DATABASE_UPDATE_EVENT = "technica:chaos-core-database-update";
export const CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY = "technica.chaosCoreDatabaseUpdate";

export interface ChaosCoreDatabaseEntry {
  entryKey: string;
  contentId: string;
  title: string;
  runtimeFile: string;
  sourceFile?: string;
  origin: "game" | "technica";
  summaryData?: Record<string, unknown>;
}

export interface LoadedChaosCoreDatabaseEntry {
  entryKey: string;
  contentId: string;
  title: string;
  origin: "game" | "technica";
  runtimeFile: string;
  summaryData?: Record<string, unknown>;
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

export type PublishableChaosCoreContentType = DatabaseContentType | "decoration";

export interface ChaosCoreDatabaseUpdateEvent {
  contentType: DatabaseContentType;
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

export interface ChaosCoreDatabaseListAllResponse {
  repoPath: string;
  entriesByType: Partial<Record<DatabaseContentType, ChaosCoreDatabaseEntry[]>>;
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
  contentType: DatabaseContentType,
  options?: { force?: boolean }
): Promise<ChaosCoreDatabaseEntry[]> {
  return invokeCommand("list_chaos_core_database", {
    repoPath,
    contentType,
    force: options?.force
  });
}

export async function listAllChaosCoreDatabase(
  repoPath: string,
  options?: { force?: boolean }
): Promise<ChaosCoreDatabaseListAllResponse> {
  return invokeCommand("list_all_chaos_core_database_command", {
    repoPath,
    force: options?.force
  });
}

export async function loadChaosCoreDatabaseEntry(
  repoPath: string,
  contentType: DatabaseContentType,
  entryKey: string,
  options?: { force?: boolean }
): Promise<LoadedChaosCoreDatabaseEntry> {
  return invokeCommand("load_chaos_core_database_entry", {
    repoPath,
    contentType,
    entryKey,
    force: options?.force
  });
}

export async function listChaosCoreDatabaseFromSession(
  sessionOrigin: string,
  pairingToken: string,
  contentType: DatabaseContentType,
  options?: { force?: boolean }
): Promise<SessionDatabaseListResponse> {
  return fetchSessionDatabaseJson(
    sessionOrigin,
    `/api/database/list?token=${encodeURIComponent(pairingToken)}&contentType=${encodeURIComponent(contentType)}${options?.force ? "&force=1" : ""}`
  );
}

export async function listAllChaosCoreDatabaseFromSession(
  sessionOrigin: string,
  pairingToken: string,
  options?: { force?: boolean }
): Promise<ChaosCoreDatabaseListAllResponse> {
  return fetchSessionDatabaseJson(
    sessionOrigin,
    `/api/database/list-all?token=${encodeURIComponent(pairingToken)}${options?.force ? "&force=1" : ""}`
  );
}

export async function loadChaosCoreDatabaseEntryFromSession(
  sessionOrigin: string,
  pairingToken: string,
  contentType: DatabaseContentType,
  entryKey: string,
  options?: { force?: boolean }
): Promise<SessionDatabaseLoadResponse> {
  return fetchSessionDatabaseJson(
    sessionOrigin,
    `/api/database/load?token=${encodeURIComponent(pairingToken)}&contentType=${encodeURIComponent(contentType)}&entryKey=${encodeURIComponent(entryKey)}${options?.force ? "&force=1" : ""}`
  );
}

export async function publishChaosCoreBundle(
  repoPath: string,
  contentType: DatabaseContentType,
  bundle: ExportBundle,
  targetEntryKey?: string,
  targetSourceFile?: string
): Promise<PublishResult> {
  return publishChaosCoreBundleToContentType(repoPath, contentType, bundle, targetEntryKey, targetSourceFile);
}

export async function publishChaosCoreBundleToContentType(
  repoPath: string,
  contentType: PublishableChaosCoreContentType,
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
  contentType: DatabaseContentType,
  entryKey: string
): Promise<void> {
  return invokeCommand("remove_chaos_core_database_entry", {
    repoPath,
    contentType,
    entryKey
  });
}

export function emitChaosCoreDatabaseUpdate(contentType: DatabaseContentType) {
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
