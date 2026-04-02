import type { ImageAsset, KeyValueRecord } from "./common";

export type SupportedWeaponType =
  | "sword"
  | "greatsword"
  | "shortsword"
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
  iconAsset?: ImageAsset;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
