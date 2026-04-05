import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { createSampleDialogueDocument } from "../../data/sampleDialogue";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { useTechnicaRuntime } from "../../hooks/useTechnicaRuntime";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { KeyValueRecord } from "../../types/common";
import type { DialogueDocument, DialogueEntry, DialogueLabel } from "../../types/dialogue";
import { type LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { isoNow } from "../../utils/date";
import { confirmAction, notify } from "../../utils/dialogs";
import {
  createBlankDialogueDocument,
  createDialogueBranch,
  createDialogueChoice,
  createDialogueEnd,
  createDialogueJump,
  createDialogueLine,
  createDialogueSetFlag,
  parseDialogueDocumentInput,
  refreshDialogueDocument,
  validateDialogueDocument
} from "../../utils/dialogueDocument";
import { downloadBundle, downloadDraftFile, buildDialogueBundleForTarget } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "../../utils/mobileProtocol";
import { submitMobileInboxEntry } from "../../utils/mobileSession";
import { getRequestedPopoutTab, openTechnicaPopout } from "../../utils/popout";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import { DialoguePreview } from "./DialoguePreview";

const DIALOGUE_STORAGE_KEY = "technica.dialogue.document";
const LEGACY_SOURCE_STORAGE_KEY = "technica.dialogue.source";

interface DialogueNpcOption {
  id: string;
  name: string;
}

function loadInitialDialogueDocument() {
  if (typeof window !== "undefined" && !window.localStorage.getItem(DIALOGUE_STORAGE_KEY)) {
    const legacySource = window.localStorage.getItem(LEGACY_SOURCE_STORAGE_KEY);
    if (legacySource) {
      const migrated = parseDialogueDocumentInput(legacySource);
      if (migrated) {
        return migrated;
      }
    }
  }

  return createSampleDialogueDocument();
}

function updateBranchEntry(
  branch: DialogueLabel,
  entryId: string,
  updater: (entry: DialogueEntry) => DialogueEntry
) {
  return {
    ...branch,
    entries: branch.entries.map((entry) => (entry.id === entryId ? updater(entry) : entry))
  };
}

function getBranchLabelOptions(document: DialogueDocument) {
  return document.labels.map((branch) => branch.label);
}

function getLinkedNpcId(metadata: DialogueDocument["metadata"]) {
  return metadata.linkedNpcId || metadata.linkednpcid || "";
}

function isDialogueDocumentPayload(value: unknown): value is DialogueDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DialogueDocument>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.sceneId === "string" &&
    Array.isArray(candidate.labels)
  );
}

export function DialogueStudio() {
  const runtime = useTechnicaRuntime();
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries } = useChaosCoreDatabase();
  const isPopout = getRequestedPopoutTab() === "dialogue";
  const [dialogue, setDialogue] = usePersistentState(DIALOGUE_STORAGE_KEY, loadInitialDialogueDocument());
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const deferredDialogue = useDeferredValue(dialogue);
  const normalizedDialogue = useMemo(() => refreshDialogueDocument(deferredDialogue), [deferredDialogue]);
  const issues = useMemo(() => validateDialogueDocument(deferredDialogue), [deferredDialogue]);
  const branchOptions = getBranchLabelOptions(dialogue);
  const linkedNpcId = getLinkedNpcId(dialogue.metadata);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void ensureSummaries("npc");
  }, [desktopEnabled, ensureSummaries, repoPath]);

  const npcOptions = useMemo(() => {
    const optionsById = new Map<string, DialogueNpcOption>();

    if (typeof window !== "undefined") {
      try {
        const localNpc = JSON.parse(window.localStorage.getItem("technica.npc.document") ?? "null") as
          | { id?: string; name?: string }
          | null;
        if (localNpc?.id?.trim() && localNpc?.name?.trim()) {
          optionsById.set(localNpc.id.trim(), {
            id: localNpc.id.trim(),
            name: localNpc.name.trim()
          });
        }
      } catch {
        // Ignore malformed local NPC drafts.
      }
    }

    summaryStates.npc.entries.forEach((entry) => {
      optionsById.set(entry.contentId, {
        id: entry.contentId,
        name: entry.title.trim() || entry.contentId
      });
    });

    return Array.from(optionsById.values()).sort((left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
  }, [summaryStates.npc.entries]);
  const speakerOptions = useMemo(() => {
    const names = new Set<string>(["Narrator"]);
    npcOptions.forEach((npc) => {
      if (npc.name.trim()) {
        names.add(npc.name.trim());
      }
    });
    dialogue.labels.forEach((branch) => {
      branch.entries.forEach((entry) => {
        if (entry.kind === "line" && entry.speaker.trim()) {
          names.add(entry.speaker.trim());
        }
      });
    });
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [dialogue.labels, npcOptions]);

  const linkedNpcOptions = useMemo(() => {
    if (!linkedNpcId || npcOptions.some((npc) => npc.id === linkedNpcId)) {
      return npcOptions;
    }

    return [
      {
        id: linkedNpcId,
        name: linkedNpcId
      },
      ...npcOptions
    ];
  }, [linkedNpcId, npcOptions]);

  useEffect(() => {
    function handleMobileInboxOpen(event: Event) {
      const customEvent = event as CustomEvent<{ entry?: MobileInboxEntry }>;
      const entry = customEvent.detail?.entry;

      if (entry?.contentType !== "dialogue") {
        return;
      }

      if (!isDialogueDocumentPayload(entry.payload)) {
        notify("The mobile dialogue draft could not be loaded because its payload is invalid.");
        return;
      }

      setDialogue(refreshDialogueDocument(entry.payload));
    }

    if (typeof window !== "undefined") {
      window.addEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
      }
    };
  }, [setDialogue]);

  function patchDialogue(updater: (current: DialogueDocument) => DialogueDocument) {
    setDialogue((current) => ({
      ...updater(current),
      updatedAt: isoNow()
    }));
  }

  async function handleExportBundle() {
    try {
      await downloadBundle(buildDialogueBundleForTarget(refreshDialogueDocument(dialogue), "chaos-core"));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export the dialogue bundle.");
    }
  }

  async function handleSendToDesktop() {
    if (!runtime.sessionOrigin || !runtime.pairingToken) {
      notify("Open this editor through the desktop pairing URL before sending content back.");
      return;
    }

    setIsSendingToDesktop(true);
    try {
      const currentDialogue = refreshDialogueDocument(dialogue);
      const sendResult = await submitMobileInboxEntry({
        sessionOrigin: runtime.sessionOrigin,
        pairingToken: runtime.pairingToken,
        deviceType: runtime.deviceType,
        request: {
          contentType: "dialogue",
          contentId: currentDialogue.id,
          title: currentDialogue.title,
          summary: `${currentDialogue.stats.labelCount} branches, ${currentDialogue.stats.lineCount} lines, ${currentDialogue.stats.choiceCount} choices`,
          payload: currentDialogue
        }
      });
      notify(sendResult.message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this dialogue draft to the desktop inbox.");
    } finally {
      setIsSendingToDesktop(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const importedDocument = parseDialogueDocumentInput(await readTextFile(file));
    if (!importedDocument) {
      notify("That file does not look like a Technica dialogue draft, source file, or runtime export.");
    } else if (confirmAction("Replace the current dialogue draft with the imported file?")) {
      setDialogue(importedDocument);
    }

    event.target.value = "";
  }

  function handleLoadSample() {
    if (confirmAction("Replace the current dialogue draft with the sample conversation?")) {
      setDialogue(createSampleDialogueDocument());
    }
  }

  function handleClear() {
    if (confirmAction("Clear the current dialogue draft and start from a blank conversation?")) {
      setDialogue(createBlankDialogueDocument());
    }
  }

  function handleLoadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry) {
    const importedDocument = parseDialogueDocumentInput(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
    if (!importedDocument) {
      notify("Could not load the selected dialogue from the Chaos Core database.");
      return;
    }
    setDialogue(importedDocument);
  }

  function handleAddBranch() {
    patchDialogue((current) => {
      const branch = createDialogueBranch("branch", current.labels.map((item) => item.label));
      return {
        ...current,
        labels: [...current.labels, branch],
        entryLabel: current.labels.length === 0 ? branch.label : current.entryLabel
      };
    });
  }

  function handleRenameBranch(branchId: string, nextValue: string) {
    patchDialogue((current) => {
      const sourceBranch = current.labels.find((branch) => branch.id === branchId);
      if (!sourceBranch) {
        return current;
      }

      const nextLabel = nextValue.trim() || sourceBranch.label;
      return {
        ...current,
        entryLabel: current.entryLabel === sourceBranch.label ? nextLabel : current.entryLabel,
        labels: current.labels.map((branch) => ({
          ...branch,
          label: branch.id === branchId ? nextLabel : branch.label,
          entries: branch.entries.map((entry) => {
            if ((entry.kind === "choice" || entry.kind === "jump") && entry.target === sourceBranch.label) {
              return {
                ...entry,
                target: nextLabel
              };
            }
            return entry;
          })
        }))
      };
    });
  }

  function handleRemoveBranch(branchId: string) {
    const branch = dialogue.labels.find((item) => item.id === branchId);
    if (!branch) {
      return;
    }

    if (dialogue.labels.length <= 1) {
      notify("Keep at least one conversation branch in the dialogue.");
      return;
    }

    if (!confirmAction(`Remove the '${branch.label}' branch? Choices and jumps pointing to it will need to be retargeted.`)) {
      return;
    }

    patchDialogue((current) => {
      const remainingBranches = current.labels.filter((item) => item.id !== branchId);
      return {
        ...current,
        entryLabel: current.entryLabel === branch.label ? remainingBranches[0]?.label ?? branch.label : current.entryLabel,
        labels: remainingBranches
      };
    });
  }

  function handleSetOpeningBranch(label: string) {
    patchDialogue((current) => ({
      ...current,
      entryLabel: label
    }));
  }

  function handleAddEntry(branchId: string, entryKind: DialogueEntry["kind"]) {
    patchDialogue((current) => ({
      ...current,
      labels: current.labels.map((branch) => {
        if (branch.id !== branchId) {
          return branch;
        }

        const existingIds = branch.entries.map((entry) => entry.id);
        const fallbackTarget = current.labels.find((item) => item.id !== branchId)?.label ?? branch.label;
        const nextEntry =
          entryKind === "line"
            ? createDialogueLine(existingIds)
            : entryKind === "choice"
              ? createDialogueChoice(fallbackTarget, existingIds)
              : entryKind === "jump"
                ? createDialogueJump(fallbackTarget, existingIds)
                : entryKind === "set"
                  ? createDialogueSetFlag(existingIds)
                  : createDialogueEnd(existingIds);

        return {
          ...branch,
          entries: [...branch.entries, nextEntry]
        };
      })
    }));
  }

  function handleRemoveEntry(branchId: string, entryId: string) {
    patchDialogue((current) => ({
      ...current,
      labels: current.labels.map((branch) =>
        branch.id === branchId
          ? {
              ...branch,
              entries: branch.entries.filter((entry) => entry.id !== entryId)
            }
          : branch
      )
    }));
  }

  function handleUpdateEntry(
    branchId: string,
    entryId: string,
    updater: (entry: DialogueEntry) => DialogueEntry
  ) {
    patchDialogue((current) => ({
      ...current,
      labels: current.labels.map((branch) =>
        branch.id === branchId ? updateBranchEntry(branch, entryId, updater) : branch
      )
    }));
  }

  function handleCreateBranchFromChoice(branchId: string, entryId: string, suggestedLabel: string) {
    patchDialogue((current) => {
      const nextBranch = createDialogueBranch(
        suggestedLabel || "branch",
        current.labels.map((branch) => branch.label)
      );

      return {
        ...current,
        labels: [
          ...current.labels.map((branch) =>
            branch.id === branchId
              ? updateBranchEntry(branch, entryId, (entry) =>
                  entry.kind === "choice"
                    ? {
                        ...entry,
                        target: nextBranch.label
                      }
                    : entry
                )
              : branch
          ),
          nextBranch
        ]
      };
    });
  }

  function renderEntryEditor(branch: DialogueLabel, entry: DialogueEntry) {
    if (entry.kind === "line") {
      return (
        <article key={entry.id} className="dialogue-entry-card">
          <div className="dialogue-entry-header">
            <span className="flow-badge speaker">Line</span>
            <button type="button" className="ghost-button danger" onClick={() => handleRemoveEntry(branch.id, entry.id)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Speaker</span>
              <input
                list="technica-dialogue-speakers"
                value={entry.speaker}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, speaker: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Mood</span>
              <input
                value={entry.mood ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, mood: event.target.value || undefined } : current
                  )
                }
              />
            </label>
            <label className="field full">
              <span>Dialogue</span>
              <textarea
                rows={4}
                value={entry.text}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, text: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Portrait key</span>
              <input
                value={entry.portraitKey ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, portraitKey: event.target.value || undefined } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Scene override</span>
              <input
                value={entry.sceneId ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, sceneId: event.target.value || undefined } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Condition</span>
              <input
                value={entry.condition ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, condition: event.target.value || undefined } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={serializeCommaList(entry.tags)}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line" ? { ...current, tags: parseCommaList(event.target.value) } : current
                  )
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={3}
                value={serializeKeyValueLines(entry.metadata)}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "line"
                      ? {
                          ...current,
                          metadata: parseKeyValueLines(event.target.value)
                        }
                      : current
                  )
                }
              />
            </label>
          </div>
        </article>
      );
    }

    if (entry.kind === "choice") {
      return (
        <article key={entry.id} className="dialogue-entry-card">
          <div className="dialogue-entry-header">
            <span className="flow-badge choice">Choice</span>
            <button type="button" className="ghost-button danger" onClick={() => handleRemoveEntry(branch.id, entry.id)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label className="field full">
              <span>Button text</span>
              <input
                value={entry.text}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice" ? { ...current, text: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Target branch</span>
              <select
                value={entry.target}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice" ? { ...current, target: event.target.value } : current
                  )
                }
              >
                {branchOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Create branch from this choice</span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleCreateBranchFromChoice(branch.id, entry.id, entry.text)}
              >
                Add linked branch
              </button>
            </div>
            <label className="field">
              <span>Condition</span>
              <input
                value={entry.condition ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice" ? { ...current, condition: event.target.value || undefined } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={serializeCommaList(entry.tags)}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice" ? { ...current, tags: parseCommaList(event.target.value) } : current
                  )
                }
              />
            </label>
            <label className="field full">
              <span>Set flags</span>
              <textarea
                rows={3}
                value={serializeKeyValueLines(entry.setFlags)}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice"
                      ? {
                          ...current,
                          setFlags: parseKeyValueLines(event.target.value) as KeyValueRecord
                        }
                      : current
                  )
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={3}
                value={serializeKeyValueLines(entry.metadata)}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "choice"
                      ? {
                          ...current,
                          metadata: parseKeyValueLines(event.target.value)
                        }
                      : current
                  )
                }
              />
            </label>
          </div>
        </article>
      );
    }

    if (entry.kind === "jump") {
      return (
        <article key={entry.id} className="dialogue-entry-card">
          <div className="dialogue-entry-header">
            <span className="flow-badge jump">Jump</span>
            <button type="button" className="ghost-button danger" onClick={() => handleRemoveEntry(branch.id, entry.id)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Target branch</span>
              <select
                value={entry.target}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "jump" ? { ...current, target: event.target.value } : current
                  )
                }
              >
                {branchOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Condition</span>
              <input
                value={entry.condition ?? ""}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "jump" ? { ...current, condition: event.target.value || undefined } : current
                  )
                }
              />
            </label>
          </div>
        </article>
      );
    }

    if (entry.kind === "set") {
      return (
        <article key={entry.id} className="dialogue-entry-card">
          <div className="dialogue-entry-header">
            <span className="flow-badge flag">Set Flag</span>
            <button type="button" className="ghost-button danger" onClick={() => handleRemoveEntry(branch.id, entry.id)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Flag key</span>
              <input
                value={entry.flag}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "set" ? { ...current, flag: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="field">
              <span>Value</span>
              <input
                value={entry.value}
                onChange={(event) =>
                  handleUpdateEntry(branch.id, entry.id, (current) =>
                    current.kind === "set" ? { ...current, value: event.target.value } : current
                  )
                }
              />
            </label>
          </div>
        </article>
      );
    }

    return (
      <article key={entry.id} className="dialogue-entry-card end-card">
        <div className="dialogue-entry-header">
          <span className="flow-badge end">End</span>
          <button type="button" className="ghost-button danger" onClick={() => handleRemoveEntry(branch.id, entry.id)}>
            Remove
          </button>
        </div>
        <p className="muted">This branch ends the conversation here.</p>
      </article>
    );
  }

  const flowPreviewPanel = (
    <Panel
      title="Flow Preview"
      actions={
        !isPopout ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => void openTechnicaPopout("dialogue", "Dialogue Editor")}
          >
            Pop out
          </button>
        ) : undefined
      }
    >
      <DialoguePreview document={normalizedDialogue} />
    </Panel>
  );

  return (
    <div className={issues.length > 0 ? "workspace-grid workspace-dialogue" : "workspace-grid workspace-dialogue validation-collapsed"}>
      <div className="workspace-column">
        <Panel
          title="Dialogue Setup"
          actions={
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => void ensureSummaries("npc", { force: true })}>
                Refresh NPC speakers
              </button>
              <button type="button" className="ghost-button" onClick={handleLoadSample}>
                Load sample
              </button>
              <button type="button" className="ghost-button" onClick={handleClear}>
                Clear
              </button>
            </div>
          }
        >
          <div className="form-grid">
            <label className="field">
              <span>Dialogue id</span>
              <input value={dialogue.id} onChange={(event) => patchDialogue((current) => ({ ...current, id: event.target.value }))} />
            </label>
            <label className="field">
              <span>Title</span>
              <input
                value={dialogue.title}
                onChange={(event) => patchDialogue((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Scene id</span>
              <input
                value={dialogue.sceneId}
                onChange={(event) => patchDialogue((current) => ({ ...current, sceneId: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Opening branch</span>
              <select
                value={dialogue.entryLabel}
                onChange={(event) => patchDialogue((current) => ({ ...current, entryLabel: event.target.value }))}
              >
                {branchOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>NPC to activate this dialogue</span>
              <select
                value={linkedNpcId}
                onChange={(event) =>
                  patchDialogue((current) => {
                    const metadata = { ...current.metadata };
                    delete metadata.linkedNpcId;
                    delete metadata.linkednpcid;

                    return {
                      ...current,
                      metadata: event.target.value
                        ? {
                            ...metadata,
                            linkedNpcId: event.target.value
                          }
                        : metadata
                    };
                  })
                }
              >
                <option value="">None</option>
                {linkedNpcOptions.map((npc) => (
                  <option key={npc.id} value={npc.id}>
                    {npc.name} ({npc.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>Tags</span>
              <input
                value={serializeCommaList(dialogue.tags)}
                onChange={(event) =>
                  patchDialogue((current) => ({
                    ...current,
                    tags: parseCommaList(event.target.value)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(dialogue.metadata)}
                onChange={(event) =>
                  patchDialogue((current) => ({
                    ...current,
                    metadata: parseKeyValueLines(event.target.value)
                  }))
                }
              />
            </label>
          </div>

          <datalist id="technica-dialogue-speakers">
            {speakerOptions.map((speaker) => (
              <option key={speaker} value={speaker} />
            ))}
          </datalist>

          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{normalizedDialogue.stats.labelCount} branches</span>
              <span className="pill">{normalizedDialogue.stats.lineCount} lines</span>
              <span className="pill">{normalizedDialogue.stats.choiceCount} choices</span>
              <span className="pill accent">Chaos Core export</span>
            </div>
            <div className="toolbar">
              {runtime.isMobile ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleSendToDesktop()}
                  disabled={!canSendToDesktop || isSendingToDesktop}
                >
                  {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                </button>
              ) : (
                <>
                  <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
                    Import draft
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => downloadDraftFile("dialogue", dialogue.title, refreshDialogueDocument(dialogue))}
                  >
                    Save draft file
                  </button>
                  <button type="button" className="primary-button" onClick={() => void handleExportBundle()}>
                    Export bundle
                  </button>
                </>
              )}
              <input ref={importRef} hidden type="file" accept=".txt,.json" onChange={handleImportFile} />
            </div>
          </div>
        </Panel>

        <ChaosCoreDatabasePanel
          contentType="dialogue"
          currentDocument={dialogue}
          buildBundle={(current) => buildDialogueBundleForTarget(refreshDialogueDocument(current), "chaos-core")}
          onLoadEntry={handleLoadDatabaseEntry}
          subtitle="Publish dialogue straight into the Chaos Core repo, then reopen the in-game conversation here."
        />
      </div>

      <div className="workspace-column wide">
        <Panel
          title="Conversation Branches"
          actions={
            <button type="button" className="ghost-button" onClick={handleAddBranch}>
              Add branch
            </button>
          }
        >
          <div className="dialogue-branch-list">
            {dialogue.labels.map((branch) => (
              <article key={branch.id} className="dialogue-branch-card">
                <header className="dialogue-branch-header">
                  <label className="field branch-label-field">
                    <span>Branch name</span>
                    <input
                      value={branch.label}
                      onChange={(event) => handleRenameBranch(branch.id, event.target.value)}
                    />
                  </label>
                  <div className="dialogue-branch-actions">
                    {branch.label === dialogue.entryLabel ? (
                      <span className="pill accent">Opening</span>
                    ) : (
                      <button type="button" className="ghost-button" onClick={() => handleSetOpeningBranch(branch.label)}>
                        Make opening
                      </button>
                    )}
                    <button type="button" className="ghost-button danger" onClick={() => handleRemoveBranch(branch.id)}>
                      Remove branch
                    </button>
                  </div>
                </header>

                <div className="dialogue-entry-list">
                  {branch.entries.length === 0 ? (
                    <div className="empty-state compact">Add dialogue lines, player choices, jumps, or flag actions.</div>
                  ) : (
                    branch.entries.map((entry) => renderEntryEditor(branch, entry))
                  )}
                </div>

                <div className="dialogue-entry-buttons">
                  <button type="button" className="ghost-button" onClick={() => handleAddEntry(branch.id, "line")}>
                    Add line
                  </button>
                  <button type="button" className="ghost-button" onClick={() => handleAddEntry(branch.id, "choice")}>
                    Add choice
                  </button>
                  <button type="button" className="ghost-button" onClick={() => handleAddEntry(branch.id, "jump")}>
                    Add jump
                  </button>
                  <button type="button" className="ghost-button" onClick={() => handleAddEntry(branch.id, "set")}>
                    Set flag
                  </button>
                  <button type="button" className="ghost-button" onClick={() => handleAddEntry(branch.id, "end")}>
                    End branch
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Panel>

      </div>

      {issues.length > 0 ? (
        <div className="workspace-column">
          <div className="dialogue-preview-rail">
            <Panel title="Validation">
              <IssueList issues={issues} emptyLabel="No validation issues. This dialogue is ready to export." />
            </Panel>
          </div>
        </div>
      ) : null}

      <aside className="dialogue-floating-preview">
        {flowPreviewPanel}
      </aside>
    </div>
  );
}
