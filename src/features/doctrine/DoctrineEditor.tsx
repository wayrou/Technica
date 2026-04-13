import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankDoctrine, createSampleDoctrine } from "../../data/sampleDoctrine";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { DoctrineDocument } from "../../types/doctrine";
import { createDoctrineId, doctrineIntentTags } from "../../types/doctrine";
import { createResourceWalletDocument, resourceKeys, resourceLabels } from "../../types/resources";
import { validateDoctrineDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildDoctrineBundleForTarget } from "../../utils/exporters";
import { parseCommaList, serializeCommaList } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchDoctrine(document: DoctrineDocument): DoctrineDocument {
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

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIntentTags(value: unknown): DoctrineDocument["intentTags"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const selected = new Set(
    value
      .map((entry) => String(entry).trim())
      .filter((entry): entry is DoctrineDocument["intentTags"][number] =>
        doctrineIntentTags.includes(entry as DoctrineDocument["intentTags"][number])
      )
  );

  return doctrineIntentTags.filter((entry) => selected.has(entry));
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
    : [];
}

function normalizeDoctrineDocument(value: unknown): DoctrineDocument {
  const fallback = createBlankDoctrine();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const name = readString(record.name, fallback.name);

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, "") || createDoctrineId(name),
    name,
    shortDescription: readString(record.shortDescription, fallback.shortDescription),
    intentTags: normalizeIntentTags(record.intentTags),
    stabilityModifier: readNumber(record.stabilityModifier, fallback.stabilityModifier),
    strainBias: readNumber(record.strainBias, fallback.strainBias),
    procBias: readNumber(record.procBias, fallback.procBias),
    buildCostModifier: createResourceWalletDocument(
      toRecord(record.buildCostModifier) as Partial<DoctrineDocument["buildCostModifier"]> | null
    ),
    doctrineRules: readString(record.doctrineRules, fallback.doctrineRules),
    description: readString(record.description, fallback.description),
    unlockAfterFloor: readNumber(record.unlockAfterFloor, fallback.unlockAfterFloor),
    requiredQuestIds: normalizeStringList(record.requiredQuestIds),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function isDoctrineDocument(value: unknown): value is DoctrineDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "shortDescription" in value &&
      "intentTags" in value
  );
}

function syncDoctrineIdentity(current: DoctrineDocument, nextName: string) {
  const previousGeneratedId = createDoctrineId(current.name);
  const nextGeneratedId = createDoctrineId(nextName.trim() || current.name);

  return {
    ...current,
    id: !current.id.trim() || current.id === previousGeneratedId ? nextGeneratedId : current.id,
    name: nextName
  };
}

function toggleIntentTagSelection(
  currentTags: DoctrineDocument["intentTags"],
  tag: DoctrineDocument["intentTags"][number]
): DoctrineDocument["intentTags"] {
  const selected = new Set(currentTags);
  if (selected.has(tag)) {
    selected.delete(tag);
  } else {
    selected.add(tag);
  }

  return doctrineIntentTags.filter((entry) => selected.has(entry));
}

function formatIntentTagLabel(tag: string) {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: DoctrineDocument) => void) {
  try {
    const parsed = normalizeDoctrineDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isDoctrineDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica doctrine format.");
      return;
    }
    setDocument(touchDoctrine(parsed));
  } catch {
    notify("Could not load the selected doctrine from the Chaos Core database.");
  }
}

export function DoctrineEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.doctrine.document"
      exportTargetKey="technica.doctrine.exportTarget"
      draftType="doctrine"
      initialDocument={createSampleDoctrine()}
      createBlank={createBlankDoctrine}
      createSample={createSampleDoctrine}
      validate={(document) => validateDoctrineDocument(normalizeDoctrineDocument(document))}
      buildBundleForTarget={(document, target) => buildDoctrineBundleForTarget(normalizeDoctrineDocument(document), target)}
      getTitle={(document) => normalizeDoctrineDocument(document).name}
      isImportPayload={isDoctrineDocument}
      touchDocument={(document) => touchDoctrine(normalizeDoctrineDocument(document))}
      replacePrompt="Replace the current doctrine draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica doctrine draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => {
        const doctrine = normalizeDoctrineDocument(document);
        const patchDoctrine = (updater: (current: DoctrineDocument) => DoctrineDocument) =>
          patchDocument((current) => touchDoctrine(normalizeDoctrineDocument(updater(normalizeDoctrineDocument(current)))));

        return (
          <>
            <Panel
              title="Doctrine Editor"
              subtitle="Author doctrine behavior profiles, cost modifiers, and unlock/shop gates for the gear workbench."
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
                    value={doctrine.name}
                    onChange={(event) => patchDoctrine((current) => syncDoctrineIdentity(current, event.target.value))}
                  />
                  <small className="muted">Internal id: {doctrine.id}</small>
                </label>
                <label className="field">
                  <span>Unlock after floor</span>
                  <input
                    type="number"
                    value={doctrine.unlockAfterFloor}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        unlockAfterFloor: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Short description</span>
                  <input
                    value={doctrine.shortDescription}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        shortDescription: event.target.value
                      }))
                    }
                  />
                </label>
                <div className="field full">
                  <span>Intent tags</span>
                  <div className="chip-row">
                    {doctrineIntentTags.map((tag) => {
                      const selected = doctrine.intentTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={selected ? "pill pill-button accent" : "pill pill-button"}
                          onClick={() =>
                            patchDoctrine((current) => ({
                              ...current,
                              intentTags: toggleIntentTagSelection(current.intentTags, tag)
                            }))
                          }
                        >
                          {formatIntentTagLabel(tag)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="field">
                  <span>Stability modifier</span>
                  <input
                    type="number"
                    value={doctrine.stabilityModifier}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        stabilityModifier: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Strain bias</span>
                  <input
                    type="number"
                    step="0.05"
                    value={doctrine.strainBias}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        strainBias: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Proc bias</span>
                  <input
                    type="number"
                    step="0.05"
                    value={doctrine.procBias}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        procBias: Number(event.target.value || 0)
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Doctrine rules</span>
                  <textarea
                    rows={4}
                    value={doctrine.doctrineRules}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        doctrineRules: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Description</span>
                  <textarea
                    rows={5}
                    value={doctrine.description}
                    onChange={(event) =>
                      patchDoctrine((current) => ({
                        ...current,
                        description: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="subsection">
                <h4>Build Cost Modifier</h4>
                <div className="form-grid">
                  {resourceKeys.map((resourceKey) => (
                    <label key={resourceKey} className="field">
                      <span>{resourceLabels[resourceKey]}</span>
                      <input
                        type="number"
                        value={doctrine.buildCostModifier[resourceKey]}
                        onChange={(event) =>
                          patchDoctrine((current) => ({
                            ...current,
                            buildCostModifier: {
                              ...current.buildCostModifier,
                              [resourceKey]: Number(event.target.value || 0)
                            }
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="subsection">
                <h4>Unlock Requirements</h4>
                <div className="form-grid">
                  <label className="field full">
                    <span>Required completed quests</span>
                    <input
                      value={serializeCommaList(doctrine.requiredQuestIds)}
                      placeholder="quest_restore_signal_grid, quest_secure_foundry"
                      onChange={(event) =>
                        patchDoctrine((current) => ({
                          ...current,
                          requiredQuestIds: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{doctrine.intentTags.length} intent tag(s)</span>
                  <span className="pill">{doctrine.stabilityModifier >= 0 ? "+" : ""}{doctrine.stabilityModifier} stability</span>
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
              contentType="doctrine"
              currentDocument={doctrine}
              buildBundle={(current) => buildDoctrineBundleForTarget(normalizeDoctrineDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish doctrine definitions into the Chaos Core repo and reopen those built-in or generated records here for revision."
            />
          </>
        );
      }}
    />
  );
}
