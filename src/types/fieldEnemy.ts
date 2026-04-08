import type { ImageAsset, KeyValueRecord } from "./common";
import type { ResourceWalletDocument } from "./resources";

export interface FieldEnemyStatsDocument {
  maxHp: number;
  speed: number;
  aggroRange: number;
  width: number;
  height: number;
}

export interface FieldEnemySpawnDocument {
  mapIds: string[];
  floorOrdinals: number[];
  spawnCount: number;
}

export type FieldEnemyDropResourcesDocument = ResourceWalletDocument;

export interface FieldEnemyItemDropDocument {
  id: string;
  quantity: number;
  chance: number;
}

export interface FieldEnemyDropsDocument {
  wad: number;
  resources: FieldEnemyDropResourcesDocument;
  items: FieldEnemyItemDropDocument[];
}

export interface FieldEnemyDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  faction: string;
  kind: string;
  spriteKey: string;
  spriteAsset?: ImageAsset;
  stats: FieldEnemyStatsDocument;
  spawn: FieldEnemySpawnDocument;
  drops: FieldEnemyDropsDocument;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
