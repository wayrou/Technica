import type { FactionDocument } from "../types/faction";
import { isoNow } from "../utils/date";
import { createFactionId } from "../types/faction";

export function createBlankFaction(): FactionDocument {
  const timestamp = isoNow();
  const name = "New Faction";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createFactionId(name),
    name,
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleFaction(): FactionDocument {
  const timestamp = isoNow();
  const name = "Lantern Guild";

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: createFactionId(name),
    name,
    description: "Guild-backed navigators, couriers, and troubleshooters who keep routes, rumors, and salvage opportunities moving.",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
