import { useRef } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankOperation, createSampleOperation } from "../../data/sampleOperation";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import { type OperationDocument } from "../../types/operation";
import { isoNow } from "../../utils/date";
import { buildOperationBundleForTarget } from "../../utils/exporters";
import { validateOperationDocument } from "../../utils/contentValidation";
import { notify } from "../../utils/dialogs";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchOperation(document: OperationDocument): OperationDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isOperationDocument(value: unknown): value is OperationDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "codename" in value &&
      "floors" in value &&
      Array.isArray((value as { floors: unknown[] }).floors)
  );
}

export function OperationEditor() {
  const floorJsonRef = useRef<HTMLTextAreaElement | null>(null);

  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: OperationDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isOperationDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica operation format.");
        return;
      }
      setDocument(touchOperation(parsed));
    } catch {
      notify("Could not load the selected operation from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.operation.document"
      exportTargetKey="technica.operation.exportTarget"
      draftType="operation"
      initialDocument={createSampleOperation()}
      createBlank={createBlankOperation}
      createSample={createSampleOperation}
      validate={validateOperationDocument}
      buildBundleForTarget={buildOperationBundleForTarget}
      getTitle={(document) => document.codename}
      isImportPayload={isOperationDocument}
      touchDocument={touchOperation}
      replacePrompt="Replace the current operation draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica operation draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => (
        <>
            <Panel
              title="Operation Setup"
              subtitle="Author direct-run Chaos Core operations with explicit floor graphs and room metadata."
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
                  <span>Operation id</span>
                  <input value={document.id} onChange={(event) => patchDocument((current) => ({ ...current, id: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Codename</span>
                  <input
                    value={document.codename}
                    onChange={(event) => patchDocument((current) => ({ ...current, codename: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Recommended power</span>
                  <input
                    type="number"
                    value={document.recommendedPower}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...current,
                        recommendedPower: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Floor count</span>
                  <input value={document.floors.length} disabled />
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={document.description}
                    onChange={(event) => patchDocument((current) => ({ ...current, description: event.target.value }))}
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

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{document.floors.length} floor(s)</span>
                  <span className="pill">
                    {document.floors.reduce((total, floor) => total + floor.rooms.length, 0)} room(s)
                  </span>
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

            <Panel
              title="Floors & Rooms JSON"
              subtitle="Edit the floor graph as JSON for now. This keeps the exporter flexible while we wire the rest of the integration."
              actions={
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    try {
                      const raw = floorJsonRef.current?.value ?? "";
                      const parsed = JSON.parse(raw) as OperationDocument["floors"];
                      if (!Array.isArray(parsed)) {
                        notify("Floor JSON must be an array.");
                        return;
                      }
                      patchDocument((current) => ({
                        ...current,
                        floors: parsed
                      }));
                    } catch (error) {
                      notify(error instanceof Error ? error.message : "Could not parse floor JSON.");
                    }
                  }}
                >
                  Apply floor JSON
                </button>
              }
            >
              <textarea
                key={document.updatedAt}
                ref={floorJsonRef}
                className="authoring-editor compact-editor"
              defaultValue={JSON.stringify(document.floors, null, 2)}
            />
          </Panel>

          <ChaosCoreDatabasePanel
            contentType="operation"
            currentDocument={document}
            buildBundle={(current) => buildOperationBundleForTarget(current, "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish operations into the Chaos Core repo and reopen those stored records here for layout and balance revisions."
          />
        </>
      )}
    />
  );
}
