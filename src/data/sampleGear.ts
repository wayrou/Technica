import type { GearDocument } from "../types/gear";
import { isoNow } from "../utils/date";

function createBaseAcquisition() {
  return {
    shop: {
      enabled: false,
      unlockFloor: 0,
      notes: ""
    },
    enemyDrop: {
      enabled: false,
      enemyUnitIds: [],
      notes: ""
    },
    victoryReward: {
      enabled: false,
      floorOrdinals: [],
      regionIds: [],
      notes: ""
    },
    otherSourcesNotes: ""
  } satisfies GearDocument["acquisition"];
}

export function createBlankGear(): GearDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_gear",
    name: "Untitled Gear",
    description: "",
    slot: "weapon",
    weaponType: "sword",
    isMechanical: false,
    stats: {
      atk: 0,
      def: 0,
      agi: 0,
      acc: 0,
      hp: 0
    },
    cardsGranted: [],
    moduleSlots: 0,
    attachedModules: [],
    wear: 0,
    inventory: {
      massKg: 2,
      bulkBu: 1,
      powerW: 0,
      startingOwned: true
    },
    acquisition: createBaseAcquisition(),
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleGear(): GearDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "gear_bastion_blade",
    name: "Bastion Blade",
    description: "A balanced frontline sword package tuned for steady guard pressure.",
    slot: "weapon",
    weaponType: "sword",
    isMechanical: false,
    stats: {
      atk: 3,
      def: 1,
      agi: 0,
      acc: 1,
      hp: 2
    },
    cardsGranted: ["card_guard"],
    moduleSlots: 1,
    attachedModules: [],
    wear: 0,
    inventory: {
      massKg: 4,
      bulkBu: 2,
      powerW: 0,
      startingOwned: true
    },
    acquisition: {
      shop: {
        enabled: true,
        unlockFloor: 0,
        notes: "Frontline outfitter stock in the first HAVEN support shop pass."
      },
      enemyDrop: {
        enabled: false,
        enemyUnitIds: [],
        notes: ""
      },
      victoryReward: {
        enabled: true,
        floorOrdinals: [1],
        regionIds: ["outer_deck"],
        notes: "Good fit for early operation clear rewards in HAVEN-adjacent routes."
      },
      otherSourcesNotes: "Can also be handed out as a scripted tutorial loadout reward."
    },
    metadata: {
      source: "Technica sample",
      role: "frontline"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
