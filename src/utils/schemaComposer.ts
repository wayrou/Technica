import type {
  SchemaCoreCategory,
  SchemaDocument,
  SchemaNetworkOutputMode,
  SchemaOperationalRequirements,
  SchemaResourceWallet,
  SchemaRoomTag,
  SchemaTagOutputModifier,
  SchemaUnlockSource
} from "../types/schema";
import { createId } from "./id";

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readSchemaKind(value: unknown): SchemaDocument["kind"] {
  return value === "fortification" ? "fortification" : "core";
}

function readSchemaUnlockSource(value: unknown, fallback: SchemaUnlockSource): SchemaUnlockSource {
  if (value === "starter" || value === "schema") {
    return value;
  }

  return fallback;
}

function readSchemaNetworkOutputMode(
  value: unknown,
  fallback: SchemaNetworkOutputMode
): SchemaNetworkOutputMode {
  if (value === "add_input" || value === "fixed") {
    return value;
  }

  if (value === "additive" || value === "plus_input" || value === "plus-input") {
    return "add_input";
  }

  return fallback;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function createSchemaResourceWallet(partial?: Partial<SchemaResourceWallet>): SchemaResourceWallet {
  return {
    metalScrap: partial?.metalScrap ?? 0,
    wood: partial?.wood ?? 0,
    chaosShards: partial?.chaosShards ?? 0,
    steamComponents: partial?.steamComponents ?? 0
  };
}

export function createSchemaOperationalRequirements(
  partial?: Partial<SchemaOperationalRequirements>
): SchemaOperationalRequirements {
  return {
    powerWatts: partial?.powerWatts ?? 0,
    commsBw: partial?.commsBw ?? 0,
    supplyCrates: partial?.supplyCrates ?? 0
  };
}

export function createSchemaTagOutputModifier(
  partial?: Partial<SchemaTagOutputModifier>
): SchemaTagOutputModifier {
  return {
    id: partial?.id?.trim() || createId("schema-modifier"),
    tag: (partial?.tag?.trim() as SchemaRoomTag | undefined) || "salvage_rich",
    output: createSchemaResourceWallet(partial?.output),
    note: partial?.note ?? ""
  };
}

function normalizeWallet(value: unknown, fallback: SchemaResourceWallet): SchemaResourceWallet {
  const record = toRecord(value);
  return createSchemaResourceWallet({
    metalScrap: readNumber(record?.metalScrap) ?? fallback.metalScrap,
    wood: readNumber(record?.wood) ?? fallback.wood,
    chaosShards: readNumber(record?.chaosShards) ?? fallback.chaosShards,
    steamComponents: readNumber(record?.steamComponents) ?? fallback.steamComponents
  });
}

function normalizeOperationalRequirements(
  value: unknown,
  fallback: SchemaOperationalRequirements
): SchemaOperationalRequirements {
  const record = toRecord(value);
  return createSchemaOperationalRequirements({
    powerWatts: readNumber(record?.powerWatts) ?? fallback.powerWatts,
    commsBw: readNumber(record?.commsBw) ?? fallback.commsBw,
    supplyCrates: readNumber(record?.supplyCrates) ?? fallback.supplyCrates
  });
}

function normalizeTagOutputModifier(value: unknown, index: number): SchemaTagOutputModifier | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const tag = readOptionalString(record.tag);
  if (!tag) {
    return null;
  }

  return createSchemaTagOutputModifier({
    id: readString(record.id, `schema_modifier_${index + 1}`),
    tag: tag as SchemaRoomTag,
    output: normalizeWallet(record.output, createSchemaResourceWallet()),
    note: readString(record.note, "")
  });
}

function inferLegacyUnlockSource(
  record: UnknownRecord,
  fallback: SchemaUnlockSource
): SchemaUnlockSource {
  const explicit = readSchemaUnlockSource(record.unlockSource, fallback);
  if (record.unlockSource === "starter" || record.unlockSource === "schema") {
    return explicit;
  }

  const metadata = toRecord(record.metadata);
  if (metadata?.unlockSource === "starter" || metadata?.unlockSource === "schema") {
    return metadata.unlockSource;
  }

  const buildCost = toRecord(record.buildCost);
  const legacyWadCost = readNumber(buildCost?.wad) ?? 0;
  const unlockWadCost = readNumber(record.unlockWadCost) ?? 0;
  const unlockCost = toRecord(record.unlockCost);
  const hasUnlockResources = Boolean(
    (unlockCost && Object.values(unlockCost).some((value) => typeof value === "number" && Number(value) > 0))
      || legacyWadCost > 0
      || unlockWadCost > 0
  );

  return hasUnlockResources ? "schema" : fallback;
}

export function normalizeSchemaDocument(value: unknown, fallback: SchemaDocument): SchemaDocument {
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const metadata = toRecord(record.metadata);
  const kind = readSchemaKind(record.kind);
  const defaultCategory = kind === "fortification" ? "" : fallback.category;
  const rawModifiers = Array.isArray(record.tagOutputModifiers)
    ? record.tagOutputModifiers
        .map((entry, index) => normalizeTagOutputModifier(entry, index))
        .filter((entry): entry is SchemaTagOutputModifier => entry !== null)
    : [];
  const buildCostRecord = toRecord(record.buildCost);
  const unlockSource = inferLegacyUnlockSource(record, fallback.unlockSource);

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name ?? record.displayName, fallback.name),
    kind,
    shortCode: readString(record.shortCode, fallback.shortCode),
    category: readString(record.category ?? metadata?.category, defaultCategory) as SchemaCoreCategory,
    description: readString(record.description, fallback.description),
    operationalRequirements: normalizeOperationalRequirements(
      record.operationalRequirements,
      fallback.operationalRequirements
    ),
    powerOutputWatts: readNumber(record.powerOutputWatts) ?? fallback.powerOutputWatts,
    powerOutputMode: readSchemaNetworkOutputMode(record.powerOutputMode, fallback.powerOutputMode),
    commsOutputBw: readNumber(record.commsOutputBw) ?? fallback.commsOutputBw,
    commsOutputMode: readSchemaNetworkOutputMode(record.commsOutputMode, fallback.commsOutputMode),
    supplyOutputCrates: readNumber(record.supplyOutputCrates) ?? fallback.supplyOutputCrates,
    supplyOutputMode: readSchemaNetworkOutputMode(record.supplyOutputMode, fallback.supplyOutputMode),
    buildCost: normalizeWallet(record.buildCost, fallback.buildCost),
    upkeep: normalizeWallet(record.upkeep, fallback.upkeep),
    wadUpkeepPerTick: readNumber(record.wadUpkeepPerTick ?? record.wadUpkeep) ?? fallback.wadUpkeepPerTick,
    incomePerTick: normalizeWallet(record.incomePerTick ?? record.income, fallback.incomePerTick),
    supportRadius: readNumber(record.supportRadius) ?? fallback.supportRadius,
    unlockSource,
    unlockCost: normalizeWallet(record.unlockCost, fallback.unlockCost),
    unlockWadCost: readNumber(record.unlockWadCost) ?? readNumber(buildCostRecord?.wad) ?? fallback.unlockWadCost,
    requiredQuestIds: readStringList(record.requiredQuestIds),
    preferredRoomTags: readStringList(record.preferredRoomTags) as SchemaRoomTag[],
    tagOutputModifiers: rawModifiers,
    placeholder: readBoolean(record.placeholder) ?? fallback.placeholder,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}
