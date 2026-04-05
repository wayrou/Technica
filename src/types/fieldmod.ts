export type FieldModScope = "unit" | "squad";
export type FieldModRarity = "common" | "uncommon" | "rare";

export const fieldModScopes: FieldModScope[] = ["unit", "squad"];
export const fieldModRarities: FieldModRarity[] = ["common", "uncommon", "rare"];

export interface FieldModDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  effects: string;
  scope: FieldModScope;
  cost: number;
  rarity: FieldModRarity;
  unlockAfterOperationFloor: number;
  createdAt: string;
  updatedAt: string;
}
