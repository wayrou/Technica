import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankFieldEnemy, createSampleFieldEnemy } from "../../data/sampleFieldEnemy";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import type { FieldEnemyDocument, FieldEnemyItemDropDocument } from "../../types/fieldEnemy";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateFieldEnemyDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildFieldEnemyBundleForTarget } from "../../utils/exporters";
import { parseKeyValueLines, parseMultilineList, serializeKeyValueLines, serializeMultilineList } from "../../utils/records";

function touchFieldEnemy(document: FieldEnemyDocument): FieldEnemyDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isFieldEnemyDocument(value: unknown): value is FieldEnemyDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      "stats" in value &&
      "spawn" in value &&
      "drops" in value
  );
}

function parseFloorOrdinals(input: string) {
  return input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
}

function serializeFloorOrdinals(values: number[]) {
  return values.join(", ");
}

function createDropItem(): FieldEnemyItemDropDocument {
  return {
    id: "",
    quantity: 1,
    chance: 1
  };
}

export function FieldEnemyEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: FieldEnemyDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isFieldEnemyDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica field enemy format.");
        return;
      }
      setDocument(touchFieldEnemy(parsed));
    } catch {
      notify("Could not load the selected field enemy from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.fieldEnemy.document"
      exportTargetKey="technica.fieldEnemy.exportTarget"
      draftType="field_enemy"
      initialDocument={createSampleFieldEnemy()}
      createBlank={createBlankFieldEnemy}
      createSample={createSampleFieldEnemy}
      validate={validateFieldEnemyDocument}
      buildBundleForTarget={buildFieldEnemyBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isFieldEnemyDocument}
      touchDocument={touchFieldEnemy}
      replacePrompt="Replace the current field enemy draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica field enemy draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => (
        <>
          <Panel
            title="Field Enemy Setup"
            subtitle="Author lightweight field enemies with random map spawns, sprite art, drop tables, and floor-based spawn rules."
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
                <span>Enemy id</span>
                <input value={document.id} onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={document.name} onChange={(event) => patchDocument((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Kind</span>
                <input value={document.kind} onChange={(event) => patchDocument((current) => ({ ...current, kind: event.target.value }))} />
              </label>
              <label className="field">
                <span>Sprite key</span>
                <input
                  value={document.spriteKey}
                  onChange={(event) => patchDocument((current) => ({ ...current, spriteKey: event.target.value }))}
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={document.description}
                  onChange={(event) => patchDocument((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>

            <div className="subsection">
              <h4>Field Stats</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Max HP</span>
                  <input
                    type="number"
                    value={document.stats.maxHp}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          maxHp: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Speed</span>
                  <input
                    type="number"
                    value={document.stats.speed}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          speed: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Aggro range</span>
                  <input
                    type="number"
                    value={document.stats.aggroRange}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          aggroRange: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Width</span>
                  <input
                    type="number"
                    value={document.stats.width}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          width: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Height</span>
                  <input
                    type="number"
                    value={document.stats.height}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          height: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Spawn Rules</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Spawns per map</span>
                  <input
                    type="number"
                    value={document.spawn.spawnCount}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          spawnCount: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Floor numbers</span>
                  <input
                    value={serializeFloorOrdinals(document.spawn.floorOrdinals)}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          floorOrdinals: parseFloorOrdinals(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Specific map ids</span>
                  <textarea
                    rows={4}
                    value={serializeMultilineList(document.spawn.mapIds)}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          mapIds: parseMultilineList(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Drops</h4>
              <div className="form-grid">
                <label className="field">
                  <span>WAD</span>
                  <input
                    type="number"
                    value={document.drops.wad}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          wad: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Metal Scrap</span>
                  <input
                    type="number"
                    value={document.drops.resources.metalScrap}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          resources: {
                            ...current.drops.resources,
                            metalScrap: Number(event.target.value || 0)
                          }
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Wood</span>
                  <input
                    type="number"
                    value={document.drops.resources.wood}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          resources: {
                            ...current.drops.resources,
                            wood: Number(event.target.value || 0)
                          }
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Chaos Shards</span>
                  <input
                    type="number"
                    value={document.drops.resources.chaosShards}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          resources: {
                            ...current.drops.resources,
                            chaosShards: Number(event.target.value || 0)
                          }
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Steam Components</span>
                  <input
                    type="number"
                    value={document.drops.resources.steamComponents}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          resources: {
                            ...current.drops.resources,
                            steamComponents: Number(event.target.value || 0)
                          }
                        }
                      }))
                    }
                  />
                </label>
              </div>

              <div className="dialogue-entry-list">
                {document.drops.items.length === 0 ? (
                  <div className="empty-state compact">Add optional item drops with quantity and 0-1 chance values.</div>
                ) : (
                  document.drops.items.map((drop, index) => (
                    <article key={`${drop.id || "item"}-${index}`} className="dialogue-entry-card">
                      <div className="dialogue-entry-header">
                        <span className="flow-badge jump">Drop {index + 1}</span>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() =>
                            patchDocument((current) => ({
                              ...current,
                              drops: {
                                ...current.drops,
                                items: current.drops.items.filter((_, itemIndex) => itemIndex !== index)
                              }
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Item id</span>
                          <input
                            value={drop.id}
                            onChange={(event) =>
                              patchDocument((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, id: event.target.value } : entry
                                  )
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Quantity</span>
                          <input
                            type="number"
                            value={drop.quantity}
                            onChange={(event) =>
                              patchDocument((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, quantity: Number(event.target.value || 0) } : entry
                                  )
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Chance</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step="0.05"
                            value={drop.chance}
                            onChange={(event) =>
                              patchDocument((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, chance: Number(event.target.value || 0) } : entry
                                  )
                                }
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
                      drops: {
                        ...current.drops,
                        items: [...current.drops.items, createDropItem()]
                      }
                    }))
                  }
                >
                  Add item drop
                </button>
              </div>
            </div>

            <div className="subsection">
              <h4>Art & Metadata</h4>
              <ImageAssetField
                label="Sprite"
                emptyLabel="Drop enemy sprite art"
                hint="Used by the field renderer when a published sprite path is available."
                asset={document.spriteAsset}
                onChange={(spriteAsset) => patchDocument((current) => ({ ...current, spriteAsset }))}
              />
              <div className="form-grid">
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
            </div>

            <div className="toolbar split">
              <div className="chip-row">
                <span className="pill">{document.kind || "light"}</span>
                <span className="pill">{document.spawn.spawnCount} spawn(s)</span>
                <span className="pill">{document.drops.items.length} item drop(s)</span>
              </div>
              <div className="toolbar">
                <label className="inline-select">
                  <span>Export target</span>
                  <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}>
                    <option value="generic">Generic</option>
                    <option value="chaos-core">Chaos Core</option>
                  </select>
                </label>
                {canSendToDesktop ? (
                  <button type="button" className="ghost-button" onClick={() => void sendToDesktop()} disabled={isSendingToDesktop}>
                    {isSendingToDesktop ? "Sending..." : "Send to desktop"}
                  </button>
                ) : null}
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
            contentType="field_enemy"
            currentDocument={document}
            buildBundle={(current) => buildFieldEnemyBundleForTarget(current, "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish lightweight field enemy definitions into Chaos Core and reopen those records here for spawn and drop tuning."
          />
        </>
      )}
    />
  );
}
