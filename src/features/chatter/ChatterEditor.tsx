import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankChatter, createSampleChatter } from "../../data/sampleChatter";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ChatterDocument, ChatterLocation } from "../../types/chatter";
import { chatterLocationLabels, chatterLocations, createChatterId } from "../../types/chatter";
import { validateChatterDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildChatterBundleForTarget } from "../../utils/exporters";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchChatter(document: ChatterDocument): ChatterDocument {
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

function normalizeLocation(value: unknown, fallback: ChatterLocation): ChatterLocation {
  return chatterLocations.includes(value as ChatterLocation) ? (value as ChatterLocation) : fallback;
}

function normalizeChatterDocument(value: unknown): ChatterDocument {
  const fallback = createBlankChatter();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const location = normalizeLocation(record.location, fallback.location);
  const content = readString(record.content, fallback.content);
  const existingId = readString(record.id, "");

  return {
    ...fallback,
    id: existingId || createChatterId(location, content),
    location,
    content,
    aerissResponse: readString(record.aerissResponse, fallback.aerissResponse),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt),
  };
}

function isChatterDocument(value: unknown): value is ChatterDocument {
  return Boolean(value && typeof value === "object" && "location" in value && "content" in value && "aerissResponse" in value);
}

function syncChatterIdentity(current: ChatterDocument, nextLocation: ChatterLocation, nextContent: string): ChatterDocument {
  const previousGeneratedId = createChatterId(current.location, current.content);
  const nextGeneratedId = createChatterId(nextLocation, nextContent);

  return {
    ...current,
    id: !current.id.trim() || current.id === previousGeneratedId ? nextGeneratedId : current.id,
    location: nextLocation,
    content: nextContent,
  };
}

export function ChatterEditor() {
  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: ChatterDocument) => void) {
    try {
      const parsed = normalizeChatterDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
      if (!isChatterDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica chatter format.");
        return;
      }
      setDocument(touchChatter(parsed));
    } catch {
      notify("Could not load the selected chatter entry from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.chatter.document"
      exportTargetKey="technica.chatter.exportTarget"
      draftType="chatter"
      initialDocument={createSampleChatter()}
      createBlank={createBlankChatter}
      createSample={createSampleChatter}
      validate={(document) => validateChatterDocument(normalizeChatterDocument(document))}
      buildBundleForTarget={(document, target) => buildChatterBundleForTarget(normalizeChatterDocument(document), target)}
      getTitle={(document) => {
        const chatter = normalizeChatterDocument(document);
        return `${chatterLocationLabels[chatter.location]} chatter`;
      }}
      isImportPayload={isChatterDocument}
      touchDocument={(document) => touchChatter(normalizeChatterDocument(document))}
      replacePrompt="Replace the current chatter draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica chatter draft or export."
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
        const chatter = normalizeChatterDocument(document);
        const patchChatter = (updater: (current: ChatterDocument) => ChatterDocument) =>
          patchDocument((current) => updater(normalizeChatterDocument(current)));

        return (
          <>
            <Panel
              title="Chatter Editor"
              subtitle="Author ambient chatter for the black market, tavern, and port, including Aeriss's click response."
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
                  <span>Chatter location</span>
                  <select
                    value={chatter.location}
                    onChange={(event) =>
                      patchChatter((current) =>
                        syncChatterIdentity(current, event.target.value as ChatterLocation, current.content)
                      )
                    }
                  >
                    {chatterLocations.map((location) => (
                      <option key={location} value={location}>
                        {chatterLocationLabels[location]}
                      </option>
                    ))}
                  </select>
                  <small className="muted">Internal id: {chatter.id}</small>
                </label>
                <label className="field full">
                  <span>Chatter content</span>
                  <textarea
                    rows={6}
                    value={chatter.content}
                    onChange={(event) =>
                      patchChatter((current) => syncChatterIdentity(current, current.location, event.target.value))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Aeriss response</span>
                  <textarea
                    rows={4}
                    value={chatter.aerissResponse}
                    onChange={(event) =>
                      patchChatter((current) => ({
                        ...current,
                        aerissResponse: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{chatterLocationLabels[chatter.location]}</span>
                  <span className="pill">{chatter.id}</span>
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
              contentType="chatter"
              currentDocument={chatter}
              buildBundle={(current) => buildChatterBundleForTarget(normalizeChatterDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish chatter entries into the Chaos Core repo so black market, tavern, and port chatter can be revised live."
            />
          </>
        );
      }}
    />
  );
}
