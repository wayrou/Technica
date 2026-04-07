export type SchemaDocumentKind = "core" | "fortification";
export type SchemaUnlockSource = "starter" | "schema";
export type SchemaNetworkOutputMode = "fixed" | "add_input";
export type SchemaCoreCategory =
  | "logistics"
  | "command"
  | "support"
  | "industry"
  | "combat"
  | "civic"
  | "mobility"
  | "research"
  | (string & {});
export type KnownSchemaRoomTag =
  | "ingress"
  | "uplink"
  | "frontier"
  | "objective"
  | "power_source"
  | "elite"
  | "side_branch"
  | "junction"
  | "core_candidate"
  | "relay"
  | "metal_rich"
  | "timber_rich"
  | "steam_vent"
  | "survey_highground"
  | "transit_junction"
  | "command_suitable"
  | "salvage_rich"
  | "medical_supplies"
  | "stable_suitable"
  | "tavern_suitable";
export type SchemaRoomTag = KnownSchemaRoomTag | (string & {});

export const schemaCoreCategories: SchemaCoreCategory[] = [
  "logistics",
  "command",
  "support",
  "industry",
  "combat",
  "civic",
  "mobility",
  "research"
];

export const schemaUnlockSources: SchemaUnlockSource[] = ["starter", "schema"];
export const schemaNetworkOutputModes: SchemaNetworkOutputMode[] = ["fixed", "add_input"];

export const schemaKnownRoomTags: KnownSchemaRoomTag[] = [
  "ingress",
  "uplink",
  "frontier",
  "objective",
  "power_source",
  "elite",
  "side_branch",
  "junction",
  "core_candidate",
  "relay",
  "metal_rich",
  "timber_rich",
  "steam_vent",
  "survey_highground",
  "transit_junction",
  "command_suitable",
  "salvage_rich",
  "medical_supplies",
  "stable_suitable",
  "tavern_suitable"
];

export interface SchemaResourceWallet {
  metalScrap: number;
  wood: number;
  chaosShards: number;
  steamComponents: number;
}

export interface SchemaOperationalRequirements {
  powerWatts: number;
  commsBw: number;
  supplyCrates: number;
}

export interface SchemaTagOutputModifier {
  id: string;
  tag: SchemaRoomTag;
  output: SchemaResourceWallet;
  note: string;
}

export interface SchemaDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  kind: SchemaDocumentKind;
  shortCode: string;
  category: SchemaCoreCategory;
  description: string;
  operationalRequirements: SchemaOperationalRequirements;
  powerOutputWatts: number;
  powerOutputMode: SchemaNetworkOutputMode;
  commsOutputBw: number;
  commsOutputMode: SchemaNetworkOutputMode;
  supplyOutputCrates: number;
  supplyOutputMode: SchemaNetworkOutputMode;
  buildCost: SchemaResourceWallet;
  upkeep: SchemaResourceWallet;
  wadUpkeepPerTick: number;
  incomePerTick: SchemaResourceWallet;
  supportRadius: number;
  unlockSource: SchemaUnlockSource;
  unlockCost: SchemaResourceWallet;
  unlockWadCost: number;
  requiredQuestIds: string[];
  preferredRoomTags: SchemaRoomTag[];
  tagOutputModifiers: SchemaTagOutputModifier[];
  placeholder: boolean;
  createdAt: string;
  updatedAt: string;
}
