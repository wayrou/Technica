import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP } from "../types/common";
import type { KeyItemDocument } from "../types/keyItem";
import { isoNow } from "../utils/date";

export function createBlankKeyItem(): KeyItemDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: "new_key_item",
    name: "New Key Item",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSampleKeyItem(): KeyItemDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: "sealed_letter_for_aeriss",
    name: "Sealed Letter",
    description: "A stamped letter meant for Aeriss. HAVEN tracks it as a quest-only key item.",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
