import { createBlankOperation, createSampleOperation } from "../../data/sampleOperation";
import type { ExportTarget } from "../../types/common";
import { normalizeOperationDocument, type OperationDocument } from "../../types/operation";
import { validateOperationDocument } from "../../utils/contentValidation";
import { buildOperationBundleForTarget } from "../../utils/exporters";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { OperationWorkspace } from "./OperationWorkspace";
import { isOperationDocument, touchOperation } from "./operationEditorUtils";

export function OperationEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.operation.document"
      exportTargetKey="technica.operation.exportTarget"
      draftType="operation"
      initialDocument={createSampleOperation()}
      createBlank={createBlankOperation}
      createSample={createSampleOperation}
      validate={(document: OperationDocument) => validateOperationDocument(normalizeOperationDocument(document))}
      buildBundleForTarget={(document: OperationDocument, target: ExportTarget) =>
        buildOperationBundleForTarget(normalizeOperationDocument(document), target)
      }
      getTitle={(document: OperationDocument) => normalizeOperationDocument(document).codename}
      isImportPayload={isOperationDocument}
      touchDocument={touchOperation}
      replacePrompt="Replace the current operation draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica operation draft or export."
      renderWorkspace={(context) => <OperationWorkspace {...context} />}
    />
  );
}
