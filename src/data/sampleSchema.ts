import type { SchemaDocument, SchemaResourceWallet, SchemaTagOutputModifier } from "../types/schema";
import { isoNow } from "../utils/date";

function createBlankWallet(): SchemaResourceWallet {
  return {
    metalScrap: 0,
    wood: 0,
    chaosShards: 0,
    steamComponents: 0
  };
}

function createTagOutputModifier(partial?: Partial<SchemaTagOutputModifier>): SchemaTagOutputModifier {
  return {
    id: partial?.id ?? `schema_modifier_${Math.random().toString(36).slice(2, 8)}`,
    tag: partial?.tag ?? "salvage_rich",
    output: {
      ...createBlankWallet(),
      ...(partial?.output ?? {})
    },
    note: partial?.note ?? ""
  };
}

export function createBlankSchema(): SchemaDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "schema_new",
    name: "Untitled Schema Entry",
    kind: "core",
    shortCode: "",
    category: "logistics",
    description: "",
    operationalRequirements: {
      powerWatts: 0,
      commsBw: 0,
      supplyCrates: 0
    },
    powerOutputWatts: 0,
    powerOutputMode: "fixed",
    commsOutputBw: 0,
    commsOutputMode: "fixed",
    supplyOutputCrates: 0,
    supplyOutputMode: "fixed",
    buildCost: createBlankWallet(),
    upkeep: createBlankWallet(),
    wadUpkeepPerTick: 0,
    incomePerTick: createBlankWallet(),
    supportRadius: 0,
    unlockSource: "schema",
    unlockCost: createBlankWallet(),
    unlockWadCost: 0,
    preferredRoomTags: [],
    tagOutputModifiers: [],
    placeholder: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleSchema(): SchemaDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "salvage_bureau",
    name: "Salvage Bureau",
    kind: "core",
    shortCode: "SB",
    category: "industry",
    description: "A salvage-processing C.O.R.E. that turns scrap-rich sectors into a steady stream of reusable material.",
    operationalRequirements: {
      powerWatts: 25,
      commsBw: 10,
      supplyCrates: 50
    },
    powerOutputWatts: 0,
    powerOutputMode: "fixed",
    commsOutputBw: 0,
    commsOutputMode: "fixed",
    supplyOutputCrates: 0,
    supplyOutputMode: "fixed",
    buildCost: {
      metalScrap: 5,
      wood: 2,
      chaosShards: 1,
      steamComponents: 1
    },
    upkeep: {
      metalScrap: 0,
      wood: 0,
      chaosShards: 0,
      steamComponents: 1
    },
    wadUpkeepPerTick: 4,
    incomePerTick: {
      metalScrap: 2,
      wood: 0,
      chaosShards: 0,
      steamComponents: 0
    },
    supportRadius: 1,
    unlockSource: "schema",
    unlockCost: {
      metalScrap: 6,
      wood: 2,
      chaosShards: 1,
      steamComponents: 1
    },
    unlockWadCost: 24,
    preferredRoomTags: ["salvage_rich", "transit_junction"],
    tagOutputModifiers: [
      createTagOutputModifier({
        tag: "salvage_rich",
        output: {
          metalScrap: 2,
          wood: 1,
          chaosShards: 0,
          steamComponents: 0
        },
        note: "Salvage-rich sectors push the Bureau harder."
      })
    ],
    placeholder: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
