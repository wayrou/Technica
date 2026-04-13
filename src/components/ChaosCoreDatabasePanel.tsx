import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useChaosCoreDatabase } from "../hooks/useChaosCoreDatabase";
import type { DatabaseContentType, ExportBundle } from "../types/common";
import {
  emitChaosCoreDatabaseUpdate,
  publishChaosCoreBundle,
  removeChaosCoreDatabaseEntry,
  resolveChaosCoreErrorMessage,
  type LoadedChaosCoreDatabaseEntry
} from "../utils/chaosCoreDatabase";
import { notify } from "../utils/dialogs";
import { ChaosCoreCardGallery } from "./ChaosCoreCardGallery";
import { Panel } from "./Panel";

interface ChaosCoreDatabasePanelProps<TDocument> {
  contentType: DatabaseContentType;
  currentDocument: TDocument;
  buildBundle: (document: TDocument) => Promise<ExportBundle> | ExportBundle;
  onLoadEntry: (entry: LoadedChaosCoreDatabaseEntry) => void;
  subtitle: string;
  preferredPublishTargetEntryKey?: string;
  preferredPublishTargetSourceFile?: string;
}

export function ChaosCoreDatabasePanel<TDocument>({
  contentType,
  currentDocument,
  buildBundle,
  onLoadEntry,
  subtitle,
  preferredPublishTargetEntryKey,
  preferredPublishTargetSourceFile
}: ChaosCoreDatabasePanelProps<TDocument>) {
  const {
    databaseEnabled,
    desktopEnabled,
    repoPath,
    repoPathDraft,
    setRepoPathDraft,
    commitRepoPath,
    detectRepo,
    summaryStates,
    ensureSummaries,
    loadEntry
  } = useChaosCoreDatabase();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEntryKey, setSelectedEntryKey] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [isRemovingEntry, setIsRemovingEntry] = useState(false);
  const [armedRemoveEntryKey, setArmedRemoveEntryKey] = useState("");
  const effectiveRepoPath = repoPath.trim() || repoPathDraft.trim();
  const summaryState = summaryStates[contentType];
  const entries = summaryState.entries;

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.entryKey === selectedEntryKey) ?? null,
    [entries, selectedEntryKey]
  );

  useEffect(() => {
    if (!isOpen || !desktopEnabled) {
      return;
    }

    if (!effectiveRepoPath) {
      setSelectedEntryKey("");
      return;
    }

    void ensureSummaries(contentType).then((nextEntries) => {
      setSelectedEntryKey((current) => {
        if (current && nextEntries.some((entry) => entry.entryKey === current)) {
          return current;
        }
        return nextEntries[0]?.entryKey ?? "";
      });
    });
  }, [contentType, desktopEnabled, effectiveRepoPath, ensureSummaries, isOpen]);

  useEffect(() => {
    setArmedRemoveEntryKey("");
  }, [selectedEntryKey]);

  function commitRepoPathDraft() {
    commitRepoPath();
  }

  function handleRepoPathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRepoPathDraft();
    }
  }

  async function handleDiscoverRepo() {
    if (!desktopEnabled) {
      notify("Chaos Core database publishing is only available in the Technica desktop app.");
      return;
    }

    try {
      const discovered = await detectRepo();
      if (!discovered) {
        notify("Could not automatically find a Chaos Core repo. Paste the repo path below.");
      }
    } catch (error) {
      notify(resolveChaosCoreErrorMessage(error, "Could not detect the Chaos Core repo path."));
    }
  }

  async function refreshEntries(force = false) {
    if (!desktopEnabled) {
      setSelectedEntryKey("");
      return [];
    }

    if (!effectiveRepoPath) {
      setSelectedEntryKey("");
      return [];
    }

    const nextEntries = await ensureSummaries(contentType, { force });
    setSelectedEntryKey((current) => {
      if (current && nextEntries.some((entry) => entry.entryKey === current)) {
        return current;
      }
      return nextEntries[0]?.entryKey ?? "";
    });
    return nextEntries;
  }

  async function handleRemove() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to remove records from the Chaos Core repo.");
      return;
    }

    if (!effectiveRepoPath || !selectedEntry) {
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
      await removeChaosCoreDatabaseEntry(effectiveRepoPath, contentType, selectedEntry.entryKey);
      await refreshEntries(true);
      emitChaosCoreDatabaseUpdate(contentType);
      notify(
        selectedEntry.origin === "game"
          ? `Disabled built-in '${selectedEntry.contentId}'.`
          : `Deleted Technica-published '${selectedEntry.contentId}'.`
      );
    } catch (error) {
      notify(resolveChaosCoreErrorMessage(error, "Could not remove the selected Chaos Core entry."));
    } finally {
      setIsRemovingEntry(false);
    }
  }

  async function handleLoad() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to load directly from the Chaos Core repo.");
      return;
    }

    if (!effectiveRepoPath || !selectedEntry) {
      return;
    }

    await handleLoadEntry(selectedEntry.entryKey);
  }

  async function handleLoadEntry(entryKey: string) {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to load directly from the Chaos Core repo.");
      return;
    }

    if (!effectiveRepoPath || !entryKey) {
      return;
    }

    setIsLoadingEntry(true);
    try {
      setSelectedEntryKey(entryKey);
      onLoadEntry(await loadEntry(contentType, entryKey));
    } catch (error) {
      notify(resolveChaosCoreErrorMessage(error, "Could not load the selected Chaos Core entry."));
    } finally {
      setIsLoadingEntry(false);
    }
  }

  async function handlePublish() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to publish directly into the Chaos Core repo.");
      return;
    }

    if (!effectiveRepoPath) {
      notify("Set the Chaos Core repo path first.");
      return;
    }

    setIsPublishing(true);
    try {
      const bundle = await buildBundle(currentDocument);
      const matchingEntry = entries.find((entry) => entry.contentId === bundle.manifest.contentId) ?? null;
      const canWriteBackSelectedEntry = selectedEntry?.origin === "technica" || contentType !== "dialogue";
      const shouldUpdateSelectedEntry =
        !preferredPublishTargetEntryKey &&
        !matchingEntry &&
        canWriteBackSelectedEntry &&
        selectedEntry?.contentId === bundle.manifest.contentId;
      const result = await publishChaosCoreBundle(
        effectiveRepoPath,
        contentType,
        bundle,
        preferredPublishTargetEntryKey ?? matchingEntry?.entryKey ?? (shouldUpdateSelectedEntry ? selectedEntry?.entryKey : undefined),
        preferredPublishTargetEntryKey
          ? preferredPublishTargetSourceFile
          : matchingEntry
            ? matchingEntry.sourceFile
          : shouldUpdateSelectedEntry
            ? selectedEntry?.sourceFile
            : undefined
      );
      const nextEntries = await refreshEntries(true);
      emitChaosCoreDatabaseUpdate(contentType);
      setSelectedEntryKey(
        nextEntries.find((entry) => entry.entryKey === result.entryKey)?.entryKey ?? result.entryKey
      );
      notify(
        result.entryKey.startsWith("game:")
          ? `Updated built-in '${result.contentId}' in the Chaos Core source tables.`
          : `Published '${result.contentId}' into the Chaos Core repo.`
      );
    } catch (error) {
      notify(resolveChaosCoreErrorMessage(error, "Could not publish into the Chaos Core repo."));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <Panel
      title="Chaos Core Database"
      subtitle={subtitle}
      actions={
        <div className="toolbar">
          {desktopEnabled ? (
            <button type="button" className="ghost-button" onClick={() => void handleDiscoverRepo()}>
              Detect repo
            </button>
          ) : null}
          {isOpen ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => void refreshEntries(true)}
              disabled={!desktopEnabled || !effectiveRepoPath || summaryState.status === "loading"}
            >
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            className={isOpen ? "secondary-button" : "ghost-button"}
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? "Hide game database" : "Open game database"}
          </button>
        </div>
      }
    >
      {!databaseEnabled ? (
        <div className="empty-state compact">
          Repo-backed Chaos Core publishing is available in the Technica desktop app. Use{" "}
          <code>npm run dev:desktop</code>
          {" "}to edit the live game database and publish directly into the Chaos Core repo.
        </div>
      ) : null}

      {desktopEnabled ? (
        <div className="form-grid">
          <label className="field full">
            <span>Chaos Core repo path</span>
            <div className="toolbar repo-path-toolbar">
              <input
                value={repoPathDraft}
                onChange={(event) => setRepoPathDraft(event.target.value)}
                onBlur={commitRepoPathDraft}
                onKeyDown={handleRepoPathKeyDown}
                placeholder="/absolute/path/to/chaos-core"
              />
              <button type="button" className="ghost-button" onClick={commitRepoPathDraft}>
                Apply
              </button>
            </div>
          </label>
        </div>
      ) : null}

      <div className="toolbar split">
        <div className="chip-row">
          <span className="pill">{entries.length} cached entr{entries.length === 1 ? "y" : "ies"}</span>
          <span className="pill">{contentType}</span>
          {summaryState.stale ? <span className="pill warning">Stale</span> : null}
          {summaryState.status === "loading" ? <span className="pill">Loading...</span> : null}
          {selectedEntry ? (
            <span className="pill">{selectedEntry.origin === "game" ? "Game" : "Technica"}</span>
          ) : null}
        </div>
        {summaryState.error ? <span className="muted">{summaryState.error}</span> : null}
      </div>

      {!isOpen ? (
        <div className="empty-state compact">
          The per-tab game database stays closed until you open it, so editor tabs remain snappy.
        </div>
      ) : null}

      {isOpen ? (
        <>
          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill accent">Lazy-loaded</span>
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

          {contentType === "card" ? (
            <ChaosCoreCardGallery
              repoPath={effectiveRepoPath}
              entries={entries}
              selectedEntryKey={selectedEntryKey}
              onSelectEntryKey={setSelectedEntryKey}
              onActivateEntryKey={(entryKey) => void handleLoadEntry(entryKey)}
            />
          ) : (
            <div className="database-list">
              {entries.length === 0 ? (
                <div className="empty-state compact">No Chaos Core entries found for this tab yet.</div>
              ) : null}
              {entries.map((entry) => (
                <button
                  key={entry.entryKey}
                  type="button"
                  className={entry.entryKey === selectedEntryKey ? "database-entry active" : "database-entry"}
                  onClick={() => setSelectedEntryKey(entry.entryKey)}
                  onDoubleClick={() => void handleLoadEntry(entry.entryKey)}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.contentId}</span>
                  <small>
                    {entry.origin === "game" ? "Game" : "Technica"} | {entry.runtimeFile}
                  </small>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Panel>
  );
}
