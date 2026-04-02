import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankItem, createSampleItem } from "../../data/sampleItem";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import { itemKinds, type ItemDocument } from "../../types/item";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildItemBundleForTarget } from "../../utils/exporters";
import { validateItemDocument } from "../../utils/contentValidation";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchItem(document: ItemDocument): ItemDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
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

export function ItemEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: ItemDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isItemDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica item format.");
        return;
      }
      setDocument(touchItem(parsed));
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
      validate={validateItemDocument}
      buildBundleForTarget={buildItemBundleForTarget}
      getTitle={(document) => document.name}
      isImportPayload={isItemDocument}
      touchDocument={touchItem}
      replacePrompt="Replace the current item draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica item draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle }) => (
        <>
          <Panel
            title="Item Setup"
            subtitle="Create consumables, resources, or portable equipment payloads that drop straight into Chaos Core storage."
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
                  label="Item icon"
                  emptyLabel="No item icon attached."
                  hint="Exports as a stable asset file for Chaos Core imports."
                  asset={document.iconAsset}
                  onChange={(iconAsset) => patchDocument((current) => ({ ...current, iconAsset }))}
                />
              </div>
              <label className="field">
                <span>Kind</span>
                <select
                  value={document.kind}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      kind: event.target.value as ItemDocument["kind"]
                    }))
                  }
                >
                  {itemKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-inline">
                <span>Stackable</span>
                <input
                  type="checkbox"
                  checked={document.stackable}
                  onChange={(event) => patchDocument((current) => ({ ...current, stackable: event.target.checked }))}
                />
              </label>
              <label className="field">
                <span>Quantity</span>
                <input
                  type="number"
                  min={1}
                  value={document.quantity}
                  onChange={(event) => patchDocument((current) => ({ ...current, quantity: Number(event.target.value || 1) }))}
                />
              </label>
              <label className="field">
                <span>Mass (kg)</span>
                <input
                  type="number"
                  value={document.massKg}
                  onChange={(event) => patchDocument((current) => ({ ...current, massKg: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field">
                <span>Bulk (bu)</span>
                <input
                  type="number"
                  value={document.bulkBu}
                  onChange={(event) => patchDocument((current) => ({ ...current, bulkBu: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field">
                <span>Power (w)</span>
                <input
                  type="number"
                  value={document.powerW}
                  onChange={(event) => patchDocument((current) => ({ ...current, powerW: Number(event.target.value || 0) }))}
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
                <span className="pill">{document.kind}</span>
                <span className="pill">Qty {document.quantity}</span>
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
            contentType="item"
            currentDocument={document}
            buildBundle={(current) => buildItemBundleForTarget(current, "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish item runtime JSON and icons directly into the Chaos Core repo, then reload them here for balance passes."
          />
        </>
      )}
    />
  );
}
