import type { ImageAsset, KeyValueRecord } from "./common";

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

export interface FieldEnemyDropResourcesDocument {
  metalScrap: number;
  wood: number;
  chaosShards: number;
  steamComponents: number;
}

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
