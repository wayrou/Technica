import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankChassis, createSampleChassis } from "../../data/sampleChassis";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ChassisDocument } from "../../types/chassis";
import { chassisSlotTypes, createChassisId } from "../../types/chassis";
import { resourceKeys, resourceLabels, createResourceWalletDocument } from "../../types/resources";
import { validateChassisDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildChassisBundleForTarget } from "../../utils/exporters";
import { parseCommaList, serializeCommaList } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchChassis(document: ChassisDocument): ChassisDocument {
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

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
    : [];
}

function normalizeChassisDocument(value: unknown): ChassisDocument {
  const fallback = createBlankChassis();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const name = readString(record.name, fallback.name);
  const slotType = chassisSlotTypes.includes(record.slotType as (typeof chassisSlotTypes)[number])
    ? (record.slotType as ChassisDocument["slotType"])
    : fallback.slotType;

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, "") || createChassisId(name),
    name,
    slotType,
    stability: readNumber(record.stability, fallback.stability),
    kg: readNumber(record.kg, fallback.kg),
    bu: readNumber(record.bu, fallback.bu),
    w: readNumber(record.w, fallback.w),
    cardSlots: readNumber(record.cardSlots, fallback.cardSlots),
    description: readString(record.description, fallback.description),
    buildCost: createResourceWalletDocument(toRecord(record.buildCost) as Partial<ChassisDocument["buildCost"]> | null),
    unlockAfterFloor: readNumber(record.unlockAfterFloor, fallback.unlockAfterFloor),
    availableInHavenShop:
      typeof record.availableInHavenShop === "boolean"
        ? record.availableInHavenShop
        : fallback.availableInHavenShop,
    havenShopUnlockAfterFloor: readNumber(
      record.havenShopUnlockAfterFloor,
      typeof record.unlockAfterFloor === "number" && Number.isFinite(record.unlockAfterFloor)
        ? record.unlockAfterFloor
        : fallback.havenShopUnlockAfterFloor
    ),
    requiredQuestIds: normalizeStringList(record.requiredQuestIds),
    allowedCardTags: normalizeStringList(record.allowedCardTags),
    allowedCardFamilies: normalizeStringList(record.allowedCardFamilies),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function isChassisDocument(value: unknown): value is ChassisDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "slotType" in value &&
      "buildCost" in value
  );
}

function syncChassisIdentity(current: ChassisDocument, nextName: string) {
  const previousGeneratedId = createChassisId(current.name);
  const nextGeneratedId = createChassisId(nextName.trim() || current.name);

  return {
    ...current,
    id: !current.id.trim() || current.id === previousGeneratedId ? nextGeneratedId : current.id,
    name: nextName
  };
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: ChassisDocument) => void) {
  try {
    const parsed = normalizeChassisDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isChassisDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica chassis format.");
      return;
    }
    setDocument(touchChassis(parsed));
  } catch {
    notify("Could not load the selected chassis from the Chaos Core database.");
  }
}

function formatSlotTypeLabel(slotType: string) {
  return slotType.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ChassisEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.chassis.document"
      exportTargetKey="technica.chassis.exportTarget"
      draftType="chassis"
      initialDocument={createSampleChassis()}
      createBlank={createBlankChassis}
      createSample={createSampleChassis}
      validate={(document) => validateChassisDocument(normalizeChassisDocument(document))}
      buildBundleForTarget={(document, target) => buildChassisBundleForTarget(normalizeChassisDocument(document), target)}
      getTitle={(document) => normalizeChassisDocument(document).name}
      isImportPayload={isChassisDocument}
      touchDocument={(document) => touchChassis(normalizeChassisDocument(document))}
      replacePrompt="Replace the current chassis draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica chassis draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => {
        const chassis = normalizeChassisDocument(document);
        const patchChassis = (updater: (current: ChassisDocument) => ChassisDocument) =>
          patchDocument((current) => touchChassis(normalizeChassisDocument(updater(normalizeChassisDocument(current)))));

        return (
          <>
            <Panel
              title="Chassis Editor"
              subtitle="Author gear-builder chassis with logistics, stability, slot profile, material cost, and shop/unlock gates."
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
                  <span>Name</span>
                  <input
                    value={chassis.name}
                    onChange={(event) => patchChassis((current) => syncChassisIdentity(current, event.target.value))}
                  />
                  <small className="muted">Internal id: {chassis.id}</small>
                </label>
                <label className="field">
                  <span>Slot type</span>
                  <select
                    value={chassis.slotType}
                    onChange={(event) =>
                      patchChassis((current) => ({
                        ...current,
                        slotType: event.target.value as ChassisDocument["slotType"]
                      }))
                    }
                  >
                    {chassisSlotTypes.map((slotType) => (
                      <option key={slotType} value={slotType}>
                        {formatSlotTypeLabel(slotType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Stability</span>
                  <input
                    type="number"
                    value={chassis.stability}
                    onChange={(event) =>
                      patchChassis((current) => ({ ...current, stability: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="field">
                  <span>KG</span>
                  <input
                    type="number"
                    value={chassis.kg}
                    onChange={(event) => patchChassis((current) => ({ ...current, kg: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>BU</span>
                  <input
                    type="number"
                    value={chassis.bu}
                    onChange={(event) => patchChassis((current) => ({ ...current, bu: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>W</span>
                  <input
                    type="number"
                    value={chassis.w}
                    onChange={(event) => patchChassis((current) => ({ ...current, w: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Card slots</span>
                  <input
                    type="number"
                    value={chassis.cardSlots}
                    onChange={(event) =>
                      patchChassis((current) => ({ ...current, cardSlots: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Unlock after floor</span>
                  <input
                    type="number"
                    value={chassis.unlockAfterFloor}
                    onChange={(event) =>
                      patchChassis((current) => ({
                        ...current,
                        unlockAfterFloor: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={5}
                    value={chassis.description}
                    onChange={(event) =>
                      patchChassis((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="subsection">
                <h4>Build Cost</h4>
                <div className="form-grid">
                  {resourceKeys.map((resourceKey) => (
                    <label key={resourceKey} className="field">
                      <span>{resourceLabels[resourceKey]}</span>
                      <input
                        type="number"
                        value={chassis.buildCost[resourceKey]}
                        onChange={(event) =>
                          patchChassis((current) => ({
                            ...current,
                            buildCost: {
                              ...current.buildCost,
                              [resourceKey]: Number(event.target.value || 0)
                            }
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="subsection">
                <h4>HAVEN Shop</h4>
                <div className="form-grid">
                  <label className="field checkbox-field full">
                    <input
                      type="checkbox"
                      checked={chassis.availableInHavenShop}
                      onChange={(event) =>
                        patchChassis((current) => ({
                          ...current,
                          availableInHavenShop: event.target.checked,
                          havenShopUnlockAfterFloor: event.target.checked
                            ? current.havenShopUnlockAfterFloor
                            : 0
                        }))
                      }
                    />
                    <span>Available in the HAVEN shop</span>
                  </label>
                  <label className="field">
                    <span>Shop unlock after floor</span>
                    <input
                      type="number"
                      value={chassis.havenShopUnlockAfterFloor}
                      disabled={!chassis.availableInHavenShop}
                      onChange={(event) =>
                        patchChassis((current) => ({
                          ...current,
                          havenShopUnlockAfterFloor: Number(event.target.value || 0)
                        }))
                      }
                    />
                    <small className="muted">
                      Controls when HAVEN starts selling this chassis independently of the general chassis unlock.
                    </small>
                  </label>
                </div>
              </div>

              <div className="subsection">
                <h4>Restrictions And Unlocks</h4>
                <div className="form-grid">
                  <label className="field full">
                    <span>Required completed quests</span>
                    <input
                      value={serializeCommaList(chassis.requiredQuestIds)}
                      placeholder="quest_restore_signal_grid, quest_secure_foundry"
                      onChange={(event) =>
                        patchChassis((current) => ({
                          ...current,
                          requiredQuestIds: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Allowed card tags</span>
                    <input
                      value={serializeCommaList(chassis.allowedCardTags)}
                      placeholder="guard, chaos, mobility"
                      onChange={(event) =>
                        patchChassis((current) => ({
                          ...current,
                          allowedCardTags: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Allowed card families</span>
                    <input
                      value={serializeCommaList(chassis.allowedCardFamilies)}
                      placeholder="shield, artillery, support"
                      onChange={(event) =>
                        patchChassis((current) => ({
                          ...current,
                          allowedCardFamilies: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{chassis.slotType}</span>
                  <span className="pill">{chassis.cardSlots} slots</span>
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
              contentType="chassis"
              currentDocument={chassis}
              buildBundle={(current) => buildChassisBundleForTarget(normalizeChassisDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish chassis definitions into the Chaos Core repo and reopen those built-in or generated records here for tuning."
            />
          </>
        );
      }}
    />
  );
}
