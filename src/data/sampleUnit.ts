import type { UnitDocument } from "../types/unit";
import { isoNow } from "../utils/date";

export function createBlankUnit(): UnitDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_unit",
    name: "Untitled Unit",
    description: "",
    faction: "",
    currentClassId: "squire",
    spawnRole: "player",
    enemySpawnFloorOrdinals: [],
    requiredQuestIds: [],
    stats: {
      maxHp: 12,
      atk: 8,
      def: 6,
      agi: 3,
      acc: 6
    },
    loadout: {
      primaryWeapon: "",
      secondaryWeapon: "",
      helmet: "",
      chestpiece: "",
      accessory1: "",
      accessory2: ""
    },
    traits: [],
    pwr: 25,
    recruitCost: 0,
    startingInRoster: true,
    deployInParty: false,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleUnit(): UnitDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "unit_brass_harrow",
    name: "Brass Harrow",
    description: "A steady breach specialist prepared for early operation deployment.",
    faction: "anchor",
    currentClassId: "squire",
    spawnRole: "player",
    enemySpawnFloorOrdinals: [],
    requiredQuestIds: [],
    stats: {
      maxHp: 15,
      atk: 9,
      def: 7,
      agi: 4,
      acc: 7
    },
    loadout: {
      primaryWeapon: "weapon_iron_longsword",
      secondaryWeapon: "",
      helmet: "armor_ironguard_helm",
      chestpiece: "armor_steelplate_cuirass",
      accessory1: "accessory_steel_signet_ring",
      accessory2: ""
    },
    traits: ["Frontline", "Reliable"],
    pwr: 42,
    recruitCost: 120,
    startingInRoster: true,
    deployInParty: false,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
