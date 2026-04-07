import { useEffect, useMemo, useState } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankMail, createSampleMail } from "../../data/sampleMail";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import type { ExportTarget } from "../../types/common";
import type { MailCategory, MailDocument } from "../../types/mail";
import { mailCategories } from "../../types/mail";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateMailDocument } from "../../utils/contentValidation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildMailBundleForTarget } from "../../utils/exporters";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";

type RequirementOption = {
  id: string;
  name: string;
};

function sanitizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
}

function normalizeMailDocument(document: Partial<MailDocument> | null | undefined): MailDocument {
  const fallback = createBlankMail();
  const candidate = document ?? {};

  return {
    ...fallback,
    ...candidate,
    category: mailCategories.includes(candidate.category as MailCategory)
      ? (candidate.category as MailCategory)
      : fallback.category,
    unlockAfterFloor: Number.isFinite(candidate.unlockAfterFloor)
      ? Number(candidate.unlockAfterFloor)
      : fallback.unlockAfterFloor,
    requiredDialogueIds: sanitizeIdList(candidate.requiredDialogueIds),
    requiredGearIds: sanitizeIdList(candidate.requiredGearIds),
    requiredItemIds: sanitizeIdList(candidate.requiredItemIds),
    requiredSchemaIds: sanitizeIdList(candidate.requiredSchemaIds),
    requiredFieldModIds: sanitizeIdList(candidate.requiredFieldModIds)
  };
}

function touchMail(document: MailDocument): MailDocument {
  return {
    ...normalizeMailDocument(document),
    updatedAt: isoNow()
  };
}

function isMailDocument(value: unknown): value is MailDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "sender" in value &&
      "subject" in value &&
      "content" in value
  );
}

function addRequirement(values: string[], nextValue: string) {
  const trimmed = nextValue.trim();
  if (!trimmed) {
    return values;
  }

  return values.includes(trimmed) ? values : [...values, trimmed];
}

function countMailPages(content: string) {
  const pages = content
    .split(/\r?\n\s*\r?\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (pages.length > 0) {
    return pages.length;
  }

  return content.trim() ? 1 : 0;
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: MailDocument) => void) {
  try {
    const parsed = normalizeMailDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isMailDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica mail format.");
      return;
    }
    setDocument(touchMail(parsed));
  } catch {
    notify("Could not load the selected mail entry from the Chaos Core database.");
  }
}

interface RequirementSectionProps {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  options: RequirementOption[];
  selectedIds: string[];
  onAdd: (nextId: string) => void;
  onRemove: (id: string) => void;
}

function RequirementSection({
  label,
  placeholder,
  value,
  onValueChange,
  options,
  selectedIds,
  onAdd,
  onRemove
}: RequirementSectionProps) {
  const selectedSet = new Set(selectedIds);

  return (
    <div className="subsection">
      <h4>{label}</h4>
      <div className="form-grid">
        <label className="field full">
          <span>{placeholder}</span>
          <select
            value={value}
            onChange={(event) => {
              const nextId = event.target.value;
              onValueChange(nextId);
              if (nextId) {
                onAdd(nextId);
                onValueChange("");
              }
            }}
          >
            <option value="">Select...</option>
            {options.map((option) => (
              <option key={option.id} value={option.id} disabled={selectedSet.has(option.id)}>
                {option.name} ({option.id})
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedIds.length > 0 ? (
        <div className="chip-row">
          {selectedIds.map((id) => (
            <button key={id} type="button" className="pill pill-button" onClick={() => onRemove(id)}>
              {id} x
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No requirements set.</p>
      )}
    </div>
  );
}

export function MailEditor() {
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries } = useChaosCoreDatabase();
  const [pendingDialogueId, setPendingDialogueId] = useState("");
  const [pendingGearId, setPendingGearId] = useState("");
  const [pendingItemId, setPendingItemId] = useState("");
  const [pendingSchemaId, setPendingSchemaId] = useState("");
  const [pendingFieldModId, setPendingFieldModId] = useState("");

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void Promise.all([
      ensureSummaries("dialogue"),
      ensureSummaries("gear"),
      ensureSummaries("item"),
      ensureSummaries("schema"),
      ensureSummaries("fieldmod")
    ]);
  }, [desktopEnabled, ensureSummaries, repoPath]);

  const dialogueOptions = useMemo(
    () =>
      summaryStates.dialogue.entries
        .map((entry) => ({ id: entry.contentId, name: entry.title.trim() || entry.contentId }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.dialogue.entries]
  );
  const gearOptions = useMemo(
    () =>
      summaryStates.gear.entries
        .map((entry) => ({ id: entry.contentId, name: entry.title.trim() || entry.contentId }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.gear.entries]
  );
  const itemOptions = useMemo(
    () =>
      summaryStates.item.entries
        .map((entry) => ({ id: entry.contentId, name: entry.title.trim() || entry.contentId }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.item.entries]
  );
  const schemaOptions = useMemo(
    () =>
      summaryStates.schema.entries
        .map((entry) => ({ id: entry.contentId, name: entry.title.trim() || entry.contentId }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.schema.entries]
  );
  const fieldModOptions = useMemo(
    () =>
      summaryStates.fieldmod.entries
        .map((entry) => ({ id: entry.contentId, name: entry.title.trim() || entry.contentId }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.fieldmod.entries]
  );

  return (
    <StructuredDocumentStudio
      storageKey="technica.mail.document"
      exportTargetKey="technica.mail.exportTarget"
      draftType="mail"
      initialDocument={createSampleMail()}
      createBlank={createBlankMail}
      createSample={createSampleMail}
      validate={(document) => validateMailDocument(normalizeMailDocument(document))}
      buildBundleForTarget={(document, target) => buildMailBundleForTarget(normalizeMailDocument(document), target)}
      getTitle={(document) => normalizeMailDocument(document).subject}
      isImportPayload={isMailDocument}
      touchDocument={touchMail}
      replacePrompt="Replace the current mail draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica mail draft or export."
      renderWorkspace={({
        document,
        setDocument,
        patchDocument,
        exportTarget,
        setExportTarget,
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
        const mail = normalizeMailDocument(document);

        return (
          <>
            <Panel
              title="Mail Editor"
              subtitle="Author mailbox messages for Chaos Core, including sender identity, readable message pages, and unlock gates."
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
                  <span>Mail id</span>
                  <input
                    value={mail.id}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeMailDocument(current), id: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Sender</span>
                  <input
                    value={mail.sender}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeMailDocument(current), sender: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Subject</span>
                  <input
                    value={mail.subject}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeMailDocument(current), subject: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <select
                    value={mail.category}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...normalizeMailDocument(current),
                        category: event.target.value as MailCategory
                      }))
                    }
                  >
                    {mailCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Mail content</span>
                  <textarea
                    rows={10}
                    value={mail.content}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeMailDocument(current), content: event.target.value }))
                    }
                  />
                </label>
              </div>

              <p className="muted">Separate pages with a blank line if the mailbox viewer should paginate the message.</p>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{mail.category}</span>
                  <span className="pill">{countMailPages(mail.content)} page(s)</span>
                  <span className="pill">Unlock floor {mail.unlockAfterFloor}</span>
                  <span className="pill">{mail.requiredDialogueIds.length} dialogue gate(s)</span>
                  <span className="pill">{mail.requiredGearIds.length} gear gate(s)</span>
                  <span className="pill">{mail.requiredItemIds.length} item gate(s)</span>
                  <span className="pill">{mail.requiredSchemaIds.length} schema gate(s)</span>
                  <span className="pill">{mail.requiredFieldModIds.length} field mod gate(s)</span>
                  <span className="pill accent">Mailbox export</span>
                </div>
                <div className="toolbar">
                  <label className="inline-select">
                    <span>Export target</span>
                    <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}>
                      <option value="generic">Generic</option>
                      <option value="chaos-core">Chaos Core</option>
                    </select>
                  </label>
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
              title="Unlock Conditions"
              subtitle="Gate mailbox delivery behind progression, completed dialogue, and owned Chaos Core content."
            >
              <div className="subsection">
                <h4>Floor Gate</h4>
                <div className="form-grid">
                  <label className="field">
                    <span>Unlock after floor reached</span>
                    <input
                      type="number"
                      min={0}
                      value={mail.unlockAfterFloor}
                      onChange={(event) =>
                        patchDocument((current) => ({
                          ...normalizeMailDocument(current),
                          unlockAfterFloor: Number(event.target.value || 0)
                        }))
                      }
                    />
                  </label>
                </div>
                <p className="muted">Set this to `0` if the message should not wait on floor progression.</p>
              </div>

              <RequirementSection
                label="Require completed dialogue"
                placeholder="Add dialogue requirement"
                value={pendingDialogueId}
                onValueChange={setPendingDialogueId}
                options={dialogueOptions}
                selectedIds={mail.requiredDialogueIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredDialogueIds: addRequirement(normalizeMailDocument(current).requiredDialogueIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredDialogueIds: normalizeMailDocument(current).requiredDialogueIds.filter(
                      (entry) => entry !== id
                    )
                  }))
                }
              />

              <RequirementSection
                label="Require owned gear"
                placeholder="Add gear requirement"
                value={pendingGearId}
                onValueChange={setPendingGearId}
                options={gearOptions}
                selectedIds={mail.requiredGearIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredGearIds: addRequirement(normalizeMailDocument(current).requiredGearIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredGearIds: normalizeMailDocument(current).requiredGearIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned items"
                placeholder="Add item requirement"
                value={pendingItemId}
                onValueChange={setPendingItemId}
                options={itemOptions}
                selectedIds={mail.requiredItemIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredItemIds: addRequirement(normalizeMailDocument(current).requiredItemIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredItemIds: normalizeMailDocument(current).requiredItemIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned schema"
                placeholder="Add schema requirement"
                value={pendingSchemaId}
                onValueChange={setPendingSchemaId}
                options={schemaOptions}
                selectedIds={mail.requiredSchemaIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredSchemaIds: addRequirement(normalizeMailDocument(current).requiredSchemaIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredSchemaIds: normalizeMailDocument(current).requiredSchemaIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned field mods"
                placeholder="Add field mod requirement"
                value={pendingFieldModId}
                onValueChange={setPendingFieldModId}
                options={fieldModOptions}
                selectedIds={mail.requiredFieldModIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredFieldModIds: addRequirement(normalizeMailDocument(current).requiredFieldModIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeMailDocument(current),
                    requiredFieldModIds: normalizeMailDocument(current).requiredFieldModIds.filter(
                      (entry) => entry !== id
                    )
                  }))
                }
              />
            </Panel>

            <ChaosCoreDatabasePanel
              contentType="mail"
              currentDocument={mail}
              buildBundle={(current) => buildMailBundleForTarget(normalizeMailDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish mailbox entries into Chaos Core and reopen those records here for sender, subject, content, and unlock tuning."
            />
          </>
        );
      }}
    />
  );
}
