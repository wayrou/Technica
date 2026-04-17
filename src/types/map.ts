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

export type MapVerticalDirection = "north" | "east" | "south" | "west";
export type MapVerticalEdgeKind = "open" | "ledge" | "rail" | "wall";
export type MapVerticalConnectorKind =
  | "stairs"
  | "ramp"
  | "ladder"
  | "drop"
  | "jump"
  | "elevator"
  | "grapple";

export interface MapVerticalPoint {
  layerId: string;
  x: number;
  y: number;
}

export interface MapVerticalCell {
  x: number;
  y: number;
  heightOffset: number;
  walkable?: boolean;
  edges: Partial<Record<MapVerticalDirection, MapVerticalEdgeKind>>;
  metadata: KeyValueRecord;
}

export interface MapVerticalLayer {
  id: string;
  name: string;
  elevation: number;
  visibleIn2d: boolean;
  cells: MapVerticalCell[];
  metadata: KeyValueRecord;
}

export interface MapVerticalConnector {
  id: string;
  kind: MapVerticalConnectorKind;
  from: MapVerticalPoint;
  to: MapVerticalPoint;
  bidirectional: boolean;
  metadata: KeyValueRecord;
}

export interface MapVerticalLayerSystem {
  schemaVersion: "technica-map-vertical.v1";
  defaultLayerId: string;
  elevationStep: number;
  layers: MapVerticalLayer[];
  connectors: MapVerticalConnector[];
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
  vertical?: MapVerticalLayerSystem;
  createdAt: string;
  updatedAt: string;
}

export interface MapBrushState {
  terrain: TerrainType;
  walkable: boolean;
  wall: boolean;
  floor: boolean;
}
