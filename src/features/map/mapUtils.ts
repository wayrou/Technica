import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP } from "../../types/common";
import type { MapDocument, MapEncounterVolume, MapSceneProp, MapTile, MapVerticalCell, MapVerticalLayer, MapVerticalLayerSystem, TerrainType } from "../../types/map";
import { isoNow } from "../../utils/date";
import { slugify } from "../../utils/id";

export const MAP_VERTICAL_SCHEMA_VERSION = "technica-map-vertical.v1" as const;
export const DEFAULT_VERTICAL_LAYER_ID = "ground";

export const terrainPalette: Array<{ value: TerrainType; label: string; color: string }> = [
  { value: "grass", label: "Grass", color: "#4f8a57" },
  { value: "road", label: "Road", color: "#b7874d" },
  { value: "stone", label: "Stone", color: "#71858d" },
  { value: "water", label: "Water", color: "#2e79b8" },
  { value: "forest", label: "Forest", color: "#255b3c" },
  { value: "sand", label: "Sand", color: "#d8ba7e" }
];

export const terrainColorMap = terrainPalette.reduce<Record<TerrainType, string>>((colors, option) => {
  colors[option.value] = option.color;
  return colors;
}, {} as Record<TerrainType, string>);

export function createDefaultTile(): MapTile {
  return {
    terrain: "grass",
    walkable: true,
    wall: false,
    floor: true,
    metadata: {}
  };
}

export function createBlankMapDocument(name = "New Field Map", width = 16, height = 12): MapDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: slugify(name, "map"),
    name,
    width,
    height,
    tileSize: 48,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => createDefaultTile())),
    objects: [],
    zones: [],
    sceneProps: [],
    encounterVolumes: [],
    renderMode: "classic_2d",
    mapTags: [],
    regionTags: [],
    entryRules: [],
    spawnAnchors: [
      {
        id: "player_start",
        kind: "player",
        x: 1,
        y: 1,
        label: "Player Start",
        tags: ["default"],
        metadata: {}
      }
    ],
    settings3d: {
      renderMode: "classic_2d",
      wallHeight: 1,
      floorThickness: 0.2,
      previewCamera: "isometric",
      defaultSurface: "field",
      metadata: {}
    },
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function resizeMapDocument(document: MapDocument, width: number, height: number) {
  return {
    ...document,
    width,
    height,
    tiles: Array.from({ length: height }, (_, rowIndex) =>
      Array.from({ length: width }, (_, columnIndex) => document.tiles[rowIndex]?.[columnIndex] ?? createDefaultTile())
    ),
    sceneProps: (document.sceneProps ?? []).filter(
      (prop) => prop.x >= 0 && prop.y >= 0 && prop.x < width && prop.y < height
    ).map((prop) => ({
      ...prop,
      width: Math.max(1, Math.min(prop.width, width - prop.x)),
      height: Math.max(1, Math.min(prop.height, height - prop.y))
    })),
    encounterVolumes: (document.encounterVolumes ?? []).filter(
      (volume) => volume.x >= 0 && volume.y >= 0 && volume.x < width && volume.y < height
    ).map((volume) => ({
      ...volume,
      width: Math.max(1, Math.min(volume.width, width - volume.x)),
      height: Math.max(1, Math.min(volume.height, height - volume.y))
    })),
    vertical: document.vertical ? resizeVerticalLayerSystem(document.vertical, width, height) : undefined
  };
}

export function normalizeRect(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x) + 1;
  const height = Math.abs(end.y - start.y) + 1;

  return { x, y, width, height };
}

export function createVerticalLayer(id: string, name: string, elevation: number): MapVerticalLayer {
  return {
    id,
    name,
    elevation,
    visibleIn2d: elevation === 0,
    cells: [],
    metadata: {}
  };
}

export function createDefaultVerticalLayerSystem(): MapVerticalLayerSystem {
  return {
    schemaVersion: MAP_VERTICAL_SCHEMA_VERSION,
    defaultLayerId: DEFAULT_VERTICAL_LAYER_ID,
    elevationStep: 1,
    layers: [createVerticalLayer(DEFAULT_VERTICAL_LAYER_ID, "Ground", 0)],
    connectors: [],
    metadata: {}
  };
}

export function createDefaultVerticalCell(x: number, y: number): MapVerticalCell {
  return {
    x,
    y,
    heightOffset: 0,
    edges: {},
    metadata: {}
  };
}

export function getMapVerticalCell(layer: MapVerticalLayer | null | undefined, x: number, y: number) {
  return layer?.cells.find((cell) => cell.x === x && cell.y === y) ?? null;
}

export function upsertMapVerticalCell(
  layer: MapVerticalLayer,
  x: number,
  y: number,
  updater: (cell: MapVerticalCell) => MapVerticalCell | null
): MapVerticalLayer {
  const existing = getMapVerticalCell(layer, x, y);
  const nextCell = updater(existing ? { ...existing, edges: { ...existing.edges }, metadata: { ...existing.metadata } } : createDefaultVerticalCell(x, y));
  const cells = layer.cells.filter((cell) => cell.x !== x || cell.y !== y);

  if (!nextCell) {
    return {
      ...layer,
      cells
    };
  }

  return {
    ...layer,
    cells: [...cells, nextCell].sort((left, right) => left.y - right.y || left.x - right.x)
  };
}

export function resizeVerticalLayerSystem(
  vertical: MapVerticalLayerSystem,
  width: number,
  height: number
): MapVerticalLayerSystem {
  return {
    ...vertical,
    layers: vertical.layers.map((layer) => ({
      ...layer,
      cells: layer.cells.filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height)
    })),
    connectors: vertical.connectors.filter(
      (connector) =>
        connector.from.x >= 0 &&
        connector.from.y >= 0 &&
        connector.from.x < width &&
        connector.from.y < height &&
        connector.to.x >= 0 &&
        connector.to.y >= 0 &&
        connector.to.x < width &&
        connector.to.y < height
    )
  };
}
