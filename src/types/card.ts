import type { ImageAsset, KeyValueRecord } from "./common";

export type CardDocumentType = "core" | "class" | "equipment" | "gambit";
export type CardDocumentRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type CardDocumentCategory =
  | "attack"
  | "defense"
  | "utility"
  | "mobility"
  | "buff"
  | "debuff"
  | "steam"
  | "chaos";
export type CardDocumentTargetType = "enemy" | "self" | "tile" | "ally";

export const cardDocumentTypes: CardDocumentType[] = ["core", "class", "equipment", "gambit"];
export const cardDocumentRarities: CardDocumentRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
export const cardDocumentCategories: CardDocumentCategory[] = [
  "attack",
  "defense",
  "utility",
  "mobility",
  "buff",
  "debuff",
  "steam",
  "chaos"
];
export const cardDocumentTargetTypes: CardDocumentTargetType[] = ["enemy", "self", "tile", "ally"];

export interface CardEffectDocument {
  type: string;
  amount?: number;
  duration?: number;
  stat?: string;
  tiles?: number;
}

export interface CardDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  cardType: CardDocumentType;
  rarity: CardDocumentRarity;
  category: CardDocumentCategory;
  strainCost: number;
  targetType: CardDocumentTargetType;
  range: number;
  damage?: number;
  effects: CardEffectDocument[];
  sourceClassId?: string;
  sourceEquipmentId?: string;
  artAsset?: ImageAsset;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
