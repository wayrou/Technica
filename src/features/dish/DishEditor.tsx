import { Panel } from "../../components/Panel";
import { createBlankDish, createSampleDish } from "../../data/sampleDish";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { DishDocument } from "../../types/dish";
import { isoNow } from "../../utils/date";
import { buildDishBundleForTarget } from "../../utils/exporters";
import { validateDishDocument } from "../../utils/contentValidation";
import { parseCommaList, serializeCommaList } from "../../utils/records";

function normalizeDish(document: DishDocument): DishDocument {
  return {
    ...document,
    unlockAfterOperationFloor: Number.isFinite(document.unlockAfterOperationFloor)
      ? document.unlockAfterOperationFloor
      : 0,
    requiredQuestIds: Array.from(new Set((document.requiredQuestIds ?? []).map((entry) => entry.trim()).filter(Boolean)))
  };
}

function touchDish(document: DishDocument): DishDocument {
  return {
    ...normalizeDish(document),
    updatedAt: isoNow()
  };
}

function isDishDocument(value: unknown): value is DishDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "cost" in value && "effect" in value);
}

export function DishEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.dish.document"
      exportTargetKey="technica.dish.exportTarget"
      draftType="dish"
      initialDocument={createSampleDish()}
      createBlank={createBlankDish}
      createSample={createSampleDish}
      validate={(document) => validateDishDocument(normalizeDish(document))}
      buildBundleForTarget={(document, target) => buildDishBundleForTarget(normalizeDish(document), target)}
      getTitle={(document) => normalizeDish(document).name}
      isImportPayload={isDishDocument}
      touchDocument={touchDish}
      replacePrompt="Replace the current dish draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica dish draft or export."
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
      }) => {
        const normalizedDocument = normalizeDish(document);

        return (
          <Panel
          title="Dish Editor"
          subtitle="Create simple tavern or mess-hall dishes with name, cost, unlock timing, effect, and description."
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
              <span>Dish id</span>
              <input
                value={normalizedDocument.id}
                onChange={(event) => patchDocument((current) => ({ ...normalizeDish(current), id: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                value={normalizedDocument.name}
                onChange={(event) => patchDocument((current) => ({ ...normalizeDish(current), name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Cost</span>
              <input
                type="number"
                min={0}
                value={normalizedDocument.cost}
                onChange={(event) =>
                  patchDocument((current) => ({ ...normalizeDish(current), cost: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className="field">
              <span>Unlock after operation floor</span>
              <input
                type="number"
                min={0}
                value={normalizedDocument.unlockAfterOperationFloor}
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...normalizeDish(current),
                    unlockAfterOperationFloor: Number(event.target.value || 0)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Require completed quests</span>
              <input
                value={serializeCommaList(normalizedDocument.requiredQuestIds)}
                placeholder="quest_restore_signal_grid, quest_clear_foundry_gate"
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...normalizeDish(current),
                    requiredQuestIds: parseCommaList(event.target.value)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Effect</span>
              <input
                value={normalizedDocument.effect}
                onChange={(event) => patchDocument((current) => ({ ...normalizeDish(current), effect: event.target.value }))}
              />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea
                rows={4}
                value={normalizedDocument.description}
                onChange={(event) =>
                  patchDocument((current) => ({ ...normalizeDish(current), description: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{normalizedDocument.cost} WAD</span>
              <span className="pill">Unlocks after floor {normalizedDocument.unlockAfterOperationFloor}</span>
              <span className="pill">{normalizedDocument.requiredQuestIds.length} quest gate(s)</span>
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
        );
      }}
    />
  );
}
