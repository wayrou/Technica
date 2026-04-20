import type { DishDocument } from "../types/dish";
import { createMerchantListingDocument } from "../types/merchant";
import { isoNow } from "../utils/date";

export function createBlankDish(): DishDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "dish_new",
    name: "Untitled Dish",
    cost: 30,
    unlockAfterOperationFloor: 0,
    merchant: createMerchantListingDocument(),
    requiredQuestIds: [],
    effect: "",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleDish(): DishDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "meal_scorched_pepper_stew",
    name: "Scorched Pepper Stew",
    cost: 35,
    unlockAfterOperationFloor: 3,
    merchant: createMerchantListingDocument({ soldAtMerchant: true, merchantFloor: 3 }),
    requiredQuestIds: [],
    effect: "+1 ATK next run.",
    description: "A smoky pepper stew that leaves squads fired up for the next deployment.",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
