import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankCard, createSampleCard } from "../../data/sampleCard";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import {
  cardDocumentCategories,
  cardDocumentRarities,
  cardDocumentTargetTypes,
  cardDocumentTypes,
  type CardDocument,
  type CardEffectDocument
} from "../../types/card";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildCardBundleForTarget } from "../../utils/exporters";
import { validateCardDocument } from "../../utils/contentValidation";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchCard(document: CardDocument): CardDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isCardDocument(value: unknown): value is CardDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "cardType" in value &&
      "effects" in value &&
      "targetType" in value
  );
}

function createEmptyEffect(): CardEffectDocument {
  return {
    type: "def_up",
    amount: 1,
    duration: 1
  };
}

export function CardEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: CardDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isCardDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica card format.");
        return;
      }
      setDocument(touchCard(parsed));
    } catch {
      notify("Could not load the selected card from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.card.document"
      exportTargetKey="technica.card.exportTarget"
      draftType="card"
      initialDocument={createSampleCard()}
      createBlank={createBlankCard}
      createSample={createSampleCard}
      validate={validateCardDocument}
      buildBundleForTarget={buildCardBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isCardDocument}
      touchDocument={touchCard}
      replacePrompt="Replace the current card draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica card draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
        <>
          <Panel
            title="Card Setup"
            subtitle="Define battle card runtime behavior plus the library metadata Chaos Core needs for display and drops."
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
                <span>Card id</span>
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
                  label="Card art"
                  emptyLabel="No card art attached."
                  hint="Exports as a stable asset file for Chaos Core imports."
                  asset={document.artAsset}
                  onChange={(artAsset) => patchDocument((current) => ({ ...current, artAsset }))}
                />
              </div>
              <label className="field">
                <span>Type</span>
                <select
                  value={document.cardType}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      cardType: event.target.value as CardDocument["cardType"]
                    }))
                  }
                >
                  {cardDocumentTypes.map((cardType) => (
                    <option key={cardType} value={cardType}>
                      {cardType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Rarity</span>
                <select
                  value={document.rarity}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      rarity: event.target.value as CardDocument["rarity"]
                    }))
                  }
                >
                  {cardDocumentRarities.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={document.category}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      category: event.target.value as CardDocument["category"]
                    }))
                  }
                >
                  {cardDocumentCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Target</span>
                <select
                  value={document.targetType}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      targetType: event.target.value as CardDocument["targetType"]
                    }))
                  }
                >
                  {cardDocumentTargetTypes.map((targetType) => (
                    <option key={targetType} value={targetType}>
                      {targetType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Strain cost</span>
                <input
                  type="number"
                  value={document.strainCost}
                  onChange={(event) =>
                    patchDocument((current) => ({ ...current, strainCost: Number(event.target.value || 0) }))
                  }
                />
              </label>
              <label className="field">
                <span>Range</span>
                <input
                  type="number"
                  value={document.range}
                  onChange={(event) => patchDocument((current) => ({ ...current, range: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field">
                <span>Damage</span>
                <input
                  type="number"
                  value={document.damage ?? ""}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      damage: event.target.value === "" ? undefined : Number(event.target.value)
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Source class id</span>
                <input
                  value={document.sourceClassId ?? ""}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      sourceClassId: event.target.value || undefined
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Source gear id</span>
                <input
                  value={document.sourceEquipmentId ?? ""}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      sourceEquipmentId: event.target.value || undefined
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

            <div className="toolbar split">
              <div className="chip-row">
                <span className="pill">{document.cardType}</span>
                <span className="pill">{document.effects.length} effect(s)</span>
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
            title="Effects"
            subtitle="Keep effects structured so Chaos Core can register the card without reparsing prose."
            actions={
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patchDocument((current) => ({
                    ...current,
                    effects: [...current.effects, createEmptyEffect()]
                  }))
                }
              >
                Add effect
              </button>
            }
          >
            <div className="stack-list">
              {document.effects.length === 0 ? <div className="empty-state compact">No effects yet.</div> : null}
              {document.effects.map((effect, index) => (
                <article key={`${effect.type}-${index}`} className="item-card">
                  <div className="item-card-header">
                    <h3>{effect.type || `Effect ${index + 1}`}</h3>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() =>
                        patchDocument((current) => ({
                          ...current,
                          effects: current.effects.filter((_, effectIndex) => effectIndex !== index)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Type</span>
                      <input
                        value={effect.type}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            effects: current.effects.map((entry, effectIndex) =>
                              effectIndex === index ? { ...entry, type: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Amount</span>
                      <input
                        type="number"
                        value={effect.amount ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            effects: current.effects.map((entry, effectIndex) =>
                              effectIndex === index
                                ? { ...entry, amount: event.target.value === "" ? undefined : Number(event.target.value) }
                                : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Duration</span>
                      <input
                        type="number"
                        value={effect.duration ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            effects: current.effects.map((entry, effectIndex) =>
                              effectIndex === index
                                ? { ...entry, duration: event.target.value === "" ? undefined : Number(event.target.value) }
                                : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Stat</span>
                      <input
                        value={effect.stat ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            effects: current.effects.map((entry, effectIndex) =>
                              effectIndex === index ? { ...entry, stat: event.target.value || undefined } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Tiles</span>
                      <input
                        type="number"
                        value={effect.tiles ?? ""}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            effects: current.effects.map((entry, effectIndex) =>
                              effectIndex === index
                                ? { ...entry, tiles: event.target.value === "" ? undefined : Number(event.target.value) }
                                : entry
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

          <ChaosCoreDatabasePanel
            contentType="card"
            currentDocument={document}
            buildBundle={(current) => buildCardBundleForTarget(current, "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish card runtime JSON and card art directly into the Chaos Core repo, then reload the live card database here."
          />
        </>
      )}
    />
  );
}
