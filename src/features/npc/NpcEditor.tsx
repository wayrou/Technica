import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankNpc, createSampleNpc } from "../../data/sampleNpc";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import type { NpcDocument, NpcRoutePoint } from "../../types/npc";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateNpcDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildNpcBundleForTarget } from "../../utils/exporters";
import { runtimeId } from "../../utils/id";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";

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

export function NpcEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: NpcDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isNpcDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica NPC format.");
        return;
      }
      setDocument(touchNpc(parsed));
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
      validate={validateNpcDocument}
      buildBundleForTarget={buildNpcBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isNpcDocument}
      touchDocument={touchNpc}
      replacePrompt="Replace the current NPC draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica NPC draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
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
                  value={document.id}
                  onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={document.name}
                  onChange={(event) => patchDocument((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Map id</span>
                <input
                  value={document.mapId}
                  onChange={(event) => patchDocument((current) => ({ ...current, mapId: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Dialogue id</span>
                <input
                  value={document.dialogueId}
                  onChange={(event) => patchDocument((current) => ({ ...current, dialogueId: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Tile X</span>
                <input
                  type="number"
                  value={document.tileX}
                  onChange={(event) => patchDocument((current) => ({ ...current, tileX: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field">
                <span>Tile Y</span>
                <input
                  type="number"
                  value={document.tileY}
                  onChange={(event) => patchDocument((current) => ({ ...current, tileY: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field">
                <span>Route mode</span>
                <select
                  value={document.routeMode}
                  onChange={(event) =>
                    patchDocument((current) => ({
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
                  value={document.portraitKey}
                  onChange={(event) => patchDocument((current) => ({ ...current, portraitKey: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Sprite key</span>
                <input
                  value={document.spriteKey}
                  onChange={(event) => patchDocument((current) => ({ ...current, spriteKey: event.target.value }))}
                />
              </label>
              <label className="field full">
                <span>Metadata</span>
                <textarea
                  rows={4}
                  value={serializeKeyValueLines(document.metadata)}
                  onChange={(event) =>
                    patchDocument((current) => ({
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
                {document.routePoints.length === 0 ? (
                  <div className="empty-state compact">Add patrol points for fixed-route NPCs.</div>
                ) : (
                  document.routePoints.map((point, index) => (
                    <article key={point.id} className="dialogue-entry-card">
                      <div className="dialogue-entry-header">
                        <span className="flow-badge jump">Point {index + 1}</span>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() =>
                            patchDocument((current) => ({
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
                              patchDocument((current) => ({
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
                              patchDocument((current) => ({
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
                              patchDocument((current) => ({
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
                    patchDocument((current) => ({
                      ...current,
                      routePoints: [
                        ...current.routePoints,
                        createRoutePoint(current.routePoints, current.tileX, current.tileY)
                      ]
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
                asset={document.portraitAsset}
                onChange={(portraitAsset) => patchDocument((current) => ({ ...current, portraitAsset }))}
              />
              <ImageAssetField
                label="Sprite"
                emptyLabel="Drop NPC field sprite"
                hint="Used by map rendering when available."
                asset={document.spriteAsset}
                onChange={(spriteAsset) => patchDocument((current) => ({ ...current, spriteAsset }))}
              />
            </div>

            <div className="toolbar split">
              <div className="chip-row">
                <span className="pill">{document.mapId}</span>
                <span className="pill">{document.routeMode}</span>
                <span className="pill">{document.routePoints.length} route point(s)</span>
              </div>
              <div className="toolbar">
                <label className="inline-select">
                  <span>Export target</span>
                  <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}>
                    <option value="generic">Generic</option>
                    <option value="chaos-core">Chaos Core</option>
                  </select>
                </label>
                <button type="button" className="ghost-button" onClick={importDraft}>
                  Import draft
                </button>
                <button type="button" className="ghost-button" onClick={saveDraft}>
                  Save draft file
                </button>
                <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                  Export bundle
                </button>
              </div>
            </div>
          </Panel>

          <ChaosCoreDatabasePanel
            contentType="npc"
            currentDocument={document}
            buildBundle={(current) => buildNpcBundleForTarget(current, "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish NPC spawns and patrol behavior into the Chaos Core repo, then reopen them here for quick revisions."
          />
        </>
      )}
    />
  );
}
