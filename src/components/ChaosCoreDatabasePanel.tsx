import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import type { EditorKind, ExportBundle } from "../types/common";
import {
  discoverChaosCoreRepo,
  isTauriRuntime,
  listChaosCoreDatabase,
  loadChaosCoreDatabaseEntry,
  publishChaosCoreBundle,
  removeChaosCoreDatabaseEntry,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../utils/chaosCoreDatabase";
import { notify } from "../utils/dialogs";
import { Panel } from "./Panel";

interface ChaosCoreDatabasePanelProps<TDocument> {
  contentType: EditorKind;
  currentDocument: TDocument;
  buildBundle: (document: TDocument) => Promise<ExportBundle> | ExportBundle;
  onLoadEntry: (entry: LoadedChaosCoreDatabaseEntry) => void;
  subtitle: string;
}

export function ChaosCoreDatabasePanel<TDocument>({
  contentType,
  currentDocument,
  buildBundle,
  onLoadEntry,
  subtitle
}: ChaosCoreDatabasePanelProps<TDocument>) {
  const desktopEnabled = isTauriRuntime();
  const [repoPath, setRepoPath] = usePersistentState("technica.chaosCoreRepoPath", "");
  const [entries, setEntries] = useState<ChaosCoreDatabaseEntry[]>([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [isRemovingEntry, setIsRemovingEntry] = useState(false);
  const [armedRemoveEntryKey, setArmedRemoveEntryKey] = useState("");

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.entryKey === selectedEntryKey) ?? null,
    [entries, selectedEntryKey]
  );

  async function handleDiscoverRepo() {
    if (!desktopEnabled) {
      notify("Chaos Core database publishing is only available in the Technica desktop app.");
      return;
    }

    try {
      const discovered = await discoverChaosCoreRepo();
      if (discovered) {
        setRepoPath(discovered);
      } else {
        notify("Could not automatically find a Chaos Core repo. Paste the repo path below.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not detect the Chaos Core repo path.");
    }
  }

  async function refreshEntries(nextRepoPath = repoPath) {
    if (!desktopEnabled) {
      setEntries([]);
      setSelectedEntryKey("");
      return;
    }

    if (!nextRepoPath.trim()) {
      setEntries([]);
      setSelectedEntryKey("");
      return;
    }

    setIsRefreshing(true);
    try {
      const nextEntries = await listChaosCoreDatabase(nextRepoPath.trim(), contentType);
      setEntries(nextEntries);
      setSelectedEntryKey((current) => {
        if (current && nextEntries.some((entry) => entry.entryKey === current)) {
          return current;
        }
        return nextEntries[0]?.entryKey ?? "";
      });
      setArmedRemoveEntryKey("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load the Chaos Core database.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRemove() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to remove records from the Chaos Core repo.");
      return;
    }

    if (!repoPath.trim() || !selectedEntry) {
      return;
    }

    if (armedRemoveEntryKey !== selectedEntry.entryKey) {
      setArmedRemoveEntryKey(selectedEntry.entryKey);
      notify(
        selectedEntry.origin === "game"
          ? `Click Disable built-in again to hide '${selectedEntry.contentId}' from Chaos Core runtime.`
          : `Click Delete published again to remove '${selectedEntry.contentId}' from the Technica-generated repo files.`
      );
      return;
    }

    setIsRemovingEntry(true);
    try {
      await removeChaosCoreDatabaseEntry(repoPath.trim(), contentType, selectedEntry.entryKey);
      await refreshEntries(repoPath.trim());
      notify(
        selectedEntry.origin === "game"
          ? `Disabled built-in '${selectedEntry.contentId}'.`
          : `Deleted Technica-published '${selectedEntry.contentId}'.`
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove the selected Chaos Core entry.");
    } finally {
      setIsRemovingEntry(false);
    }
  }

  async function handleLoad() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to load directly from the Chaos Core repo.");
      return;
    }

    if (!repoPath.trim() || !selectedEntry) {
      return;
    }

    setIsLoadingEntry(true);
    try {
      onLoadEntry(await loadChaosCoreDatabaseEntry(repoPath.trim(), contentType, selectedEntry.entryKey));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load the selected Chaos Core entry.");
    } finally {
      setIsLoadingEntry(false);
    }
  }

  async function handlePublish() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to publish directly into the Chaos Core repo.");
      return;
    }

    if (!repoPath.trim()) {
      notify("Set the Chaos Core repo path first.");
      return;
    }

    setIsPublishing(true);
    try {
      const result = await publishChaosCoreBundle(
        repoPath.trim(),
        contentType,
        await buildBundle(currentDocument),
        selectedEntry?.entryKey,
        selectedEntry?.sourceFile
      );
      await refreshEntries(repoPath.trim());
      setSelectedEntryKey(result.entryKey);
      notify(
        result.entryKey.startsWith("game:")
          ? `Updated built-in '${result.contentId}' in the Chaos Core source tables.`
          : `Published '${result.contentId}' into the Chaos Core repo.`
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not publish into the Chaos Core repo.");
    } finally {
      setIsPublishing(false);
    }
  }

  useEffect(() => {
    if (!desktopEnabled) {
      setEntries([]);
      setSelectedEntryKey("");
      return;
    }

    if (!repoPath.trim()) {
      void handleDiscoverRepo();
      return;
    }

    void refreshEntries(repoPath);
  }, [contentType, desktopEnabled, repoPath]);

  useEffect(() => {
    setArmedRemoveEntryKey("");
  }, [selectedEntryKey]);

  return (
    <Panel
      title="Chaos Core Database"
      subtitle={subtitle}
      actions={
        <div className="toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleDiscoverRepo()}
            disabled={!desktopEnabled}
          >
            Detect repo
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void refreshEntries()}
            disabled={!desktopEnabled || isRefreshing}
          >
            Refresh
          </button>
        </div>
      }
    >
      {!desktopEnabled ? (
        <div className="empty-state compact">
          Repo-backed Chaos Core publishing is available in the Technica desktop app. Use{" "}
          <code>npm run dev:desktop</code>
          {" "}to edit the live game database and publish directly into the Chaos Core repo.
        </div>
      ) : null}

      <div className="form-grid">
        <label className="field full">
          <span>Chaos Core repo path</span>
          <input
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="/absolute/path/to/chaos-core"
            disabled={!desktopEnabled}
          />
        </label>
      </div>

      <div className="toolbar split">
        <div className="chip-row">
          <span className="pill">{entries.length} entries</span>
          <span className="pill">{contentType}</span>
          {selectedEntry ? <span className="pill">{selectedEntry.origin === "game" ? "Game" : "Technica"}</span> : null}
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleLoad()}
            disabled={!desktopEnabled || !selectedEntry || isLoadingEntry}
          >
            Load selected
          </button>
          <button
            type="button"
            className="ghost-button danger"
            onClick={() => void handleRemove()}
            disabled={!desktopEnabled || !selectedEntry || isRemovingEntry}
          >
            {selectedEntry?.origin === "game"
              ? armedRemoveEntryKey === selectedEntry.entryKey
                ? "Confirm disable"
                : "Disable built-in"
              : armedRemoveEntryKey === selectedEntry?.entryKey
                ? "Confirm delete"
                : "Delete published"}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handlePublish()}
            disabled={!desktopEnabled || isPublishing}
          >
            Publish current to game
          </button>
        </div>
      </div>

      {desktopEnabled ? (
        <div className="database-list">
          {entries.length === 0 ? <div className="empty-state compact">No Chaos Core entries found for this tab yet.</div> : null}
          {entries.map((entry) => (
            <button
              key={entry.entryKey}
              type="button"
              className={entry.entryKey === selectedEntryKey ? "database-entry active" : "database-entry"}
              onClick={() => setSelectedEntryKey(entry.entryKey)}
            >
              <strong>{entry.title}</strong>
              <span>{entry.contentId}</span>
              <small>{entry.origin === "game" ? "Game" : "Technica"} · {entry.runtimeFile}</small>
            </button>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
