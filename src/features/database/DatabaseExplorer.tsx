import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Panel } from "../../components/Panel";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import type { DatabaseContentType } from "../../types/common";
import type { ChaosCoreDatabaseEntry, LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { notify } from "../../utils/dialogs";

const DATABASE_CONTENT_TYPES: DatabaseContentType[] = [
  "dialogue",
  "quest",
  "map",
  "npc",
  "gear",
  "item",
  "card",
  "unit",
  "operation",
  "class",
  "schema"
];

const EDITOR_STORAGE_KEYS: Record<DatabaseContentType, string> = {
  dialogue: "technica.dialogue.document",
  quest: "technica.quest.document",
  map: "technica.map.document",
  npc: "technica.npc.document",
  gear: "technica.gear.document",
  item: "technica.item.document",
  card: "technica.card.document",
  unit: "technica.unit.document",
  operation: "technica.operation.document",
  class: "technica.class.document",
  schema: "technica.schema.document"
};

type DatabaseSummaryEntry = ChaosCoreDatabaseEntry & {
  contentType: DatabaseContentType;
};

type DatabaseLoadedEntry = LoadedChaosCoreDatabaseEntry & {
  contentType: DatabaseContentType;
  runtimeData: unknown;
};

type CrossReference = {
  entryKey: string;
  contentId: string;
  contentType: DatabaseContentType;
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
  onOpenEditor: (contentType: DatabaseContentType) => void;
}

export function DatabaseExplorer({ onOpenEditor }: DatabaseExplorerProps) {
  const {
    databaseEnabled,
    desktopEnabled,
    sessionEnabled,
    repoPath,
    repoPathDraft,
    setRepoPathDraft,
    commitRepoPath,
    detectRepo,
    summaryStates,
    ensureAllSummaries,
    loadEntry
  } = useChaosCoreDatabase();
  const [selectedEntryKey, setSelectedEntryKey] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DatabaseLoadedEntry | null>(null);
  const [filterText, setFilterText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const [isScanningReferences, setIsScanningReferences] = useState(false);
  const [inboundReferences, setInboundReferences] = useState<CrossReference[]>([]);

  const entries = useMemo(
    () =>
      DATABASE_CONTENT_TYPES.flatMap((contentType) =>
        summaryStates[contentType].entries.map((entry) => ({
          ...entry,
          contentType
        }))
      ).sort((left, right) =>
        `${left.contentType}:${left.title}:${left.contentId}`.localeCompare(
          `${right.contentType}:${right.title}:${right.contentId}`
        )
      ),
    [summaryStates]
  );

  const isAnySummaryLoading = DATABASE_CONTENT_TYPES.some(
    (contentType) => summaryStates[contentType].status === "loading"
  );
  const hasAnyStaleType = DATABASE_CONTENT_TYPES.some((contentType) => summaryStates[contentType].stale);

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

  useEffect(() => {
    if (!databaseEnabled) {
      setSelectedEntryKey("");
      setSelectedEntry(null);
      setInboundReferences([]);
      return;
    }

    let cancelled = false;

    async function loadSummaries() {
      if (!sessionEnabled && !repoPath.trim()) {
        if (desktopEnabled) {
          try {
            const discovered = await detectRepo();
            if (!discovered || cancelled) {
              return;
            }
          } catch (error) {
            if (!cancelled) {
              notify(error instanceof Error ? error.message : "Could not detect the Chaos Core repo path.");
            }
            return;
          }
        } else {
          return;
        }
      }

      try {
        await ensureAllSummaries();
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "Could not refresh the Chaos Core database.");
        }
      }
    }

    void loadSummaries();

    return () => {
      cancelled = true;
    };
  }, [databaseEnabled, desktopEnabled, detectRepo, ensureAllSummaries, repoPath, sessionEnabled]);

  useEffect(() => {
    setSelectedEntryKey((current) => {
      if (current && entries.some((entry) => entry.entryKey === current)) {
        return current;
      }
      return entries[0]?.entryKey ?? "";
    });
  }, [entries]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedEntry() {
      if (!selectedEntryKey) {
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
        const loaded = await loadEntry(summary.contentType, summary.entryKey);
        if (!cancelled) {
          setSelectedEntry({
            ...loaded,
            contentType: summary.contentType,
            runtimeData: parseRuntimeData(loaded.runtimeContent)
          });
          setInboundReferences([]);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedEntry(null);
          setInboundReferences([]);
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
  }, [entries, loadEntry, selectedEntryKey]);

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

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await ensureAllSummaries({ force: true });
      setInboundReferences([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not refresh the Chaos Core database.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleScanInboundReferences() {
    if (!selectedEntry) {
      return;
    }

    setIsScanningReferences(true);
    try {
      const knownIds = new Set(entries.map((entry) => entry.contentId));
      const nextInbound: CrossReference[] = [];

      for (const [index, summary] of entries.entries()) {
        if (summary.entryKey === selectedEntry.entryKey) {
          continue;
        }

        const loaded = await loadEntry(summary.contentType, summary.entryKey);
        const refs = new Set<string>();
        collectStringReferences(parseRuntimeData(loaded.runtimeContent), knownIds, refs);
        if (refs.has(selectedEntry.contentId)) {
          nextInbound.push(summarizeReference(summary));
        }

        if (index % 12 === 0) {
          await sleepFrame();
        }
      }

      setInboundReferences(nextInbound);
    } catch (error) {
      setInboundReferences([]);
      notify(error instanceof Error ? error.message : "Could not scan inbound references.");
    } finally {
      setIsScanningReferences(false);
    }
  }

  function handleRepoPathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRepoPath();
    }
  }

  return (
    <div className="workspace-grid blueprint-grid">
      <div className="workspace-column">
        <Panel
          title="Game Database"
          subtitle="Browse every Chaos Core content table in one place, then jump into the matching editor when you want to revise a record."
          actions={
            <div className="toolbar">
              {desktopEnabled ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    void detectRepo().catch((error) =>
                      notify(error instanceof Error ? error.message : "Could not detect the Chaos Core repo path.")
                    )
                  }
                >
                  Detect repo
                </button>
              ) : null}
              <button type="button" className="ghost-button" onClick={() => void handleRefresh()} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          }
        >
          {!databaseEnabled ? (
            <div className="empty-state compact">
              The unified database browser is available in the Technica desktop app or a paired mobile session.
            </div>
          ) : null}

          <div className="form-grid">
            {desktopEnabled ? (
              <label className="field full">
                <span>Chaos Core repo path</span>
                <div className="toolbar repo-path-toolbar">
                  <input
                    value={repoPathDraft}
                    onChange={(event) => setRepoPathDraft(event.target.value)}
                    onBlur={() => commitRepoPath()}
                    onKeyDown={handleRepoPathKeyDown}
                    placeholder="/absolute/path/to/chaos-core"
                  />
                  <button type="button" className="ghost-button" onClick={() => commitRepoPath()}>
                    Apply
                  </button>
                </div>
              </label>
            ) : (
              <div className="field full">
                <span>Database source</span>
                <div className="empty-state compact">
                  Live Chaos Core data is coming through the connected desktop session.
                </div>
              </div>
            )}
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
            {sessionEnabled ? <span className="pill">Desktop session</span> : null}
            {hasAnyStaleType ? <span className="pill warning">Stale cache</span> : null}
            {selectedEntry ? <span className="pill accent">{selectedEntry.contentType}</span> : null}
            {isLoadingSelected || isAnySummaryLoading ? <span className="pill">Loading...</span> : null}
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
                    {entry.contentType} | {entry.origin === "game" ? "Game" : "Technica"}
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
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => void handleScanInboundReferences()} disabled={!selectedEntry || isScanningReferences}>
                {isScanningReferences ? "Scanning..." : "Scan references"}
              </button>
              <button type="button" className="primary-button" onClick={handleOpenInEditor} disabled={!selectedEntry}>
                Open in editor
              </button>
            </div>
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
                          {entry.contentType} | {entry.origin === "game" ? "Game" : "Technica"}
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
                  </div>
                </div>
                <div className="database-reference-list">
                  {inboundReferences.length === 0 ? (
                    <div className="empty-state compact">
                      {isScanningReferences ? "Scanning for inbound references..." : "Run Scan references to find inbound links."}
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
                          {entry.contentType} | {entry.origin === "game" ? "Game" : "Technica"}
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
