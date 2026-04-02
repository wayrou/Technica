import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../components/Panel";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { EditorKind } from "../../types/common";
import {
  discoverChaosCoreRepo,
  isTauriRuntime,
  listChaosCoreDatabase,
  loadChaosCoreDatabaseEntry,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
import { notify } from "../../utils/dialogs";

const DATABASE_CONTENT_TYPES: EditorKind[] = [
  "dialogue",
  "quest",
  "map",
  "npc",
  "gear",
  "item",
  "card",
  "unit",
  "operation",
  "class"
];

const EDITOR_STORAGE_KEYS: Record<EditorKind, string> = {
  dialogue: "technica.dialogue.document",
  quest: "technica.quest.document",
  map: "technica.map.document",
  npc: "technica.npc.document",
  gear: "technica.gear.document",
  item: "technica.item.document",
  card: "technica.card.document",
  unit: "technica.unit.document",
  operation: "technica.operation.document",
  class: "technica.class.document"
};

type DatabaseSummaryEntry = ChaosCoreDatabaseEntry & {
  contentType: EditorKind;
};

type DatabaseLoadedEntry = LoadedChaosCoreDatabaseEntry & {
  contentType: EditorKind;
  runtimeData: unknown;
};

type CrossReference = {
  entryKey: string;
  contentId: string;
  contentType: EditorKind;
  title: string;
  origin: "game" | "technica";
};

function parseRuntimeData(rawContent: string) {
  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    return rawContent;
  }
}

function collectStringReferences(value: unknown, knownIds: Set<string>, refs: Set<string>) {
  if (typeof value === "string") {
    if (knownIds.has(value)) {
      refs.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringReferences(item, knownIds, refs));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStringReferences(item, knownIds, refs));
  }
}

function summarizeReference(entry: DatabaseSummaryEntry): CrossReference {
  return {
    entryKey: entry.entryKey,
    contentId: entry.contentId,
    contentType: entry.contentType,
    title: entry.title,
    origin: entry.origin
  };
}

function sleepFrame() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

interface DatabaseExplorerProps {
  onOpenEditor: (contentType: EditorKind) => void;
}

export function DatabaseExplorer({ onOpenEditor }: DatabaseExplorerProps) {
  const desktopEnabled = isTauriRuntime();
  const loadedEntryCache = useRef(new Map<string, DatabaseLoadedEntry>());
  const [repoPath, setRepoPath] = usePersistentState("technica.chaosCoreRepoPath", "");
  const [entries, setEntries] = useState<DatabaseSummaryEntry[]>([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DatabaseLoadedEntry | null>(null);
  const [filterText, setFilterText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const [isScanningReferences, setIsScanningReferences] = useState(false);
  const [inboundReferences, setInboundReferences] = useState<CrossReference[]>([]);

  const visibleEntries = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return entries;
    }

    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.contentId.toLowerCase().includes(query) ||
        entry.contentType.toLowerCase().includes(query) ||
        entry.origin.toLowerCase().includes(query)
    );
  }, [entries, filterText]);

  const outboundReferences = useMemo(() => {
    if (!selectedEntry) {
      return [];
    }

    const knownIds = new Set(entries.map((entry) => entry.contentId));
    const entryById = new Map(entries.map((entry) => [entry.contentId, entry]));
    const refs = new Set<string>();

    collectStringReferences(selectedEntry.runtimeData, knownIds, refs);
    refs.delete(selectedEntry.contentId);

    return Array.from(refs)
      .map((contentId) => entryById.get(contentId))
      .filter((entry): entry is DatabaseSummaryEntry => Boolean(entry))
      .map(summarizeReference);
  }, [entries, selectedEntry]);

  async function getLoadedEntry(summary: DatabaseSummaryEntry) {
    const cached = loadedEntryCache.current.get(summary.entryKey);
    if (cached) {
      return cached;
    }

    const loaded = await loadChaosCoreDatabaseEntry(repoPath.trim(), summary.contentType, summary.entryKey);
    const nextLoaded = {
      ...loaded,
      contentType: summary.contentType,
      runtimeData: parseRuntimeData(loaded.runtimeContent)
    } satisfies DatabaseLoadedEntry;

    loadedEntryCache.current.set(summary.entryKey, nextLoaded);
    return nextLoaded;
  }

  async function handleDiscoverRepo() {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to browse the live Chaos Core database.");
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

  async function refreshDatabase(nextRepoPath = repoPath) {
    if (!desktopEnabled || !nextRepoPath.trim()) {
      loadedEntryCache.current.clear();
      setEntries([]);
      setSelectedEntryKey("");
      setSelectedEntry(null);
      setInboundReferences([]);
      return;
    }

    setIsRefreshing(true);
    try {
      const summariesByType = await Promise.all(
        DATABASE_CONTENT_TYPES.map(async (contentType) => ({
          contentType,
          summaries: await listChaosCoreDatabase(nextRepoPath.trim(), contentType)
        }))
      );

      const nextEntries = summariesByType
        .flatMap(({ contentType, summaries }) =>
          summaries.map((summary) => ({
            ...summary,
            contentType
          }))
        )
        .sort((left, right) =>
          `${left.contentType}:${left.title}:${left.contentId}`.localeCompare(
            `${right.contentType}:${right.title}:${right.contentId}`
          )
        );

      loadedEntryCache.current.clear();
      setEntries(nextEntries);
      setSelectedEntry(null);
      setInboundReferences([]);
      setSelectedEntryKey((current) => {
        if (current && nextEntries.some((entry) => entry.entryKey === current)) {
          return current;
        }
        return nextEntries[0]?.entryKey ?? "";
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not refresh the Chaos Core database.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleOpenInEditor() {
    if (!selectedEntry || typeof window === "undefined") {
      return;
    }

    const payload = selectedEntry.editorContent ?? selectedEntry.runtimeContent;
    if (!payload) {
      notify("This database entry does not include editor-ready content.");
      return;
    }

    window.localStorage.setItem(EDITOR_STORAGE_KEYS[selectedEntry.contentType], payload);
    onOpenEditor(selectedEntry.contentType);
    notify(`Loaded '${selectedEntry.title}' into ${selectedEntry.contentType} editor.`);
  }

  useEffect(() => {
    if (!desktopEnabled) {
      loadedEntryCache.current.clear();
      setEntries([]);
      setSelectedEntryKey("");
      setSelectedEntry(null);
      setInboundReferences([]);
      return;
    }

    if (!repoPath.trim()) {
      void handleDiscoverRepo();
      return;
    }

    void refreshDatabase(repoPath);
  }, [desktopEnabled, repoPath]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedEntry() {
      if (!desktopEnabled || !repoPath.trim() || !selectedEntryKey) {
        setSelectedEntry(null);
        setInboundReferences([]);
        return;
      }

      const summary = entries.find((entry) => entry.entryKey === selectedEntryKey);
      if (!summary) {
        setSelectedEntry(null);
        setInboundReferences([]);
        return;
      }

      setIsLoadingSelected(true);
      try {
        const loaded = await getLoadedEntry(summary);
        if (!cancelled) {
          setSelectedEntry(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedEntry(null);
          notify(error instanceof Error ? error.message : "Could not load the selected database record.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelected(false);
        }
      }
    }

    void loadSelectedEntry();

    return () => {
      cancelled = true;
    };
  }, [desktopEnabled, entries, repoPath, selectedEntryKey]);

  useEffect(() => {
    let cancelled = false;

    async function scanInboundReferences() {
      if (!selectedEntry || !repoPath.trim() || !desktopEnabled) {
        setInboundReferences([]);
        return;
      }

      setIsScanningReferences(true);
      try {
        const knownIds = new Set(entries.map((entry) => entry.contentId));
        const nextInbound: CrossReference[] = [];

        for (const [index, summary] of entries.entries()) {
          if (cancelled) {
            return;
          }

          if (summary.entryKey === selectedEntry.entryKey) {
            continue;
          }

          const loaded = await getLoadedEntry(summary);
          const refs = new Set<string>();
          collectStringReferences(loaded.runtimeData, knownIds, refs);
          if (refs.has(selectedEntry.contentId)) {
            nextInbound.push(summarizeReference(summary));
          }

          if (index % 12 === 0) {
            await sleepFrame();
          }
        }

        if (!cancelled) {
          setInboundReferences(nextInbound);
        }
      } catch {
        if (!cancelled) {
          setInboundReferences([]);
        }
      } finally {
        if (!cancelled) {
          setIsScanningReferences(false);
        }
      }
    }

    void scanInboundReferences();

    return () => {
      cancelled = true;
    };
  }, [desktopEnabled, entries, repoPath, selectedEntry]);

  return (
    <div className="workspace-grid blueprint-grid">
      <div className="workspace-column">
        <Panel
          title="Game Database"
          subtitle="Browse every Chaos Core content table in one place, then jump into the matching editor when you want to revise a record."
          actions={
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => void handleDiscoverRepo()}>
                Detect repo
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void refreshDatabase()}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          }
        >
          {!desktopEnabled ? (
            <div className="empty-state compact">
              The unified database browser is available in the Technica desktop app.
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field full">
              <span>Chaos Core repo path</span>
              <input
                value={repoPath}
                onChange={(event) => setRepoPath(event.target.value)}
                placeholder="/absolute/path/to/chaos-core"
              />
            </label>
            <label className="field full">
              <span>Search</span>
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="Filter by name, id, type, or origin"
              />
            </label>
          </div>

          <div className="chip-row">
            <span className="pill">{visibleEntries.length} visible</span>
            <span className="pill">{entries.length} total</span>
            {selectedEntry ? <span className="pill accent">{selectedEntry.contentType}</span> : null}
            {isLoadingSelected ? <span className="pill">Loading record...</span> : null}
          </div>

          <div className="database-browser-list">
            {visibleEntries.length === 0 ? (
              <div className="empty-state compact">No matching Chaos Core entries found.</div>
            ) : (
              visibleEntries.map((entry) => (
                <button
                  key={`${entry.contentType}:${entry.entryKey}`}
                  type="button"
                  className={entry.entryKey === selectedEntryKey ? "database-entry active" : "database-entry"}
                  onClick={() => setSelectedEntryKey(entry.entryKey)}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.contentId}</span>
                  <small>
                    {entry.contentType} · {entry.origin === "game" ? "Game" : "Technica"}
                  </small>
                </button>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="workspace-column">
        <Panel
          title="Selected Record"
          subtitle="Inspect where this record lives and open it in the matching editor for a live balancing pass."
          actions={
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenInEditor}
              disabled={!selectedEntry}
            >
              Open in editor
            </button>
          }
        >
          {selectedEntry ? (
            <div className="database-entry-detail">
              <div className="chip-row">
                <span className="pill accent">{selectedEntry.contentType}</span>
                <span className="pill">{selectedEntry.origin === "game" ? "Game" : "Technica"}</span>
                <span className="pill">{selectedEntry.contentId}</span>
              </div>

              <article className="item-card">
                <div className="item-card-header">
                  <h3>{selectedEntry.title}</h3>
                </div>
                <div className="stack-list">
                  <div>
                    <div className="muted">Runtime file</div>
                    <strong>{selectedEntry.runtimeFile}</strong>
                  </div>
                  {selectedEntry.sourceFile ? (
                    <div>
                      <div className="muted">Source file</div>
                      <strong>{selectedEntry.sourceFile}</strong>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="item-card">
                <div className="item-card-header">
                  <h3>Outbound references</h3>
                  <span className="pill">{outboundReferences.length}</span>
                </div>
                <div className="database-reference-list">
                  {outboundReferences.length === 0 ? (
                    <div className="empty-state compact">No direct content references found.</div>
                  ) : (
                    outboundReferences.map((entry) => (
                      <button
                        key={`outbound:${entry.entryKey}`}
                        type="button"
                        className="database-entry"
                        onClick={() => setSelectedEntryKey(entry.entryKey)}
                      >
                        <strong>{entry.title}</strong>
                        <span>{entry.contentId}</span>
                        <small>
                          {entry.contentType} · {entry.origin === "game" ? "Game" : "Technica"}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </article>

              <article className="item-card">
                <div className="item-card-header">
                  <h3>Used by</h3>
                  <div className="chip-row">
                    <span className="pill">{inboundReferences.length}</span>
                    {isScanningReferences ? <span className="pill">Scanning...</span> : null}
                  </div>
                </div>
                <div className="database-reference-list">
                  {inboundReferences.length === 0 ? (
                    <div className="empty-state compact">
                      {isScanningReferences ? "Scanning for inbound references..." : "No inbound references found."}
                    </div>
                  ) : (
                    inboundReferences.map((entry) => (
                      <button
                        key={`inbound:${entry.entryKey}`}
                        type="button"
                        className="database-entry"
                        onClick={() => setSelectedEntryKey(entry.entryKey)}
                      >
                        <strong>{entry.title}</strong>
                        <span>{entry.contentId}</span>
                        <small>
                          {entry.contentType} · {entry.origin === "game" ? "Game" : "Technica"}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </article>
            </div>
          ) : (
            <div className="empty-state compact">Select a record from the game database to inspect references.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
