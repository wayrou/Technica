import { Panel } from "../../components/Panel";
import { createBlankUnit, createSampleUnit } from "../../data/sampleUnit";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import type { UnitDocument } from "../../types/unit";
import { isoNow } from "../../utils/date";
import { buildUnitBundleForTarget } from "../../utils/exporters";
import { validateUnitDocument } from "../../utils/contentValidation";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";

function touchUnit(document: UnitDocument): UnitDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isUnitDocument(value: unknown): value is UnitDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "currentClassId" in value &&
      "stats" in value &&
      "loadout" in value
  );
}

export function UnitEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.unit.document"
      exportTargetKey="technica.unit.exportTarget"
      draftType="unit"
      initialDocument={createSampleUnit()}
      createBlank={createBlankUnit}
      createSample={createSampleUnit}
      validate={validateUnitDocument}
      buildBundleForTarget={buildUnitBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isUnitDocument}
      touchDocument={touchUnit}
      replacePrompt="Replace the current unit draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica unit draft or export."
      previewTitle="Unit Preview"
      previewSubtitle="The exported unit payload updates live as the form changes."
      renderWorkspace={({ document, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
        <>
          <Panel
            title="Unit Setup"
            subtitle="Create roster-ready unit templates with explicit class, stats, loadout, and staging flags."
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
                <span>Unit id</span>
                <input value={document.id} onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={document.name} onChange={(event) => patchDocument((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Class id</span>
                <input
                  value={document.currentClassId}
                  onChange={(event) => patchDocument((current) => ({ ...current, currentClassId: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>PWR</span>
                <input
                  type="number"
                  value={document.pwr}
                  onChange={(event) => patchDocument((current) => ({ ...current, pwr: Number(event.target.value || 0) }))}
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
              <h4>Stat Profile</h4>
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
                  <span>Recruit cost</span>
                  <input
                    type="number"
                    value={document.recruitCost}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...current, recruitCost: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Traits</span>
                  <input
                    value={serializeCommaList(document.traits)}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        traits: parseCommaList(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Loadout & Staging</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Primary weapon</span>
                  <input
                    value={document.loadout.primaryWeapon}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          primaryWeapon: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Secondary weapon</span>
                  <input
                    value={document.loadout.secondaryWeapon}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          secondaryWeapon: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Helmet</span>
                  <input
                    value={document.loadout.helmet}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          helmet: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Chestpiece</span>
                  <input
                    value={document.loadout.chestpiece}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          chestpiece: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Accessory 1</span>
                  <input
                    value={document.loadout.accessory1}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          accessory1: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Accessory 2</span>
                  <input
                    value={document.loadout.accessory2}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        loadout: {
                          ...current.loadout,
                          accessory2: event.target.value
                        }
                      }))
                    }
                  />
                </label>
                <label className="field field-inline">
                  <span>Starting in roster</span>
                  <input
                    type="checkbox"
                    checked={document.startingInRoster}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...current, startingInRoster: event.target.checked }))
                    }
                  />
                </label>
                <label className="field field-inline">
                  <span>Deploy in party</span>
                  <input
                    type="checkbox"
                    checked={document.deployInParty}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...current, deployInParty: event.target.checked }))
                    }
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
            </div>

            <div className="toolbar split">
              <div className="chip-row">
                <span className="pill">{document.currentClassId}</span>
                <span className="pill">{document.traits.length} trait(s)</span>
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
        </>
      )}
    />
  );
}
