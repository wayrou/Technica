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
import {
  emitChaosCoreDatabaseUpdate,
  removeChaosCoreDatabaseEntry,
  resolveChaosCoreErrorMessage,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
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
  canPublishDialogueAsBuiltInSource,
  parseDialogueDocumentInput,
  refreshDialogueDocument,
  validateDialogueDocument
} from "../../utils/dialogueDocument";
import {
  applyDialogueOccurrenceRulesToMetadata,
  extractDialogueOccurrenceRules,
  stripDialogueOccurrenceMetadata,
  type DialogueOccurrenceMode,
  type DialogueOccurrenceRules
} from "../../utils/dialogueOccurrence";
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
  dialogueId?: string;
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
  return document.labels.filter((branch) => !branch.continuationForChoiceClusterId).map((branch) => branch.label);
}

interface DialogueOccurrenceSummary {
  npcId: string;
  mode: DialogueOccurrenceMode;
  poolWeight: number;
  unlockAfterFloor: number;
  requiredQuestIds: string[];
  requiredGearIds: string[];
  requiredItemIds: string[];
  requiredFieldModIds: string[];
  requiredSchemaIds: string[];
}

interface AttachedDialogueRow {
  key: string;
  entryKey?: string;
  contentId: string;
  title: string;
  sourceLabel: string;
  modeLabel: string;
  unlockLabel: string;
  origin?: "game" | "technica";
  isCurrentDraft?: boolean;
}

interface DerivedChoiceCluster {
  id: string;
  sourceBranchId: string;
  branchIds: string[];
  continuationBranchId?: string;
}

function parseOccurrenceSummary(summaryData: Record<string, unknown> | undefined): DialogueOccurrenceSummary | null {
  if (!summaryData || typeof summaryData.npcId !== "string" || !summaryData.npcId.trim()) {
    return null;
  }

  const parseIdList = (key: string) =>
    Array.isArray(summaryData[key]) ? summaryData[key].map(String).filter(Boolean) : [];

  return {
    npcId: summaryData.npcId.trim(),
    mode: summaryData.mode === "random_pool" ? "random_pool" : "exclusive",
    poolWeight:
      typeof summaryData.poolWeight === "number" && Number.isFinite(summaryData.poolWeight)
        ? Math.max(1, Math.round(summaryData.poolWeight))
        : 1,
    unlockAfterFloor:
      typeof summaryData.unlockAfterFloor === "number" && Number.isFinite(summaryData.unlockAfterFloor)
        ? Math.max(0, Math.round(summaryData.unlockAfterFloor))
        : 0,
    requiredQuestIds: parseIdList("requiredQuestIds"),
    requiredGearIds: parseIdList("requiredGearIds"),
    requiredItemIds: parseIdList("requiredItemIds"),
    requiredFieldModIds: parseIdList("requiredFieldModIds"),
    requiredSchemaIds: parseIdList("requiredSchemaIds")
  };
}

function formatOccurrenceModeLabel(mode: DialogueOccurrenceMode, poolWeight = 1) {
  if (mode === "random_pool") {
    return poolWeight > 1 ? `Random pool x${poolWeight}` : "Random pool";
  }

  return "Always / only line set";
}

function formatUnlockLabel(occurrence: Pick<
  DialogueOccurrenceRules,
  | "unlockAfterFloor"
  | "requiredQuestIds"
  | "requiredGearIds"
  | "requiredItemIds"
  | "requiredFieldModIds"
  | "requiredSchemaIds"
>) {
  const parts: string[] = [];

  if (occurrence.unlockAfterFloor > 0) {
    parts.push(`after floor ${occurrence.unlockAfterFloor}`);
  }
  if (occurrence.requiredQuestIds.length > 0) {
    parts.push(`${occurrence.requiredQuestIds.length} quest`);
  }
  if (occurrence.requiredGearIds.length > 0) {
    parts.push(`${occurrence.requiredGearIds.length} gear`);
  }
  if (occurrence.requiredItemIds.length > 0) {
    parts.push(`${occurrence.requiredItemIds.length} item`);
  }
  if (occurrence.requiredFieldModIds.length > 0) {
    parts.push(`${occurrence.requiredFieldModIds.length} field mod`);
  }
  if (occurrence.requiredSchemaIds.length > 0) {
    parts.push(`${occurrence.requiredSchemaIds.length} schema`);
  }

  return parts.length > 0 ? parts.join(" • ") : "Always available";
}

function createAttachedDialogueRow(
  key: string,
  contentId: string,
  title: string,
  sourceLabel: string,
  occurrence: Pick<
    DialogueOccurrenceRules,
    | "mode"
    | "poolWeight"
    | "unlockAfterFloor"
    | "requiredQuestIds"
    | "requiredGearIds"
    | "requiredItemIds"
    | "requiredFieldModIds"
    | "requiredSchemaIds"
  >,
  options?: {
    isCurrentDraft?: boolean;
    origin?: "game" | "technica";
  }
): AttachedDialogueRow {
  return {
    key,
    entryKey: options?.isCurrentDraft ? undefined : key,
    contentId,
    title,
    sourceLabel,
    modeLabel: formatOccurrenceModeLabel(occurrence.mode, occurrence.poolWeight),
    unlockLabel: formatUnlockLabel(occurrence),
    origin: options?.origin,
    isCurrentDraft: options?.isCurrentDraft
  };
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

function getChoiceClusterIdForEntry(branch: DialogueLabel, entryId: string) {
  const targetIndex = branch.entries.findIndex((entry) => entry.id === entryId && entry.kind === "choice");
  if (targetIndex === -1) {
    return null;
  }

  let startIndex = targetIndex;
  while (startIndex > 0 && branch.entries[startIndex - 1]?.kind === "choice") {
    startIndex -= 1;
  }

  const firstChoice = branch.entries[startIndex];
  if (!firstChoice || firstChoice.kind !== "choice") {
    return null;
  }

  return `${branch.id}::${firstChoice.id}`;
}

function findChoiceClusterInsertionIndex(labels: DialogueLabel[], clusterId: string, sourceBranchId: string) {
  let insertionIndex = Math.max(
    0,
    labels.findIndex((label) => label.id === sourceBranchId) + 1
  );

  labels.forEach((label, index) => {
    if (
      label.id === sourceBranchId ||
      label.choiceClusterId === clusterId ||
      label.continuationForChoiceClusterId === clusterId
    ) {
      insertionIndex = Math.max(insertionIndex, index + 1);
    }
  });

  return insertionIndex;
}

function deriveChoiceClusters(labels: DialogueLabel[]) {
  const visibleBranches = labels.filter((branch) => !branch.continuationForChoiceClusterId);
  const branchesByLabel = new Map(visibleBranches.map((branch) => [branch.label, branch]));
  const clusters = new Map<string, DerivedChoiceCluster>();

  const ensureCluster = (clusterId: string, sourceBranchId: string) => {
    const existing = clusters.get(clusterId);
    if (existing) {
      if (!existing.sourceBranchId && sourceBranchId) {
        existing.sourceBranchId = sourceBranchId;
      }
      return existing;
    }

    const nextCluster: DerivedChoiceCluster = {
      id: clusterId,
      sourceBranchId,
      branchIds: []
    };
    clusters.set(clusterId, nextCluster);
    return nextCluster;
  };

  visibleBranches.forEach((branch) => {
    if (!branch.choiceClusterId) {
      return;
    }

    const cluster = ensureCluster(branch.choiceClusterId, branch.choiceSourceBranchId ?? "");
    if (!cluster.branchIds.includes(branch.id)) {
      cluster.branchIds.push(branch.id);
    }
  });

  visibleBranches.forEach((branch) => {
    let index = 0;
    while (index < branch.entries.length) {
      const entry = branch.entries[index];
      if (entry.kind !== "choice") {
        index += 1;
        continue;
      }

      const clusterId = `${branch.id}::${entry.id}`;
      const cluster = ensureCluster(clusterId, branch.id);

      while (index < branch.entries.length && branch.entries[index]?.kind === "choice") {
        const choiceEntry = branch.entries[index];
        if (choiceEntry.kind === "choice") {
          const targetBranch = branchesByLabel.get(choiceEntry.target);
          if (targetBranch && !cluster.branchIds.includes(targetBranch.id)) {
            cluster.branchIds.push(targetBranch.id);
          }
        }
        index += 1;
      }
    }
  });

  labels.forEach((branch) => {
    if (!branch.continuationForChoiceClusterId) {
      return;
    }

    const cluster = ensureCluster(branch.continuationForChoiceClusterId, branch.choiceSourceBranchId ?? "");
    cluster.continuationBranchId = branch.id;
  });

  return clusters;
}

export function DialogueStudio() {
  const runtime = useTechnicaRuntime();
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries, loadEntry } = useChaosCoreDatabase();
  const isPopout = getRequestedPopoutTab() === "dialogue";
  const [dialogue, setDialogue] = usePersistentState(DIALOGUE_STORAGE_KEY, loadInitialDialogueDocument());
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);
  const [deletingAttachedDialogueKey, setDeletingAttachedDialogueKey] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);
  const deferredDialogue = useDeferredValue(dialogue);
  const normalizedDialogue = useMemo(() => refreshDialogueDocument(deferredDialogue), [deferredDialogue]);
  const issues = useMemo(() => validateDialogueDocument(deferredDialogue), [deferredDialogue]);
  const branchOptions = getBranchLabelOptions(dialogue);
  const occurrenceRules = useMemo(() => extractDialogueOccurrenceRules(dialogue.metadata), [dialogue.metadata]);
  const visibleMetadata = useMemo(() => stripDialogueOccurrenceMetadata(dialogue.metadata), [dialogue.metadata]);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void Promise.all([
      ensureSummaries("npc"),
      ensureSummaries("dialogue"),
      ensureSummaries("gear"),
      ensureSummaries("item"),
      ensureSummaries("fieldmod"),
      ensureSummaries("schema")
    ]);
  }, [desktopEnabled, ensureSummaries, repoPath]);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim() || !occurrenceRules.npcId) {
      return;
    }

    if (summaryStates.npc.status === "idle" || summaryStates.npc.stale) {
      void ensureSummaries("npc", { force: summaryStates.npc.stale });
    }

    if (summaryStates.dialogue.status === "idle" || summaryStates.dialogue.stale) {
      void ensureSummaries("dialogue", { force: summaryStates.dialogue.stale });
    }
  }, [
    desktopEnabled,
    ensureSummaries,
    occurrenceRules.npcId,
    repoPath,
    summaryStates.dialogue.stale,
    summaryStates.dialogue.status,
    summaryStates.npc.stale,
    summaryStates.npc.status
  ]);

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
        name: entry.title.trim() || entry.contentId,
        dialogueId:
          entry.summaryData && typeof entry.summaryData.dialogueId === "string" && entry.summaryData.dialogueId.trim()
            ? entry.summaryData.dialogueId.trim()
            : undefined
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
  const currentNpcOption = useMemo(
    () => npcOptions.find((npc) => npc.id === occurrenceRules.npcId) ?? null,
    [npcOptions, occurrenceRules.npcId]
  );
  const gearOptions = useMemo(
    () =>
      summaryStates.gear.entries
        .map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.gear.entries]
  );
  const itemOptions = useMemo(
    () =>
      summaryStates.item.entries
        .map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.item.entries]
  );
  const schemaOptions = useMemo(
    () =>
      summaryStates.schema.entries
        .map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.schema.entries]
  );
  const fieldModOptions = useMemo(
    () =>
      summaryStates.fieldmod.entries
        .map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [summaryStates.fieldmod.entries]
  );
  const attachedDialogueRows = useMemo(() => {
    if (!occurrenceRules.npcId) {
      return [] as AttachedDialogueRow[];
    }

    const rowsByKey = new Map<string, AttachedDialogueRow>();

    const pushRow = (row: AttachedDialogueRow) => {
      rowsByKey.set(row.key, row);
    };

    if (currentNpcOption?.dialogueId) {
      const builtInEntry = summaryStates.dialogue.entries.find((entry) => entry.contentId === currentNpcOption.dialogueId);
      if (builtInEntry) {
        pushRow(
          createAttachedDialogueRow(
            builtInEntry.entryKey,
            builtInEntry.contentId,
            builtInEntry.title,
            builtInEntry.origin === "game" ? "Base game default" : "Direct NPC default",
            {
              mode: "exclusive",
              poolWeight: 1,
              unlockAfterFloor: 0,
              requiredQuestIds: [],
              requiredGearIds: [],
              requiredItemIds: [],
              requiredFieldModIds: [],
              requiredSchemaIds: []
            },
            { origin: builtInEntry.origin }
          )
        );
      }
    }

    summaryStates.dialogue.entries.forEach((entry) => {
      const summary = parseOccurrenceSummary(entry.summaryData);
      const matchesAssignedNpc = summary?.npcId === occurrenceRules.npcId;
      const matchesNpcDefaultDialogue = Boolean(currentNpcOption?.dialogueId && entry.contentId === currentNpcOption.dialogueId);
      if (!matchesAssignedNpc && !matchesNpcDefaultDialogue) {
        return;
      }

      pushRow(
        createAttachedDialogueRow(
          entry.entryKey,
          entry.contentId,
          entry.title,
          entry.origin === "game"
            ? matchesNpcDefaultDialogue
              ? "Base game default"
              : "Base game row"
            : "Technica published",
          summary ?? {
            mode: "exclusive",
            poolWeight: 1,
            unlockAfterFloor: 0,
            requiredQuestIds: [],
            requiredGearIds: [],
            requiredItemIds: [],
            requiredFieldModIds: [],
            requiredSchemaIds: []
          },
          { origin: entry.origin }
        )
      );
    });

    if (occurrenceRules.npcId) {
      pushRow(
        createAttachedDialogueRow(
          `draft:${normalizedDialogue.id}`,
          normalizedDialogue.id,
          normalizedDialogue.title,
          "Current draft",
          occurrenceRules,
          { isCurrentDraft: true }
        )
      );
    }

    return Array.from(rowsByKey.values()).sort((left, right) => {
      if (left.isCurrentDraft && !right.isCurrentDraft) {
        return -1;
      }
      if (!left.isCurrentDraft && right.isCurrentDraft) {
        return 1;
      }
      return left.title.localeCompare(right.title) || left.contentId.localeCompare(right.contentId);
    });
  }, [currentNpcOption?.dialogueId, normalizedDialogue.id, normalizedDialogue.title, occurrenceRules, summaryStates.dialogue.entries]);
  const preferredPublishTarget = useMemo(() => {
    if (
      occurrenceRules.mode !== "exclusive" ||
      !occurrenceRules.npcId ||
      !currentNpcOption?.dialogueId ||
      !canPublishDialogueAsBuiltInSource(normalizedDialogue)
    ) {
      return null;
    }

    const builtInDialogueEntry =
      summaryStates.dialogue.entries.find(
        (entry) => entry.origin === "game" && entry.contentId === currentNpcOption.dialogueId
      ) ?? null;

    if (!builtInDialogueEntry) {
      return {
        entryKey: `game:${currentNpcOption.dialogueId}`,
        sourceFile: "src/field/npcs.ts"
      };
    }

    return {
      entryKey: builtInDialogueEntry.entryKey,
      sourceFile: builtInDialogueEntry.sourceFile ?? "src/field/npcs.ts"
    };
  }, [currentNpcOption?.dialogueId, normalizedDialogue, occurrenceRules.mode, occurrenceRules.npcId, summaryStates.dialogue.entries]);
  const visibleBranches = useMemo(
    () => dialogue.labels.filter((branch) => !branch.continuationForChoiceClusterId),
    [dialogue.labels]
  );
  const derivedChoiceClusters = useMemo(() => deriveChoiceClusters(dialogue.labels), [dialogue.labels]);
  const effectiveChoiceClusterIdByBranchId = useMemo(() => {
    const map = new Map<string, string>();
    derivedChoiceClusters.forEach((cluster) => {
      cluster.branchIds.forEach((branchId) => {
        if (!map.has(branchId)) {
          map.set(branchId, cluster.id);
        }
      });
    });
    return map;
  }, [derivedChoiceClusters]);
  const continuationBranchesByClusterId = useMemo(() => {
    const map = new Map<string, DialogueLabel>();
    dialogue.labels.forEach((branch) => {
      if (branch.continuationForChoiceClusterId) {
        map.set(branch.continuationForChoiceClusterId, branch);
      }
    });
    return map;
  }, [dialogue.labels]);
  const choiceClusterBranchCounts = useMemo(() => {
    const map = new Map<string, number>();
    derivedChoiceClusters.forEach((cluster) => {
      map.set(cluster.id, cluster.branchIds.length);
    });
    return map;
  }, [derivedChoiceClusters]);
  const lastVisibleBranchIdByClusterId = useMemo(() => {
    const map = new Map<string, string>();
    visibleBranches.forEach((branch) => {
      const clusterId = effectiveChoiceClusterIdByBranchId.get(branch.id);
      if (clusterId) {
        map.set(clusterId, branch.id);
      }
    });
    return map;
  }, [effectiveChoiceClusterIdByBranchId, visibleBranches]);

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

  function patchOccurrenceRules(updater: (current: DialogueOccurrenceRules) => DialogueOccurrenceRules) {
    patchDialogue((current) => {
      const nextRules = updater(extractDialogueOccurrenceRules(current.metadata));
      return {
        ...current,
        metadata: applyDialogueOccurrenceRulesToMetadata(current.metadata, nextRules)
      };
    });
  }

  function addOccurrenceListValue(
    key: "requiredGearIds" | "requiredItemIds" | "requiredFieldModIds" | "requiredSchemaIds",
    value: string
  ) {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    patchOccurrenceRules((current) => ({
      ...current,
      [key]: Array.from(new Set([...(current[key] ?? []), normalizedValue]))
    }));
  }

  function removeOccurrenceListValue(
    key: "requiredGearIds" | "requiredItemIds" | "requiredFieldModIds" | "requiredSchemaIds",
    value: string
  ) {
    patchOccurrenceRules((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((entry) => entry !== value)
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

  async function handleLoadAttachedDialogue(entryKey: string | undefined) {
    if (!entryKey) {
      return;
    }

    try {
      const entry = await loadEntry("dialogue", entryKey);
      handleLoadDatabaseEntry(entry);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load the selected attached dialogue.");
    }
  }

  async function handleDeleteAttachedDialogue(row: AttachedDialogueRow) {
    if (!desktopEnabled) {
      notify("Open Technica in desktop mode to remove dialogue records from the Chaos Core repo.");
      return;
    }

    if (!repoPath.trim() || !row.entryKey || row.isCurrentDraft) {
      return;
    }

    const confirmed = confirmAction(
      row.origin === "game"
        ? `Disable built-in dialogue '${row.contentId}' from Chaos Core?`
        : `Delete published dialogue '${row.contentId}' from Chaos Core?`
    );
    if (!confirmed) {
      return;
    }

    setDeletingAttachedDialogueKey(row.key);
    try {
      await removeChaosCoreDatabaseEntry(repoPath.trim(), "dialogue", row.entryKey);
      emitChaosCoreDatabaseUpdate("dialogue");
      await Promise.all([
        ensureSummaries("dialogue", { force: true }),
        ensureSummaries("npc", { force: true })
      ]);
      notify(
        row.origin === "game"
          ? `Disabled built-in dialogue '${row.contentId}'.`
          : `Deleted published dialogue '${row.contentId}'.`
      );
    } catch (error) {
      notify(resolveChaosCoreErrorMessage(error, "Could not remove the selected attached dialogue."));
    } finally {
      setDeletingAttachedDialogueKey("");
    }
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
          autoContinueTarget: branch.autoContinueTarget === sourceBranch.label ? nextLabel : branch.autoContinueTarget,
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
      const clusterId = branch.choiceClusterId;
      const remainingBranches = current.labels.filter((item) => item.id !== branchId);
      const shouldRemoveContinuation =
        clusterId &&
        !remainingBranches.some((item) => item.choiceClusterId === clusterId) &&
        remainingBranches.some((item) => item.continuationForChoiceClusterId === clusterId);
      const nextLabels = remainingBranches
        .filter((item) => !(shouldRemoveContinuation && item.continuationForChoiceClusterId === clusterId))
        .map((item) =>
          clusterId && item.choiceClusterId === clusterId && shouldRemoveContinuation
            ? {
                ...item,
                autoContinueTarget: undefined
              }
            : item
        );
      return {
        ...current,
        entryLabel: current.entryLabel === branch.label ? nextLabels[0]?.label ?? branch.label : current.entryLabel,
        labels: nextLabels
      };
    });
  }

  function handleSetOpeningBranch(label: string) {
    patchDialogue((current) => ({
      ...current,
      entryLabel: label
    }));
  }

  function createEntryForKind(
    entryKind: DialogueEntry["kind"],
    branchId: string,
    current: DialogueDocument,
    existingIds: string[]
  ) {
    const fallbackTarget = current.labels.find((item) => item.id !== branchId)?.label ?? current.labels[0]?.label ?? "opening";
    return entryKind === "line"
      ? createDialogueLine(existingIds)
      : entryKind === "choice"
        ? createDialogueChoice(fallbackTarget, existingIds)
        : entryKind === "jump"
          ? createDialogueJump(fallbackTarget, existingIds)
          : entryKind === "set"
            ? createDialogueSetFlag(existingIds)
            : createDialogueEnd(existingIds);
  }

  function handleAddEntry(branchId: string, entryKind: DialogueEntry["kind"]) {
    patchDialogue((current) => ({
      ...current,
      labels: current.labels.map((branch) => {
        if (branch.id !== branchId) {
          return branch;
        }

        const nextEntry = createEntryForKind(entryKind, branchId, current, branch.entries.map((entry) => entry.id));

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
      const sourceBranch = current.labels.find((branch) => branch.id === branchId);
      if (!sourceBranch) {
        return current;
      }

      const clusterId = getChoiceClusterIdForEntry(sourceBranch, entryId);
      if (!clusterId) {
        return current;
      }

      const existingContinuationBranch = current.labels.find(
        (branch) => branch.continuationForChoiceClusterId === clusterId
      );
      const nextBranch = createDialogueBranch(
        suggestedLabel || "branch",
        current.labels.map((branch) => branch.label)
      );
      nextBranch.choiceClusterId = clusterId;
      nextBranch.choiceSourceBranchId = branchId;
      nextBranch.choiceSourceEntryId = entryId;
      nextBranch.autoContinueTarget = existingContinuationBranch?.label;

      const updatedLabels = current.labels.map((branch) =>
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
      );

      const insertionIndex = existingContinuationBranch
        ? updatedLabels.findIndex((branch) => branch.id === existingContinuationBranch.id)
        : findChoiceClusterInsertionIndex(updatedLabels, clusterId, branchId);

      return {
        ...current,
        labels: [
          ...updatedLabels.slice(0, insertionIndex),
          nextBranch,
          ...updatedLabels.slice(insertionIndex)
        ]
      };
    });
  }

  function handleAddPostChoiceContinuationEntry(
    clusterId: string,
    sourceBranchId: string,
    entryKind: DialogueEntry["kind"]
  ) {
    patchDialogue((current) => {
      const derivedClusters = deriveChoiceClusters(current.labels);
      const cluster = derivedClusters.get(clusterId);
      const existingContinuationBranch = current.labels.find(
        (branch) => branch.continuationForChoiceClusterId === clusterId
      );

      if (existingContinuationBranch) {
        return {
          ...current,
          labels: current.labels.map((branch) =>
            branch.id === existingContinuationBranch.id
              ? {
                  ...branch,
                  entries: [
                    ...branch.entries,
                    createEntryForKind(
                      entryKind,
                      existingContinuationBranch.id,
                      current,
                      branch.entries.map((entry) => entry.id)
                    )
                  ]
                }
              : branch
          )
        };
      }

      const sourceBranch = current.labels.find((branch) => branch.id === sourceBranchId);
      if (!sourceBranch || !cluster) {
        return current;
      }

      const continuationBranch = createDialogueBranch(
        `${sourceBranch.label}_after_choices`,
        current.labels.map((branch) => branch.label),
        [createEntryForKind(entryKind, sourceBranchId, current, [])]
      );
      continuationBranch.continuationForChoiceClusterId = clusterId;
      continuationBranch.choiceSourceBranchId = sourceBranchId;

      const labelsWithAutoContinue = current.labels.map((branch) =>
        cluster.branchIds.includes(branch.id)
          ? {
              ...branch,
              autoContinueTarget: continuationBranch.label,
              choiceClusterId: branch.choiceClusterId ?? clusterId,
              choiceSourceBranchId: branch.choiceSourceBranchId ?? sourceBranchId
            }
          : branch
      );

      const insertionIndex = findChoiceClusterInsertionIndex(labelsWithAutoContinue, clusterId, sourceBranchId);

      return {
        ...current,
        labels: [
          ...labelsWithAutoContinue.slice(0, insertionIndex),
          continuationBranch,
          ...labelsWithAutoContinue.slice(insertionIndex)
        ]
      };
    });
  }

  function handleRemovePostChoiceContinuation(clusterId: string) {
    patchDialogue((current) => {
      const derivedClusters = deriveChoiceClusters(current.labels);
      const cluster = derivedClusters.get(clusterId);

      return {
        ...current,
        labels: current.labels
          .filter((branch) => branch.continuationForChoiceClusterId !== clusterId)
          .map((branch) =>
            cluster?.branchIds.includes(branch.id)
              ? {
                  ...branch,
                  autoContinueTarget: undefined
                }
              : branch
          )
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

  function renderPostChoiceContinuationSection(branch: DialogueLabel) {
    const clusterId = effectiveChoiceClusterIdByBranchId.get(branch.id);
    if (!clusterId) {
      return null;
    }

    const branchCount = choiceClusterBranchCounts.get(clusterId) ?? 0;
    const continuationBranch = continuationBranchesByClusterId.get(clusterId) ?? null;
    const shouldRenderSection = branchCount >= 2 || Boolean(continuationBranch);

    if (!shouldRenderSection || lastVisibleBranchIdByClusterId.get(clusterId) !== branch.id) {
      return null;
    }

    return (
      <article key={`continuation:${clusterId}`} className="dialogue-branch-card dialogue-branch-card--continuation">
        <header className="dialogue-branch-header">
          <div className="branch-label-field">
            <span>After these choices</span>
            <p className="muted">
              This section continues automatically after any branch in this choice set finishes, unless that branch explicitly ends or jumps somewhere else.
            </p>
          </div>
          <div className="dialogue-branch-actions">
            {continuationBranch ? (
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => handleRemovePostChoiceContinuation(clusterId)}
              >
                Remove section
              </button>
            ) : null}
          </div>
        </header>

        <div className="dialogue-entry-list">
          {continuationBranch ? (
            continuationBranch.entries.map((entry) => renderEntryEditor(continuationBranch, entry))
          ) : (
            <div className="empty-state compact">
              Add shared follow-up dialogue here. Technica will route each branch in this choice cluster into it automatically.
            </div>
          )}
        </div>

        <div className="dialogue-entry-buttons">
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAddPostChoiceContinuationEntry(clusterId, derivedChoiceClusters.get(clusterId)?.sourceBranchId || branch.id, "line")}
          >
            Add line
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAddPostChoiceContinuationEntry(clusterId, derivedChoiceClusters.get(clusterId)?.sourceBranchId || branch.id, "choice")}
          >
            Add choice
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAddPostChoiceContinuationEntry(clusterId, derivedChoiceClusters.get(clusterId)?.sourceBranchId || branch.id, "jump")}
          >
            Add jump
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAddPostChoiceContinuationEntry(clusterId, derivedChoiceClusters.get(clusterId)?.sourceBranchId || branch.id, "set")}
          >
            Set flag
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAddPostChoiceContinuationEntry(clusterId, derivedChoiceClusters.get(clusterId)?.sourceBranchId || branch.id, "end")}
          >
            End branch
          </button>
        </div>
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
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  void Promise.all([
                    ensureSummaries("npc", { force: true }),
                    ensureSummaries("dialogue", { force: true }),
                    ensureSummaries("gear", { force: true }),
                    ensureSummaries("item", { force: true }),
                    ensureSummaries("fieldmod", { force: true }),
                    ensureSummaries("schema", { force: true })
                  ])
                }
              >
                Refresh game summaries
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
                value={serializeKeyValueLines(visibleMetadata)}
                onChange={(event) =>
                  patchDialogue((current) => ({
                    ...current,
                    metadata: applyDialogueOccurrenceRulesToMetadata(
                      parseKeyValueLines(event.target.value),
                      extractDialogueOccurrenceRules(current.metadata)
                    )
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

        <Panel
          title="When Does This Dialogue Happen?"
          subtitle="Attach this conversation to an NPC, choose whether it overrides or joins a random pool, and gate it behind progression or owned content."
        >
          <div className="form-grid">
            <label className="field">
              <span>Assigned NPC</span>
              <select
                value={occurrenceRules.npcId}
                onChange={(event) =>
                  patchOccurrenceRules((current) => ({
                    ...current,
                    npcId: event.target.value
                  }))
                }
              >
                <option value="">None</option>
                {npcOptions.map((npc) => (
                  <option key={npc.id} value={npc.id}>
                    {npc.name} ({npc.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Dialogue behavior</span>
              <select
                value={occurrenceRules.mode}
                onChange={(event) =>
                  patchOccurrenceRules((current) => ({
                    ...current,
                    mode: event.target.value === "random_pool" ? "random_pool" : "exclusive"
                  }))
                }
              >
                <option value="exclusive">Always / only thing they say</option>
                <option value="random_pool">Add to random pool</option>
              </select>
            </label>
            <label className="field">
              <span>Pool weight</span>
              <input
                type="number"
                min={1}
                step={1}
                value={occurrenceRules.poolWeight}
                disabled={occurrenceRules.mode !== "random_pool"}
                onChange={(event) =>
                  patchOccurrenceRules((current) => ({
                    ...current,
                    poolWeight: Math.max(1, Number(event.target.value || 1))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Unlock after floor</span>
              <input
                type="number"
                min={0}
                step={1}
                value={occurrenceRules.unlockAfterFloor}
                onChange={(event) =>
                  patchOccurrenceRules((current) => ({
                    ...current,
                    unlockAfterFloor: Math.max(0, Number(event.target.value || 0))
                  }))
                }
              />
            </label>

            <label className="field full">
              <span>Require completed quests</span>
              <input
                value={serializeCommaList(occurrenceRules.requiredQuestIds)}
                placeholder="quest_restore_signal_grid, quest_clear_foundry_gate"
                onChange={(event) =>
                  patchOccurrenceRules((current) => ({
                    ...current,
                    requiredQuestIds: parseCommaList(event.target.value)
                  }))
                }
              />
            </label>

            <label className="field full">
              <span>Require owned gear</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  addOccurrenceListValue("requiredGearIds", event.target.value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Add gear requirement...</option>
                {gearOptions
                  .filter((option) => !occurrenceRules.requiredGearIds.includes(option.id))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
              </select>
              {occurrenceRules.requiredGearIds.length > 0 ? (
                <div className="chip-row">
                  {occurrenceRules.requiredGearIds.map((gearId) => (
                    <button
                      key={gearId}
                      type="button"
                      className="pill"
                      onClick={() => removeOccurrenceListValue("requiredGearIds", gearId)}
                    >
                      {gearId} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No gear requirements.</p>
              )}
            </label>

            <label className="field full">
              <span>Require owned items</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  addOccurrenceListValue("requiredItemIds", event.target.value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Add item requirement...</option>
                {itemOptions
                  .filter((option) => !occurrenceRules.requiredItemIds.includes(option.id))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
              </select>
              {occurrenceRules.requiredItemIds.length > 0 ? (
                <div className="chip-row">
                  {occurrenceRules.requiredItemIds.map((itemId) => (
                    <button
                      key={itemId}
                      type="button"
                      className="pill"
                      onClick={() => removeOccurrenceListValue("requiredItemIds", itemId)}
                    >
                      {itemId} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No item requirements.</p>
              )}
            </label>

            <label className="field full">
              <span>Require unlocked schema</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  addOccurrenceListValue("requiredSchemaIds", event.target.value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Add schema requirement...</option>
                {schemaOptions
                  .filter((option) => !occurrenceRules.requiredSchemaIds.includes(option.id))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
              </select>
              {occurrenceRules.requiredSchemaIds.length > 0 ? (
                <div className="chip-row">
                  {occurrenceRules.requiredSchemaIds.map((schemaId) => (
                    <button
                      key={schemaId}
                      type="button"
                      className="pill"
                      onClick={() => removeOccurrenceListValue("requiredSchemaIds", schemaId)}
                    >
                      {schemaId} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No schema requirements.</p>
              )}
            </label>

            <label className="field full">
              <span>Require owned field mods</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  addOccurrenceListValue("requiredFieldModIds", event.target.value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Add field mod requirement...</option>
                {fieldModOptions
                  .filter((option) => !occurrenceRules.requiredFieldModIds.includes(option.id))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
              </select>
              {occurrenceRules.requiredFieldModIds.length > 0 ? (
                <div className="chip-row">
                  {occurrenceRules.requiredFieldModIds.map((fieldModId) => (
                    <button
                      key={fieldModId}
                      type="button"
                      className="pill"
                      onClick={() => removeOccurrenceListValue("requiredFieldModIds", fieldModId)}
                    >
                      {fieldModId} x
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No field mod requirements.</p>
              )}
            </label>
          </div>

          <div className="toolbar split">
            <div className="chip-row">
              {currentNpcOption ? <span className="pill accent">Attached to {currentNpcOption.name}</span> : null}
              {currentNpcOption?.dialogueId ? (
                <span className="pill">Default dialogue: {currentNpcOption.dialogueId}</span>
              ) : null}
              {currentNpcOption?.dialogueId && occurrenceRules.mode === "exclusive" && !preferredPublishTarget ? (
                <span className="pill">Publishes as Technica override</span>
              ) : null}
            </div>
            {attachedDialogueRows.filter((row) => row.modeLabel === "Always / only line set").length > 1 ? (
              <span className="muted">Multiple always-on dialogues are attached here. Chaos Core will use the first eligible override.</span>
            ) : null}
          </div>

          {occurrenceRules.npcId ? (
            attachedDialogueRows.length > 0 ? (
              <div className="dialogue-linked-list">
                {attachedDialogueRows.map((row) => (
                  <article
                    key={row.key}
                    className={`dialogue-entry-card ${row.isCurrentDraft ? "dialogue-entry-card--current" : ""}`}
                  >
                    <div className="dialogue-entry-header">
                      <strong>{row.title}</strong>
                      <div className="toolbar">
                        <span className="flow-badge jump">{row.sourceLabel}</span>
                        {!row.isCurrentDraft ? (
                          <>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleLoadAttachedDialogue(row.entryKey)}
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              className="ghost-button danger"
                              disabled={deletingAttachedDialogueKey === row.key}
                              onClick={() => void handleDeleteAttachedDialogue(row)}
                            >
                              {row.origin === "game" ? "Disable" : "Delete"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="chip-row">
                      <span className="pill">{row.contentId}</span>
                      <span className="pill">{row.modeLabel}</span>
                      <span className="pill">{row.unlockLabel}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">No dialogue is attached to this NPC yet.</div>
            )
          ) : (
            <div className="empty-state compact">
              Pick an NPC to see its current dialogue pool, default base-game line set, and any published Technica overrides.
            </div>
          )}
        </Panel>

        <ChaosCoreDatabasePanel
          contentType="dialogue"
          currentDocument={dialogue}
          buildBundle={(current) => buildDialogueBundleForTarget(refreshDialogueDocument(current), "chaos-core")}
          onLoadEntry={handleLoadDatabaseEntry}
          preferredPublishTargetEntryKey={preferredPublishTarget?.entryKey}
          preferredPublishTargetSourceFile={preferredPublishTarget?.sourceFile}
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
            {visibleBranches.map((branch) => (
              <div key={branch.id} className="dialogue-branch-stack">
                <article className="dialogue-branch-card">
                  <header className="dialogue-branch-header">
                    <label className="field branch-label-field">
                      <span>Branch name</span>
                      <input
                        value={branch.label}
                        onChange={(event) => handleRenameBranch(branch.id, event.target.value)}
                      />
                    </label>
                    <div className="dialogue-branch-actions">
                      {effectiveChoiceClusterIdByBranchId.get(branch.id) ? <span className="pill">Choice branch</span> : null}
                      {branch.autoContinueTarget || continuationBranchesByClusterId.get(effectiveChoiceClusterIdByBranchId.get(branch.id) ?? "") ? (
                        <span className="pill accent">Auto-continues</span>
                      ) : null}
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

                {renderPostChoiceContinuationSection(branch)}
              </div>
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
