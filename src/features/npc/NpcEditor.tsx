import { useEffect, useMemo, type CSSProperties } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankNpc, createSampleNpc } from "../../data/sampleNpc";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { mergeFactionOptions } from "../../types/faction";
import type { NpcDocument, NpcPresentationDocument, NpcRoutePoint } from "../../types/npc";
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

function getNpcPresentationLabel(presentation: NpcPresentationDocument) {
  return presentation.mode === "model_3d" ? "3D model" : "Billboard sprite";
}

function normalizeNpcDocument(value: unknown): NpcDocument {
  const fallback = createBlankNpc();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const metadata = toRecord(record.metadata);
  const presentation = toRecord(record.presentation);
  const presentationMetadata = toRecord(presentation?.metadata);
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
    presentation: {
      mode:
        presentation?.mode === "model_3d" || presentation?.mode === "billboard_sprite"
          ? presentation.mode
          : fallback.presentation?.mode ?? "billboard_sprite",
      modelKey: readString(presentation?.modelKey, fallback.presentation?.modelKey ?? ""),
      modelAssetPath: readString(presentation?.modelAssetPath, fallback.presentation?.modelAssetPath ?? ""),
      materialKey: readString(presentation?.materialKey, fallback.presentation?.materialKey ?? ""),
      scale: readNumber(presentation?.scale, fallback.presentation?.scale ?? 1),
      heightOffset: readNumber(presentation?.heightOffset, fallback.presentation?.heightOffset ?? 0),
      facingMode:
        presentation?.facingMode === "movement" || presentation?.facingMode === "fixed" || presentation?.facingMode === "camera"
          ? presentation.facingMode
          : fallback.presentation?.facingMode ?? "camera",
      previewPose: readString(presentation?.previewPose, fallback.presentation?.previewPose ?? "idle"),
      metadata: presentationMetadata
        ? Object.fromEntries(Object.entries(presentationMetadata).map(([key, entry]) => [key, String(entry)]))
        : fallback.presentation?.metadata ?? {}
    },
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
        const defaultPresentation = createBlankNpc().presentation!;
        const selectedFaction = factionOptions.find((option) => option.id === npc.faction) ?? null;
        const patchNpc = (updater: (current: NpcDocument) => NpcDocument) =>
          patchDocument((current) => updater(normalizeNpcDocument(current)));
        const patchPresentation = (updater: (current: NpcPresentationDocument) => NpcPresentationDocument) =>
          patchNpc((current) => ({
            ...current,
            presentation: updater(current.presentation ?? defaultPresentation)
          }));
        const presentation = npc.presentation ?? defaultPresentation;
        const spriteMetadataPath = npc.metadata.spritePath?.trim() ?? "";
        const hasSpriteSource = Boolean(npc.spriteAsset?.dataUrl || npc.spriteKey.trim() || spriteMetadataPath);
        const hasModelSource = Boolean(presentation.modelKey.trim() || presentation.modelAssetPath.trim());
        const presentationReady = presentation.mode === "model_3d" ? hasModelSource : hasSpriteSource;
        const previewScale = Math.max(0.35, Math.min(2.25, Number.isFinite(presentation.scale) ? presentation.scale : 1));
        const previewWidth = Math.max(34, Math.min(132, 52 * previewScale));
        const previewHeight = Math.max(34, Math.min(132, 72 * previewScale));
        const previewLift = Math.max(-28, Math.min(64, presentation.heightOffset * 28));
        const previewVisualStyle: CSSProperties = {
          width: `${previewWidth}px`,
          height: `${previewHeight}px`,
          transform: `translate(-50%, calc(-50% - ${previewLift}px))`
        };

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

              <div className="subsection">
                <h4>3D Presentation</h4>
                <div className="field-enemy-preview-card">
                  <div className="field-enemy-preview-stage" data-mode={presentation.mode}>
                    <span className="field-enemy-preview-grid" />
                    <span className="field-enemy-preview-shadow" />
                    <div
                      className={presentation.mode === "model_3d" ? "field-enemy-preview-visual model" : "field-enemy-preview-visual billboard"}
                      style={previewVisualStyle}
                    >
                      {presentation.mode === "model_3d" ? (
                        <>
                          <span className="field-enemy-preview-model-core" />
                          <span className="field-enemy-preview-model-label">
                            {(presentation.modelKey || presentation.modelAssetPath || npc.name || "NPC").slice(0, 18)}
                          </span>
                        </>
                      ) : npc.spriteAsset?.dataUrl ? (
                        <img src={npc.spriteAsset.dataUrl} alt={`${npc.name || "NPC"} sprite preview`} />
                      ) : (
                        <span className="field-enemy-preview-sprite-fallback">
                          {(npc.spriteKey || npc.name || "npc").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {presentation.heightOffset !== 0 ? (
                      <span className="field-enemy-preview-lift" style={{ height: `${Math.abs(previewLift)}px` }} />
                    ) : null}
                  </div>
                  <div className="field-enemy-preview-copy">
                    <div className="field-enemy-preview-header">
                      <div>
                        <span className="eyebrow">Chaos Core Presentation</span>
                        <strong>{getNpcPresentationLabel(presentation)}</strong>
                      </div>
                      <span className={presentationReady ? "pill accent" : "pill warning"}>
                        {presentationReady ? "Ready" : "Needs source"}
                      </span>
                    </div>
                    <div className="field-enemy-preview-metrics">
                      <span>Scale {previewScale.toFixed(2)}x</span>
                      <span>Height offset {presentation.heightOffset}</span>
                      <span>{presentation.facingMode} facing</span>
                      <span>{presentation.previewPose || "idle"} pose</span>
                    </div>
                    <div className="field-enemy-preview-summary">
                      <strong>Map placement</strong>
                      <span>
                        {npc.mapId || "No map selected"} // tile {npc.tileX}, {npc.tileY} // {npc.routeMode} route
                      </span>
                    </div>
                    <div className="field-enemy-preview-summary">
                      <strong>Conversation hook</strong>
                      <span>{npc.dialogueId.trim() || "No dialogue id assigned yet."}</span>
                    </div>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          patchPresentation((current) => ({
                            ...current,
                            mode: "billboard_sprite",
                            facingMode: "camera",
                            scale: current.scale || 1,
                            previewPose: current.previewPose || "idle"
                          }))
                        }
                      >
                        Billboard preset
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          patchPresentation((current) => ({
                            ...current,
                            mode: "model_3d",
                            facingMode: "movement",
                            scale: current.scale || 1,
                            previewPose: current.previewPose || "idle"
                          }))
                        }
                      >
                        3D model preset
                      </button>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Presentation mode</span>
                    <select
                      value={presentation.mode}
                      onChange={(event) =>
                        patchPresentation((current) => ({
                          ...current,
                          mode: event.target.value === "model_3d" ? "model_3d" : "billboard_sprite"
                        }))
                      }
                    >
                      <option value="billboard_sprite">Billboard sprite</option>
                      <option value="model_3d">3D model</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Model key</span>
                    <input
                      value={presentation.modelKey}
                      onChange={(event) => patchPresentation((current) => ({ ...current, modelKey: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Model asset path</span>
                    <input
                      value={presentation.modelAssetPath}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, modelAssetPath: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Material key</span>
                    <input
                      value={presentation.materialKey}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, materialKey: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Scale</span>
                    <input
                      type="number"
                      step="0.05"
                      value={presentation.scale}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, scale: Number(event.target.value || 1) }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Height offset</span>
                    <input
                      type="number"
                      step="0.05"
                      value={presentation.heightOffset}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, heightOffset: Number(event.target.value || 0) }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Facing mode</span>
                    <select
                      value={presentation.facingMode}
                      onChange={(event) =>
                        patchPresentation((current) => ({
                          ...current,
                          facingMode:
                            event.target.value === "movement" || event.target.value === "fixed" ? event.target.value : "camera"
                        }))
                      }
                    >
                      <option value="camera">Face camera</option>
                      <option value="movement">Face movement</option>
                      <option value="fixed">Fixed</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Preview pose</span>
                    <input
                      value={presentation.previewPose}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, previewPose: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Presentation metadata</span>
                    <textarea
                      rows={3}
                      value={serializeKeyValueLines(presentation.metadata)}
                      onChange={(event) =>
                        patchPresentation((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{npc.mapId}</span>
                  {npc.faction ? <span className="pill">{npc.faction}</span> : null}
                  <span className="pill">{npc.routeMode}</span>
                  <span className="pill">{npc.routePoints.length} route point(s)</span>
                  <span className="pill">{getNpcPresentationLabel(presentation)}</span>
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
