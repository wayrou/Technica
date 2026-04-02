import { Panel } from "../../components/Panel";
import { createBlankClass, createSampleClass } from "../../data/sampleClass";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import { classUnlockConditionTypes, type ClassDocument, type ClassUnlockConditionDocument } from "../../types/class";
import { supportedWeaponTypes } from "../../types/gear";
import { isoNow } from "../../utils/date";
import { buildClassBundleForTarget } from "../../utils/exporters";
import { validateClassDocument } from "../../utils/contentValidation";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";

function touchClass(document: ClassDocument): ClassDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isClassDocument(value: unknown): value is ClassDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "tier" in value &&
      "weaponTypes" in value &&
      "unlockConditions" in value
  );
}

function createUnlockCondition(): ClassUnlockConditionDocument {
  return {
    type: "milestone",
    description: "Describe the unlock gate"
  };
}

export function ClassEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.class.document"
      exportTargetKey="technica.class.exportTarget"
      draftType="class"
      initialDocument={createSampleClass()}
      createBlank={createBlankClass}
      createSample={createSampleClass}
      validate={validateClassDocument}
      buildBundleForTarget={buildClassBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isClassDocument}
      touchDocument={touchClass}
      replacePrompt="Replace the current class draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica class draft or export."
      previewTitle="Class Preview"
      previewSubtitle="The exported class definition updates live as the form changes."
      renderWorkspace={({ document, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
        <>
          <Panel
            title="Class Setup"
            subtitle="Author new class definitions that drop directly into Chaos Core class management."
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
                <span>Class id</span>
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
              <label className="field">
                <span>Tier</span>
                <select
                  value={document.tier}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      tier: Number(event.target.value) as ClassDocument["tier"]
                    }))
                  }
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
              <label className="field">
                <span>Weapon types</span>
                <input
                  list="technica-weapon-types"
                  value={serializeCommaList(document.weaponTypes)}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      weaponTypes: parseCommaList(event.target.value) as ClassDocument["weaponTypes"]
                    }))
                  }
                />
              </label>
              <label className="field full">
                <span>Innate ability</span>
                <input
                  value={document.innateAbility}
                  onChange={(event) => patchDocument((current) => ({ ...current, innateAbility: event.target.value }))}
                />
              </label>
            </div>

            <div className="subsection">
              <h4>Base Stats</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Max HP</span>
                  <input
                    type="number"
                    value={document.baseStats.maxHp}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        baseStats: {
                          ...current.baseStats,
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
                    value={document.baseStats.atk}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        baseStats: {
                          ...current.baseStats,
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
                    value={document.baseStats.def}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        baseStats: {
                          ...current.baseStats,
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
                    value={document.baseStats.agi}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        baseStats: {
                          ...current.baseStats,
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
                    value={document.baseStats.acc}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        baseStats: {
                          ...current.baseStats,
                          acc: Number(event.target.value || 0)
                        }
                      }))
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
                <span className="pill">Tier {document.tier}</span>
                <span className="pill">{document.unlockConditions.length} unlock(s)</span>
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

          <Panel
            title="Unlock Conditions"
            subtitle="Keep rank gates and milestone descriptors explicit so Chaos Core can surface them in the class directory."
            actions={
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patchDocument((current) => ({
                    ...current,
                    unlockConditions: [...current.unlockConditions, createUnlockCondition()]
                  }))
                }
              >
                Add condition
              </button>
            }
          >
            <div className="stack-list">
              {document.unlockConditions.map((condition, index) => (
                <article key={`${condition.type}-${index}`} className="item-card">
                  <div className="item-card-header">
                    <h3>{condition.type}</h3>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() =>
                        patchDocument((current) => ({
                          ...current,
                          unlockConditions: current.unlockConditions.filter((_, conditionIndex) => conditionIndex !== index)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Type</span>
                      <select
                        value={condition.type}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            unlockConditions: current.unlockConditions.map((entry, conditionIndex) =>
                              conditionIndex === index
                                ? {
                                    ...entry,
                                    type: event.target.value as ClassUnlockConditionDocument["type"]
                                  }
                                : entry
                            )
                          }))
                        }
                      >
                        {classUnlockConditionTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Required class id</span>
                      <input
                        value={condition.requiredClassId ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            unlockConditions: current.unlockConditions.map((entry, conditionIndex) =>
                              conditionIndex === index
                                ? { ...entry, requiredClassId: event.target.value || undefined }
                                : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Required rank</span>
                      <input
                        type="number"
                        value={condition.requiredRank ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            unlockConditions: current.unlockConditions.map((entry, conditionIndex) =>
                              conditionIndex === index
                                ? {
                                    ...entry,
                                    requiredRank: event.target.value === "" ? undefined : Number(event.target.value)
                                  }
                                : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={condition.description ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            unlockConditions: current.unlockConditions.map((entry, conditionIndex) =>
                              conditionIndex === index ? { ...entry, description: event.target.value || undefined } : entry
                            )
                          }))
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <datalist id="technica-weapon-types">
            {supportedWeaponTypes.map((weaponType) => (
              <option key={weaponType} value={weaponType} />
            ))}
          </datalist>
        </>
      )}
    />
  );
}
