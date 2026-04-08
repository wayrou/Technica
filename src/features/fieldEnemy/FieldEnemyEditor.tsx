import { useEffect, useMemo } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankFieldEnemy, createSampleFieldEnemy } from "../../data/sampleFieldEnemy";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import { mergeFactionOptions } from "../../types/faction";
import type { FieldEnemyDocument, FieldEnemyItemDropDocument } from "../../types/fieldEnemy";
import { resourceKeys, resourceLabels } from "../../types/resources";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateFieldEnemyDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildFieldEnemyBundleForTarget } from "../../utils/exporters";
import { parseKeyValueLines, parseMultilineList, serializeKeyValueLines, serializeMultilineList } from "../../utils/records";

type UnknownRecord = Record<string, unknown>;

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

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeFieldEnemyDocument(value: unknown): FieldEnemyDocument {
  const fallback = createBlankFieldEnemy();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const stats = toRecord(record.stats);
  const spawn = toRecord(record.spawn);
  const drops = toRecord(record.drops);
  const metadata = toRecord(record.metadata);
  const resources = toRecord(drops?.resources);
  const { faction: _legacyFaction, ...metadataWithoutFaction } = metadata ?? {};

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    faction: readString(record.faction, readString(metadata?.faction, fallback.faction)),
    kind: readString(record.kind, fallback.kind),
    spriteKey: readString(record.spriteKey, fallback.spriteKey),
    spriteAsset:
      record.spriteAsset && typeof record.spriteAsset === "object"
        ? (record.spriteAsset as FieldEnemyDocument["spriteAsset"])
        : fallback.spriteAsset,
    stats: {
      maxHp: readNumber(stats?.maxHp, fallback.stats.maxHp),
      speed: readNumber(stats?.speed, fallback.stats.speed),
      aggroRange: readNumber(stats?.aggroRange, fallback.stats.aggroRange),
      width: readNumber(stats?.width, fallback.stats.width),
      height: readNumber(stats?.height, fallback.stats.height)
    },
    spawn: {
      mapIds: Array.isArray(spawn?.mapIds) ? spawn.mapIds.map(String).map((entry) => entry.trim()).filter(Boolean) : fallback.spawn.mapIds,
      floorOrdinals: Array.isArray(spawn?.floorOrdinals)
        ? spawn.floorOrdinals.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0).map((entry) => Math.floor(entry))
        : fallback.spawn.floorOrdinals,
      spawnCount: readNumber(spawn?.spawnCount ?? spawn?.count, fallback.spawn.spawnCount)
    },
    drops: {
      wad: readNumber(drops?.wad, fallback.drops.wad),
      resources: {
        ...fallback.drops.resources,
        ...Object.fromEntries(
          resourceKeys.map((resourceKey) => [resourceKey, readNumber(resources?.[resourceKey], fallback.drops.resources[resourceKey])])
        )
      },
      items: Array.isArray(drops?.items)
        ? drops.items.map((entry) => {
            const item = toRecord(entry);
            return {
              id: readString(item?.id, ""),
              quantity: readNumber(item?.quantity, 1),
              chance: readNumber(item?.chance, 1)
            };
          })
        : fallback.drops.items
    },
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadataWithoutFaction).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function createDropItem(): FieldEnemyItemDropDocument {
  return {
    id: "",
    quantity: 1,
    chance: 1
  };
}

export function FieldEnemyEditor() {
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

  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: FieldEnemyDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isFieldEnemyDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica field enemy format.");
        return;
      }
      setDocument(touchFieldEnemy(normalizeFieldEnemyDocument(parsed)));
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
      validate={(document) => validateFieldEnemyDocument(normalizeFieldEnemyDocument(document))}
      buildBundleForTarget={(document, target) => buildFieldEnemyBundleForTarget(normalizeFieldEnemyDocument(document), target)}
      getTitle={(document) => normalizeFieldEnemyDocument(document).name}
      isImportPayload={isFieldEnemyDocument}
      touchDocument={(document) => touchFieldEnemy(normalizeFieldEnemyDocument(document))}
      replacePrompt="Replace the current field enemy draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica field enemy draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => (
        (() => {
          const fieldEnemy = normalizeFieldEnemyDocument(document);
          const selectedFaction = factionOptions.find((option) => option.id === fieldEnemy.faction) ?? null;
          const patchFieldEnemy = (updater: (current: FieldEnemyDocument) => FieldEnemyDocument) =>
            patchDocument((current) => updater(normalizeFieldEnemyDocument(current)));

          return (
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
                <input value={fieldEnemy.id} onChange={(event) => patchFieldEnemy((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={fieldEnemy.name} onChange={(event) => patchFieldEnemy((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Faction</span>
                <select
                  value={fieldEnemy.faction}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, faction: event.target.value }))}
                >
                  {!fieldEnemy.faction.trim() ? <option value="">Select faction...</option> : null}
                  {fieldEnemy.faction.trim() && !selectedFaction ? (
                    <option value={fieldEnemy.faction}>Custom ({fieldEnemy.faction})</option>
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
                <span>Kind</span>
                <input value={fieldEnemy.kind} onChange={(event) => patchFieldEnemy((current) => ({ ...current, kind: event.target.value }))} />
              </label>
              <label className="field">
                <span>Sprite key</span>
                <input
                  value={fieldEnemy.spriteKey}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, spriteKey: event.target.value }))}
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={fieldEnemy.description}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, description: event.target.value }))}
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
                    value={fieldEnemy.stats.maxHp}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.stats.speed}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.stats.aggroRange}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.stats.width}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.stats.height}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.spawn.spawnCount}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={serializeFloorOrdinals(fieldEnemy.spawn.floorOrdinals)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={serializeMultilineList(fieldEnemy.spawn.mapIds)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                    value={fieldEnemy.drops.wad}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          wad: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                {resourceKeys.map((resourceKey) => (
                  <label key={resourceKey} className="field">
                    <span>{resourceLabels[resourceKey]}</span>
                    <input
                      type="number"
                      value={fieldEnemy.drops.resources[resourceKey]}
                      onChange={(event) =>
                        patchFieldEnemy((current) => ({
                          ...current,
                          drops: {
                            ...current.drops,
                            resources: {
                              ...current.drops.resources,
                              [resourceKey]: Number(event.target.value || 0)
                            }
                          }
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="dialogue-entry-list">
                {fieldEnemy.drops.items.length === 0 ? (
                  <div className="empty-state compact">Add optional item drops with quantity and 0-1 chance values.</div>
                ) : (
                  fieldEnemy.drops.items.map((drop, index) => (
                    <article key={`${drop.id || "item"}-${index}`} className="dialogue-entry-card">
                      <div className="dialogue-entry-header">
                        <span className="flow-badge jump">Drop {index + 1}</span>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() =>
                            patchFieldEnemy((current) => ({
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
                              patchFieldEnemy((current) => ({
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
                              patchFieldEnemy((current) => ({
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
                              patchFieldEnemy((current) => ({
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
                    patchFieldEnemy((current) => ({
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
                asset={fieldEnemy.spriteAsset}
                onChange={(spriteAsset) => patchFieldEnemy((current) => ({ ...current, spriteAsset }))}
              />
              <div className="form-grid">
                <label className="field full">
                  <span>Metadata</span>
                  <textarea
                    rows={4}
                    value={serializeKeyValueLines(fieldEnemy.metadata)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
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
                <span className="pill">{fieldEnemy.kind || "light"}</span>
                {fieldEnemy.faction ? <span className="pill">{fieldEnemy.faction}</span> : null}
                <span className="pill">{fieldEnemy.spawn.spawnCount} spawn(s)</span>
                <span className="pill">{fieldEnemy.drops.items.length} item drop(s)</span>
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
            currentDocument={fieldEnemy}
            buildBundle={(current) => buildFieldEnemyBundleForTarget(normalizeFieldEnemyDocument(current), "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish lightweight field enemy definitions into Chaos Core and reopen those records here for spawn and drop tuning."
          />
        </>
          );
        })()
      )}
    />
  );
}
