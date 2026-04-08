import type { NpcDocument } from "../types/npc";
import { isoNow } from "../utils/date";
import { runtimeId } from "../utils/id";

export function createBlankNpc(): NpcDocument {
  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "npc_new_arrival",
    name: "New Arrival",
    faction: "",
    mapId: "base_camp",
    tileX: 8,
    tileY: 8,
    routeMode: "none",
    routePoints: [],
    dialogueId: "npc_new_arrival",
    portraitKey: "",
    spriteKey: "",
    metadata: {},
    createdAt: isoNow(),
    updatedAt: isoNow()
  };
}

export function createSampleNpc(): NpcDocument {
  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "npc_village_guide",
    name: "Village Guide",
    faction: "wayfarer",
    mapId: "base_camp",
    tileX: 9,
    tileY: 10,
    routeMode: "fixed",
    routePoints: [
      { id: runtimeId("guide_patrol_a", "route_point"), x: 9, y: 10 },
      { id: runtimeId("guide_patrol_b", "route_point"), x: 12, y: 10 },
      { id: runtimeId("guide_patrol_c", "route_point"), x: 12, y: 12 }
    ],
    dialogueId: "village_guide_intro",
    portraitKey: "guide_smile",
    spriteKey: "guide_field_sprite",
    metadata: {
      role: "mentor"
    },
    createdAt: isoNow(),
    updatedAt: isoNow()
  };
}
