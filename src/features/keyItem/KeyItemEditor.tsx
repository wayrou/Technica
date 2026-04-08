import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankKeyItem, createSampleKeyItem } from "../../data/sampleKeyItem";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { KeyItemDocument } from "../../types/keyItem";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildKeyItemBundleForTarget } from "../../utils/exporters";
import { validateKeyItemDocument } from "../../utils/contentValidation";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchKeyItem(document: KeyItemDocument): KeyItemDocument {
  return {
    ...document,
    updatedAt: isoNow(),
  };
}

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeKeyItemDocument(value: unknown): KeyItemDocument {
  const fallback = createBlankKeyItem();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    iconAsset:
      record.iconAsset && typeof record.iconAsset === "object"
        ? (record.iconAsset as KeyItemDocument["iconAsset"])
        : undefined,
    iconPath: readString(record.iconPath, fallback.iconPath ?? ""),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt),
  };
}

function isKeyItemDocument(value: unknown): value is KeyItemDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "name" in value && "description" in value);
}

export function KeyItemEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: KeyItemDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isKeyItemDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica key item format.");
        return;
      }
      setDocument(touchKeyItem(normalizeKeyItemDocument(parsed)));
    } catch {
      notify("Could not load the selected key item from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.keyItem.document"
      exportTargetKey="technica.keyItem.exportTarget"
      draftType="key_item"
      initialDocument={createSampleKeyItem()}
      createBlank={createBlankKeyItem}
      createSample={createSampleKeyItem}
      validate={(document) => validateKeyItemDocument(normalizeKeyItemDocument(document))}
      buildBundleForTarget={(document, target) => buildKeyItemBundleForTarget(normalizeKeyItemDocument(document), target)}
      getTitle={(document) => normalizeKeyItemDocument(document).name}
      isImportPayload={isKeyItemDocument}
      touchDocument={(document) => touchKeyItem(normalizeKeyItemDocument(document))}
      replacePrompt="Replace the current key item draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica key item draft or export."
      renderWorkspace={({
        document,
        setDocument,
        patchDocument,
        loadSample,
        clearDocument,
        importDraft,
        saveDraft,
        exportBundle,
        isMobile,
        canSendToDesktop,
        isSendingToDesktop,
        sendToDesktop,
      }) => {
        const keyItem = normalizeKeyItemDocument(document);
        const patchKeyItem = (updater: (current: KeyItemDocument) => KeyItemDocument) =>
          patchDocument((current) => updater(normalizeKeyItemDocument(current)));

        return (
          <>
            <Panel
              title="Key Item Editor"
              subtitle="Author quest-only inventory items for Chaos Core, including the name, description, and icon."
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
                  <span>Key item id</span>
                  <input
                    value={keyItem.id}
                    onChange={(event) => patchKeyItem((current) => ({ ...current, id: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={keyItem.name}
                    onChange={(event) => patchKeyItem((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={5}
                    value={keyItem.description}
                    onChange={(event) =>
                      patchKeyItem((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </label>
                <div className="field full">
                  <ImageAssetField
                    label="Key item icon"
                    emptyLabel="No key item icon attached."
                    hint="Exports as a stable asset file for Chaos Core inventory rendering."
                    asset={keyItem.iconAsset}
                    onChange={(iconAsset) => patchKeyItem((current) => ({ ...current, iconAsset }))}
                  />
                </div>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">quest item</span>
                  {keyItem.iconAsset ? <span className="pill">{keyItem.iconAsset.fileName}</span> : null}
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

            <ChaosCoreDatabasePanel
              contentType="key_item"
              currentDocument={keyItem}
              buildBundle={(current) => buildKeyItemBundleForTarget(normalizeKeyItemDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish key item runtime JSON and icons into the Chaos Core repo, then reopen them here for quest-flow tuning."
            />
          </>
        );
      }}
    />
  );
}
