import type { EffectFlowDocument } from "./effectFlow";

export type FieldModScope = "unit" | "squad";
export type FieldModRarity = "common" | "uncommon" | "rare";
export type FieldModTrigger =
  | "battle_start"
  | "turn_start"
  | "card_played"
  | "draw"
  | "move"
  | "hit"
  | "crit"
  | "kill"
  | "shield_gained"
  | "damage_taken"
  | "room_cleared";
export type FieldModStackMode = "linear" | "additive";

export const fieldModScopes: FieldModScope[] = ["unit", "squad"];
export const fieldModRarities: FieldModRarity[] = ["common", "uncommon", "rare"];
export const fieldModTriggers: FieldModTrigger[] = [
  "battle_start",
  "turn_start",
  "card_played",
  "draw",
  "move",
  "hit",
  "crit",
  "kill",
  "shield_gained",
  "damage_taken",
  "room_cleared",
];
export const fieldModStackModes: FieldModStackMode[] = ["linear", "additive"];

export interface FieldModDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  effects: string;
  trigger: FieldModTrigger;
  chance: number;
  stackMode: FieldModStackMode;
  maxStacks: number;
  effectFlow: EffectFlowDocument;
  scope: FieldModScope;
  cost: number;
  rarity: FieldModRarity;
  unlockAfterOperationFloor: number;
  createdAt: string;
  updatedAt: string;
}
