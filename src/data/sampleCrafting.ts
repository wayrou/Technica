import type { CraftingDocument } from "../types/crafting";
import { isoNow } from "../utils/date";

export function createBlankCraftingRecipe(): CraftingDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "recipe_new",
    name: "Untitled Recipe",
    category: "armor",
    description: "",
    cost: {
      metalScrap: 0,
      wood: 0,
      chaosShards: 0,
      steamComponents: 0
    },
    grants: [
      {
        itemId: "",
        quantity: 1
      }
    ],
    requiresItemId: "",
    acquisitionMethod: "starter",
    purchaseVendor: "haven_shop",
    purchaseCostWad: 0,
    unlockFloor: 0,
    notes: "",
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleCraftingRecipe(): CraftingDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "recipe_steam_valve_wristguard",
    name: "Steam Valve Wristguard",
    category: "armor",
    description: "An accessory recipe that vents heat from mechanical weapons.",
    cost: {
      metalScrap: 2,
      wood: 0,
      chaosShards: 0,
      steamComponents: 3
    },
    grants: [
      {
        itemId: "accessory_steam_valve_wristguard",
        quantity: 1
      }
    ],
    requiresItemId: "",
    acquisitionMethod: "unlock_floor",
    purchaseVendor: "haven_shop",
    purchaseCostWad: 0,
    unlockFloor: 3,
    notes: "Quartermaster training packet becomes available after clearing floor 3.",
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
