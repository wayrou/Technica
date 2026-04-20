import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { MerchantListingFields } from "../../components/MerchantListingFields";
import { Panel } from "../../components/Panel";
import { createBlankItem, createSampleItem } from "../../data/sampleItem";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { itemArchetypes, itemKinds, type ItemArchetype, type ItemDocument, type ItemKind } from "../../types/item";
import { normalizeMerchantListingDocument } from "../../types/merchant";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildItemBundleForTarget } from "../../utils/exporters";
import { validateItemDocument } from "../../utils/contentValidation";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchItem(document: ItemDocument): ItemDocument {
  return {
    ...document,
    updatedAt: isoNow()
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

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readItemKind(value: unknown, fallback: ItemKind): ItemKind {
  return value === "resource" || value === "equipment" || value === "consumable" ? value : fallback;
}

function readItemArchetype(value: unknown, fallback: ItemArchetype): ItemArchetype {
  return value === "weapon_chassis" || value === "standard" ? value : fallback;
}

function normalizeItemDocument(value: unknown): ItemDocument {
  const fallback = createBlankItem();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const acquisition = toRecord(record.acquisition);
  const havenShop = toRecord(acquisition?.havenShop);
  const fieldMapResource = toRecord(acquisition?.fieldMapResource);
  const enemyDrop = toRecord(acquisition?.enemyDrop);
  const weaponChassis = toRecord(record.weaponChassis);
  const metadata = toRecord(record.metadata);

  const archetype = readItemArchetype(record.archetype, fallback.archetype);
  const normalized: ItemDocument = {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    kind: readItemKind(record.kind, fallback.kind),
    archetype,
    stackable: readBoolean(record.stackable, fallback.stackable),
    quantity: readNumber(record.quantity, fallback.quantity),
    massKg: readNumber(record.massKg, fallback.massKg),
    bulkBu: readNumber(record.bulkBu, fallback.bulkBu),
    powerW: readNumber(record.powerW, fallback.powerW),
    iconAsset: record.iconAsset && typeof record.iconAsset === "object" ? (record.iconAsset as ItemDocument["iconAsset"]) : undefined,
    acquisition: {
      startsWithPlayer: readBoolean(acquisition?.startsWithPlayer, fallback.acquisition.startsWithPlayer),
      havenShop: {
        enabled: readBoolean(havenShop?.enabled, fallback.acquisition.havenShop.enabled),
        unlockFloor: readNumber(havenShop?.unlockFloor, fallback.acquisition.havenShop.unlockFloor),
        notes: readString(havenShop?.notes, fallback.acquisition.havenShop.notes)
      },
      fieldMapResource: {
        enabled: readBoolean(fieldMapResource?.enabled, fallback.acquisition.fieldMapResource.enabled),
        mapId: readString(fieldMapResource?.mapId, fallback.acquisition.fieldMapResource.mapId),
        resourceNodeId: readString(fieldMapResource?.resourceNodeId, fallback.acquisition.fieldMapResource.resourceNodeId),
        notes: readString(fieldMapResource?.notes, fallback.acquisition.fieldMapResource.notes)
      },
      enemyDrop: {
        enabled: readBoolean(enemyDrop?.enabled, fallback.acquisition.enemyDrop.enabled),
        enemyUnitIds: Array.isArray(enemyDrop?.enemyUnitIds)
          ? enemyDrop.enemyUnitIds.filter((entry): entry is string => typeof entry === "string")
          : fallback.acquisition.enemyDrop.enemyUnitIds,
        notes: readString(enemyDrop?.notes, fallback.acquisition.enemyDrop.notes)
      },
      otherSourcesNotes: readString(acquisition?.otherSourcesNotes, fallback.acquisition.otherSourcesNotes)
    },
    merchant: normalizeMerchantListingDocument(record.merchant, fallback.merchant),
    weaponChassis: {
      stability: readNumber(weaponChassis?.stability, fallback.weaponChassis.stability),
      cardSlots: readNumber(weaponChassis?.cardSlots, fallback.weaponChassis.cardSlots)
    },
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadata).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };

  if (normalized.archetype === "weapon_chassis") {
    return {
      ...normalized,
      kind: "equipment",
      stackable: false,
      quantity: 1
    };
  }

  return normalized;
}

function isItemDocument(value: unknown): value is ItemDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "kind" in value &&
      "quantity" in value &&
      "massKg" in value
  );
}

function countEnabledSources(document: ItemDocument) {
  let count = 0;
  if (document.acquisition.startsWithPlayer) {
    count += 1;
  }
  if (document.acquisition.havenShop.enabled) {
    count += 1;
  }
  if (document.merchant.soldAtMerchant) {
    count += 1;
  }
  if (document.acquisition.fieldMapResource.enabled) {
    count += 1;
  }
  if (document.acquisition.enemyDrop.enabled) {
    count += 1;
  }
  return count;
}

export function ItemEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: ItemDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isItemDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica item format.");
        return;
      }
      setDocument(touchItem(normalizeItemDocument(parsed)));
    } catch {
      notify("Could not load the selected item from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.item.document"
      exportTargetKey="technica.item.exportTarget"
      draftType="item"
      initialDocument={createSampleItem()}
      createBlank={createBlankItem}
      createSample={createSampleItem}
      validate={(document) => validateItemDocument(normalizeItemDocument(document))}
      buildBundleForTarget={(document, target) => buildItemBundleForTarget(normalizeItemDocument(document), target)}
      getTitle={(document) => normalizeItemDocument(document).name}
      isImportPayload={isItemDocument}
      touchDocument={(document) => touchItem(normalizeItemDocument(document))}
      replacePrompt="Replace the current item draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica item draft or export."
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
        const item = normalizeItemDocument(document);
        const isWeaponChassis = item.archetype === "weapon_chassis";
        const patchItem = (updater: (current: ItemDocument) => ItemDocument) =>
          patchDocument((current) => updater(normalizeItemDocument(current)));

        return (
          <>
            <Panel
              title="Item Setup"
              subtitle="Define how players obtain the item in Chaos Core, or switch into weapon chassis mode for stripped-down platform authoring."
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
                  <span>Item id</span>
                  <input value={item.id} onChange={(event) => patchItem((current) => ({ ...current, id: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input value={item.name} onChange={(event) => patchItem((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Authoring mode</span>
                  <select
                    value={item.archetype}
                    onChange={(event) =>
                      patchItem((current) => {
                        const nextArchetype = event.target.value as ItemArchetype;
                        return {
                          ...current,
                          archetype: nextArchetype,
                          kind: nextArchetype === "weapon_chassis" ? "equipment" : current.kind,
                          stackable: nextArchetype === "weapon_chassis" ? false : current.stackable,
                          quantity: nextArchetype === "weapon_chassis" ? 1 : current.quantity
                        };
                      })
                    }
                  >
                    {itemArchetypes.map((archetype) => (
                      <option key={archetype} value={archetype}>
                        {archetype === "weapon_chassis" ? "Weapon chassis" : "Standard item"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Kind</span>
                  <select
                    value={item.kind}
                    disabled={isWeaponChassis}
                    onChange={(event) =>
                      patchItem((current) => ({
                        ...current,
                        kind: event.target.value as ItemKind
                      }))
                    }
                  >
                    {itemKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  {isWeaponChassis ? <small className="muted">Weapon chassis always export as equipment.</small> : null}
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={item.description}
                    onChange={(event) => patchItem((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
                {!isWeaponChassis ? (
                  <div className="field full">
                    <ImageAssetField
                      label="Item icon"
                      emptyLabel="No item icon attached."
                      hint="Exports as a stable asset file for Chaos Core imports."
                      asset={item.iconAsset}
                      onChange={(iconAsset) => patchItem((current) => ({ ...current, iconAsset }))}
                    />
                  </div>
                ) : null}
              </div>

              <div className="subsection">
                <h4>{isWeaponChassis ? "Weapon Chassis Profile" : "Logistics & Inventory"}</h4>
                <div className="form-grid">
                  <label className="field field-inline">
                    <span>Stackable</span>
                    <input
                      type="checkbox"
                      checked={item.stackable}
                      disabled={isWeaponChassis}
                      onChange={(event) => patchItem((current) => ({ ...current, stackable: event.target.checked }))}
                    />
                  </label>
                  <label className="field">
                    <span>Quantity</span>
                    <input
                      type="number"
                      min={1}
                      disabled={isWeaponChassis}
                      value={item.quantity}
                      onChange={(event) => patchItem((current) => ({ ...current, quantity: Number(event.target.value || 1) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Mass (kg)</span>
                    <input
                      type="number"
                      value={item.massKg}
                      onChange={(event) => patchItem((current) => ({ ...current, massKg: Number(event.target.value || 0) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Bulk (bu)</span>
                    <input
                      type="number"
                      value={item.bulkBu}
                      onChange={(event) => patchItem((current) => ({ ...current, bulkBu: Number(event.target.value || 0) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Power (w)</span>
                    <input
                      type="number"
                      value={item.powerW}
                      onChange={(event) => patchItem((current) => ({ ...current, powerW: Number(event.target.value || 0) }))}
                    />
                  </label>
                  {isWeaponChassis ? (
                    <>
                      <label className="field">
                        <span>Stability</span>
                        <input
                          type="number"
                          value={item.weaponChassis.stability}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              weaponChassis: {
                                ...current.weaponChassis,
                                stability: Number(event.target.value || 0)
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Card slots</span>
                        <input
                          type="number"
                          min={1}
                          value={item.weaponChassis.cardSlots}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              weaponChassis: {
                                ...current.weaponChassis,
                                cardSlots: Number(event.target.value || 0)
                              }
                            }))
                          }
                        />
                      </label>
                      <div className="field full">
                        <div className="empty-state compact">
                          Weapon chassis mode intentionally locks the normal item fields down to the chassis-facing stats only.
                        </div>
                      </div>
                    </>
                  ) : (
                    <label className="field full">
                      <span>Metadata</span>
                      <textarea
                        rows={5}
                        value={serializeKeyValueLines(item.metadata)}
                        onChange={(event) =>
                          patchItem((current) => ({
                            ...current,
                            metadata: parseKeyValueLines(event.target.value)
                          }))
                        }
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className={`subsection ${isWeaponChassis ? "section-disabled" : ""}`}>
                <h4>How Players Get This Item</h4>
                <div className="stack-list">
                  <div className="nested-card">
                    <div className="form-grid">
                      <label className="field field-inline">
                        <span>Player starts with it</span>
                        <input
                          type="checkbox"
                          checked={item.acquisition.startsWithPlayer}
                          disabled={isWeaponChassis}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                startsWithPlayer: event.target.checked
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field field-inline">
                        <span>Sold in HAVEN shop</span>
                        <input
                          type="checkbox"
                          checked={item.acquisition.havenShop.enabled}
                          disabled={isWeaponChassis}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                havenShop: {
                                  ...current.acquisition.havenShop,
                                  enabled: event.target.checked
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>HAVEN unlock floor</span>
                        <input
                          type="number"
                          min={0}
                          disabled={isWeaponChassis || !item.acquisition.havenShop.enabled}
                          value={item.acquisition.havenShop.unlockFloor}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                havenShop: {
                                  ...current.acquisition.havenShop,
                                  unlockFloor: Number(event.target.value || 0)
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field full">
                        <span>HAVEN shop notes</span>
                        <textarea
                          rows={2}
                          disabled={isWeaponChassis || !item.acquisition.havenShop.enabled}
                          value={item.acquisition.havenShop.notes}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                havenShop: {
                                  ...current.acquisition.havenShop,
                                  notes: event.target.value
                                }
                              }
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <MerchantListingFields
                    value={item.merchant}
                    disabled={isWeaponChassis}
                    onChange={(merchant) => patchItem((current) => ({ ...current, merchant }))}
                  />

                  <div className="nested-card">
                    <div className="form-grid">
                      <label className="field field-inline">
                        <span>Found on a field map resource</span>
                        <input
                          type="checkbox"
                          checked={item.acquisition.fieldMapResource.enabled}
                          disabled={isWeaponChassis}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                fieldMapResource: {
                                  ...current.acquisition.fieldMapResource,
                                  enabled: event.target.checked
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Field map id</span>
                        <input
                          disabled={isWeaponChassis || !item.acquisition.fieldMapResource.enabled}
                          value={item.acquisition.fieldMapResource.mapId}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                fieldMapResource: {
                                  ...current.acquisition.fieldMapResource,
                                  mapId: event.target.value
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Resource node id</span>
                        <input
                          disabled={isWeaponChassis || !item.acquisition.fieldMapResource.enabled}
                          value={item.acquisition.fieldMapResource.resourceNodeId}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                fieldMapResource: {
                                  ...current.acquisition.fieldMapResource,
                                  resourceNodeId: event.target.value
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field full">
                        <span>Field resource notes</span>
                        <textarea
                          rows={2}
                          disabled={isWeaponChassis || !item.acquisition.fieldMapResource.enabled}
                          value={item.acquisition.fieldMapResource.notes}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                fieldMapResource: {
                                  ...current.acquisition.fieldMapResource,
                                  notes: event.target.value
                                }
                              }
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="nested-card">
                    <div className="form-grid">
                      <label className="field field-inline">
                        <span>Dropped by enemy units</span>
                        <input
                          type="checkbox"
                          checked={item.acquisition.enemyDrop.enabled}
                          disabled={isWeaponChassis}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                enemyDrop: {
                                  ...current.acquisition.enemyDrop,
                                  enabled: event.target.checked
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field full">
                        <span>Enemy unit ids</span>
                        <input
                          disabled={isWeaponChassis || !item.acquisition.enemyDrop.enabled}
                          value={serializeCommaList(item.acquisition.enemyDrop.enemyUnitIds)}
                          placeholder="enemy_raider, enemy_phase_sapper"
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                enemyDrop: {
                                  ...current.acquisition.enemyDrop,
                                  enemyUnitIds: parseCommaList(event.target.value)
                                }
                              }
                            }))
                          }
                        />
                      </label>
                      <label className="field full">
                        <span>Enemy drop notes</span>
                        <textarea
                          rows={2}
                          disabled={isWeaponChassis || !item.acquisition.enemyDrop.enabled}
                          value={item.acquisition.enemyDrop.notes}
                          onChange={(event) =>
                            patchItem((current) => ({
                              ...current,
                              acquisition: {
                                ...current.acquisition,
                                enemyDrop: {
                                  ...current.acquisition.enemyDrop,
                                  notes: event.target.value
                                }
                              }
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <label className="field full">
                    <span>Other acquisition notes</span>
                    <textarea
                      rows={3}
                      disabled={isWeaponChassis}
                      value={item.acquisition.otherSourcesNotes}
                      onChange={(event) =>
                        patchItem((current) => ({
                          ...current,
                          acquisition: {
                            ...current.acquisition,
                            otherSourcesNotes: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{isWeaponChassis ? "weapon chassis" : item.kind}</span>
                  {!isWeaponChassis ? <span className="pill">{countEnabledSources(item)} source(s)</span> : null}
                  <span className="pill">{item.massKg} kg</span>
                  {isWeaponChassis ? <span className="pill">Stability {item.weaponChassis.stability}</span> : null}
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
              contentType="item"
              currentDocument={item}
              buildBundle={(current) => buildItemBundleForTarget(normalizeItemDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish item runtime JSON and icons directly into the Chaos Core repo, then reload them here for balance passes."
            />
          </>
        );
      }}
    />
  );
}
