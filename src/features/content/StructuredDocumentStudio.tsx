import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTechnicaRuntime } from "../../hooks/useTechnicaRuntime";
import type { EditorKind, ExportBundle, ExportTarget, ValidationIssue } from "../../types/common";
import { confirmAction, notify } from "../../utils/dialogs";
import { downloadBundle, downloadDraftFile } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "../../utils/mobileProtocol";
import { submitMobileInboxEntry } from "../../utils/mobileSession";
import { TECHNICA_WORKSPACE_COMMAND_EVENT, type WorkspaceCommand } from "../../utils/workspaceShortcuts";

interface StructuredStudioContext<TDocument> {
  document: TDocument;
  setDocument: Dispatch<SetStateAction<TDocument>>;
  patchDocument: (updater: (current: TDocument) => TDocument) => void;
  exportTarget: ExportTarget;
  setExportTarget: Dispatch<SetStateAction<ExportTarget>>;
  isMobile: boolean;
  canSendToDesktop: boolean;
  isSendingToDesktop: boolean;
  loadSample: () => void;
  clearDocument: () => void;
  importDraft: () => void;
  saveDraft: () => void;
  exportBundle: () => Promise<void>;
  sendToDesktop: () => Promise<void>;
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
  getMobileSendSummary?: (document: TDocument) => string;
  replacePrompt: string;
  invalidImportMessage: string;
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
  getMobileSendSummary,
  replacePrompt,
  invalidImportMessage,
  renderWorkspace
}: StructuredDocumentStudioProps<TDocument>) {
  const runtime = useTechnicaRuntime();
  const [document, setDocument] = usePersistentState(storageKey, initialDocument);
  const [exportTarget, setExportTarget] = usePersistentState<ExportTarget>(exportTargetKey, "chaos-core");
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const deferredDocument = useDeferredValue(document);
  const issues = useMemo(() => validate(deferredDocument), [deferredDocument, validate]);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);

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

  async function sendToDesktop() {
    if (!runtime.sessionOrigin || !runtime.pairingToken) {
      notify("Open this editor through the desktop pairing URL before sending content back.");
      return;
    }

    setIsSendingToDesktop(true);
    try {
      const currentDocument = touchDocument(document);
      const inferredContentId =
        typeof currentDocument === "object" &&
        currentDocument !== null &&
        "id" in currentDocument &&
        typeof (currentDocument as { id?: unknown }).id === "string"
          ? (currentDocument as { id: string }).id
          : getTitle(currentDocument);
      const sendResult = await submitMobileInboxEntry({
        sessionOrigin: runtime.sessionOrigin,
        pairingToken: runtime.pairingToken,
        deviceType: runtime.deviceType,
        request: {
          contentType: draftType,
          contentId: inferredContentId,
          title: getTitle(currentDocument),
          summary: getMobileSendSummary?.(currentDocument),
          payload: currentDocument
        }
      });
      notify(sendResult.message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this draft to the desktop inbox.");
    } finally {
      setIsSendingToDesktop(false);
    }
  }

  useEffect(() => {
    function handleMobileInboxOpen(event: Event) {
      const customEvent = event as CustomEvent<{ entry?: MobileInboxEntry }>;
      const entry = customEvent.detail?.entry;

      if (entry?.contentType !== draftType) {
        return;
      }

      if (!isImportPayload(entry.payload)) {
        notify(`The mobile ${draftType} draft could not be loaded because its payload is invalid.`);
        return;
      }

      setDocument(touchDocument(entry.payload));
    }

    if (typeof window !== "undefined") {
      window.addEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
      }
    };
  }, [draftType, isImportPayload, setDocument, touchDocument]);

  useEffect(() => {
    function handleWorkspaceCommand(event: Event) {
      const customEvent = event as CustomEvent<{ command?: WorkspaceCommand }>;
      const command = customEvent.detail?.command;
      if (!command || runtime.isMobile) {
        return;
      }

      if (command === "import-draft") {
        importRef.current?.click();
      }
      if (command === "save-draft") {
        downloadDraftFile(draftType, getTitle(document), document);
      }
      if (command === "export-bundle") {
        void exportBundle();
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener(TECHNICA_WORKSPACE_COMMAND_EVENT, handleWorkspaceCommand);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(TECHNICA_WORKSPACE_COMMAND_EVENT, handleWorkspaceCommand);
      }
    };
  }, [document, draftType, exportBundle, getTitle, runtime.isMobile]);

  const context: StructuredStudioContext<TDocument> = {
    document,
    setDocument,
    patchDocument,
    exportTarget,
    setExportTarget,
    isMobile: runtime.isMobile,
    canSendToDesktop,
    isSendingToDesktop,
    loadSample,
    clearDocument,
    importDraft: () => importRef.current?.click(),
    saveDraft: () => downloadDraftFile(draftType, getTitle(document), document),
    exportBundle,
    sendToDesktop
  };

  return (
    <div className={issues.length > 0 ? "workspace-grid blueprint-grid" : "workspace-grid blueprint-grid validation-collapsed"}>
      <div className="workspace-column">
        {renderWorkspace(context)}
        <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
      </div>

      {issues.length > 0 ? (
        <div className="workspace-column">
          <Panel title="Validation" subtitle="Required fields, duplicate ids, and broken references show up here.">
            <IssueList issues={issues} emptyLabel="No validation issues. This content is ready to export." />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
