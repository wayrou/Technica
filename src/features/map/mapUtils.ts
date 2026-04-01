import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP } from "../../types/common";
import type { MapDocument, MapTile, TerrainType } from "../../types/map";
import { isoNow } from "../../utils/date";
import { slugify } from "../../utils/id";

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
    )
  };
}

export function normalizeRect(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x) + 1;
  const height = Math.abs(end.y - start.y) + 1;

  return { x, y, width, height };
}
