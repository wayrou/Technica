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

export type MapRenderMode = "classic_2d" | "simple_3d" | "bespoke_3d";
export type MapEntrySource = "atlas_theater" | "floor_region" | "door" | "portal";
export type MapSpawnAnchorKind = "player" | "enemy" | "npc" | "portal_exit" | "generic";
export type MapPreviewCameraMode = "isometric" | "third_person" | "top_down";

export interface MapEntryRule {
  id: string;
  source: MapEntrySource;
  floorOrdinal?: number;
  regionId?: string;
  operationId?: string;
  theaterScreenId?: string;
  sourceMapId?: string;
  doorId?: string;
  portalId?: string;
  label: string;
  entryPointId: string;
  unlockRequirements: string[];
  metadata: KeyValueRecord;
}

export interface MapSpawnAnchor {
  id: string;
  kind: MapSpawnAnchorKind;
  x: number;
  y: number;
  layerId?: string;
  label: string;
  tags: string[];
  metadata: KeyValueRecord;
}

export interface Map3DSettings {
  renderMode: MapRenderMode;
  wallHeight: number;
  floorThickness: number;
  previewCamera: MapPreviewCameraMode;
  defaultSurface: string;
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
  renderMode?: MapRenderMode;
  mapTags?: string[];
  regionTags?: string[];
  entryRules?: MapEntryRule[];
  spawnAnchors?: MapSpawnAnchor[];
  settings3d?: Map3DSettings;
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
