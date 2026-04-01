import type { KeyValueRecord } from "./common";

export type TerrainType =
  | "grass"
  | "road"
  | "stone"
  | "water"
  | "forest"
  | "sand";

export interface MapTile {
  terrain: TerrainType;
  walkable: boolean;
  wall: boolean;
  floor: boolean;
  metadata: KeyValueRecord;
}

export interface MapObject {
  id: string;
  type: string;
  sprite: string;
  label: string;
  action: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata: KeyValueRecord;
}

export interface MapZone {
  id: string;
  label: string;
  action: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata: KeyValueRecord;
}

export interface MapDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: MapTile[][];
  objects: MapObject[];
  zones: MapZone[];
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}

export interface MapBrushState {
  terrain: TerrainType;
  walkable: boolean;
  wall: boolean;
  floor: boolean;
}
