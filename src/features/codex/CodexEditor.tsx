import { useEffect, useMemo, useState } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankCodexEntry, createSampleCodexEntry } from "../../data/sampleCodex";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import type { CodexDocument, CodexEntryType } from "../../types/codex";
import { codexEntryTypes } from "../../types/codex";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { notify } from "../../utils/dialogs";
import { isoNow } from "../../utils/date";
import {
  emitChaosCoreDatabaseUpdate,
  publishChaosCoreBundleToContentType,
  resolveChaosCoreErrorMessage,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
import { buildCodexBundleForTarget } from "../../utils/exporters";
import { validateCodexDocument } from "../../utils/contentValidation";
import { parseCommaList, serializeCommaList } from "../../utils/records";

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

function normalizeCodexDocument(document: Partial<CodexDocument> | null | undefined): CodexDocument {
  const fallback = createBlankCodexEntry();
  const candidate = document ?? {};

  return {
    ...fallback,
    ...candidate,
    entryType: codexEntryTypes.includes(candidate.entryType as CodexEntryType)
      ? (candidate.entryType as CodexEntryType)
      : fallback.entryType,
    unlockAfterFloor: Number.isFinite(candidate.unlockAfterFloor)
      ? Number(candidate.unlockAfterFloor)
      : fallback.unlockAfterFloor,
    requiredDialogueIds: sanitizeIdList(candidate.requiredDialogueIds),
    requiredQuestIds: sanitizeIdList(candidate.requiredQuestIds),
    requiredGearIds: sanitizeIdList(candidate.requiredGearIds),
    requiredItemIds: sanitizeIdList(candidate.requiredItemIds),
    requiredSchemaIds: sanitizeIdList(candidate.requiredSchemaIds),
    requiredFieldModIds: sanitizeIdList(candidate.requiredFieldModIds)
  };
}

function touchCodex(document: CodexDocument): CodexDocument {
  return {
    ...normalizeCodexDocument(document),
    updatedAt: isoNow()
  };
}

function isCodexDocument(value: unknown): value is CodexDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "entryType" in value && "content" in value);
}

function addRequirement(values: string[], nextValue: string) {
  const trimmed = nextValue.trim();
  if (!trimmed) {
    return values;
  }

  return values.includes(trimmed) ? values : [...values, trimmed];
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: CodexDocument) => void) {
  try {
    const parsed = normalizeCodexDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isCodexDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica codex format.");
      return;
    }
    setDocument(touchCodex(parsed));
  } catch {
    notify("Could not load the selected codex entry from the Chaos Core database.");
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

export function CodexEditor() {
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries, detectRepo } = useChaosCoreDatabase();
  const [isPublishingToGame, setIsPublishingToGame] = useState(false);
  const [publishTarget, setPublishTarget] = useState<{ entryKey: string; sourceFile?: string } | null>(null);
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
      storageKey="technica.codex.document"
      exportTargetKey="technica.codex.exportTarget"
      draftType="codex"
      initialDocument={createSampleCodexEntry()}
      createBlank={createBlankCodexEntry}
      createSample={createSampleCodexEntry}
      validate={(document) => validateCodexDocument(normalizeCodexDocument(document))}
      buildBundleForTarget={(document, target) => buildCodexBundleForTarget(normalizeCodexDocument(document), target)}
      getTitle={(document) => normalizeCodexDocument(document).title}
      isImportPayload={isCodexDocument}
      touchDocument={touchCodex}
      replacePrompt="Replace the current codex entry draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica codex entry draft or export."
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
        const codex = normalizeCodexDocument(document);

        async function handlePublishCurrentToGame() {
          if (!desktopEnabled) {
            notify("Open Technica in desktop mode to publish codex entries directly into the Chaos Core repo.");
            return;
          }

          setIsPublishingToGame(true);
          try {
            let activeRepoPath = repoPath.trim();
            if (!activeRepoPath) {
              activeRepoPath = (await detectRepo())?.trim() ?? "";
            }

            if (!activeRepoPath) {
              notify("Could not automatically find a Chaos Core repo. Open the Database tab and set the repo path first.");
              return;
            }

            const bundle = await buildCodexBundleForTarget(codex, "chaos-core");
            const matchingGameEntry =
              publishTarget?.entryKey.startsWith("game:")
                ? publishTarget
                : summaryStates.codex.entries.find(
                    (entry) => entry.origin === "game" && entry.contentId === bundle.manifest.contentId
                  );
            const result = await publishChaosCoreBundleToContentType(
              activeRepoPath,
              "codex",
              bundle,
              matchingGameEntry?.entryKey,
              matchingGameEntry?.sourceFile
            );
            if (result.entryKey.startsWith("game:")) {
              setPublishTarget({
                entryKey: result.entryKey,
                sourceFile: matchingGameEntry?.sourceFile ?? "src/core/codexSystem.ts"
              });
            }
            emitChaosCoreDatabaseUpdate("codex");
            notify(
              result.entryKey.startsWith("game:")
                ? `Updated built-in '${result.contentId}' in the Chaos Core source tables.`
                : `Published '${result.contentId}' into the Chaos Core repo.`
            );
          } catch (error) {
            notify(resolveChaosCoreErrorMessage(error, "Could not publish this codex entry into the Chaos Core repo."));
          } finally {
            setIsPublishingToGame(false);
          }
        }

        return (
          <div className="stack-list">
            <Panel
              title="Codex Entry Editor"
              subtitle="Author unlockable codex records for lore, factions, creatures, and tech."
              actions={
                <div className="toolbar">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setPublishTarget(null);
                      loadSample();
                    }}
                  >
                    Load sample
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setPublishTarget(null);
                      clearDocument();
                    }}
                  >
                    Clear
                  </button>
                </div>
              }
            >
              <div className="form-grid">
                <label className="field">
                  <span>Codex id</span>
                  <input
                    value={codex.id}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeCodexDocument(current), id: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={codex.title}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeCodexDocument(current), title: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Type</span>
                  <select
                    value={codex.entryType}
                    onChange={(event) =>
                      patchDocument((current) => ({
                        ...normalizeCodexDocument(current),
                        entryType: event.target.value as CodexEntryType
                      }))
                    }
                  >
                    {codexEntryTypes.map((entryType) => (
                      <option key={entryType} value={entryType}>
                        {entryType}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Codex entry content</span>
                  <textarea
                    rows={10}
                    value={codex.content}
                    onChange={(event) =>
                      patchDocument((current) => ({ ...normalizeCodexDocument(current), content: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="toolbar split">
                <div className="chip-row">
                  <span className="pill">{codex.entryType}</span>
                  <span className="pill">Unlock floor {codex.unlockAfterFloor}</span>
                  <span className="pill">{codex.requiredDialogueIds.length} dialogue gate(s)</span>
                  <span className="pill">{codex.requiredQuestIds.length} quest gate(s)</span>
                  <span className="pill">{codex.requiredGearIds.length} gear gate(s)</span>
                  <span className="pill">{codex.requiredItemIds.length} item gate(s)</span>
                  <span className="pill">{codex.requiredSchemaIds.length} schema gate(s)</span>
                  <span className="pill">{codex.requiredFieldModIds.length} field mod gate(s)</span>
                  <span className="pill accent">Codex export</span>
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
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setPublishTarget(null);
                          importDraft();
                        }}
                      >
                        Import draft
                      </button>
                    <button type="button" className="ghost-button" onClick={saveDraft}>
                      Save draft file
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handlePublishCurrentToGame()}
                      disabled={isPublishingToGame}
                    >
                      {isPublishingToGame ? "Publishing..." : "Publish current to game"}
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
              subtitle="Gate this codex entry behind progression, completed dialogue, and owned Chaos Core content."
            >
              <div className="subsection">
                <h4>Floor Gate</h4>
                <div className="form-grid">
                  <label className="field">
                    <span>Unlock after floor reached</span>
                    <input
                      type="number"
                      min={0}
                      value={codex.unlockAfterFloor}
                      onChange={(event) =>
                        patchDocument((current) => ({
                          ...normalizeCodexDocument(current),
                          unlockAfterFloor: Number(event.target.value || 0)
                        }))
                      }
                    />
                  </label>
                </div>
                <p className="muted">Set this to `0` if this codex entry should not wait on floor progression.</p>
              </div>

              <div className="subsection">
                <h4>Require completed quests</h4>
                <div className="form-grid">
                  <label className="field full">
                    <span>Add quest requirement ids</span>
                    <input
                      value={serializeCommaList(codex.requiredQuestIds)}
                      placeholder="quest_restore_signal_grid, quest_clear_foundry_gate"
                      onChange={(event) =>
                        patchDocument((current) => ({
                          ...normalizeCodexDocument(current),
                          requiredQuestIds: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
                {codex.requiredQuestIds.length > 0 ? (
                  <div className="chip-row">
                    {codex.requiredQuestIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="pill pill-button"
                        onClick={() =>
                          patchDocument((current) => ({
                            ...normalizeCodexDocument(current),
                            requiredQuestIds: normalizeCodexDocument(current).requiredQuestIds.filter((entry) => entry !== id)
                          }))
                        }
                      >
                        {id} x
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No quest requirements set.</p>
                )}
              </div>

              <RequirementSection
                label="Require completed dialogue"
                placeholder="Add dialogue requirement"
                value={pendingDialogueId}
                onValueChange={setPendingDialogueId}
                options={dialogueOptions}
                selectedIds={codex.requiredDialogueIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredDialogueIds: addRequirement(normalizeCodexDocument(current).requiredDialogueIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredDialogueIds: normalizeCodexDocument(current).requiredDialogueIds.filter(
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
                selectedIds={codex.requiredGearIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredGearIds: addRequirement(normalizeCodexDocument(current).requiredGearIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredGearIds: normalizeCodexDocument(current).requiredGearIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned items"
                placeholder="Add item requirement"
                value={pendingItemId}
                onValueChange={setPendingItemId}
                options={itemOptions}
                selectedIds={codex.requiredItemIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredItemIds: addRequirement(normalizeCodexDocument(current).requiredItemIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredItemIds: normalizeCodexDocument(current).requiredItemIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned schema"
                placeholder="Add schema requirement"
                value={pendingSchemaId}
                onValueChange={setPendingSchemaId}
                options={schemaOptions}
                selectedIds={codex.requiredSchemaIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredSchemaIds: addRequirement(normalizeCodexDocument(current).requiredSchemaIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredSchemaIds: normalizeCodexDocument(current).requiredSchemaIds.filter((entry) => entry !== id)
                  }))
                }
              />

              <RequirementSection
                label="Require owned field mods"
                placeholder="Add field mod requirement"
                value={pendingFieldModId}
                onValueChange={setPendingFieldModId}
                options={fieldModOptions}
                selectedIds={codex.requiredFieldModIds}
                onAdd={(nextId) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredFieldModIds: addRequirement(normalizeCodexDocument(current).requiredFieldModIds, nextId)
                  }))
                }
                onRemove={(id) =>
                  patchDocument((current) => ({
                    ...normalizeCodexDocument(current),
                    requiredFieldModIds: normalizeCodexDocument(current).requiredFieldModIds.filter(
                      (entry) => entry !== id
                    )
                  }))
                }
              />
            </Panel>

            <ChaosCoreDatabasePanel
              contentType="codex"
              currentDocument={codex}
              buildBundle={(current) => buildCodexBundleForTarget(normalizeCodexDocument(current), "chaos-core")}
              onLoadEntry={(entry) => {
                setPublishTarget({
                  entryKey: entry.entryKey,
                  sourceFile: entry.sourceFile
                });
                loadDatabaseEntry(entry, setDocument);
              }}
              subtitle="Browse the live Chaos Core codex archive, including the built-in Lore, Faction, Bestiary, and Tech entries, then load them into this editor to revise them."
            />
          </div>
        );
      }}
    />
  );
}
