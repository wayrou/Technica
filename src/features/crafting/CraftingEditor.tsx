import { Panel } from "../../components/Panel";
import { createBlankCraftingRecipe, createSampleCraftingRecipe } from "../../data/sampleCrafting";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import {
  craftingCategories,
  recipeAcquisitionMethods,
  type CraftingDocument,
  type RecipeAcquisitionMethod
} from "../../types/crafting";
import { isoNow } from "../../utils/date";
import { buildCraftingBundleForTarget } from "../../utils/exporters";
import { validateCraftingDocument } from "../../utils/contentValidation";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";

function touchCraftingRecipe(document: CraftingDocument): CraftingDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isCraftingDocument(value: unknown): value is CraftingDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "cost" in value && "grants" in value);
}

export function CraftingEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.crafting.document"
      exportTargetKey="technica.crafting.exportTarget"
      draftType="crafting"
      initialDocument={createSampleCraftingRecipe()}
      createBlank={createBlankCraftingRecipe}
      createSample={createSampleCraftingRecipe}
      validate={validateCraftingDocument}
      buildBundleForTarget={buildCraftingBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isCraftingDocument}
      touchDocument={touchCraftingRecipe}
      replacePrompt="Replace the current crafting recipe draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica crafting recipe draft or export."
      renderWorkspace={({
        document,
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
      }) => (
        <Panel
          title="Crafting Editor"
          subtitle="Author armor, consumable, and upgrade recipes, define how players learn them, and control which items they grant on craft."
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
              <span>Recipe id</span>
              <input value={document.id} onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))} />
            </label>
            <label className="field">
              <span>Name</span>
              <input value={document.name} onChange={(event) => patchDocument((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={document.category}
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...current,
                    category: event.target.value as CraftingDocument["category"]
                  }))
                }
              >
                {craftingCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Requires base item</span>
              <input
                value={document.requiresItemId}
                placeholder={document.category === "upgrade" ? "armor_steelplate_cuirass" : "Optional"}
                onChange={(event) => patchDocument((current) => ({ ...current, requiresItemId: event.target.value }))}
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
            <h4>Resource Cost</h4>
            <div className="form-grid">
              <label className="field">
                <span>Metal scrap</span>
                <input
                  type="number"
                  min={0}
                  value={document.cost.metalScrap}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      cost: {
                        ...current.cost,
                        metalScrap: Number(event.target.value || 0)
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Wood</span>
                <input
                  type="number"
                  min={0}
                  value={document.cost.wood}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      cost: {
                        ...current.cost,
                        wood: Number(event.target.value || 0)
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Chaos shards</span>
                <input
                  type="number"
                  min={0}
                  value={document.cost.chaosShards}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      cost: {
                        ...current.cost,
                        chaosShards: Number(event.target.value || 0)
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Steam components</span>
                <input
                  type="number"
                  min={0}
                  value={document.cost.steamComponents}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      cost: {
                        ...current.cost,
                        steamComponents: Number(event.target.value || 0)
                      }
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="subsection">
            <h4>Crafted Grants</h4>
            <div className="stack-list">
              {document.grants.map((grant, index) => (
                <div key={`${grant.itemId}-${index}`} className="nested-card">
                  <div className="form-grid">
                    <label className="field">
                      <span>Granted item id</span>
                      <input
                        value={grant.itemId}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            grants: current.grants.map((entry, grantIndex) =>
                              grantIndex === index ? { ...entry, itemId: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Quantity</span>
                      <input
                        type="number"
                        min={1}
                        value={grant.quantity}
                        onChange={(event) =>
                          patchDocument((current) => ({
                            ...current,
                            grants: current.grants.map((entry, grantIndex) =>
                              grantIndex === index ? { ...entry, quantity: Number(event.target.value || 1) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="toolbar">
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() =>
                        patchDocument((current) => ({
                          ...current,
                          grants: current.grants.length === 1
                            ? current.grants
                            : current.grants.filter((_, grantIndex) => grantIndex !== index)
                        }))
                      }
                      disabled={document.grants.length === 1}
                    >
                      Remove grant
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patchDocument((current) => ({
                    ...current,
                    grants: [...current.grants, { itemId: "", quantity: 1 }]
                  }))
                }
              >
                Add crafted grant
              </button>
            </div>
          </div>

          <div className="subsection">
            <h4>How Players Learn This Recipe</h4>
            <div className="form-grid">
              <label className="field">
                <span>Acquisition</span>
                <select
                  value={document.acquisitionMethod}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      acquisitionMethod: event.target.value as RecipeAcquisitionMethod
                    }))
                  }
                >
                  {recipeAcquisitionMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Purchase vendor</span>
                <input
                  value={document.purchaseVendor}
                  disabled={document.acquisitionMethod !== "purchased"}
                  placeholder="haven_shop"
                  onChange={(event) => patchDocument((current) => ({ ...current, purchaseVendor: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Purchase cost (WAD)</span>
                <input
                  type="number"
                  min={0}
                  disabled={document.acquisitionMethod !== "purchased"}
                  value={document.purchaseCostWad}
                  onChange={(event) =>
                    patchDocument((current) => ({ ...current, purchaseCostWad: Number(event.target.value || 0) }))
                  }
                />
              </label>
              <label className="field">
                <span>Unlock after floor</span>
                <input
                  type="number"
                  min={0}
                  disabled={document.acquisitionMethod !== "unlock_floor"}
                  value={document.unlockFloor}
                  onChange={(event) =>
                    patchDocument((current) => ({ ...current, unlockFloor: Number(event.target.value || 0) }))
                  }
                />
              </label>
              <label className="field full">
                <span>Acquisition notes</span>
                <textarea
                  rows={3}
                  value={document.notes}
                  onChange={(event) => patchDocument((current) => ({ ...current, notes: event.target.value }))}
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
              <span className="pill">{document.category}</span>
              <span className="pill">{document.grants.length} grant(s)</span>
              <span className="pill">{document.acquisitionMethod}</span>
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
      )}
    />
  );
}
