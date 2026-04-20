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
  regionIds?: string[];
  mapTags?: string[];
  spawnAnchorTags?: string[];
  allowGeneratedAprons?: boolean;
  avoidSafeZones?: boolean;
  minDistanceFromPlayerSpawn?: number;
}

export type FieldEnemyPresentationMode = "billboard_sprite" | "model_3d";
export type FieldEnemyFacingMode = "camera" | "movement" | "fixed";

export interface FieldEnemyPresentationDocument {
  mode: FieldEnemyPresentationMode;
  modelKey: string;
  modelAssetPath: string;
  materialKey: string;
  scale: number;
  heightOffset: number;
  facingMode: FieldEnemyFacingMode;
  previewPose: string;
  metadata: KeyValueRecord;
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
  presentation?: FieldEnemyPresentationDocument;
  stats: FieldEnemyStatsDocument;
  spawn: FieldEnemySpawnDocument;
  drops: FieldEnemyDropsDocument;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
