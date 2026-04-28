import type { ImageAsset, KeyValueRecord } from "./common";

export type NpcRouteMode = "fixed" | "random" | "none";
export type NpcPresentationMode = "billboard_sprite" | "model_3d";
export type NpcFacingMode = "camera" | "movement" | "fixed";

export interface NpcRoutePoint {
  id: string;
  x: number;
  y: number;
}

export interface NpcPresentationDocument {
  mode: NpcPresentationMode;
  modelKey: string;
  modelAssetPath: string;
  materialKey: string;
  scale: number;
  heightOffset: number;
  facingMode: NpcFacingMode;
  previewPose: string;
  metadata: KeyValueRecord;
}

export interface NpcDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  faction: string;
  mapId: string;
  tileX: number;
  tileY: number;
  routeMode: NpcRouteMode;
  routePoints: NpcRoutePoint[];
  dialogueId: string;
  portraitKey: string;
  spriteKey: string;
  portraitAsset?: ImageAsset;
  spriteAsset?: ImageAsset;
  presentation?: NpcPresentationDocument;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
