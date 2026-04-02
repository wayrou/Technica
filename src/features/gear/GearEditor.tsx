import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankGear, createSampleGear } from "../../data/sampleGear";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { type ExportTarget } from "../../types/common";
import { gearSlotTypes, supportedWeaponTypes, type GearDocument } from "../../types/gear";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildGearBundleForTarget } from "../../utils/exporters";
import { validateGearDocument } from "../../utils/contentValidation";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchGear(document: GearDocument): GearDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isGearDocument(value: unknown): value is GearDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "slot" in value &&
      "stats" in value &&
      "inventory" in value
  );
}

export function GearEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: GearDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isGearDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica gear format.");
        return;
      }
      setDocument(touchGear(parsed));
    } catch {
      notify("Could not load the selected gear from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.gear.document"
      exportTargetKey="technica.gear.exportTarget"
      draftType="gear"
      initialDocument={createSampleGear()}
      createBlank={createBlankGear}
      createSample={createSampleGear}
      validate={validateGearDocument}
      buildBundleForTarget={buildGearBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isGearDocument}
      touchDocument={touchGear}
      replacePrompt="Replace the current gear draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica gear draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
        <>
          <Panel
            title="Gear Setup"
            subtitle="Define equipment, its gameplay payload, and how it lands in Chaos Core inventory."
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
                <span>Gear id</span>
                <input value={document.id} onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={document.name} onChange={(event) => patchDocument((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={document.description}
                  onChange={(event) => patchDocument((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <div className="field full">
                <ImageAssetField
                  label="Gear icon"
                  emptyLabel="No gear icon attached."
                  hint="Exports as a stable asset file for Chaos Core imports."
                  asset={document.iconAsset}
                  onChange={(iconAsset) => patchDocument((current) => ({ ...current, iconAsset }))}
                />
              </div>
              <label className="field">
                <span>Slot</span>
                <select
                  value={document.slot}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      slot: event.target.value as GearDocument["slot"]
                    }))
                  }
                >
                  {gearSlotTypes.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Weapon type</span>
                <select
                  value={document.weaponType ?? ""}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      weaponType: event.target.value ? (event.target.value as GearDocument["weaponType"]) : undefined
                    }))
                  }
                >
                  <option value="">None</option>
                  {supportedWeaponTypes.map((weaponType) => (
                    <option key={weaponType} value={weaponType}>
                      {weaponType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-inline">
                <span>Mechanical</span>
                <input
                  type="checkbox"
                  checked={document.isMechanical}
                  onChange={(event) => patchDocument((current) => ({ ...current, isMechanical: event.target.checked }))}
                />
              </label>
            </div>

            <div className="subsection">
              <h4>Stat Profile</h4>
              <div className="form-grid">
                <label className="field">
                  <span>ATK</span>
                  <input
                    type="number"
                    value={document.stats.atk}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          atk: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>DEF</span>
                  <input
                    type="number"
                    value={document.stats.def}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          def: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>AGI</span>
                  <input
                    type="number"
                    value={document.stats.agi}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          agi: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>ACC</span>
                  <input
                    type="number"
                    value={document.stats.acc}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          acc: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>HP</span>
                  <input
                    type="number"
                    value={document.stats.hp}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          hp: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Wear</span>
                  <input
                    type="number"
                    value={document.wear}
                    onChange={(event) => patchDocument((current) => ({ ...current, wear: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Module slots</span>
                  <input
                    type="number"
                    value={document.moduleSlots}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...current, moduleSlots: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Granted cards</span>
                  <input
                    value={serializeCommaList(document.cardsGranted)}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        cardsGranted: parseCommaList(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Attached modules</span>
                  <input
                    value={serializeCommaList(document.attachedModules)}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        attachedModules: parseCommaList(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Inventory Footprint</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Mass (kg)</span>
                  <input
                    type="number"
                    value={document.inventory.massKg}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        inventory: {
                          ...current.inventory,
                          massKg: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Bulk (bu)</span>
                  <input
                    type="number"
                    value={document.inventory.bulkBu}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        inventory: {
                          ...current.inventory,
                          bulkBu: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Power (w)</span>
                  <input
                    type="number"
                    value={document.inventory.powerW}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        inventory: {
                          ...current.inventory,
                          powerW: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field field-inline">
                  <span>Starting owned</span>
                  <input
                    type="checkbox"
                    checked={document.inventory.startingOwned}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        inventory: {
                          ...current.inventory,
                          startingOwned: event.target.checked
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Metadata</span>
                  <textarea
                    rows={5}
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
                <span className="pill">{document.slot}</span>
                <span className="pill">{document.cardsGranted.length} granted cards</span>
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
              contentType="gear"
              currentDocument={document}
              buildBundle={(current) => buildGearBundleForTarget(current, "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish gear runtime JSON and icons straight into the Chaos Core repo, then reload live game entries for balancing."
            />
        </>
      )}
    />
  );
}
