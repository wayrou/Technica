import type { EditorKind, ExportBundle } from "../types/common";

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
