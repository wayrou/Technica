import type { ImageAsset, KeyValueRecord } from "./common";

export type NpcRouteMode = "fixed" | "random" | "none";

export interface NpcRoutePoint {
  id: string;
  x: number;
  y: number;
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
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
