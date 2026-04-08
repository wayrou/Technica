import { useEffect, useMemo } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankNpc, createSampleNpc } from "../../data/sampleNpc";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { mergeFactionOptions } from "../../types/faction";
import type { NpcDocument, NpcRoutePoint } from "../../types/npc";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateNpcDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildNpcBundleForTarget } from "../../utils/exporters";
import { runtimeId } from "../../utils/id";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";

type UnknownRecord = Record<string, unknown>;

function touchNpc(document: NpcDocument): NpcDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isNpcDocument(value: unknown): value is NpcDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      "mapId" in value &&
      "routeMode" in value &&
      "routePoints" in value
  );
}

function createRoutePoint(existingPoints: NpcRoutePoint[], x: number, y: number): NpcRoutePoint {
  return {
    id: runtimeId(`route_point_${existingPoints.length + 1}`, "route_point"),
    x,
    y
  };
}

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNpcDocument(value: unknown): NpcDocument {
  const fallback = createBlankNpc();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const metadata = toRecord(record.metadata);
  const { faction: _legacyFaction, ...metadataWithoutFaction } = metadata ?? {};

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    faction: readString(record.faction, readString(metadata?.faction, fallback.faction)),
    mapId: readString(record.mapId, fallback.mapId),
    tileX: readNumber(record.tileX ?? record.x, fallback.tileX),
    tileY: readNumber(record.tileY ?? record.y, fallback.tileY),
    routeMode:
      record.routeMode === "fixed" || record.routeMode === "random" || record.routeMode === "none"
        ? record.routeMode
        : fallback.routeMode,
    routePoints: Array.isArray(record.routePoints)
      ? record.routePoints.map((entry, index) => {
          const point = toRecord(entry);
          return {
            id: readString(point?.id, runtimeId(`route_point_${index + 1}`, "route_point")),
            x: readNumber(point?.x, 0),
            y: readNumber(point?.y, 0)
          };
        })
      : fallback.routePoints,
    dialogueId: readString(record.dialogueId, fallback.dialogueId),
    portraitKey: readString(record.portraitKey, fallback.portraitKey),
    spriteKey: readString(record.spriteKey, fallback.spriteKey),
    portraitAsset:
      record.portraitAsset && typeof record.portraitAsset === "object"
        ? (record.portraitAsset as NpcDocument["portraitAsset"])
        : fallback.portraitAsset,
    spriteAsset:
      record.spriteAsset && typeof record.spriteAsset === "object"
        ? (record.spriteAsset as NpcDocument["spriteAsset"])
        : fallback.spriteAsset,
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadataWithoutFaction).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

export function NpcEditor() {
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries } = useChaosCoreDatabase();

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void ensureSummaries("faction");
  }, [desktopEnabled, ensureSummaries, repoPath]);

  const factionOptions = useMemo(
    () =>
      mergeFactionOptions(
        summaryStates.faction.entries.map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId,
          origin: entry.origin
        }))
      ),
    [summaryStates.faction.entries]
  );

  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: NpcDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isNpcDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica NPC format.");
        return;
      }
      setDocument(touchNpc(normalizeNpcDocument(parsed)));
    } catch {
      notify("Could not load the selected NPC from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.npc.document"
      exportTargetKey="technica.npc.exportTarget"
      draftType="npc"
      initialDocument={createSampleNpc()}
      createBlank={createBlankNpc}
      createSample={createSampleNpc}
      validate={(document) => validateNpcDocument(normalizeNpcDocument(document))}
      buildBundleForTarget={(document, target) => buildNpcBundleForTarget(normalizeNpcDocument(document), target)}
      getTitle={(document) => normalizeNpcDocument(document).name}
      getMobileSendSummary={(document) => {
        const npc = normalizeNpcDocument(document);
        return `${npc.mapId || "no map"} - ${npc.routeMode} route - ${npc.routePoints.length} route point(s)`;
      }}
      isImportPayload={isNpcDocument}
      touchDocument={(document) => touchNpc(normalizeNpcDocument(document))}
      replacePrompt="Replace the current NPC draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica NPC draft or export."
      renderWorkspace={({
        document,
        setDocument,
        patchDocument,
        loadSample,
        clearDocument,
        importDraft,
        saveDraft,
        exportBundle,
        isMobile,
        canSendToDesktop,
        isSendingToDesktop,
        sendToDesktop
      }) => {
        const npc = normalizeNpcDocument(document);
        const selectedFaction = factionOptions.find((option) => option.id === npc.faction) ?? null;
        const patchNpc = (updater: (current: NpcDocument) => NpcDocument) =>
          patchDocument((current) => updater(normalizeNpcDocument(current)));

        return (
          <>
            <Panel
              title="NPC Setup"
              actions={
                <div className="toolbar">
                  <button type="button" className="ghost-button" onClick={loadSample}>
                    Load sample
                  </button>
                  <button type="button" className="ghost-button" onClick={clearDocument}>
                    Clear
                  </button>
                </div>
              }
            >
              <div className="form-grid">
                <label className="field">
                  <span>NPC id</span>
                  <input
                    value={npc.id}
                    onChange={(event) => patchNpc((current) => ({ ...current, id: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={npc.name}
                    onChange={(event) => patchNpc((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Faction</span>
                  <select
                    value={npc.faction}
                    onChange={(event) => patchNpc((current) => ({ ...current, faction: event.target.value }))}
                  >
                    {!npc.faction.trim() ? <option value="">Select faction...</option> : null}
                    {npc.faction.trim() && !selectedFaction ? (
                      <option value={npc.faction}>Custom ({npc.faction})</option>
                    ) : null}
                    {factionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({option.id})
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    {selectedFaction
                      ? `${selectedFaction.name} (${selectedFaction.id})${selectedFaction.origin === "preset" ? " - Preset" : selectedFaction.origin === "game" ? " - Game" : " - Technica"}`
                      : `${factionOptions.length} faction option(s), including Chaos Core presets.`}
                  </small>
                </label>
                <label className="field">
                  <span>Map id</span>
                  <input
                    value={npc.mapId}
                    onChange={(event) => patchNpc((current) => ({ ...current, mapId: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Dialogue id</span>
                  <input
                    value={npc.dialogueId}
                    onChange={(event) => patchNpc((current) => ({ ...current, dialogueId: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Tile X</span>
                  <input
                    type="number"
                    value={npc.tileX}
                    onChange={(event) => patchNpc((current) => ({ ...current, tileX: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Tile Y</span>
                  <input
                    type="number"
                    value={npc.tileY}
                    onChange={(event) => patchNpc((current) => ({ ...current, tileY: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Route mode</span>
                  <select
                    value={npc.routeMode}
                    onChange={(event) =>
                      patchNpc((current) => ({
                        ...current,
                        routeMode: event.target.value as NpcDocument["routeMode"]
                      }))
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="random">Random</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label className="field">
                  <span>Portrait key</span>
                  <input
                    value={npc.portraitKey}
                    onChange={(event) => patchNpc((current) => ({ ...current, portraitKey: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Sprite key</span>
                  <input
                    value={npc.spriteKey}
                    onChange={(event) => patchNpc((current) => ({ ...current, spriteKey: event.target.value }))}
                  />
                </label>
                <label className="field full">
                  <span>Metadata</span>
                  <textarea
                    rows={4}
                    value={serializeKeyValueLines(npc.metadata)}
                    onChange={(event) =>
                      patchNpc((current) => ({
                        ...current,
                        metadata: parseKeyValueLines(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>

              <div className="subsection">
                <h4>Route Points</h4>
                <div className="dialogue-entry-list">
                  {npc.routePoints.length === 0 ? (
                    <div className="empty-state compact">Add patrol points for fixed-route NPCs.</div>
                  ) : (
                    npc.routePoints.map((point, index) => (
                      <article key={point.id} className="dialogue-entry-card">
                        <div className="dialogue-entry-header">
                          <span className="flow-badge jump">Point {index + 1}</span>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() =>
                              patchNpc((current) => ({
                                ...current,
                                routePoints: current.routePoints.filter((entry) => entry.id !== point.id)
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-grid">
                          <label className="field">
                            <span>Point id</span>
                            <input
                              value={point.id}
                              onChange={(event) =>
                                patchNpc((current) => ({
                                  ...current,
                                  routePoints: current.routePoints.map((entry) =>
                                    entry.id === point.id ? { ...entry, id: event.target.value } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>X</span>
                            <input
                              type="number"
                              value={point.x}
                              onChange={(event) =>
                                patchNpc((current) => ({
                                  ...current,
                                  routePoints: current.routePoints.map((entry) =>
                                    entry.id === point.id ? { ...entry, x: Number(event.target.value || 0) } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Y</span>
                            <input
                              type="number"
                              value={point.y}
                              onChange={(event) =>
                                patchNpc((current) => ({
                                  ...current,
                                  routePoints: current.routePoints.map((entry) =>
                                    entry.id === point.id ? { ...entry, y: Number(event.target.value || 0) } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                <div className="toolbar">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      patchNpc((current) => ({
                        ...current,
                        routePoints: [...current.routePoints, createRoutePoint(current.routePoints, current.tileX, current.tileY)]
                      }))
                    }
                  >
                    Add route point
                  </button>
                </div>
              </div>

              <div className="subsection">
                <h4>Art</h4>
                <ImageAssetField
                  label="Portrait"
                  emptyLabel="Drop NPC portrait art"
                  hint="Used by dialogue UI and profile panels."
                  asset={npc.portraitAsset}
                  onChange={(portraitAsset) => patchNpc((current) => ({ ...current, portraitAsset }))}
                />
                <ImageAssetField
                  label="Sprite"
                  emptyLabel="Drop NPC field sprite"
                  hint="Used by map rendering when available."
                  asset={npc.spriteAsset}
                  onChange={(spriteAsset) => patchNpc((current) => ({ ...current, spriteAsset }))}
                />
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{npc.mapId}</span>
                  {npc.faction ? <span className="pill">{npc.faction}</span> : null}
                  <span className="pill">{npc.routeMode}</span>
                  <span className="pill">{npc.routePoints.length} route point(s)</span>
                  <span className="pill accent">Chaos Core export</span>
                </div>
                <div className="toolbar">
                  {isMobile ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void sendToDesktop()}
                      disabled={!canSendToDesktop || isSendingToDesktop}
                    >
                      {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="ghost-button" onClick={importDraft}>
                        Import draft
                      </button>
                      <button type="button" className="ghost-button" onClick={saveDraft}>
                        Save draft file
                      </button>
                      <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                        Export bundle
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Panel>

            <ChaosCoreDatabasePanel
              contentType="npc"
              currentDocument={npc}
              buildBundle={(current) => buildNpcBundleForTarget(normalizeNpcDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish NPC spawns and patrol behavior into the Chaos Core repo, then reopen them here for quick revisions."
            />
          </>
        );
      }}
    />
  );
}
