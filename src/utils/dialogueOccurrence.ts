import type { KeyValueRecord } from "../types/common";

export type DialogueOccurrenceMode = "exclusive" | "random_pool";

export interface DialogueOccurrenceRules {
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

export const DIALOGUE_OCCURRENCE_METADATA_KEYS = {
  npcId: "dialogueNpcId",
  mode: "dialogueOccurrence",
  poolWeight: "dialoguePoolWeight",
  unlockAfterFloor: "dialogueUnlockAfterFloor",
  requiredQuestIds: "dialogueRequireQuestIds",
  requiredGearIds: "dialogueRequireGearIds",
  requiredItemIds: "dialogueRequireItemIds",
  requiredFieldModIds: "dialogueRequireFieldModIds",
  requiredSchemaIds: "dialogueRequireSchemaIds",
  legacyLinkedNpcId: "linkedNpcId"
} as const;

const DIALOGUE_OCCURRENCE_METADATA_KEY_SET = new Set(
  Object.values(DIALOGUE_OCCURRENCE_METADATA_KEYS).map((value) => value.toLowerCase())
);

const EMPTY_RULES: DialogueOccurrenceRules = {
  npcId: "",
  mode: "exclusive",
  poolWeight: 1,
  unlockAfterFloor: 0,
  requiredQuestIds: [],
  requiredGearIds: [],
  requiredItemIds: [],
  requiredFieldModIds: [],
  requiredSchemaIds: []
};

function readMetadataString(metadata: Record<string, unknown> | undefined | null, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined | null, ...keys: string[]) {
  const raw = readMetadataString(metadata, ...keys);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCommaList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function serializeCommaList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

function normalizeMode(value: string): DialogueOccurrenceMode {
  return value.trim().toLowerCase() === "random_pool" ? "random_pool" : "exclusive";
}

function sanitizeIdList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeDialogueOccurrenceMetadataKey(key: string) {
  const trimmedKey = key.trim();
  const collapsedKey = trimmedKey.replace(/[-_\s]/g, "").toLowerCase();

  switch (collapsedKey) {
    case "linkednpcid":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.legacyLinkedNpcId;
    case "dialoguenpcid":
    case "dialogueassignmentnpcid":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.npcId;
    case "dialogueoccurrence":
    case "dialoguemode":
    case "dialogueassignmentmode":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.mode;
    case "dialoguepoolweight":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.poolWeight;
    case "dialogueunlockafterfloor":
    case "dialoguefloorunlock":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.unlockAfterFloor;
    case "dialoguerequirequestids":
    case "dialoguerequiredquestids":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredQuestIds;
    case "dialoguerequiregearids":
    case "dialoguerequiredgearids":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredGearIds;
    case "dialoguerequireitemids":
    case "dialoguerequireditemids":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredItemIds;
    case "dialoguerequirefieldmodids":
    case "dialoguerequiredfieldmodids":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredFieldModIds;
    case "dialoguerequireschemaids":
    case "dialoguerequiredschemaids":
      return DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredSchemaIds;
    default:
      return trimmedKey;
  }
}

export function isDialogueOccurrenceMetadataKey(key: string) {
  return DIALOGUE_OCCURRENCE_METADATA_KEY_SET.has(normalizeDialogueOccurrenceMetadataKey(key).toLowerCase());
}

export function stripDialogueOccurrenceMetadata(metadata: KeyValueRecord): KeyValueRecord {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !isDialogueOccurrenceMetadataKey(key))
  );
}

export function extractDialogueOccurrenceRules(
  metadata: Record<string, unknown> | undefined | null
): DialogueOccurrenceRules {
  const npcId = readMetadataString(
    metadata,
    DIALOGUE_OCCURRENCE_METADATA_KEYS.npcId,
    DIALOGUE_OCCURRENCE_METADATA_KEYS.legacyLinkedNpcId,
    "linkednpcid"
  );

  return {
    npcId,
    mode: normalizeMode(readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.mode)),
    poolWeight: Math.max(1, Math.round(readMetadataNumber(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.poolWeight) || 1)),
    unlockAfterFloor: Math.max(
      0,
      Math.round(readMetadataNumber(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.unlockAfterFloor))
    ),
    requiredQuestIds: parseCommaList(
      readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredQuestIds)
    ),
    requiredGearIds: parseCommaList(
      readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredGearIds)
    ),
    requiredItemIds: parseCommaList(
      readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredItemIds)
    ),
    requiredFieldModIds: parseCommaList(
      readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredFieldModIds)
    ),
    requiredSchemaIds: parseCommaList(
      readMetadataString(metadata, DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredSchemaIds)
    )
  };
}

export function applyDialogueOccurrenceRulesToMetadata(
  metadata: KeyValueRecord,
  rules: DialogueOccurrenceRules
): KeyValueRecord {
  const nextMetadata = stripDialogueOccurrenceMetadata(metadata);
  const npcId = rules.npcId.trim();

  if (!npcId) {
    return nextMetadata;
  }

  nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.npcId] = npcId;
  nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.legacyLinkedNpcId] = npcId;
  nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.mode] = rules.mode;

  if (rules.mode === "random_pool" && rules.poolWeight > 1) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.poolWeight] = String(Math.max(1, Math.round(rules.poolWeight)));
  }

  if (rules.unlockAfterFloor > 0) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.unlockAfterFloor] = String(
      Math.max(0, Math.round(rules.unlockAfterFloor))
    );
  }

  const questIds = serializeCommaList(sanitizeIdList(rules.requiredQuestIds));
  if (questIds) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredQuestIds] = questIds;
  }

  const gearIds = serializeCommaList(sanitizeIdList(rules.requiredGearIds));
  if (gearIds) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredGearIds] = gearIds;
  }

  const itemIds = serializeCommaList(sanitizeIdList(rules.requiredItemIds));
  if (itemIds) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredItemIds] = itemIds;
  }

  const fieldModIds = serializeCommaList(sanitizeIdList(rules.requiredFieldModIds));
  if (fieldModIds) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredFieldModIds] = fieldModIds;
  }

  const schemaIds = serializeCommaList(sanitizeIdList(rules.requiredSchemaIds));
  if (schemaIds) {
    nextMetadata[DIALOGUE_OCCURRENCE_METADATA_KEYS.requiredSchemaIds] = schemaIds;
  }

  return nextMetadata;
}

export function createEmptyDialogueOccurrenceRules(): DialogueOccurrenceRules {
  return {
    ...EMPTY_RULES,
    requiredQuestIds: [],
    requiredGearIds: [],
    requiredItemIds: [],
    requiredFieldModIds: [],
    requiredSchemaIds: []
  };
}

export function summarizeDialogueOccurrenceRules(
  metadata: Record<string, unknown> | undefined | null
): Record<string, unknown> | undefined {
  const rules = extractDialogueOccurrenceRules(metadata);
  if (!rules.npcId) {
    return undefined;
  }

  return {
    npcId: rules.npcId,
    mode: rules.mode,
    poolWeight: rules.poolWeight,
    unlockAfterFloor: rules.unlockAfterFloor,
    requiredQuestIds: rules.requiredQuestIds,
    requiredGearIds: rules.requiredGearIds,
    requiredItemIds: rules.requiredItemIds,
    requiredFieldModIds: rules.requiredFieldModIds,
    requiredSchemaIds: rules.requiredSchemaIds
  };
}
