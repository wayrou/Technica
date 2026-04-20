import type { MapDocument, MapVerticalConnectorKind, TerrainType } from "../types/map";
import { runtimeId } from "./id";

export interface Map3DAdapterTile {
  x: number;
  y: number;
  elevation: number;
  surface: string;
  walkable: boolean;
  wall: boolean;
  floor: boolean;
  wallHeight: number;
  floorThickness: number;
  layerId: string;
  metadata: Record<string, unknown>;
}

export interface Map3DAdapterTraversalLink {
  id: string;
  kind: MapVerticalConnectorKind;
  from: {
    layerId: string;
    x: number;
    y: number;
  };
  to: {
    layerId: string;
    x: number;
    y: number;
  };
  bidirectional: boolean;
  metadata: Record<string, unknown>;
}

export interface Map3DAdapterPayload {
  schemaVersion: "technica-map-3d-adapter.v1";
  mapId: string;
  name: string;
  renderMode: "classic_2d" | "simple_3d" | "bespoke_3d";
  width: number;
  height: number;
  tileSize: number;
  defaultSurface: string;
  previewCamera: "isometric" | "third_person" | "top_down";
  tiles: Map3DAdapterTile[];
  traversalLinks: Map3DAdapterTraversalLink[];
  spawnAnchors: NonNullable<MapDocument["spawnAnchors"]>;
  entryRules: NonNullable<MapDocument["entryRules"]>;
  metadata: {
    source: "technica";
    derivedFrom2d: boolean;
    layerCount: number;
    connectorCount: number;
  };
}

const TERRAIN_SURFACE_BY_TYPE: Record<TerrainType, string> = {
  grass: "grass",
  road: "packed_dirt",
  stone: "stone",
  water: "water",
  forest: "forest_floor",
  sand: "sand"
};

function getTileSurface(terrain: TerrainType, fallback: string) {
  return TERRAIN_SURFACE_BY_TYPE[terrain] ?? fallback;
}

export function buildMap3DAdapterPayload(document: MapDocument): Map3DAdapterPayload {
  const renderMode = document.renderMode ?? document.settings3d?.renderMode ?? "classic_2d";
  const wallHeight = document.settings3d?.wallHeight ?? 1;
  const floorThickness = document.settings3d?.floorThickness ?? 0.2;
  const defaultSurface = document.settings3d?.defaultSurface || "field";
  const defaultLayerId = document.vertical?.defaultLayerId ?? "ground";
  const elevationStep = document.vertical?.elevationStep ?? 1;
  const verticalCellsByCoordinate = new Map<string, { layerId: string; elevation: number; heightOffset: number; metadata: Record<string, string> }>();

  document.vertical?.layers.forEach((layer) => {
    layer.cells.forEach((cell) => {
      verticalCellsByCoordinate.set(`${cell.x},${cell.y}`, {
        layerId: layer.id,
        elevation: layer.elevation,
        heightOffset: cell.heightOffset,
        metadata: cell.metadata
      });
    });
  });

  return {
    schemaVersion: "technica-map-3d-adapter.v1",
    mapId: runtimeId(document.id || document.name, "field_map"),
    name: document.name,
    renderMode,
    width: document.width,
    height: document.height,
    tileSize: document.tileSize,
    defaultSurface,
    previewCamera: document.settings3d?.previewCamera ?? "isometric",
    tiles: document.tiles.flatMap((row, y) =>
      row.map((tile, x) => {
        const verticalCell = verticalCellsByCoordinate.get(`${x},${y}`);
        return {
          x,
          y,
          elevation: ((verticalCell?.elevation ?? 0) + (verticalCell?.heightOffset ?? 0)) * elevationStep,
          surface: String(tile.metadata.surface ?? getTileSurface(tile.terrain, defaultSurface)),
          walkable: tile.walkable && !tile.wall,
          wall: tile.wall,
          floor: tile.floor,
          wallHeight: tile.wall ? wallHeight : 0,
          floorThickness,
          layerId: verticalCell?.layerId ?? defaultLayerId,
          metadata: {
            terrain: tile.terrain,
            ...tile.metadata,
            ...(verticalCell?.metadata ?? {})
          }
        };
      })
    ),
    traversalLinks:
      document.vertical?.connectors.map((connector) => ({
        id: runtimeId(connector.id, "traversal"),
        kind: connector.kind,
        from: {
          layerId: runtimeId(connector.from.layerId),
          x: connector.from.x,
          y: connector.from.y
        },
        to: {
          layerId: runtimeId(connector.to.layerId),
          x: connector.to.x,
          y: connector.to.y
        },
        bidirectional: connector.bidirectional,
        metadata: connector.metadata
      })) ?? [],
    spawnAnchors: document.spawnAnchors ?? [],
    entryRules: document.entryRules ?? [],
    metadata: {
      source: "technica",
      derivedFrom2d: renderMode === "simple_3d",
      layerCount: document.vertical?.layers.length ?? 1,
      connectorCount: document.vertical?.connectors.length ?? 0
    }
  };
}
