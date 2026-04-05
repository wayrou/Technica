import type { ItemDocument } from "../types/item";
import { isoNow } from "../utils/date";

function createBaseAcquisition() {
  return {
    startsWithPlayer: false,
    havenShop: {
      enabled: true,
      unlockFloor: 1,
      notes: "Available in the HAVEN support shop after the first tactical floor."
    },
    fieldMapResource: {
      enabled: false,
      mapId: "",
      resourceNodeId: "",
      notes: ""
    },
    enemyDrop: {
      enabled: false,
      enemyUnitIds: [],
      notes: ""
    },
    otherSourcesNotes: ""
  } satisfies ItemDocument["acquisition"];
}

export function createBlankItem(): ItemDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_item",
    name: "Untitled Item",
    description: "",
    kind: "consumable",
    archetype: "standard",
    stackable: true,
    quantity: 1,
    massKg: 1,
    bulkBu: 1,
    powerW: 0,
    acquisition: createBaseAcquisition(),
    weaponChassis: {
      stability: 70,
      cardSlots: 3
    },
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
    archetype: "standard",
    stackable: true,
    quantity: 3,
    massKg: 1,
    bulkBu: 1,
    powerW: 20,
    acquisition: {
      startsWithPlayer: true,
      havenShop: {
        enabled: true,
        unlockFloor: 1,
        notes: "Support crews can restock these in HAVEN."
      },
      fieldMapResource: {
        enabled: true,
        mapId: "base_camp",
        resourceNodeId: "resource_phase_cache",
        notes: "Can also be scavenged from the Phase Cache node."
      },
      enemyDrop: {
        enabled: true,
        enemyUnitIds: ["enemy_phase_sapper"],
        notes: "Phase Sappers sometimes carry spare cells."
      },
      otherSourcesNotes: "Good fit for scripted tutorial rewards and engineering quest turn-ins."
    },
    weaponChassis: {
      stability: 0,
      cardSlots: 0
    },
    metadata: {
      useCase: "support",
      rarity: "field_issue"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
