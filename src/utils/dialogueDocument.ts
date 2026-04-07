import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP, type KeyValueRecord, type ValidationIssue } from "../types/common";
import type {
  DialogueChoice,
  DialogueDocument,
  DialogueEntry,
  DialogueJump,
  DialogueLabel,
  DialogueLine,
  DialogueSetFlag
} from "../types/dialogue";
import { isoNow } from "./date";
import { parseDialogueSource } from "./dialogueParser";
import { normalizeDialogueOccurrenceMetadataKey } from "./dialogueOccurrence";
import { createSequentialId, runtimeId, slugify } from "./id";
import { parseCommaList } from "./records";

const DEFAULT_BRANCH_ID = "opening";

function buildStats(labels: DialogueLabel[]) {
  return labels.reduce(
    (stats, label) => {
      for (const entry of label.entries) {
        if (entry.kind === "line") {
          stats.lineCount += 1;
        }
        if (entry.kind === "choice") {
          stats.choiceCount += 1;
        }
      }

      return stats;
    },
    {
      labelCount: labels.filter((label) => !label.continuationForChoiceClusterId).length,
      lineCount: 0,
      choiceCount: 0
    }
  );
}

function escapeAttributeValue(value: string) {
  if (!value.trim()) {
    return "\"\"";
  }

  return /\s/.test(value) ? `"${value.replace(/"/g, "'")}"` : value;
}

function serializeMetadataLines(metadata: KeyValueRecord) {
  return Object.entries(metadata)
    .filter(([key, value]) => key.trim() && String(value).trim())
    .map(([key, value]) => `@meta ${normalizeDialogueMetadataKey(key)}=${value}`)
    .join("\n");
}

function serializeAttributes(attributes: KeyValueRecord) {
  const serialized = Object.entries(attributes)
    .filter(([, value]) => String(value).trim())
    .map(([key, value]) => `${key}=${escapeAttributeValue(String(value))}`);

  return serialized.length > 0 ? ` [${serialized.join(" ")}]` : "";
}

function serializeChoiceFlags(setFlags: KeyValueRecord) {
  return Object.entries(setFlags)
    .filter(([key]) => key.trim())
    .map(([key, value]) => `${key}:${String(value).trim() || "true"}`)
    .join(",");
}

function normalizeBranchId(value: string, fallback = DEFAULT_BRANCH_ID) {
  return runtimeId(value, fallback);
}

function normalizeDocumentMetadata(metadata: KeyValueRecord) {
  return Object.entries(metadata).reduce<KeyValueRecord>((nextMetadata, [key, value]) => {
    const normalizedKey = normalizeDialogueMetadataKey(key);
    const normalizedValue = String(value).trim();
    if (normalizedKey && normalizedValue) {
      nextMetadata[normalizedKey] = normalizedValue;
    }
    return nextMetadata;
  }, {});
}

function normalizeDialogueMetadataKey(key: string) {
  const trimmedKey = key.trim();
  const occurrenceKey = normalizeDialogueOccurrenceMetadataKey(trimmedKey);
  if (occurrenceKey !== trimmedKey) {
    return occurrenceKey;
  }

  return /\s/.test(trimmedKey) ? runtimeId(trimmedKey, "meta") : trimmedKey;
}

function normalizeLineEntry(entry: DialogueLine, index: number): DialogueLine {
  return {
    ...entry,
    id: entry.id || `line_${index + 1}`,
    speaker: entry.speaker.trim() || "Narrator",
    text: entry.text,
    mood: entry.mood?.trim() || undefined,
    portraitKey: entry.portraitKey?.trim() || undefined,
    sceneId: entry.sceneId?.trim() || undefined,
    condition: entry.condition?.trim() || undefined,
    tags: Array.from(new Set(entry.tags.map((tag) => tag.trim()).filter(Boolean))),
    metadata: normalizeDocumentMetadata(entry.metadata)
  };
}

function normalizeChoiceEntry(entry: DialogueChoice, index: number, knownBranches: string[]): DialogueChoice {
  return {
    ...entry,
    id: entry.id || `choice_${index + 1}`,
    text: entry.text,
    target: normalizeBranchId(entry.target || knownBranches[0] || DEFAULT_BRANCH_ID),
    condition: entry.condition?.trim() || undefined,
    tags: Array.from(new Set(entry.tags.map((tag) => tag.trim()).filter(Boolean))),
    setFlags: normalizeDocumentMetadata(entry.setFlags),
    metadata: normalizeDocumentMetadata(entry.metadata)
  };
}

function normalizeJumpEntry(entry: DialogueJump, index: number, knownBranches: string[]): DialogueJump {
  return {
    ...entry,
    id: entry.id || `jump_${index + 1}`,
    target: normalizeBranchId(entry.target || knownBranches[0] || DEFAULT_BRANCH_ID),
    condition: entry.condition?.trim() || undefined
  };
}

function normalizeSetFlagEntry(entry: DialogueSetFlag, index: number): DialogueSetFlag {
  return {
    ...entry,
    id: entry.id || `set_${index + 1}`,
    flag: runtimeId(entry.flag, `flag_${index + 1}`),
    value: String(entry.value).trim() || "true"
  };
}

function normalizeEntry(entry: DialogueEntry, index: number, knownBranches: string[]): DialogueEntry {
  if (entry.kind === "line") {
    return normalizeLineEntry(entry, index);
  }

  if (entry.kind === "choice") {
    return normalizeChoiceEntry(entry, index, knownBranches);
  }

  if (entry.kind === "jump") {
    return normalizeJumpEntry(entry, index, knownBranches);
  }

  if (entry.kind === "set") {
    return normalizeSetFlagEntry(entry, index);
  }

  return {
    ...entry,
    id: entry.id || `end_${index + 1}`
  };
}

function normalizeBranchTarget(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalizeBranchId(normalized, DEFAULT_BRANCH_ID) : undefined;
}

function normalizeLabels(labels: DialogueLabel[]) {
  const knownBranches = labels.map((label, index) => normalizeBranchId(label.label || label.id, `branch_${index + 1}`));
  return labels.map((label, index) => ({
    id: label.id || `branch_${index + 1}`,
    label: knownBranches[index],
    entries: label.entries.map((entry, entryIndex) => normalizeEntry(entry, entryIndex, knownBranches)),
    autoContinueTarget: normalizeBranchTarget(label.autoContinueTarget),
    choiceClusterId: label.choiceClusterId?.trim() || undefined,
    choiceSourceBranchId: label.choiceSourceBranchId?.trim() || undefined,
    choiceSourceEntryId: label.choiceSourceEntryId?.trim() || undefined,
    continuationForChoiceClusterId: label.continuationForChoiceClusterId?.trim() || undefined
  }));
}

export function serializeDialogueDocument(document: DialogueDocument) {
  const lines = [
    `@id ${runtimeId(document.id, slugify(document.title, "dialogue"))}`,
    `@title ${document.title.trim() || "Untitled Dialogue"}`,
    `@scene ${runtimeId(document.sceneId, "scene_untitled")}`
  ];

  const metadataLines = serializeMetadataLines(document.metadata);
  if (metadataLines) {
    lines.push(metadataLines);
  }

  if (document.tags.length > 0) {
    lines.push(`@tag ${document.tags.join(", ")}`);
  }

  document.labels.forEach((label) => {
    lines.push("", `:${normalizeBranchId(label.label, DEFAULT_BRANCH_ID)}`);

    label.entries.forEach((entry) => {
      if (entry.kind === "line") {
        const attributes: KeyValueRecord = {
          ...entry.metadata
        };
        if (entry.mood) attributes.mood = entry.mood;
        if (entry.portraitKey) attributes.portrait = entry.portraitKey;
        if (entry.sceneId) attributes.scene = entry.sceneId;
        if (entry.condition) attributes.if = entry.condition;
        if (entry.tags.length > 0) attributes.tags = entry.tags.join(",");
        lines.push(`${entry.speaker || "Narrator"}${serializeAttributes(attributes)}: ${entry.text}`);
      }

      if (entry.kind === "choice") {
        const attributes: KeyValueRecord = {
          ...entry.metadata
        };
        if (entry.condition) attributes.if = entry.condition;
        if (entry.tags.length > 0) attributes.tags = entry.tags.join(",");
        const flags = serializeChoiceFlags(entry.setFlags);
        if (flags) attributes.set = flags;
        lines.push(`? ${entry.text} -> ${normalizeBranchId(entry.target)}${serializeAttributes(attributes)}`);
      }

      if (entry.kind === "jump") {
        lines.push(`-> ${normalizeBranchId(entry.target)}`);
      }

      if (entry.kind === "set") {
        lines.push(`@set ${runtimeId(entry.flag, "flag")}=${String(entry.value).trim() || "true"}`);
      }

      if (entry.kind === "end") {
        lines.push("END");
      }
    });
  });

  return `${lines.join("\n").trim()}\n`;
}

export function refreshDialogueDocument(document: DialogueDocument): DialogueDocument {
  const labels = normalizeLabels(document.labels.length > 0 ? document.labels : [createDialogueBranch(DEFAULT_BRANCH_ID)]);
  const entryLabel = normalizeBranchId(
    labels.some((label) => label.label === document.entryLabel) ? document.entryLabel : labels[0]?.label,
    DEFAULT_BRANCH_ID
  );

  const refreshedDocument: DialogueDocument = {
    ...document,
    id: runtimeId(document.id, slugify(document.title, "dialogue")),
    title: document.title.trim() || "Untitled Dialogue",
    sceneId: runtimeId(document.sceneId, "scene_untitled"),
    metadata: normalizeDocumentMetadata(document.metadata),
    tags: Array.from(new Set(document.tags.map((tag) => tag.trim()).filter(Boolean))),
    entryLabel,
    labels,
    stats: buildStats(labels),
    updatedAt: isoNow()
  };

  return {
    ...refreshedDocument,
    rawSource: serializeDialogueDocument(refreshedDocument)
  };
}

export function validateDialogueDocument(document: DialogueDocument): ValidationIssue[] {
  const normalizedDocument = refreshDialogueDocument(document);
  const issues: ValidationIssue[] = [];
  const labelNames = normalizedDocument.labels.map((label) => label.label);
  const labelNameSet = new Set(labelNames);

  if (!normalizedDocument.id.trim()) {
    issues.push({
      severity: "error",
      field: "id",
      message: "Dialogue id is required."
    });
  }

  if (!normalizedDocument.title.trim()) {
    issues.push({
      severity: "error",
      field: "title",
      message: "Dialogue title is required."
    });
  }

  if (!normalizedDocument.sceneId.trim()) {
    issues.push({
      severity: "error",
      field: "sceneId",
      message: "Scene id is required."
    });
  }

  if (labelNames.length === 0) {
    issues.push({
      severity: "error",
      message: "Add at least one conversation branch."
    });
    return issues;
  }

  if (labelNameSet.size !== labelNames.length) {
    issues.push({
      severity: "error",
      message: "Branch names must be unique."
    });
  }

  if (!labelNameSet.has(normalizedDocument.entryLabel)) {
    issues.push({
      severity: "error",
      field: "entryLabel",
      message: "Pick an existing branch as the opening branch."
    });
  }

  const reachable = new Set<string>();
  const queue = [normalizedDocument.entryLabel];
  const branchMap = new Map(normalizedDocument.labels.map((label) => [label.label, label]));

  while (queue.length > 0) {
    const currentBranch = queue.shift();
    if (!currentBranch || reachable.has(currentBranch)) {
      continue;
    }

    reachable.add(currentBranch);
    branchMap.get(currentBranch)?.entries.forEach((entry) => {
      if ((entry.kind === "choice" || entry.kind === "jump") && labelNameSet.has(entry.target) && !reachable.has(entry.target)) {
        queue.push(entry.target);
      }
    });
    const autoContinueTarget = branchMap.get(currentBranch)?.autoContinueTarget;
    if (autoContinueTarget && labelNameSet.has(autoContinueTarget) && !reachable.has(autoContinueTarget)) {
      queue.push(autoContinueTarget);
    }
  }

  normalizedDocument.labels.forEach((label) => {
    if (label.entries.length === 0) {
      issues.push({
        severity: "warning",
        field: label.label,
        message: `Branch '${label.label}' is empty.`
      });
    }

    if (!reachable.has(label.label)) {
      issues.push({
        severity: "warning",
        field: label.label,
        message: `Branch '${label.label}' is unreachable from '${normalizedDocument.entryLabel}'.`
      });
    }

    if (label.autoContinueTarget && !labelNameSet.has(label.autoContinueTarget)) {
      issues.push({
        severity: "error",
        field: label.label,
        message: `Post-choice continuation target '${label.autoContinueTarget}' does not match any branch.`
      });
    }

    label.entries.forEach((entry) => {
      if (entry.kind === "line") {
        if (!entry.speaker.trim()) {
          issues.push({
            severity: "error",
            field: label.label,
            message: `A line in '${label.label}' is missing its speaker.`
          });
        }

        if (!entry.text.trim()) {
          issues.push({
            severity: "error",
            field: label.label,
            message: `A line in '${label.label}' is missing its dialogue text.`
          });
        }
      }

      if (entry.kind === "choice") {
        if (!entry.text.trim()) {
          issues.push({
            severity: "error",
            field: label.label,
            message: `A choice in '${label.label}' needs visible button text.`
          });
        }

        if (!labelNameSet.has(entry.target)) {
          issues.push({
            severity: "error",
            field: label.label,
            message: `Choice target '${entry.target}' does not match any branch.`
          });
        }
      }

      if (entry.kind === "jump" && !labelNameSet.has(entry.target)) {
        issues.push({
          severity: "error",
          field: label.label,
          message: `Jump target '${entry.target}' does not match any branch.`
        });
      }

      if (entry.kind === "set" && !entry.flag.trim()) {
        issues.push({
          severity: "error",
          field: label.label,
          message: `A flag action in '${label.label}' is missing its key.`
        });
      }
    });
  });

  if (!normalizedDocument.labels.some((label) => label.entries.some((entry) => entry.kind === "end"))) {
    issues.push({
      severity: "warning",
      message: "No branch currently ends the conversation."
    });
  }

  return issues;
}

export function canPublishDialogueAsBuiltInSource(document: DialogueDocument): boolean {
  const normalizedDocument = refreshDialogueDocument(document);
  const visibleLabels = normalizedDocument.labels.filter((label) => !label.continuationForChoiceClusterId);

  if (visibleLabels.length !== 1) {
    return false;
  }

  const [branch] = visibleLabels;
  if (!branch || branch.autoContinueTarget) {
    return false;
  }

  return branch.entries.every((entry) => {
    if (entry.kind === "end") {
      return true;
    }

    if (entry.kind !== "line") {
      return false;
    }

    return (
      !entry.mood &&
      !entry.portraitKey &&
      !entry.sceneId &&
      !entry.condition &&
      entry.tags.length === 0 &&
      Object.keys(entry.metadata).length === 0
    );
  });
}

export function createDialogueBranch(
  label: string,
  existingLabels: string[] = [],
  initialEntries?: DialogueEntry[]
): DialogueLabel {
  const preferredLabel = normalizeBranchId(label, "branch");
  const normalizedLabel = existingLabels.map((entry) => normalizeBranchId(entry, "branch")).includes(preferredLabel)
    ? createSequentialId(preferredLabel, existingLabels)
    : preferredLabel;

  return {
    id: normalizedLabel,
    label: normalizedLabel,
    entries: initialEntries ?? [
      {
        id: "line_1",
        kind: "line",
        speaker: "Narrator",
        text: "",
        tags: [],
        metadata: {}
      }
    ]
  };
}

export function createDialogueLine(existingIds: string[] = []): DialogueLine {
  return {
    id: createSequentialId("line", existingIds),
    kind: "line",
    speaker: "Narrator",
    text: "",
    tags: [],
    metadata: {}
  };
}

export function createDialogueChoice(target: string, existingIds: string[] = []): DialogueChoice {
  return {
    id: createSequentialId("choice", existingIds),
    kind: "choice",
    text: "New choice",
    target: normalizeBranchId(target, DEFAULT_BRANCH_ID),
    tags: [],
    setFlags: {},
    metadata: {}
  };
}

export function createDialogueJump(target: string, existingIds: string[] = []): DialogueJump {
  return {
    id: createSequentialId("jump", existingIds),
    kind: "jump",
    target: normalizeBranchId(target, DEFAULT_BRANCH_ID)
  };
}

export function createDialogueSetFlag(existingIds: string[] = []): DialogueSetFlag {
  return {
    id: createSequentialId("set", existingIds),
    kind: "set",
    flag: "story_flag",
    value: "true"
  };
}

export function createDialogueEnd(existingIds: string[] = []) {
  return {
    id: createSequentialId("end", existingIds),
    kind: "end" as const
  };
}

export function createBlankDialogueDocument(): DialogueDocument {
  const timestamp = isoNow();
  const openingBranch = createDialogueBranch(DEFAULT_BRANCH_ID);
  const document: DialogueDocument = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: "new_dialogue",
    title: "Untitled Dialogue",
    sceneId: "scene_untitled",
    rawSource: "",
    metadata: {},
    tags: [],
    entryLabel: openingBranch.label,
    labels: [openingBranch],
    stats: {
      labelCount: 1,
      lineCount: 1,
      choiceCount: 0
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return refreshDialogueDocument(document);
}

export function parseDialogueDocumentInput(content: string): DialogueDocument | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        payload?: DialogueDocument;
        rawSource?: string;
        source?: {
          rawSource?: string;
        };
        lines?: string[];
        title?: string;
        sceneId?: string;
        id?: string;
        labels?: DialogueLabel[];
      };
      const payload = parsed.payload ?? parsed;
      if (payload && typeof payload === "object" && "id" in payload && "labels" in payload && Array.isArray(payload.labels)) {
        return refreshDialogueDocument(payload as DialogueDocument);
      }
      if (parsed.payload?.rawSource) {
        return refreshDialogueDocument(parseDialogueSource(parsed.payload.rawSource).document);
      }
      if (parsed.rawSource) {
        return refreshDialogueDocument(parseDialogueSource(parsed.rawSource).document);
      }
      if (parsed.source?.rawSource) {
        return refreshDialogueDocument(parseDialogueSource(parsed.source.rawSource).document);
      }
      if (parsed.id && Array.isArray(parsed.lines)) {
        return refreshDialogueDocument(
          parseDialogueSource(
            `@id ${parsed.id}\n@title ${parsed.title ?? parsed.id}\n@scene ${parsed.sceneId ?? "scene_untitled"}\n\n:${DEFAULT_BRANCH_ID}\n${parsed.lines
              .map((line) => `${parsed.title ?? "Narrator"}: ${line}`)
              .join("\n")}\nEND\n`
          ).document
        );
      }
    } catch {
      return null;
    }

    return null;
  }

  return refreshDialogueDocument(parseDialogueSource(content).document);
}

export function parseDialogueTags(value: string) {
  return parseCommaList(value);
}
