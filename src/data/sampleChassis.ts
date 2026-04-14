import type { ChassisDocument } from "../types/chassis";
import { createChassisId } from "../types/chassis";
import { createResourceWalletDocument } from "../types/resources";
import { isoNow } from "../utils/date";

export function createBlankChassis(): ChassisDocument {
  const timestamp = isoNow();
  const name = "New Chassis";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createChassisId(name),
    name,
    slotType: "weapon",
    stability: 70,
    kg: 8,
    bu: 12,
    w: 5,
    cardSlots: 4,
    description: "",
    buildCost: createResourceWalletDocument(),
    unlockAfterFloor: 0,
    availableInHavenShop: true,
    havenShopUnlockAfterFloor: 0,
    requiredQuestIds: [],
    allowedCardTags: [],
    allowedCardFamilies: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleChassis(): ChassisDocument {
  const timestamp = isoNow();
  const name = "Mistguard Bulwark";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createChassisId(name),
    name,
    slotType: "weapon",
    stability: 78,
    kg: 11,
    bu: 15,
    w: 7,
    cardSlots: 4,
    description: "A reinforced frontline frame built to hold formation while feeding stable card lines into heavy weapon routines.",
    buildCost: createResourceWalletDocument({
      metalScrap: 18,
      wood: 2,
      steamComponents: 3,
      fittings: 2,
      chargeCells: 1
    }),
    unlockAfterFloor: 2,
    availableInHavenShop: true,
    havenShopUnlockAfterFloor: 2,
    requiredQuestIds: [],
    allowedCardTags: ["guard", "stability"],
    allowedCardFamilies: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
