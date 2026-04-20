import type { ImageAsset, KeyValueRecord } from "./common";
import type { MerchantListingDocument } from "./merchant";

export type SupportedWeaponType =
  | "sword"
  | "greatsword"
  | "shortsword"
  | "shield"
  | "bow"
  | "greatbow"
  | "gun"
  | "staff"
  | "greatstaff"
  | "dagger"
  | "knife"
  | "fist"
  | "rod"
  | "katana"
  | "shuriken"
  | "spear"
  | "instrument";

export type GearSlotType = "weapon" | "helmet" | "chestpiece" | "accessory";

export const supportedWeaponTypes: SupportedWeaponType[] = [
  "sword",
  "greatsword",
  "shortsword",
  "shield",
  "bow",
  "greatbow",
  "gun",
  "staff",
  "greatstaff",
  "dagger",
  "knife",
  "fist",
  "rod",
  "katana",
  "shuriken",
  "spear",
  "instrument"
];

export const gearSlotTypes: GearSlotType[] = ["weapon", "helmet", "chestpiece", "accessory"];

export interface GearStats {
  atk: number;
  def: number;
  agi: number;
  acc: number;
  hp: number;
}

export interface GearInventoryProfile {
  massKg: number;
  bulkBu: number;
  powerW: number;
  startingOwned: boolean;
}

export interface GearShopSource {
  enabled: boolean;
  unlockFloor: number;
  notes: string;
}

export interface GearEnemyDropSource {
  enabled: boolean;
  enemyUnitIds: string[];
  notes: string;
}

export interface GearVictoryRewardSource {
  enabled: boolean;
  floorOrdinals: number[];
  regionIds: string[];
  notes: string;
}

export interface GearAcquisitionDocument {
  shop: GearShopSource;
  enemyDrop: GearEnemyDropSource;
  victoryReward: GearVictoryRewardSource;
  otherSourcesNotes: string;
}

export interface GearDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  slot: GearSlotType;
  weaponType?: SupportedWeaponType;
  isMechanical: boolean;
  stats: GearStats;
  cardsGranted: string[];
  moduleSlots: number;
  attachedModules: string[];
  wear: number;
  inventory: GearInventoryProfile;
  acquisition: GearAcquisitionDocument;
  merchant: MerchantListingDocument;
  iconAsset?: ImageAsset;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
