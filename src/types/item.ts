import type { ImageAsset, KeyValueRecord } from "./common";

export type ItemKind = "resource" | "equipment" | "consumable";
export type ItemArchetype = "standard" | "weapon_chassis";

export const itemKinds: ItemKind[] = ["resource", "equipment", "consumable"];
export const itemArchetypes: ItemArchetype[] = ["standard", "weapon_chassis"];

export interface ItemHavenShopSource {
  enabled: boolean;
  unlockFloor: number;
  notes: string;
}

export interface ItemFieldMapSource {
  enabled: boolean;
  mapId: string;
  resourceNodeId: string;
  notes: string;
}

export interface ItemEnemyDropSource {
  enabled: boolean;
  enemyUnitIds: string[];
  notes: string;
}

export interface ItemAcquisitionDocument {
  startsWithPlayer: boolean;
  havenShop: ItemHavenShopSource;
  fieldMapResource: ItemFieldMapSource;
  enemyDrop: ItemEnemyDropSource;
  otherSourcesNotes: string;
}

export interface WeaponChassisDocument {
  stability: number;
  cardSlots: number;
}

export interface ItemDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  archetype: ItemArchetype;
  stackable: boolean;
  quantity: number;
  massKg: number;
  bulkBu: number;
  powerW: number;
  acquisition: ItemAcquisitionDocument;
  weaponChassis: WeaponChassisDocument;
  iconAsset?: ImageAsset;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
