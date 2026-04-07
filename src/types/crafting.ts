import type { KeyValueRecord } from "./common";

export type CraftingCategory = "armor" | "consumable" | "upgrade";
export type RecipeAcquisitionMethod = "starter" | "purchased" | "unlock_floor" | "found" | "reward";

export const craftingCategories: CraftingCategory[] = ["armor", "consumable", "upgrade"];
export const recipeAcquisitionMethods: RecipeAcquisitionMethod[] = [
  "starter",
  "purchased",
  "unlock_floor",
  "found",
  "reward"
];

export interface CraftingResourceCost {
  metalScrap: number;
  wood: number;
  chaosShards: number;
  steamComponents: number;
}

export interface CraftingGrantDocument {
  itemId: string;
  quantity: number;
}

export interface CraftingDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  category: CraftingCategory;
  description: string;
  cost: CraftingResourceCost;
  grants: CraftingGrantDocument[];
  requiresItemId: string;
  acquisitionMethod: RecipeAcquisitionMethod;
  purchaseVendor: string;
  purchaseCostWad: number;
  unlockFloor: number;
  requiredQuestIds: string[];
  notes: string;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
