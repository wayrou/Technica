import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP, type KeyValueRecord, type ValidationIssue } from "../types/common";
import type {
  DialogueChoice,
  DialogueDocument,
  DialogueEntry,
  DialogueLabel,
  DialogueLine
} from "../types/dialogue";
import { isoNow } from "./date";
import { createId, slugify } from "./id";
import { parseCommaList } from "./records";

function parseAttributeBlock(rawAttributes: string) {
  const attributes: KeyValueRecord = {};
  const matcher = /([a-zA-Z0-9_-]+)=("[^"]*"|'[^']*'|[^\s]+)/g;

  for (const match of rawAttributes.matchAll(matcher)) {
    const key = match[1];
    const value = match[2].replace(/^['"]|['"]$/g, "");
    attributes[key] = value;
  }

  return attributes;
}

function parseSetFlags(rawValue: string) {
  return rawValue
    .split(",")
    .map((assignment) => assignment.trim())
    .filter(Boolean)
    .reduce<KeyValueRecord>((flags, assignment) => {
      const separatorIndex = assignment.includes(":") ? assignment.indexOf(":") : assignment.indexOf("=");
      if (separatorIndex === -1) {
        flags[assignment] = "true";
        return flags;
      }

      const key = assignment.slice(0, separatorIndex).trim();
      const value = assignment.slice(separatorIndex + 1).trim();
      if (key) {
        flags[key] = value || "true";
      }
      return flags;
    }, {});
}

function separateKnownAttributes(attributes: KeyValueRecord) {
  const metadata = { ...attributes };
  const tags = attributes.tags ? parseCommaList(attributes.tags) : [];
  const condition = attributes.if;
  const mood = attributes.mood;
  const portraitKey = attributes.portrait;
  const sceneId = attributes.scene;
  const setFlags = attributes.set ? parseSetFlags(attributes.set) : {};

  delete metadata.tags;
  delete metadata.if;
  delete metadata.mood;
  delete metadata.portrait;
  delete metadata.scene;
  delete metadata.set;

  return {
    metadata,
    tags,
    condition,
    mood,
    portraitKey,
    sceneId,
    setFlags
  };
}

function createLineEntry(speakerSegment: string, text: string, lineNumber: number): DialogueLine | null {
  const attributeMatch = speakerSegment.match(/^(.*?)\s*\[(.+)\]\s*$/);
  const speaker = (attributeMatch ? attributeMatch[1] : speakerSegment).trim();
  const attributes = attributeMatch ? parseAttributeBlock(attributeMatch[2]) : {};
  const normalized = separateKnownAttributes(attributes);

  if (!speaker || !text.trim()) {
    return null;
  }

  return {
    id: createId(`line-${lineNumber}`),
    kind: "line",
    speaker,
    text: text.trim(),
    mood: normalized.mood,
    portraitKey: normalized.portraitKey,
    sceneId: normalized.sceneId,
    condition: normalized.condition,
    tags: normalized.tags,
    metadata: normalized.metadata
  };
}

function createChoiceEntry(rawContent: string, lineNumber: number): DialogueChoice | null {
  const choicePattern = /^(.*?)\s*->\s*([a-zA-Z0-9_-]+)(?:\s*\[(.+)\])?$/;
  const match = rawContent.match(choicePattern);

  if (!match) {
    return null;
  }

  const attributes = match[3] ? parseAttributeBlock(match[3]) : {};
  const normalized = separateKnownAttributes(attributes);

  return {
    id: createId(`choice-${lineNumber}`),
    kind: "choice",
    text: match[1].trim(),
    target: match[2].trim(),
    condition: normalized.condition,
    tags: normalized.tags,
    setFlags: normalized.setFlags,
    metadata: normalized.metadata
  };
}

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
      labelCount: labels.length,
      lineCount: 0,
      choiceCount: 0
    }
  );
}

function collectReachableLabels(document: DialogueDocument) {
  const visited = new Set<string>();
  const queue = [document.entryLabel];
  const labelMap = new Map(document.labels.map((label) => [label.label, label]));

  while (queue.length > 0) {
    const nextLabel = queue.shift();
    if (!nextLabel || visited.has(nextLabel)) {
      continue;
    }

    visited.add(nextLabel);
    const label = labelMap.get(nextLabel);
    if (!label) {
      continue;
    }

    label.entries.forEach((entry) => {
      if ((entry.kind === "choice" || entry.kind === "jump") && !visited.has(entry.target)) {
        queue.push(entry.target);
      }
    });
  }

  return visited;
}

export function parseDialogueSource(rawSource: string) {
  const issues: ValidationIssue[] = [];
  const timestamp = isoNow();
  const globalMetadata: KeyValueRecord = {};
  const globalTags: string[] = [];
  const labels: DialogueLabel[] = [];
  const labelNames = new Set<string>();
  const lines = rawSource.split(/\r?\n/);
  let currentLabel: DialogueLabel | null = null;
  let title = "Untitled Dialogue";
  let id = "";
  let sceneId = "scene-untitled";

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      return;
    }

    if (line.startsWith("@id ")) {
      id = line.slice(4).trim();
      return;
    }

    if (line.startsWith("@title ")) {
      title = line.slice(7).trim() || title;
      return;
    }

    if (line.startsWith("@scene ")) {
      sceneId = line.slice(7).trim() || sceneId;
      return;
    }

    if (line.startsWith("@meta ")) {
      const content = line.slice(6).trim();
      const separatorIndex = content.includes("=") ? content.indexOf("=") : content.indexOf(" ");
      if (separatorIndex === -1) {
        issues.push({
          severity: "warning",
          line: lineNumber,
          message: "Metadata should use @meta key=value."
        });
        return;
      }

      const key = content.slice(0, separatorIndex).trim();
      const value = content.slice(separatorIndex + 1).trim();
      if (key) {
        globalMetadata[key] = value;
      }
      return;
    }

    if (line.startsWith("@tag ")) {
      globalTags.push(...parseCommaList(line.slice(5)));
      return;
    }

    if (line.startsWith(":")) {
      const labelName = line.slice(1).trim();
      if (!labelName) {
        issues.push({
          severity: "error",
          line: lineNumber,
          message: "Labels need a name after ':'."
        });
        return;
      }

      if (labelNames.has(labelName)) {
        issues.push({
          severity: "error",
          line: lineNumber,
          message: `Duplicate label '${labelName}'.`
        });
      }

      labelNames.add(labelName);
      currentLabel = {
        id: createId(`label-${labelName}`),
        label: labelName,
        entries: []
      };
      labels.push(currentLabel);
      return;
    }

    if (!currentLabel) {
      issues.push({
        severity: "error",
        line: lineNumber,
        message: "Content must appear under a label such as ':start'."
      });
      return;
    }

    if (line === "END") {
      currentLabel.entries.push({
        id: createId(`end-${lineNumber}`),
        kind: "end"
      });
      return;
    }

    if (line.startsWith("@set ")) {
      const assignment = line.slice(5).trim();
      const separatorIndex = assignment.includes("=") ? assignment.indexOf("=") : assignment.indexOf(":");
      const flag = separatorIndex === -1 ? assignment : assignment.slice(0, separatorIndex).trim();
      const value = separatorIndex === -1 ? "true" : assignment.slice(separatorIndex + 1).trim() || "true";

      if (!flag) {
        issues.push({
          severity: "error",
          line: lineNumber,
          message: "Flag assignments need a key after '@set'."
        });
        return;
      }

      currentLabel.entries.push({
        id: createId(`set-${lineNumber}`),
        kind: "set",
        flag,
        value
      });
      return;
    }

    if (line.startsWith("-> ")) {
      const target = line.slice(3).trim();
      if (!target) {
        issues.push({
          severity: "error",
          line: lineNumber,
          message: "Jump lines need a target after '->'."
        });
        return;
      }

      currentLabel.entries.push({
        id: createId(`jump-${lineNumber}`),
        kind: "jump",
        target
      });
      return;
    }

    if (line.startsWith("?")) {
      const choice = createChoiceEntry(line.slice(1).trim(), lineNumber);
      if (!choice) {
        issues.push({
          severity: "error",
          line: lineNumber,
          message: "Choices must use '? Text -> target [if=condition tags=a,b]'."
        });
        return;
      }

      currentLabel.entries.push(choice);
      return;
    }

    const speakerSeparatorIndex = line.indexOf(":");
    if (speakerSeparatorIndex === -1) {
      issues.push({
        severity: "error",
        line: lineNumber,
        message: "Dialogue lines must use 'Speaker: text'."
      });
      return;
    }

    const speakerSegment = line.slice(0, speakerSeparatorIndex).trim();
    const text = line.slice(speakerSeparatorIndex + 1).trim();
    const lineEntry = createLineEntry(speakerSegment, text, lineNumber);

    if (!lineEntry) {
      issues.push({
        severity: "error",
        line: lineNumber,
        message: "Dialogue lines need both a speaker and text."
      });
      return;
    }

    currentLabel.entries.push(lineEntry);
  });

  const document: DialogueDocument = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: id || slugify(title, "dialogue"),
    title,
    sceneId,
    rawSource,
    metadata: globalMetadata,
    tags: Array.from(new Set(globalTags)),
    entryLabel: labels[0]?.label ?? "start",
    labels,
    stats: buildStats(labels),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (labels.length === 0) {
    issues.push({
      severity: "error",
      message: "Add at least one label such as ':start' to create a dialogue flow."
    });
  }

  const definedLabels = new Set(document.labels.map((label) => label.label));
  document.labels.forEach((label) => {
    if (label.entries.length === 0) {
      issues.push({
        severity: "warning",
        message: `Label '${label.label}' is empty.`
      });
    }

    label.entries.forEach((entry) => {
      if ((entry.kind === "choice" || entry.kind === "jump") && !definedLabels.has(entry.target)) {
        issues.push({
          severity: "error",
          message: `Target '${entry.target}' is referenced but not defined.`,
          field: label.label
        });
      }
    });
  });

  const reachable = collectReachableLabels(document);
  document.labels.forEach((label) => {
    if (!reachable.has(label.label)) {
      issues.push({
        severity: "warning",
        message: `Label '${label.label}' is unreachable from '${document.entryLabel}'.`
      });
    }
  });

  const hasTerminalNode = document.labels.some((label) =>
    label.entries.some((entry) => entry.kind === "end")
  );
  if (!hasTerminalNode) {
    issues.push({
      severity: "warning",
      message: "No END node was found. The importer may need to infer how this conversation exits."
    });
  }

  return {
    document,
    issues
  };
}

export function describeDialogueEntry(entry: DialogueEntry) {
  if (entry.kind === "line") {
    return `${entry.speaker}: ${entry.text}`;
  }

  if (entry.kind === "choice") {
    return `${entry.text} -> ${entry.target}`;
  }

  if (entry.kind === "jump") {
    return `Jump -> ${entry.target}`;
  }

  if (entry.kind === "set") {
    return `Set ${entry.flag}=${entry.value}`;
  }

  return "End conversation";
}
