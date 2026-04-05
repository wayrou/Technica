import type { FieldModDocument } from "../types/fieldmod";
import { isoNow } from "../utils/date";

export function createBlankFieldMod(): FieldModDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mod_new",
    name: "Untitled Field Mod",
    effects: "",
    scope: "unit",
    cost: 10,
    rarity: "common",
    unlockAfterOperationFloor: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleFieldMod(): FieldModDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mod_contact_overload",
    name: "Contact Overload",
    effects: "On hit: 15% chance to deal +1 damage to a random enemy.",
    scope: "unit",
    cost: 10,
    rarity: "common",
    unlockAfterOperationFloor: 4,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
