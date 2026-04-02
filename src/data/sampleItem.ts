import type { ItemDocument } from "../types/item";
import { isoNow } from "../utils/date";

export function createBlankItem(): ItemDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_item",
    name: "Untitled Item",
    description: "",
    kind: "consumable",
    stackable: true,
    quantity: 1,
    massKg: 1,
    bulkBu: 1,
    powerW: 0,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleItem(): ItemDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "item_phase_battery",
    name: "Phase Battery",
    description: "Portable surge cell for field repairs, doors, and improvised power routing.",
    kind: "consumable",
    stackable: true,
    quantity: 3,
    massKg: 1,
    bulkBu: 1,
    powerW: 20,
    metadata: {
      useCase: "support",
      rarity: "field_issue"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
