import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankFaction, createSampleFaction } from "../../data/sampleFaction";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { FactionDocument } from "../../types/faction";
import { createFactionId } from "../../types/faction";
import { validateFactionDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildFactionBundleForTarget } from "../../utils/exporters";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchFaction(document: FactionDocument): FactionDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeFactionDocument(value: unknown): FactionDocument {
  const fallback = createBlankFaction();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const name = readString(record.name, fallback.name);
  const existingId = readString(record.id, "");

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: existingId || createFactionId(name),
    name,
    description: readString(record.description, fallback.description),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function isFactionDocument(value: unknown): value is FactionDocument {
  return Boolean(value && typeof value === "object" && "name" in value && "description" in value);
}

function syncFactionIdentity(current: FactionDocument, nextName: string): FactionDocument {
  const trimmedName = nextName.trim();
  const previousGeneratedId = createFactionId(current.name);
  const nextGeneratedId = createFactionId(trimmedName || current.name);

  return {
    ...current,
    id: !current.id.trim() || current.id === previousGeneratedId ? nextGeneratedId : current.id,
    name: nextName
  };
}

export function FactionEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: FactionDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isFactionDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica faction format.");
        return;
      }
      setDocument(touchFaction(normalizeFactionDocument(parsed)));
    } catch {
      notify("Could not load the selected faction from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.faction.document"
      exportTargetKey="technica.faction.exportTarget"
      draftType="faction"
      initialDocument={createSampleFaction()}
      createBlank={createBlankFaction}
      createSample={createSampleFaction}
      validate={(document) => validateFactionDocument(normalizeFactionDocument(document))}
      buildBundleForTarget={(document, target) => buildFactionBundleForTarget(normalizeFactionDocument(document), target)}
      getTitle={(document) => normalizeFactionDocument(document).name}
      isImportPayload={isFactionDocument}
      touchDocument={(document) => touchFaction(normalizeFactionDocument(document))}
      replacePrompt="Replace the current faction draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica faction draft or export."
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
        sendToDesktop
      }) => {
        const faction = normalizeFactionDocument(document);
        const patchFaction = (updater: (current: FactionDocument) => FactionDocument) =>
          patchDocument((current) => updater(normalizeFactionDocument(current)));

        return (
          <>
            <Panel
              title="Faction Editor"
              subtitle="Author faction definitions for Chaos Core and reuse them across units, field enemies, and NPCs."
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
                  <span>Name</span>
                  <input
                    value={faction.name}
                    onChange={(event) => patchFaction((current) => syncFactionIdentity(current, event.target.value))}
                  />
                  <small className="muted">Internal id: {faction.id}</small>
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={6}
                    value={faction.description}
                    onChange={(event) =>
                      patchFaction((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{faction.id}</span>
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
              contentType="faction"
              currentDocument={faction}
              buildBundle={(current) => buildFactionBundleForTarget(normalizeFactionDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish faction definitions into the Chaos Core repo and reopen them here for naming and lore updates."
            />
          </>
        );
      }}
    />
  );
}
