import { Panel } from "../../components/Panel";
import { createBlankFieldMod, createSampleFieldMod } from "../../data/sampleFieldMod";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { fieldModRarities, fieldModScopes, type FieldModDocument } from "../../types/fieldmod";
import { isoNow } from "../../utils/date";
import { buildFieldModBundleForTarget } from "../../utils/exporters";
import { validateFieldModDocument } from "../../utils/contentValidation";

function normalizeFieldMod(document: FieldModDocument): FieldModDocument {
  return {
    ...document,
    unlockAfterOperationFloor: Number.isFinite(document.unlockAfterOperationFloor)
      ? document.unlockAfterOperationFloor
      : 0
  };
}

function touchFieldMod(document: FieldModDocument): FieldModDocument {
  return {
    ...normalizeFieldMod(document),
    updatedAt: isoNow()
  };
}

function isFieldModDocument(value: unknown): value is FieldModDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "effects" in value && "scope" in value);
}

export function FieldModEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.fieldmod.document"
      exportTargetKey="technica.fieldmod.exportTarget"
      draftType="fieldmod"
      initialDocument={createSampleFieldMod()}
      createBlank={createBlankFieldMod}
      createSample={createSampleFieldMod}
      validate={(document) => validateFieldModDocument(normalizeFieldMod(document))}
      buildBundleForTarget={(document, target) => buildFieldModBundleForTarget(normalizeFieldMod(document), target)}
      getTitle={(document) => normalizeFieldMod(document).name}
      isImportPayload={isFieldModDocument}
      touchDocument={touchFieldMod}
      replacePrompt="Replace the current field mod draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica field mod draft or export."
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
        const normalizedDocument = normalizeFieldMod(document);

        return (
          <Panel
          title="Field Mods"
          subtitle="Create black-market field mods with name, effects, scope, cost, rarity, and unlock timing."
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
              <span>Field mod id</span>
              <input
                value={normalizedDocument.id}
                onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), id: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                value={normalizedDocument.name}
                onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Scope</span>
              <select
                value={normalizedDocument.scope}
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...normalizeFieldMod(current),
                    scope: event.target.value as FieldModDocument["scope"]
                  }))
                }
              >
                {fieldModScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Rarity</span>
              <select
                value={normalizedDocument.rarity}
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...normalizeFieldMod(current),
                    rarity: event.target.value as FieldModDocument["rarity"]
                  }))
                }
              >
                {fieldModRarities.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cost</span>
              <input
                type="number"
                min={0}
                value={normalizedDocument.cost}
                onChange={(event) =>
                  patchDocument((current) => ({ ...normalizeFieldMod(current), cost: Number(event.target.value || 0) }))
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
                    ...normalizeFieldMod(current),
                    unlockAfterOperationFloor: Number(event.target.value || 0)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Effects</span>
              <textarea
                rows={6}
                value={normalizedDocument.effects}
                onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), effects: event.target.value }))}
              />
            </label>
          </div>

          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{normalizedDocument.scope}</span>
              <span className="pill">{normalizedDocument.rarity}</span>
              <span className="pill">{normalizedDocument.cost} WAD</span>
              <span className="pill">Unlocks after floor {normalizedDocument.unlockAfterOperationFloor}</span>
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
