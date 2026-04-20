import type { DecorationDocument } from "../types/decoration";
import { createMerchantListingDocument } from "../types/merchant";
import { isoNow } from "../utils/date";

export function createBlankDecoration(): DecorationDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "decoration_new",
    name: "Untitled Decoration",
    description: "",
    tileSize: 1,
    merchant: createMerchantListingDocument(),
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleDecoration(): DecorationDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "decoration_haven_banner",
    name: "HAVEN Banner",
    description: "A wall-hung banner used to break up empty industrial corridors in the HAVEN interior.",
    tileSize: 1,
    merchant: createMerchantListingDocument({ soldAtMerchant: true, merchantFloor: 2 }),
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
