import type { ImageAsset, KeyValueRecord } from "./common";
import type { EffectFlowDocument } from "./effectFlow";

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
export type CardEffectBlockAction =
  | "damage"
  | "heal"
  | "def_up"
  | "atk_up"
  | "agi_up"
  | "acc_up"
  | "def_down"
  | "atk_down"
  | "agi_down"
  | "acc_down"
  | "push"
  | "move"
  | "stun"
  | "burn"
  | "set_flag"
  | "end_turn";
export type CardEffectComposerMode = "blocks" | "manual";

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
export const cardEffectBlockActions: CardEffectBlockAction[] = [
  "damage",
  "heal",
  "def_up",
  "atk_up",
  "agi_up",
  "acc_up",
  "def_down",
  "atk_down",
  "agi_down",
  "acc_down",
  "push",
  "move",
  "stun",
  "burn",
  "set_flag",
  "end_turn"
];

export interface CardEffectDocument {
  type: string;
  amount?: number;
  duration?: number;
  stat?: string;
  tiles?: number;
}

export interface CardEffectBlockDocument {
  id: string;
  action: CardEffectBlockAction;
  amount?: number;
  duration?: number;
  stat?: string;
  tiles?: number;
  note?: string;
  condition?: string;
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
  effectFlow: EffectFlowDocument;
  effectComposerMode: CardEffectComposerMode;
  effectBlocks: CardEffectBlockDocument[];
  effects: CardEffectDocument[];
  sourceClassId?: string;
  sourceEquipmentId?: string;
  artAsset?: ImageAsset;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
