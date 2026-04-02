import { useRef, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { EditorKind, ExportBundle, ExportTarget, ValidationIssue } from "../../types/common";
import { confirmAction, notify } from "../../utils/dialogs";
import { createDraftEnvelope, downloadBundle, downloadDraftFile } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";

interface StructuredStudioContext<TDocument> {
  document: TDocument;
  setDocument: Dispatch<SetStateAction<TDocument>>;
  patchDocument: (updater: (current: TDocument) => TDocument) => void;
  exportTarget: ExportTarget;
  setExportTarget: Dispatch<SetStateAction<ExportTarget>>;
  loadSample: () => void;
  clearDocument: () => void;
  importDraft: () => void;
  saveDraft: () => void;
  exportBundle: () => Promise<void>;
}

interface StructuredDocumentStudioProps<TDocument> {
  storageKey: string;
  exportTargetKey: string;
  draftType: EditorKind;
  initialDocument: TDocument;
  createBlank: () => TDocument;
  createSample: () => TDocument;
  validate: (document: TDocument) => ValidationIssue[];
  buildBundleForTarget: (document: TDocument, target: ExportTarget) => Promise<ExportBundle> | ExportBundle;
  getTitle: (document: TDocument) => string;
  isImportPayload: (payload: unknown) => payload is TDocument;
  touchDocument?: (document: TDocument) => TDocument;
  replacePrompt: string;
  invalidImportMessage: string;
  previewTitle: string;
  previewSubtitle: string;
  renderWorkspace: (context: StructuredStudioContext<TDocument>) => ReactNode;
}

export function StructuredDocumentStudio<TDocument>({
  storageKey,
  exportTargetKey,
  draftType,
  initialDocument,
  createBlank,
  createSample,
  validate,
  buildBundleForTarget,
  getTitle,
  isImportPayload,
  touchDocument = (next) => next,
  replacePrompt,
  invalidImportMessage,
  previewTitle,
  previewSubtitle,
  renderWorkspace
}: StructuredDocumentStudioProps<TDocument>) {
  const [document, setDocument] = usePersistentState(storageKey, initialDocument);
  const [exportTarget, setExportTarget] = usePersistentState<ExportTarget>(exportTargetKey, "generic");
  const importRef = useRef<HTMLInputElement | null>(null);
  const issues = validate(document);

  function patchDocument(updater: (current: TDocument) => TDocument) {
    setDocument((current) => touchDocument(updater(current)));
  }

  function loadSample() {
    if (confirmAction("Replace the current draft with the sample document?")) {
      setDocument(touchDocument(createSample()));
    }
  }

  function clearDocument() {
    if (confirmAction("Clear the current draft and replace it with a blank template?")) {
      setDocument(touchDocument(createBlank()));
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await readTextFile(file)) as { payload?: unknown } | unknown;
      const payload = typeof parsed === "object" && parsed !== null && "payload" in parsed ? parsed.payload : parsed;
      if (!isImportPayload(payload)) {
        notify(invalidImportMessage);
      } else if (confirmAction(replacePrompt)) {
        setDocument(touchDocument(payload));
      }
    } catch {
      notify("Could not parse the selected JSON file.");
    }

    event.target.value = "";
  }

  async function exportBundle() {
    try {
      await downloadBundle(await buildBundleForTarget(document, exportTarget));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export the bundle.");
    }
  }

  const context: StructuredStudioContext<TDocument> = {
    document,
    setDocument,
    patchDocument,
    exportTarget,
    setExportTarget,
    loadSample,
    clearDocument,
    importDraft: () => importRef.current?.click(),
    saveDraft: () => downloadDraftFile(draftType, getTitle(document), document),
    exportBundle
  };

  return (
    <div className="workspace-grid blueprint-grid">
      <div className="workspace-column">
        {renderWorkspace(context)}
        <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
      </div>

      <div className="workspace-column">
        <Panel title="Validation" subtitle="Required fields, duplicate ids, and broken references show up here.">
          <IssueList issues={issues} emptyLabel="No validation issues. This content is ready to export." />
        </Panel>

        <Panel title={previewTitle} subtitle={previewSubtitle}>
          <pre className="json-preview tall">{JSON.stringify(document, null, 2)}</pre>
        </Panel>

        <Panel title="Draft Envelope" subtitle="Draft files can be reimported later without losing Technica metadata.">
          <pre className="json-preview">{JSON.stringify(createDraftEnvelope(draftType, document), null, 2)}</pre>
        </Panel>
      </div>
    </div>
  );
}
