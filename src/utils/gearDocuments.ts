import { createBlankGear } from "../data/sampleGear";
import type { ImageAsset, KeyValueRecord } from "../types/common";
import {
  gearSlotTypes,
  supportedWeaponTypes,
  type GearAcquisitionDocument,
  type GearDocument,
  type GearInventoryProfile,
  type GearSlotType,
  type GearStats,
  type SupportedWeaponType,
} from "../types/gear";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
    .filter(Boolean);
}

function normalizeNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry));
}

function normalizeImageAsset(value: unknown): ImageAsset | undefined {
  const record = asRecord(value);
  const fileName = readString(record.fileName);
  const mimeType = readString(record.mimeType);
  const dataUrl = readString(record.dataUrl);

  if (!fileName && !mimeType && !dataUrl) {
    return undefined;
  }

  return {
    fileName,
    mimeType,
    sizeBytes: readFiniteNumber(record.sizeBytes),
    dataUrl,
  };
}

function normalizeMetadata(value: unknown): KeyValueRecord {
  const record = asRecord(value);

  return Object.entries(record).reduce<KeyValueRecord>((normalized, [key, entry]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || entry === undefined || entry === null) {
      return normalized;
    }

    normalized[normalizedKey] = typeof entry === "string" ? entry : String(entry);
    return normalized;
  }, {});
}

function normalizeStats(value: unknown, fallback: GearStats): GearStats {
  const record = asRecord(value);

  return {
    atk: readFiniteNumber(record.atk, fallback.atk),
    def: readFiniteNumber(record.def, fallback.def),
    agi: readFiniteNumber(record.agi, fallback.agi),
    acc: readFiniteNumber(record.acc, fallback.acc),
    hp: readFiniteNumber(record.hp, fallback.hp),
  };
}

function normalizeInventory(value: unknown, fallback: GearInventoryProfile): GearInventoryProfile {
  const record = asRecord(value);

  return {
    massKg: readFiniteNumber(record.massKg, fallback.massKg),
    bulkBu: readFiniteNumber(record.bulkBu, fallback.bulkBu),
    powerW: readFiniteNumber(record.powerW, fallback.powerW),
    startingOwned: readBoolean(record.startingOwned, fallback.startingOwned),
  };
}

function normalizeAcquisition(value: unknown, fallback: GearAcquisitionDocument): GearAcquisitionDocument {
  const record = asRecord(value);
  const shop = asRecord(record.shop);
  const enemyDrop = asRecord(record.enemyDrop);
  const victoryReward = asRecord(record.victoryReward);

  return {
    shop: {
      enabled: readBoolean(shop.enabled, fallback.shop.enabled),
      unlockFloor: readFiniteNumber(shop.unlockFloor, fallback.shop.unlockFloor),
      notes: readString(shop.notes, fallback.shop.notes),
    },
    enemyDrop: {
      enabled: readBoolean(enemyDrop.enabled, fallback.enemyDrop.enabled),
      enemyUnitIds: normalizeStringList(enemyDrop.enemyUnitIds),
      notes: readString(enemyDrop.notes, fallback.enemyDrop.notes),
    },
    victoryReward: {
      enabled: readBoolean(victoryReward.enabled, fallback.victoryReward.enabled),
      floorOrdinals: normalizeNumberList(victoryReward.floorOrdinals),
      regionIds: normalizeStringList(victoryReward.regionIds),
      notes: readString(victoryReward.notes, fallback.victoryReward.notes),
    },
    otherSourcesNotes: readString(record.otherSourcesNotes, fallback.otherSourcesNotes),
  };
}

function normalizeSlot(value: unknown, fallback: GearSlotType): GearSlotType {
  if (typeof value === "string" && gearSlotTypes.includes(value as GearSlotType)) {
    return value as GearSlotType;
  }

  return fallback;
}

function normalizeWeaponType(value: unknown, slot: GearSlotType): SupportedWeaponType | undefined {
  if (slot !== "weapon") {
    return undefined;
  }

  if (typeof value === "string" && supportedWeaponTypes.includes(value as SupportedWeaponType)) {
    return value as SupportedWeaponType;
  }

  return undefined;
}

export function normalizeGearDocument(value: unknown): GearDocument {
  const fallback = createBlankGear();
  const record = asRecord(value);
  const slot = normalizeSlot(record.slot, fallback.slot);

  return {
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    slot,
    weaponType: normalizeWeaponType(record.weaponType, slot),
    isMechanical: readBoolean(record.isMechanical, fallback.isMechanical),
    stats: normalizeStats(record.stats, fallback.stats),
    cardsGranted: normalizeStringList(record.cardsGranted),
    moduleSlots: readFiniteNumber(record.moduleSlots, fallback.moduleSlots),
    attachedModules: normalizeStringList(record.attachedModules),
    wear: readFiniteNumber(record.wear, fallback.wear),
    inventory: normalizeInventory(record.inventory, fallback.inventory),
    acquisition: normalizeAcquisition(record.acquisition, fallback.acquisition),
    iconAsset: normalizeImageAsset(record.iconAsset),
    metadata: normalizeMetadata(record.metadata),
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt),
  };
}
