import type { DoctrineDocument } from "../types/doctrine";
import { createDoctrineId } from "../types/doctrine";
import { createMerchantListingDocument } from "../types/merchant";
import { createResourceWalletDocument } from "../types/resources";
import { isoNow } from "../utils/date";

export function createBlankDoctrine(): DoctrineDocument {
  const timestamp = isoNow();
  const name = "New Doctrine";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createDoctrineId(name),
    name,
    shortDescription: "",
    intentTags: ["assault"],
    stabilityModifier: 0,
    strainBias: 0,
    procBias: 0,
    buildCostModifier: createResourceWalletDocument(),
    doctrineRules: "",
    description: "",
    unlockAfterFloor: 0,
    merchant: createMerchantListingDocument(),
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleDoctrine(): DoctrineDocument {
  const timestamp = isoNow();
  const name = "Bastion Doctrine";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createDoctrineId(name),
    name,
    shortDescription: "Stability-first frontline doctrine for shielded advance patterns.",
    intentTags: ["sustain", "control"],
    stabilityModifier: 12,
    strainBias: -0.1,
    procBias: 0,
    buildCostModifier: createResourceWalletDocument({
      metalScrap: 3,
      steamComponents: 1,
      fittings: 1,
      resin: 1
    }),
    doctrineRules: "Guard-oriented cards gain improved consistency. Reactive defense patterns favor lower strain over raw burst.",
    description: "A defensive discipline tuned for squads that want stable guard cycles, patient tempo, and durable board control.",
    unlockAfterFloor: 2,
    merchant: createMerchantListingDocument({ soldAtMerchant: true, merchantFloor: 2 }),
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
