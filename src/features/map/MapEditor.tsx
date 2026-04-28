import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type WheelEvent as ReactWheelEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { createSampleMap } from "../../data/sampleMap";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { useTechnicaRuntime } from "../../hooks/useTechnicaRuntime";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { ValidationIssue } from "../../types/common";
import type {
  MapBrushState,
  Map3DSettings,
  MapDocument,
  MapEncounterVolume,
  MapEntryRule,
  MapEntrySource,
  MapObject,
  MapRenderMode,
  MapSceneProp,
  MapSpawnAnchor,
  MapSpawnAnchorKind,
  MapVerticalConnector,
  MapVerticalConnectorKind,
  MapVerticalDirection,
  MapVerticalEdgeKind,
  MapVerticalLayer,
  MapVerticalLayerSystem,
  TerrainType,
  MapZone
} from "../../types/map";
import type { NpcDocument } from "../../types/npc";
import { isoNow } from "../../utils/date";
import { confirmAction, notify } from "../../utils/dialogs";
import {
  buildMapBundleForTarget,
  buildNpcBundleForTarget,
  downloadBundle,
  downloadDraftFile
} from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "../../utils/mobileProtocol";
import { submitMobileInboxEntry } from "../../utils/mobileSession";
import {
  emitChaosCoreDatabaseUpdate,
  publishChaosCoreBundle,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
import { createSequentialId, runtimeId } from "../../utils/id";
import { parseKeyValueLines, parseMultilineList, serializeKeyValueLines, serializeMultilineList } from "../../utils/records";
import { openTechnicaPopout } from "../../utils/popout";
import { validateMapDocument } from "../../utils/mapValidation";
import { buildMap3DAdapterPayload, type Map3DAdapterTile } from "../../utils/map3dAdapter";
import {
  createBlankMapDocument,
  createDefaultVerticalLayerSystem,
  createVerticalLayer,
  createDefaultTile,
  getMapVerticalCell,
  normalizeRect,
  resizeMapDocument,
  terrainColorMap,
  terrainPalette,
  upsertMapVerticalCell
} from "./mapUtils";

type MapTool = "paint" | "erase" | "select" | "move" | "object" | "prop" | "zone" | "encounter" | "npc" | "enemy" | "pan";

type MapNpcMarker = {
  entryKey: string;
  contentId: string;
  name: string;
  mapId: string;
  tileX: number;
  tileY: number;
  origin: "game" | "technica";
  sourceFile?: string;
};

type MapLabelDensity = "smart" | "always" | "minimal";
type FocusTraySection = "controls" | "inspector" | "data";
type MapRouteBuilderDraft = {
  source: MapEntrySource;
  floorOrdinal: number;
  regionId: string;
  operationId: string;
  theaterScreenId: string;
  sourceMapId: string;
  doorId: string;
  portalId: string;
  label: string;
  entryPointId: string;
};
type MapZoneRouteSource = "door" | "portal";
type MapZoneRouteProof = {
  zoneId: string;
  label: string;
  source: MapZoneRouteSource | "";
  routeId: string;
  targetMapId: string;
  entryPointId: string;
  targetExists: boolean | null;
  warnings: string[];
};
type ViewportMetrics = {
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
};
type MapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAP_TOOL_OPTIONS: Array<{
  id: MapTool;
  label: string;
  shortcut: string;
  hint: string;
}> = [
  { id: "paint", label: "Paint", shortcut: "B", hint: "Paint terrain and collision flags." },
  { id: "erase", label: "Erase", shortcut: "E", hint: "Reset tiles back to the default grass tile." },
  { id: "select", label: "Select", shortcut: "V", hint: "Inspect a tile, object, zone, or NPC marker." },
  { id: "move", label: "Move", shortcut: "G", hint: "Reposition the selected object or zone." },
  { id: "object", label: "Object", shortcut: "O", hint: "Drop a new object onto the clicked tile." },
  { id: "prop", label: "3D Prop", shortcut: "P", hint: "Place a bespoke 3D prop or setpiece onto the clicked tile." },
  { id: "zone", label: "Zone", shortcut: "Z", hint: "Drag out a trigger or interaction rectangle." },
  { id: "encounter", label: "Encounter", shortcut: "C", hint: "Drag an encounter staging volume with entry, enemy, and extraction metadata." },
  { id: "npc", label: "NPC", shortcut: "N", hint: "Place the chosen NPC onto a clicked tile." },
  { id: "enemy", label: "Enemy", shortcut: "L", hint: "Place a light field enemy that flips Chaos Core into combat mode." },
  { id: "pan", label: "Pan", shortcut: "Space", hint: "Drag the map viewport around." }
];

const MAP_TOOL_SHORTCUTS: Partial<Record<string, MapTool>> = {
  b: "paint",
  e: "erase",
  v: "select",
  g: "move",
  o: "object",
  p: "prop",
  z: "zone",
  c: "encounter",
  n: "npc",
  l: "enemy",
  h: "pan"
};

const MAP_RENDER_MODE_PROFILES: Array<{
  id: MapRenderMode;
  label: string;
  summary: string;
  previewCamera: Map3DSettings["previewCamera"];
  wallHeight: number;
  floorThickness: number;
  defaultSurface: string;
  tags: string[];
}> = [
  {
    id: "classic_2d",
    label: "Classic 2D",
    summary: "Fast top-down field map using Chaos Core's original 2D runtime renderer.",
    previewCamera: "top_down",
    wallHeight: 1,
    floorThickness: 0.2,
    defaultSurface: "field",
    tags: ["classic_2d"]
  },
  {
    id: "simple_3d",
    label: "Simple 3D",
    summary: "Author in the 2D grid, publish a 3D adapter, and let Chaos Core render raised walls and surfaces.",
    previewCamera: "isometric",
    wallHeight: 1.25,
    floorThickness: 0.2,
    defaultSurface: "field",
    tags: ["simple_3d", "technica_3d"]
  },
  {
    id: "bespoke_3d",
    label: "Bespoke 3D",
    summary: "Use vertical layers, anchors, and entry routing for a custom 3D field space reached from theater/portal routes.",
    previewCamera: "third_person",
    wallHeight: 1.5,
    floorThickness: 0.25,
    defaultSurface: "field",
    tags: ["bespoke_3d", "technica_3d"]
  }
];

const MAP_ENTRY_SOURCE_LABELS: Record<MapEntrySource, string> = {
  atlas_theater: "Atlas theater",
  floor_region: "Floor region",
  door: "Door",
  portal: "Portal"
};

const DEFAULT_ROUTE_BUILDER_DRAFT: MapRouteBuilderDraft = {
  source: "atlas_theater",
  floorOrdinal: 0,
  regionId: "floor_0",
  operationId: "",
  theaterScreenId: "room_ingress",
  sourceMapId: "",
  doorId: "door_id",
  portalId: "portal_id",
  label: "Atlas theater entry",
  entryPointId: ""
};

const MAP_ZONE_ROUTE_TARGET_KEYS = [
  "fieldMapId",
  "technicaFieldMapId",
  "targetImportedMapId",
  "targetMapId"
] as const;
const MAP_ZONE_ROUTE_METADATA_KEYS = [
  ...MAP_ZONE_ROUTE_TARGET_KEYS,
  "doorId",
  "portalId",
  "fieldMapRouteSource",
  "routeSource",
  "entryPointId",
  "fieldMapEntryPointId",
  "spawnAnchorId",
  "fieldMapLabel",
  "routeLabel"
] as const;

const MAP_SPAWN_ANCHOR_LABELS: Record<MapSpawnAnchorKind, string> = {
  player: "Player",
  enemy: "Enemy",
  npc: "NPC",
  portal_exit: "Portal exit",
  generic: "Generic"
};

const VERTICAL_EDGE_OPTIONS: Array<{ value: MapVerticalEdgeKind; label: string }> = [
  { value: "open", label: "Open" },
  { value: "ledge", label: "Ledge" },
  { value: "rail", label: "Rail" },
  { value: "wall", label: "Wall" }
];

const VERTICAL_CONNECTOR_OPTIONS: Array<{ value: MapVerticalConnectorKind; label: string }> = [
  { value: "stairs", label: "Stairs" },
  { value: "ramp", label: "Ramp" },
  { value: "ladder", label: "Ladder" },
  { value: "drop", label: "Drop" },
  { value: "jump", label: "Jump" },
  { value: "elevator", label: "Elevator" },
  { value: "grapple", label: "Grapple" }
];

const VERTICAL_DIRECTIONS: MapVerticalDirection[] = ["north", "east", "south", "west"];

const MAP_STORAGE_KEY = "technica.map.document";
const MAP_VIEW_EXPANDED_STORAGE_KEY = "technica.map.view.expanded";
const MAP_VIEW_LABEL_DENSITY_STORAGE_KEY = "technica.map.view.labelDensity";
const MAP_VIEW_SHOW_MINIMAP_STORAGE_KEY = "technica.map.view.showMinimap";
const MAP_VIEW_SHOW_RULERS_STORAGE_KEY = "technica.map.view.showRulers";
const MAP_VIEW_SHOW_GRID_COORDS_STORAGE_KEY = "technica.map.view.showGridCoords";
const MIN_MAP_ZOOM = 0.3;
const MAX_MAP_ZOOM = 2.4;
const STANDARD_MIN_CELL_SIZE = 22;
const FOCUS_MIN_CELL_SIZE = 12;
const GRID_GAP = 1;
const RULER_SIZE = 28;
const MINIMAP_SIZE = 220;
const MAP_SCENE_OVERSCAN_TILES = 3;
const MAP_SCENE_INITIAL_VISIBLE_TILES = 48;
const MAP_3D_PREVIEW_MAX_TILES = 320;
const MAP_3D_PREVIEW_TILE_WIDTH = 34;
const MAP_3D_PREVIEW_TILE_HEIGHT = 18;
const MAP_3D_PREVIEW_ISO_X = 18;
const MAP_3D_PREVIEW_ISO_Y = 10;
const MAP_3D_PREVIEW_ELEVATION_SCALE = 16;

function touchMap(document: MapDocument) {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function clampZoom(value: number) {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, Math.round(value * 100) / 100));
}

function computeCellSize(tileSize: number, zoom: number, isFocusMode: boolean) {
  return Math.max(isFocusMode ? FOCUS_MIN_CELL_SIZE : STANDARD_MIN_CELL_SIZE, Math.round(tileSize * 0.72 * zoom));
}

function clampTileCoordinate(value: number, maxExclusive: number) {
  return Math.max(0, Math.min(Math.max(0, maxExclusive - 1), value));
}

function getAdapterTileTerrain(tile: Map3DAdapterTile): TerrainType {
  const terrain = tile.metadata.terrain;
  return typeof terrain === "string" && terrain in terrainColorMap ? (terrain as TerrainType) : "grass";
}

function hexToRgb(color: string) {
  const normalized = color.trim().replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return { r: 98, g: 140, b: 130 };
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function mixColor(color: string, target: { r: number; g: number; b: number }, amount: number) {
  const base = hexToRgb(color);
  const mix = (source: number, next: number) => Math.round(source + (next - source) * amount);
  return `rgb(${mix(base.r, target.r)}, ${mix(base.g, target.g)}, ${mix(base.b, target.b)})`;
}

function terrainSceneStyles(color: string) {
  return {
    ["--terrain-base" as string]: color,
    ["--terrain-highlight" as string]: mixColor(color, { r: 255, g: 255, b: 255 }, 0.22),
    ["--terrain-shadow" as string]: mixColor(color, { r: 4, g: 12, b: 15 }, 0.48),
    ["--terrain-rim" as string]: mixColor(color, { r: 240, g: 246, b: 247 }, 0.14),
    ["--terrain-noise" as string]: mixColor(color, { r: 18, g: 24, b: 27 }, 0.28)
  } as CSSProperties;
}

function getCoordinateInterval(length: number, zoom: number) {
  if (zoom >= 1.7) {
    return 2;
  }
  if (zoom >= 1.2) {
    return length > 120 ? 8 : length > 80 ? 6 : 4;
  }
  if (zoom >= 0.8) {
    return length > 120 ? 12 : length > 80 ? 10 : 6;
  }
  return length > 120 ? 20 : length > 80 ? 16 : 10;
}

function getOverlayBadge(kind: "object" | "enemy" | "zone" | "npc" | "prop" | "encounter") {
  switch (kind) {
    case "enemy":
      return "EN";
    case "zone":
      return "ZN";
    case "npc":
      return "NP";
    case "prop":
      return "3D";
    case "encounter":
      return "FX";
    default:
      return "OB";
  }
}

function createDefaultObject(x: number, y: number, existingIds: string[]): MapObject {
  return {
    id: createSequentialId("object", existingIds),
    type: "interactive",
    sprite: "sprite_key",
    label: "New object",
    action: "interact",
    x,
    y,
    width: 1,
    height: 1,
    metadata: {}
  };
}

function isEnemyObject(object: MapObject) {
  return object.type.trim().toLowerCase() === "enemy";
}

function createDefaultEnemyObject(x: number, y: number, existingIds: string[]): MapObject {
  return {
    id: createSequentialId("enemy", existingIds),
    type: "enemy",
    sprite: "light_enemy",
    label: "Light Enemy",
    action: "",
    x,
    y,
    width: 1,
    height: 1,
    metadata: {
      enemyKind: "light",
      hp: "3",
      speed: "90",
      aggroRange: "200"
    }
  };
}

function createDefaultZone(x: number, y: number, width: number, height: number, existingIds: string[]): MapZone {
  return {
    id: createSequentialId("zone", existingIds),
    label: "New zone",
    action: "trigger_action",
    x,
    y,
    width,
    height,
    metadata: {}
  };
}

function createDefaultSceneProp(x: number, y: number, existingIds: string[], layerId?: string): MapSceneProp {
  return {
    id: createSequentialId("scene_prop", existingIds),
    kind: "setpiece",
    label: "New setpiece",
    x,
    y,
    width: 1,
    height: 1,
    layerId,
    elevation: 0,
    heightOffset: 0,
    rotationYaw: 0,
    scale: 1,
    modelKey: "prop_model_key",
    modelAssetPath: "",
    materialKey: "",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    metadata: {}
  };
}

function createDefaultEncounterVolume(
  x: number,
  y: number,
  width: number,
  height: number,
  existingIds: string[],
  playerEntryAnchorId = "player_start",
  layerId?: string
): MapEncounterVolume {
  return {
    id: createSequentialId("encounter", existingIds),
    label: "New encounter",
    x,
    y,
    width,
    height,
    layerId,
    triggerMode: "on_enter",
    startsActive: true,
    playerEntryAnchorId,
    fallbackReturnAnchorId: playerEntryAnchorId,
    extractionAnchorId: "",
    enemyAnchorTags: ["enemy"],
    linkedFieldEnemyIds: [],
    tacticalEncounterId: "",
    clearBehavior: "clear_volume",
    metadata: {}
  };
}

function mergeUniqueList(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next].map((item) => item.trim()).filter(Boolean)));
}

function createDefaultEntryRule(
  source: MapEntrySource,
  existingIds: string[],
  entryPointId: string
): MapEntryRule {
  const sourceLabel = MAP_ENTRY_SOURCE_LABELS[source];
  const idPrefix =
    source === "atlas_theater" ? "entry_theater" : source === "floor_region" ? "entry_floor" : `entry_${source}`;

  return {
    id: createSequentialId(idPrefix, existingIds),
    source,
    floorOrdinal: source === "door" || source === "portal" ? undefined : 0,
    regionId: source === "floor_region" ? "floor_0" : "",
    operationId: "",
    theaterScreenId: source === "atlas_theater" ? "theater_room_id" : "",
    sourceMapId: source === "door" || source === "portal" ? "source_map_id" : "",
    doorId: source === "door" ? "door_id" : "",
    portalId: source === "portal" ? "portal_id" : "",
    label: `${sourceLabel} entry`,
    entryPointId,
    unlockRequirements: [],
    metadata: {}
  };
}

function routeBuilderLabelForSource(source: MapEntrySource) {
  return `${MAP_ENTRY_SOURCE_LABELS[source]} entry`;
}

function getEntryRouteHandshakeKey(entryRule: Pick<
  MapEntryRule,
  "source" | "floorOrdinal" | "regionId" | "operationId" | "theaterScreenId" | "sourceMapId" | "doorId" | "portalId"
>) {
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

  if (entryRule.source === "atlas_theater") {
    return [
      entryRule.source,
      normalize(entryRule.operationId),
      normalize(entryRule.theaterScreenId)
    ].join("::");
  }

  if (entryRule.source === "floor_region") {
    return [
      entryRule.source,
      normalize(entryRule.operationId),
      Number.isFinite(entryRule.floorOrdinal) ? String(entryRule.floorOrdinal) : "",
      normalize(entryRule.regionId)
    ].join("::");
  }

  if (entryRule.source === "door") {
    return [
      entryRule.source,
      normalize(entryRule.sourceMapId),
      normalize(entryRule.doorId)
    ].join("::");
  }

  return [
    entryRule.source,
    normalize(entryRule.sourceMapId),
    normalize(entryRule.portalId)
  ].join("::");
}

function createDefaultSpawnAnchor(
  kind: MapSpawnAnchorKind,
  x: number,
  y: number,
  existingIds: string[]
) {
  const label = MAP_SPAWN_ANCHOR_LABELS[kind];
  const idPrefix = kind === "portal_exit" ? "portal_exit" : `${kind}_anchor`;

  return {
    id: createSequentialId(idPrefix, existingIds),
    kind,
    x,
    y,
    label,
    tags: kind === "generic" ? [] : [kind],
    metadata: {}
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readStringProperty(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || !(key in value)) {
    return "";
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property.trim() : "";
}

function readNumberProperty(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" && Number.isFinite(property) ? property : null;
}

function describeMapReceiptRoute(entryRule: unknown): string | null {
  if (!entryRule || typeof entryRule !== "object") {
    return null;
  }

  const source = readStringProperty(entryRule, "source") || "route";
  const target = readStringProperty(entryRule, "entryPointId") || "default spawn";
  const floorOrdinal = readNumberProperty(entryRule, "floorOrdinal");
  const sourceDetail =
    readStringProperty(entryRule, "theaterScreenId") ||
    readStringProperty(entryRule, "regionId") ||
    readStringProperty(entryRule, "doorId") ||
    readStringProperty(entryRule, "portalId") ||
    readStringProperty(entryRule, "sourceMapId");
  const sourceLabel = sourceDetail ? `${source}:${sourceDetail}` : source;
  const floorLabel = floorOrdinal === null ? "" : ` floor ${floorOrdinal}`;

  return `${sourceLabel}${floorLabel} -> ${target}`;
}

function describeRuntimeZoneRoute(zone: unknown): string | null {
  if (!zone || typeof zone !== "object") {
    return null;
  }

  const metadata = "metadata" in zone ? (zone as Record<string, unknown>).metadata : null;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const targetMapId =
    readStringProperty(metadataRecord, "fieldMapId") ||
    readStringProperty(metadataRecord, "technicaFieldMapId") ||
    readStringProperty(metadataRecord, "targetImportedMapId") ||
    readStringProperty(metadataRecord, "targetMapId");
  const source =
    readStringProperty(metadataRecord, "fieldMapRouteSource") ||
    readStringProperty(metadataRecord, "routeSource") ||
    (readStringProperty(metadataRecord, "portalId") ? "portal" : readStringProperty(metadataRecord, "doorId") ? "door" : "");
  const routeId = source === "portal"
    ? readStringProperty(metadataRecord, "portalId")
    : readStringProperty(metadataRecord, "doorId");

  if (!targetMapId && !source && !routeId) {
    return null;
  }

  const zoneId = readStringProperty(zone, "id") || "zone";
  const entryPointId =
    readStringProperty(metadataRecord, "entryPointId") ||
    readStringProperty(metadataRecord, "fieldMapEntryPointId") ||
    readStringProperty(metadataRecord, "spawnAnchorId");
  const spawnLabel = entryPointId ? ` -> spawn ${entryPointId}` : "";

  return `zone ${zoneId} -> map ${targetMapId || "missing target"} via ${source || "missing source"} ${routeId || "missing id"}${spawnLabel}`;
}

function describeMapPublishReceipt(context: {
  bundle: Awaited<ReturnType<typeof buildMapBundleForTarget>>;
  loadedEntry: LoadedChaosCoreDatabaseEntry | null;
}) {
  const runtimeContent =
    context.loadedEntry?.runtimeContent ??
    context.bundle.files.find((file) => file.name === context.bundle.manifest.entryFile)?.content ??
    "";
  const runtimeMap = parseJsonRecord(runtimeContent);
  if (!runtimeMap) {
    return ["Runtime map JSON could not be parsed for receipt details."];
  }

  const entryRules = Array.isArray(runtimeMap.entryRules) ? runtimeMap.entryRules : [];
  const spawnAnchors = Array.isArray(runtimeMap.spawnAnchors) ? runtimeMap.spawnAnchors : [];
  const interactionZones = Array.isArray(runtimeMap.interactionZones) ? runtimeMap.interactionZones : [];
  const outboundRoutes = interactionZones
    .map((zone) => describeRuntimeZoneRoute(zone))
    .filter((route): route is string => Boolean(route));
  const adapter3d = runtimeMap.adapter3d && typeof runtimeMap.adapter3d === "object" ? (runtimeMap.adapter3d as Record<string, unknown>) : null;
  const adapterTiles = Array.isArray(adapter3d?.tiles) ? adapter3d.tiles.length : 0;
  const traversalLinks = Array.isArray(adapter3d?.traversalLinks) ? adapter3d.traversalLinks.length : 0;
  const entryIds = entryRules
    .map((entry) => (entry && typeof entry === "object" && "id" in entry ? String(entry.id) : ""))
    .filter(Boolean);
  const anchorIds = spawnAnchors
    .map((anchor) => (anchor && typeof anchor === "object" && "id" in anchor ? String(anchor.id) : ""))
    .filter(Boolean);
  const routeTargets = entryRules
    .map((entry) => readStringProperty(entry, "entryPointId"))
    .filter(Boolean);
  const missingRouteTargets = routeTargets.filter((target) => !anchorIds.includes(target));
  const firstRoutePreview = describeMapReceiptRoute(entryRules[0]);
  const routeHandshake =
    entryRules.length === 0
      ? "needs entry route"
      : spawnAnchors.length === 0
        ? "needs spawn anchor"
        : missingRouteTargets.length > 0
          ? `missing anchor target(s): ${missingRouteTargets.join(", ")}`
          : "ready";

  return [
    `Map id: ${typeof runtimeMap.id === "string" ? runtimeMap.id : context.bundle.manifest.contentId}`,
    `Render mode: ${typeof runtimeMap.renderMode === "string" ? runtimeMap.renderMode : "classic_2d"}`,
    `Entry routes: ${entryRules.length}${entryIds.length ? ` (${entryIds.join(", ")})` : ""}`,
    firstRoutePreview ? `Route preview: ${firstRoutePreview}` : "Route preview: no route configured",
    `Outbound door/portal routes: ${outboundRoutes.length}`,
    ...(outboundRoutes.length > 0
      ? outboundRoutes.slice(0, 5).map((route) => `Outbound preview: ${route}`)
      : ["Outbound preview: no door/portal route zones configured"]),
    `Spawn anchors: ${spawnAnchors.length}${anchorIds.length ? ` (${anchorIds.join(", ")})` : ""}`,
    `Chaos route handshake: ${routeHandshake}`,
    `3D adapter: ${adapterTiles} tiles, ${traversalLinks} traversal links`
  ];
}

function isNpcDocument(value: unknown): value is NpcDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      "mapId" in value &&
      "tileX" in value &&
      "tileY" in value
  );
}

function isMapDocumentPayload(value: unknown): value is MapDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapDocument>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    Array.isArray(candidate.tiles)
  );
}

function readMetadataText(record: Record<string, string> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readZoneTargetMapId(zone: MapZone): string {
  return (
    readMetadataText(zone.metadata, "fieldMapId") ||
    readMetadataText(zone.metadata, "technicaFieldMapId") ||
    readMetadataText(zone.metadata, "targetImportedMapId") ||
    readMetadataText(zone.metadata, "targetMapId") ||
    readMetadataText(zone.metadata, "targetMap")
  );
}

function readZoneEntryPointId(zone: MapZone): string {
  return (
    readMetadataText(zone.metadata, "fieldMapEntryPointId") ||
    readMetadataText(zone.metadata, "entryPointId") ||
    readMetadataText(zone.metadata, "spawnAnchorId")
  );
}

function readZoneRouteLabel(zone: MapZone): string {
  return readMetadataText(zone.metadata, "fieldMapLabel") || readMetadataText(zone.metadata, "routeLabel") || zone.label;
}

function readZoneRouteSource(zone: MapZone): MapZoneRouteSource | "" {
  const explicitSource =
    readMetadataText(zone.metadata, "fieldMapRouteSource") ||
    readMetadataText(zone.metadata, "routeSource");

  if (explicitSource === "door" || explicitSource === "portal") {
    return explicitSource;
  }

  if (readMetadataText(zone.metadata, "portalId")) {
    return "portal";
  }

  if (readMetadataText(zone.metadata, "doorId")) {
    return "door";
  }

  return "";
}

function readZoneRouteId(zone: MapZone, source = readZoneRouteSource(zone)): string {
  if (source === "portal") {
    return readMetadataText(zone.metadata, "portalId");
  }

  if (source === "door") {
    return readMetadataText(zone.metadata, "doorId");
  }

  return readMetadataText(zone.metadata, "portalId") || readMetadataText(zone.metadata, "doorId");
}

function hasZoneRouteMetadata(zone: MapZone): boolean {
  return MAP_ZONE_ROUTE_METADATA_KEYS.some((key) => readMetadataText(zone.metadata, key));
}

function setRouteMetadataValue(metadata: Record<string, string>, key: string, value: string) {
  const next = { ...metadata };
  const normalizedValue = value.trim();
  if (normalizedValue) {
    next[key] = normalizedValue;
  } else {
    delete next[key];
  }
  return next;
}

function setZoneRouteSourceMetadata(zone: MapZone, source: MapZoneRouteSource): MapZone {
  const nextMetadata = setRouteMetadataValue(zone.metadata, "fieldMapRouteSource", source);
  if (source === "door") {
    delete nextMetadata.portalId;
    if (!nextMetadata.doorId) {
      nextMetadata.doorId = runtimeId(zone.id, "door");
    }
  } else {
    delete nextMetadata.doorId;
    if (!nextMetadata.portalId) {
      nextMetadata.portalId = runtimeId(zone.id, "portal");
    }
  }

  return {
    ...zone,
    action: zone.action.trim() ? zone.action : "custom",
    metadata: nextMetadata
  };
}

function createZoneRouteProof(
  zone: MapZone,
  options: {
    currentMapId: string;
    mapEntries: ChaosCoreDatabaseEntry[];
    mapDatabaseLoaded: boolean;
    duplicateRouteKeys: Set<string>;
  }
): MapZoneRouteProof {
  const source = readZoneRouteSource(zone);
  const routeId = readZoneRouteId(zone, source);
  const targetMapId = readZoneTargetMapId(zone);
  const entryPointId = readZoneEntryPointId(zone);
  const normalizedTargetMapId = runtimeId(targetMapId);
  const targetExists = !targetMapId
    ? false
    : normalizedTargetMapId === options.currentMapId ||
      options.mapEntries.some((entry) => runtimeId(entry.contentId) === normalizedTargetMapId);
  const routeKey = source && routeId ? `${source}:${runtimeId(routeId)}` : "";
  const warnings: string[] = [];

  if (!targetMapId) {
    warnings.push("Choose the target map id that Chaos Core should load.");
  }
  if (!source) {
    warnings.push("Choose whether this zone is a door route or a portal route.");
  }
  if (source === "door" && !routeId) {
    warnings.push("Door routes need a door id.");
  }
  if (source === "portal" && !routeId) {
    warnings.push("Portal routes need a portal id.");
  }
  if (targetMapId && options.mapDatabaseLoaded && !targetExists) {
    warnings.push(`Target map '${targetMapId}' is not in the loaded Chaos Core map database.`);
  }
  if (targetMapId && normalizedTargetMapId === options.currentMapId) {
    warnings.push("Target map is this same map. That is allowed, but double-check that this is an intentional loop.");
  }
  if (routeKey && options.duplicateRouteKeys.has(routeKey)) {
    warnings.push(`Another zone on this map also uses ${source} id '${routeId}'.`);
  }

  return {
    zoneId: zone.id,
    label: readZoneRouteLabel(zone),
    source,
    routeId,
    targetMapId,
    entryPointId,
    targetExists: targetMapId ? targetExists : null,
    warnings
  };
}

export function MapEditor() {
  const runtime = useTechnicaRuntime();
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries, loadEntry } = useChaosCoreDatabase();
  const [map, setMap] = usePersistentState(MAP_STORAGE_KEY, createSampleMap());
  const [expandedInline, setExpandedInline] = usePersistentState<boolean>(MAP_VIEW_EXPANDED_STORAGE_KEY, false);
  const [labelDensity, setLabelDensity] = usePersistentState<MapLabelDensity>(MAP_VIEW_LABEL_DENSITY_STORAGE_KEY, "smart");
  const [showMinimap, setShowMinimap] = usePersistentState<boolean>(MAP_VIEW_SHOW_MINIMAP_STORAGE_KEY, true);
  const [showRulers, setShowRulers] = usePersistentState<boolean>(MAP_VIEW_SHOW_RULERS_STORAGE_KEY, true);
  const [showGridCoordinates, setShowGridCoordinates] = usePersistentState<boolean>(MAP_VIEW_SHOW_GRID_COORDS_STORAGE_KEY, true);
  const [tool, setTool] = useState<MapTool>("paint");
  const [brush, setBrush] = useState<MapBrushState>({
    terrain: "grass",
    walkable: true,
    wall: false,
    floor: true
  });
  const [zoom, setZoom] = useState(1);
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedScenePropId, setSelectedScenePropId] = useState<string | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [routeBuilderDraft, setRouteBuilderDraft] = useState<MapRouteBuilderDraft>(DEFAULT_ROUTE_BUILDER_DRAFT);
  const [activeVerticalLayerId, setActiveVerticalLayerId] = useState("ground");
  const [connectorDraft, setConnectorDraft] = useState({
    kind: "stairs" as MapVerticalConnectorKind,
    toLayerId: "ground",
    toX: 0,
    toY: 0,
    bidirectional: true
  });
  const [dimensionDraft, setDimensionDraft] = useState({ width: map.width, height: map.height });
  const [layerVisibility, setLayerVisibility] = useState({
    walkable: true,
    walls: true,
    objects: true,
    props: true,
    zones: true,
    encounters: true,
    npcs: true,
    enemies: true,
    vertical: true
  });
  const [selectedNpcPlacementEntryKey, setSelectedNpcPlacementEntryKey] = useState("");
  const [selectedNpcMarkerEntryKey, setSelectedNpcMarkerEntryKey] = useState<string | null>(null);
  const [isPlacingNpc, setIsPlacingNpc] = useState(false);
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [zoneDrag, setZoneDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [focusTraySection, setFocusTraySection] = useState<FocusTraySection>("controls");
  const [viewportMetrics, setViewportMetrics] = useState<ViewportMetrics>({
    width: 0,
    height: 0,
    scrollLeft: 0,
    scrollTop: 0
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const deferredMap = useDeferredValue(map);
  const map3dAdapter = useMemo(() => buildMap3DAdapterPayload(deferredMap), [deferredMap]);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);
  const isFocusMode = runtime.isPopout || expandedInline;
  const map3dSettings: Map3DSettings = map.settings3d ?? {
    renderMode: map.renderMode ?? "classic_2d",
    wallHeight: 1,
    floorThickness: 0.2,
    previewCamera: "isometric",
    defaultSurface: "field",
    metadata: {}
  };
  const activeMapRenderMode = map.renderMode ?? map3dSettings.renderMode;
  const activeMapRenderProfile =
    MAP_RENDER_MODE_PROFILES.find((profile) => profile.id === activeMapRenderMode) ?? MAP_RENDER_MODE_PROFILES[0];
  const selectedZone = map.zones.find((item) => item.id === selectedZoneId) ?? null;
  const playerSpawnAnchor = map.spawnAnchors?.find((anchor) => anchor.kind === "player") ?? null;
  const entryRouteCount = map.entryRules?.length ?? 0;
  const spawnAnchorCount = map.spawnAnchors?.length ?? 0;
  const spawnAnchorIds = useMemo(
    () => new Set((map.spawnAnchors ?? []).map((anchor) => anchor.id.trim()).filter(Boolean)),
    [map.spawnAnchors]
  );
  const routeTargetIds = useMemo(
    () => (map.entryRules ?? []).map((entryRule) => entryRule.entryPointId.trim()).filter(Boolean),
    [map.entryRules]
  );
  const missingRouteTargetIds = useMemo(
    () => Array.from(new Set(routeTargetIds.filter((targetId) => !spawnAnchorIds.has(targetId)))),
    [routeTargetIds, spawnAnchorIds]
  );
  const blankRouteTargetCount = (map.entryRules ?? []).filter((entryRule) => !entryRule.entryPointId.trim()).length;
  const routeTargetsReady = entryRouteCount > 0 && blankRouteTargetCount === 0 && missingRouteTargetIds.length === 0;
  const mapEntries = summaryStates.map.entries;
  const mapDatabaseLoaded = summaryStates.map.status === "ready" || mapEntries.length > 0;
  const currentRuntimeMapId = runtimeId(map.id || map.name, "field_map");
  const outboundRouteProofs = useMemo(() => {
    const routedZones = map.zones.filter(hasZoneRouteMetadata);
    const routeKeyCounts = new Map<string, number>();

    routedZones.forEach((zone) => {
      const source = readZoneRouteSource(zone);
      const routeId = readZoneRouteId(zone, source);
      if (!source || !routeId) {
        return;
      }
      const key = `${source}:${runtimeId(routeId)}`;
      routeKeyCounts.set(key, (routeKeyCounts.get(key) ?? 0) + 1);
    });

    const duplicateRouteKeys = new Set(
      Array.from(routeKeyCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    );

    return routedZones.map((zone) =>
      createZoneRouteProof(zone, {
        currentMapId: currentRuntimeMapId,
        mapEntries,
        mapDatabaseLoaded,
        duplicateRouteKeys
      })
    );
  }, [currentRuntimeMapId, map.zones, mapDatabaseLoaded, mapEntries]);
  const selectedZoneRouteProof = selectedZone
    ? outboundRouteProofs.find((proof) => proof.zoneId === selectedZone.id) ?? null
    : null;
  const routeAuthoringIssues = useMemo<ValidationIssue[]>(
    () =>
      outboundRouteProofs.flatMap((proof) =>
        proof.warnings.map((warning) => ({
          severity: "warning" as const,
          field: `zones.${proof.zoneId}`,
          message: `Outbound route '${proof.zoneId}': ${warning}`
        }))
      ),
    [outboundRouteProofs]
  );
  const issues = useMemo(
    () => [...validateMapDocument(deferredMap), ...routeAuthoringIssues],
    [deferredMap, routeAuthoringIssues]
  );
  const map3dReadiness = [
    {
      label: activeMapRenderMode === "classic_2d" ? "2D runtime" : "3D runtime adapter",
      ready: activeMapRenderMode === "classic_2d" || map3dAdapter.tiles.length > 0
    },
    { label: "Player anchor", ready: Boolean(playerSpawnAnchor) },
    { label: "Entry route", ready: entryRouteCount > 0 },
    { label: "Route targets", ready: routeTargetsReady },
    { label: "Map tags", ready: Boolean(map.mapTags?.length) }
  ];
  const map3dPreview = useMemo(() => {
    const maxElevation = Math.max(0, ...map3dAdapter.tiles.map((tile) => tile.elevation));
    const previewStep = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, map3dAdapter.tiles.length) / MAP_3D_PREVIEW_MAX_TILES)));
    const tileByCoordinate = new Map(map3dAdapter.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const stageWidth = Math.max(
      360,
      (map3dAdapter.width + map3dAdapter.height) * MAP_3D_PREVIEW_ISO_X + MAP_3D_PREVIEW_TILE_WIDTH + 96
    );
    const stageHeight = Math.max(
      240,
      (map3dAdapter.width + map3dAdapter.height) * MAP_3D_PREVIEW_ISO_Y +
        maxElevation * MAP_3D_PREVIEW_ELEVATION_SCALE +
        120
    );
    const xOffset = map3dAdapter.height * MAP_3D_PREVIEW_ISO_X + 48;
    const yOffset = maxElevation * MAP_3D_PREVIEW_ELEVATION_SCALE + 24;
    const getPreviewPoint = (x: number, y: number) => {
      const tile = tileByCoordinate.get(`${x},${y}`);
      const elevation = tile?.elevation ?? 0;
      return {
        x: xOffset + (x - y) * MAP_3D_PREVIEW_ISO_X + MAP_3D_PREVIEW_TILE_WIDTH / 2,
        y: yOffset + (x + y) * MAP_3D_PREVIEW_ISO_Y - elevation * MAP_3D_PREVIEW_ELEVATION_SCALE + MAP_3D_PREVIEW_TILE_HEIGHT / 2
      };
    };
    const tiles = map3dAdapter.tiles
      .filter((tile) => tile.x % previewStep === 0 && tile.y % previewStep === 0)
      .map((tile) => {
        const terrain = getAdapterTileTerrain(tile);
        const left = xOffset + (tile.x - tile.y) * MAP_3D_PREVIEW_ISO_X;
        const top = yOffset + (tile.x + tile.y) * MAP_3D_PREVIEW_ISO_Y - tile.elevation * MAP_3D_PREVIEW_ELEVATION_SCALE;
        const style = {
          left: `${left}px`,
          top: `${top}px`,
          zIndex: Math.round((tile.x + tile.y) * 2 + tile.elevation * 8 + (tile.wall ? 200 : 0)),
          ["--preview-tile-color" as string]: terrainColorMap[terrain],
          ["--preview-elevation" as string]: `${Math.max(0, tile.elevation * MAP_3D_PREVIEW_ELEVATION_SCALE)}px`
        } as CSSProperties;

        return {
          tile,
          terrain,
          style
        };
      });
    const anchors = map3dAdapter.spawnAnchors.map((anchor) => {
      const point = getPreviewPoint(anchor.x, anchor.y);
      return {
        anchor,
        style: {
          left: `${point.x}px`,
          top: `${point.y}px`
        } as CSSProperties
      };
    });
    const connectorLines = map3dAdapter.traversalLinks.map((connector) => {
      const from = getPreviewPoint(connector.from.x, connector.from.y);
      const to = getPreviewPoint(connector.to.x, connector.to.y);
      return {
        connector,
        from,
        to
      };
    });

    return {
      tiles,
      anchors,
      connectorLines,
      previewStep,
      stageWidth,
      stageHeight,
      maxElevation,
      hiddenTileCount: Math.max(0, map3dAdapter.tiles.length - tiles.length),
      wallTileCount: map3dAdapter.tiles.filter((tile) => tile.wall).length,
      blockedTileCount: map3dAdapter.tiles.filter((tile) => !tile.walkable).length,
      noFloorTileCount: map3dAdapter.tiles.filter((tile) => !tile.floor).length,
      elevatedTileCount: map3dAdapter.tiles.filter((tile) => tile.elevation > 0).length
    };
  }, [map3dAdapter]);
  const selectedObject = map.objects.find((item) => item.id === selectedObjectId) ?? null;
  const selectedEnemyObject = selectedObject && isEnemyObject(selectedObject) ? selectedObject : null;
  const mapSceneProps = map.sceneProps ?? [];
  const selectedSceneProp = mapSceneProps.find((item) => item.id === selectedScenePropId) ?? null;
  const mapEncounterVolumes = map.encounterVolumes ?? [];
  const selectedEncounterVolume = mapEncounterVolumes.find((item) => item.id === selectedEncounterId) ?? null;
  const verticalLayerSystem = map.vertical ?? null;
  const verticalLayers = verticalLayerSystem?.layers ?? [];
  const verticalCellCount = useMemo(
    () => verticalLayers.reduce((count, layer) => count + layer.cells.length, 0),
    [verticalLayers]
  );
  const activeVerticalLayer =
    verticalLayers.find((layer) => layer.id === activeVerticalLayerId) ?? verticalLayers[0] ?? null;
  const activeVerticalCell =
    selectedCell && activeVerticalLayer ? getMapVerticalCell(activeVerticalLayer, selectedCell.x, selectedCell.y) : null;
  const selectedCellVerticalConnectors = useMemo(
    () =>
      selectedCell && verticalLayerSystem
        ? verticalLayerSystem.connectors.filter(
            (connector) =>
              (connector.from.layerId === activeVerticalLayer?.id &&
                connector.from.x === selectedCell.x &&
                connector.from.y === selectedCell.y) ||
              (connector.to.layerId === activeVerticalLayer?.id &&
                connector.to.x === selectedCell.x &&
                connector.to.y === selectedCell.y)
          )
        : [],
    [activeVerticalLayer?.id, selectedCell, verticalLayerSystem]
  );
  const mapEnemyObjects = useMemo(
    () => map.objects.filter((item) => isEnemyObject(item)),
    [map.objects]
  );
  const mapNonEnemyObjects = useMemo(
    () => map.objects.filter((item) => !isEnemyObject(item)),
    [map.objects]
  );
  const minimapScenePropRects = useMemo(
    () =>
      mapSceneProps.map((item) => (
        <rect
          key={`mini-scene-prop-${item.id}`}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill="rgba(151, 176, 255, 0.95)"
        />
      )),
    [mapSceneProps]
  );
  const minimapEncounterRects = useMemo(
    () =>
      mapEncounterVolumes.map((item) => (
        <rect
          key={`mini-encounter-${item.id}`}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill="rgba(255, 215, 110, 0.45)"
          stroke="rgba(255, 215, 110, 0.95)"
          strokeWidth={0.08}
        />
      )),
    [mapEncounterVolumes]
  );
  const npcEntries = summaryStates.npc.entries;
  const mapNpcMarkers = useMemo(
    () =>
      npcEntries
        .map<MapNpcMarker | null>((entry) => {
          const mapId = typeof entry.summaryData?.mapId === "string" ? entry.summaryData.mapId : "";
          const tileX = typeof entry.summaryData?.tileX === "number" ? entry.summaryData.tileX : null;
          const tileY = typeof entry.summaryData?.tileY === "number" ? entry.summaryData.tileY : null;

          if (!mapId || tileX === null || tileY === null) {
            return null;
          }

          return {
            entryKey: entry.entryKey,
            contentId: entry.contentId,
            name: entry.title.trim() || entry.contentId,
            mapId,
            tileX,
            tileY,
            origin: entry.origin,
            sourceFile: entry.sourceFile
          };
        })
        .filter((entry): entry is MapNpcMarker => entry !== null && entry.mapId === map.id),
    [map.id, npcEntries]
  );
  const selectedNpcPlacementEntry =
    npcEntries.find((entry) => entry.entryKey === selectedNpcPlacementEntryKey) ?? null;
  const cellSize = computeCellSize(map.tileSize, zoom, isFocusMode);
  const gridGap = GRID_GAP;
  const cellStride = cellSize + gridGap;
  const mapCanvasWidth = map.width * cellSize + Math.max(0, map.width - 1) * gridGap;
  const mapCanvasHeight = map.height * cellSize + Math.max(0, map.height - 1) * gridGap;
  const coordinateInterval = useMemo(
    () => Math.max(getCoordinateInterval(Math.max(map.width, map.height), zoom), 1),
    [map.height, map.width, zoom]
  );
  const terrainSceneStyleMap = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    for (const [terrain, color] of Object.entries(terrainColorMap)) {
      styles[terrain] = terrainSceneStyles(color);
    }
    return styles;
  }, []);
  const showCanvasCoordinates = showGridCoordinates && zoom >= 1.05 && cellSize >= 24;
  const canvasOffset = showRulers ? RULER_SIZE : 0;
  const sceneWidth = mapCanvasWidth + canvasOffset;
  const sceneHeight = mapCanvasHeight + canvasOffset;
  const activeTool = MAP_TOOL_OPTIONS.find((option) => option.id === tool) ?? MAP_TOOL_OPTIONS[0];
  const selectedNpcMarker =
    mapNpcMarkers.find((marker) => marker.entryKey === selectedNpcMarkerEntryKey) ?? null;
  const selectedRect = useMemo<MapRect | null>(() => {
    if (selectedObject) {
      return {
        x: selectedObject.x,
        y: selectedObject.y,
        width: selectedObject.width,
        height: selectedObject.height
      };
    }

    if (selectedSceneProp) {
      return {
        x: selectedSceneProp.x,
        y: selectedSceneProp.y,
        width: selectedSceneProp.width,
        height: selectedSceneProp.height
      };
    }

    if (selectedEncounterVolume) {
      return {
        x: selectedEncounterVolume.x,
        y: selectedEncounterVolume.y,
        width: selectedEncounterVolume.width,
        height: selectedEncounterVolume.height
      };
    }

    if (selectedZone) {
      return {
        x: selectedZone.x,
        y: selectedZone.y,
        width: selectedZone.width,
        height: selectedZone.height
      };
    }

    if (selectedNpcMarker) {
      return {
        x: selectedNpcMarker.tileX,
        y: selectedNpcMarker.tileY,
        width: 1,
        height: 1
      };
    }

    if (selectedCell) {
      return {
        x: selectedCell.x,
        y: selectedCell.y,
        width: 1,
        height: 1
      };
    }

    return null;
  }, [selectedCell, selectedEncounterVolume, selectedNpcMarker, selectedObject, selectedSceneProp, selectedZone]);
  const topRulerMarks = useMemo(
    () => Array.from({ length: Math.ceil(map.width / coordinateInterval) }, (_, index) => index * coordinateInterval).filter((value) => value < map.width),
    [coordinateInterval, map.width]
  );
  const leftRulerMarks = useMemo(
    () => Array.from({ length: Math.ceil(map.height / coordinateInterval) }, (_, index) => index * coordinateInterval).filter((value) => value < map.height),
    [coordinateInterval, map.height]
  );
  const minimapViewport = useMemo(() => {
    const visibleWidth = Math.max(0, (viewportMetrics.width - canvasOffset) / Math.max(cellStride, 1));
    const visibleHeight = Math.max(0, (viewportMetrics.height - canvasOffset) / Math.max(cellStride, 1));
    const left = Math.max(0, (viewportMetrics.scrollLeft - canvasOffset) / Math.max(cellStride, 1));
    const top = Math.max(0, (viewportMetrics.scrollTop - canvasOffset) / Math.max(cellStride, 1));
    return {
      x: Math.max(0, Math.min(map.width, left)),
      y: Math.max(0, Math.min(map.height, top)),
      width: Math.max(0.8, Math.min(map.width, visibleWidth)),
      height: Math.max(0.8, Math.min(map.height, visibleHeight))
    };
  }, [canvasOffset, cellStride, map.height, map.width, viewportMetrics.height, viewportMetrics.scrollLeft, viewportMetrics.scrollTop, viewportMetrics.width]);
  const visibleTileWindow = useMemo(() => {
    if (viewportMetrics.width <= 0 || viewportMetrics.height <= 0) {
      const initialColumns = Math.min(map.width, MAP_SCENE_INITIAL_VISIBLE_TILES);
      const initialRows = Math.min(map.height, MAP_SCENE_INITIAL_VISIBLE_TILES);
      return {
        startColumn: 0,
        endColumn: initialColumns,
        startRow: 0,
        endRow: initialRows,
        columnCount: initialColumns,
        rowCount: initialRows,
        left: 0,
        top: 0
      };
    }

    const viewportLeft = Math.max(0, viewportMetrics.scrollLeft - canvasOffset);
    const viewportTop = Math.max(0, viewportMetrics.scrollTop - canvasOffset);
    const viewportRight = Math.max(viewportLeft, viewportMetrics.scrollLeft + viewportMetrics.width - canvasOffset);
    const viewportBottom = Math.max(viewportTop, viewportMetrics.scrollTop + viewportMetrics.height - canvasOffset);
    const startColumn = Math.max(0, Math.floor(viewportLeft / Math.max(cellStride, 1)) - MAP_SCENE_OVERSCAN_TILES);
    const endColumn = Math.min(map.width, Math.ceil(viewportRight / Math.max(cellStride, 1)) + MAP_SCENE_OVERSCAN_TILES);
    const startRow = Math.max(0, Math.floor(viewportTop / Math.max(cellStride, 1)) - MAP_SCENE_OVERSCAN_TILES);
    const endRow = Math.min(map.height, Math.ceil(viewportBottom / Math.max(cellStride, 1)) + MAP_SCENE_OVERSCAN_TILES);

    return {
      startColumn,
      endColumn,
      startRow,
      endRow,
      columnCount: Math.max(0, endColumn - startColumn),
      rowCount: Math.max(0, endRow - startRow),
      left: startColumn * cellStride,
      top: startRow * cellStride
    };
  }, [
    canvasOffset,
    cellStride,
    map.height,
    map.width,
    viewportMetrics.height,
    viewportMetrics.scrollLeft,
    viewportMetrics.scrollTop,
    viewportMetrics.width
  ]);
  const visibleTileEntries = useMemo(() => {
    const entries: Array<{ tile: MapDocument["tiles"][number][number]; rowIndex: number; columnIndex: number }> = [];

    for (let rowIndex = visibleTileWindow.startRow; rowIndex < visibleTileWindow.endRow; rowIndex += 1) {
      const row = map.tiles[rowIndex];
      if (!row) {
        continue;
      }

      for (let columnIndex = visibleTileWindow.startColumn; columnIndex < visibleTileWindow.endColumn; columnIndex += 1) {
        const tile = row[columnIndex];
        if (!tile) {
          continue;
        }

        entries.push({ tile, rowIndex, columnIndex });
      }
    }

    return entries;
  }, [map.tiles, visibleTileWindow.endColumn, visibleTileWindow.endRow, visibleTileWindow.startColumn, visibleTileWindow.startRow]);
  const activeVerticalCellLookup = useMemo(() => {
    const lookup = new Map<string, MapVerticalLayer["cells"][number]>();
    activeVerticalLayer?.cells.forEach((cell) => {
      lookup.set(`${cell.x},${cell.y}`, cell);
    });
    return lookup;
  }, [activeVerticalLayer]);
  const zoneDragRect = useMemo(() => (zoneDrag ? normalizeRect(zoneDrag.start, zoneDrag.end) : null), [zoneDrag]);
  const minimapTileRects = useMemo(
    () =>
      map.tiles.flatMap((row, rowIndex) =>
        row.map((tile, columnIndex) => (
          <rect
            key={`mini-tile-${columnIndex}-${rowIndex}`}
            x={columnIndex}
            y={rowIndex}
            width={1}
            height={1}
            fill={terrainColorMap[tile.terrain]}
            opacity={tile.floor ? 1 : 0.55}
          />
        ))
      ),
    [map.tiles]
  );
  const minimapZoneRects = useMemo(
    () =>
      map.zones.map((zone) => (
        <rect
          key={`mini-zone-${zone.id}`}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill="rgba(15, 178, 140, 0.2)"
          stroke="rgba(193, 255, 241, 0.78)"
          strokeWidth={0.15}
        />
      )),
    [map.zones]
  );
  const minimapObjectRects = useMemo(
    () =>
      mapNonEnemyObjects.map((item) => (
        <rect
          key={`mini-object-${item.id}`}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill="rgba(243, 181, 98, 0.95)"
        />
      )),
    [mapNonEnemyObjects]
  );
  const minimapEnemyRects = useMemo(
    () =>
      mapEnemyObjects.map((item) => (
        <rect
          key={`mini-enemy-${item.id}`}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill="rgba(255, 108, 108, 0.95)"
        />
      )),
    [mapEnemyObjects]
  );
  const minimapNpcMarkers = useMemo(
    () =>
      mapNpcMarkers.map((npc) => (
        <circle
          key={`mini-npc-${npc.entryKey}`}
          cx={npc.tileX + 0.5}
          cy={npc.tileY + 0.5}
          r={0.38}
          fill="rgba(127, 228, 203, 0.95)"
        />
      )),
    [mapNpcMarkers]
  );

  useEffect(() => {
    setDimensionDraft({ width: map.width, height: map.height });
  }, [map.height, map.width]);

  useEffect(() => {
    if (!verticalLayerSystem) {
      return;
    }

    if (!verticalLayerSystem.layers.some((layer) => layer.id === activeVerticalLayerId)) {
      const nextLayerId = verticalLayerSystem.defaultLayerId || verticalLayerSystem.layers[0]?.id || "ground";
      setActiveVerticalLayerId(nextLayerId);
    }
  }, [activeVerticalLayerId, verticalLayerSystem]);

  useEffect(() => {
    if (!selectedCell) {
      return;
    }

    setConnectorDraft((current) => ({
      ...current,
      toX: selectedCell.x,
      toY: selectedCell.y
    }));
  }, [selectedCell]);

  useEffect(() => {
    if (!verticalLayerSystem) {
      return;
    }

    setConnectorDraft((current) => {
      const layerExists = verticalLayerSystem.layers.some((layer) => layer.id === current.toLayerId);
      if (layerExists) {
        return current;
      }

      const fallbackLayer =
        verticalLayerSystem.layers.find((layer) => layer.id !== activeVerticalLayer?.id) ??
        activeVerticalLayer ??
        verticalLayerSystem.layers[0];
      return {
        ...current,
        toLayerId: fallbackLayer?.id ?? "ground"
      };
    });
  }, [activeVerticalLayer, verticalLayerSystem]);

  useEffect(() => {
    if (!isFocusMode) {
      return;
    }

    if (selectedCell || selectedObject || selectedSceneProp || selectedEncounterVolume || selectedZone || selectedNpcMarker) {
      setFocusTraySection("inspector");
    }
  }, [isFocusMode, selectedCell, selectedEncounterVolume, selectedNpcMarker, selectedObject, selectedSceneProp, selectedZone]);

  useEffect(() => {
    if (!isPainting && !zoneDrag && !panState) {
      return;
    }

    function finishInteractions() {
      setIsPainting(false);
      setPanState(null);
      if (zoneDrag) {
        const rect = normalizeRect(zoneDrag.start, zoneDrag.end);
        if (tool === "encounter") {
          const encounter = createDefaultEncounterVolume(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            map.encounterVolumes?.map((item) => item.id) ?? [],
            playerSpawnAnchor?.id ?? "player_start",
            activeVerticalLayer?.id
          );
          setMap((current) =>
            touchMap({
              ...current,
              encounterVolumes: [...(current.encounterVolumes ?? []), encounter]
            })
          );
          setSelectedEncounterId(encounter.id);
        } else {
          const zone = createDefaultZone(rect.x, rect.y, rect.width, rect.height, map.zones.map((item) => item.id));
          setMap((current) =>
            touchMap({
              ...current,
              zones: [...current.zones, zone]
            })
          );
          setSelectedZoneId(zone.id);
        }
        setSelectedObjectId(null);
        setSelectedScenePropId(null);
        setSelectedCell(null);
        setSelectedNpcMarkerEntryKey(null);
      }
      setZoneDrag(null);
    }

    window.addEventListener("pointerup", finishInteractions);
    return () => window.removeEventListener("pointerup", finishInteractions);
  }, [activeVerticalLayer?.id, isPainting, map.encounterVolumes, map.zones, panState, playerSpawnAnchor?.id, setMap, tool, zoneDrag]);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      setSelectedNpcPlacementEntryKey("");
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    void ensureSummaries("npc");
  }, [desktopEnabled, ensureSummaries, repoPath]);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void ensureSummaries("map");
  }, [desktopEnabled, ensureSummaries, repoPath]);

  useEffect(() => {
    setSelectedNpcPlacementEntryKey((current) => {
      if (current && npcEntries.some((entry) => entry.entryKey === current)) {
        return current;
      }
      return npcEntries[0]?.entryKey ?? "";
    });
  }, [npcEntries]);

  useEffect(() => {
    setSelectedNpcMarkerEntryKey((current) => {
      if (current && mapNpcMarkers.some((marker) => marker.entryKey === current)) {
        return current;
      }
      return null;
    });
  }, [mapNpcMarkers]);

  useEffect(() => {
    function handleMobileInboxOpen(event: Event) {
      const customEvent = event as CustomEvent<{ entry?: MobileInboxEntry }>;
      const entry = customEvent.detail?.entry;
      if (entry?.contentType !== "map") {
        return;
      }

      if (!isMapDocumentPayload(entry.payload)) {
        notify("The mobile map draft could not be loaded because its payload is invalid.");
        return;
      }

      setMap(touchMap(entry.payload));
    }

    if (typeof window !== "undefined") {
      window.addEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
      }
    };
  }, [setMap]);

  useEffect(() => {
    function handleMapShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePanning(true);
        return;
      }

      const shortcutTool = MAP_TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (shortcutTool) {
        event.preventDefault();
        setTool(shortcutTool);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((current) => clampZoom(current + 0.1));
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        setZoom((current) => clampZoom(current - 0.1));
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        void fitMapToViewport();
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        void focusViewportOnRect(selectedRect ?? { x: 0, y: 0, width: map.width, height: map.height }, 1);
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (selectedRect) {
          void fitSelectionToViewport();
        } else {
          void fitMapToViewport();
        }
        return;
      }

      if (event.key === "Escape") {
        clearSelection();
        setZoneDrag(null);
      }
    }

    function handleMapShortcutRelease(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    }

    function handleWindowBlur() {
      setIsSpacePanning(false);
    }

    window.addEventListener("keydown", handleMapShortcuts);
    window.addEventListener("keyup", handleMapShortcutRelease);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleMapShortcuts);
      window.removeEventListener("keyup", handleMapShortcutRelease);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [map.height, map.width, selectedRect]);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;

    function updateViewportMetrics() {
      setViewportMetrics({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop
      });
    }

    updateViewportMetrics();
    viewport.addEventListener("scroll", updateViewportMetrics);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateViewportMetrics);
      observer.observe(viewport);
    }

    window.addEventListener("resize", updateViewportMetrics);
    return () => {
      viewport.removeEventListener("scroll", updateViewportMetrics);
      window.removeEventListener("resize", updateViewportMetrics);
      observer?.disconnect();
    };
  }, [isFocusMode, map.height, map.width, showRulers, zoom]);

  async function placeNpcOnMap(x: number, y: number) {
    if (!desktopEnabled) {
      notify("NPC placement writes directly into the Chaos Core repo and requires Technica desktop mode.");
      return;
    }

    if (!repoPath.trim()) {
      notify("Set the Chaos Core repo path in the database panel before placing NPCs.");
      return;
    }

    if (!selectedNpcPlacementEntry) {
      notify("Select an NPC from the placement dropdown before clicking a map tile.");
      return;
    }

    setIsPlacingNpc(true);
    try {
      const loaded = await loadEntry("npc", selectedNpcPlacementEntry.entryKey);
      const parsed = JSON.parse(loaded.editorContent ?? loaded.sourceContent ?? loaded.runtimeContent);
      if (!isNpcDocument(parsed)) {
        notify("The selected NPC entry is not in a Technica-compatible NPC format.");
        return;
      }

      const nextNpcDocument: NpcDocument = {
        ...parsed,
        mapId: map.id,
        tileX: x,
        tileY: y,
        updatedAt: isoNow()
      };

      await publishChaosCoreBundle(
        repoPath.trim(),
        "npc",
        buildNpcBundleForTarget(nextNpcDocument, "chaos-core"),
        loaded.entryKey,
        loaded.sourceFile
      );

      await ensureSummaries("npc", { force: true });
      emitChaosCoreDatabaseUpdate("npc");
      setSelectedNpcMarkerEntryKey(loaded.entryKey);
      notify(`Placed '${nextNpcDocument.name}' at ${x}, ${y} on '${map.name}'.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not place the selected NPC on this map.");
    } finally {
      setIsPlacingNpc(false);
    }
  }

  function patchMap(updater: (current: MapDocument) => MapDocument) {
    setMap((current) => touchMap(updater(current)));
  }

  function updateMap3DSettings(updater: (settings: Map3DSettings) => Map3DSettings) {
    patchMap((current) => ({
      ...current,
      settings3d: updater(current.settings3d ?? map3dSettings)
    }));
  }

  function applyMapRenderModePreset(renderMode: MapRenderMode) {
    const profile = MAP_RENDER_MODE_PROFILES.find((option) => option.id === renderMode) ?? MAP_RENDER_MODE_PROFILES[0];
    patchMap((current) => {
      const currentSettings = current.settings3d ?? map3dSettings;
      return {
        ...current,
        renderMode,
        mapTags: mergeUniqueList(current.mapTags ?? [], profile.tags),
        settings3d: {
          ...currentSettings,
          renderMode,
          previewCamera: profile.previewCamera,
          wallHeight: profile.wallHeight,
          floorThickness: profile.floorThickness,
          defaultSurface: profile.defaultSurface
        },
        vertical: renderMode === "bespoke_3d" && !current.vertical ? createDefaultVerticalLayerSystem() : current.vertical
      };
    });
  }

  function getStarterPoint(current: MapDocument) {
    return {
      x: clampTileCoordinate(selectedCell?.x ?? Math.floor(current.width / 2), current.width),
      y: clampTileCoordinate(selectedCell?.y ?? Math.floor(current.height / 2), current.height)
    };
  }

  function getPreset3DSettings(current: MapDocument, renderMode: MapRenderMode): Map3DSettings {
    const profile = MAP_RENDER_MODE_PROFILES.find((option) => option.id === renderMode) ?? MAP_RENDER_MODE_PROFILES[0];
    return {
      ...(current.settings3d ?? map3dSettings),
      renderMode,
      previewCamera: profile.previewCamera,
      wallHeight: profile.wallHeight,
      floorThickness: profile.floorThickness,
      defaultSurface: profile.defaultSurface
    };
  }

  function prepareSimple3DFieldMap() {
    let selectedAnchor: { x: number; y: number } | null = null;

    patchMap((current) => {
      const starterPoint = getStarterPoint(current);
      selectedAnchor = starterPoint;
      const { anchors, anchorId } = ensurePlayerEntryAnchor(current);
      const existingAnchorIds = anchors.map((anchor) => anchor.id);
      const enemyAnchor =
        anchors.some((anchor) => anchor.kind === "enemy")
          ? null
          : {
              ...createDefaultSpawnAnchor(
                "enemy",
                clampTileCoordinate(starterPoint.x + 2, current.width),
                starterPoint.y,
                existingAnchorIds
              ),
              label: "Starter Enemy Pocket",
              tags: ["enemy", "starter", "field"]
            };
      const entryRules = current.entryRules?.length
        ? current.entryRules
        : [
            {
              ...createDefaultEntryRule("floor_region", [], anchorId),
              label: "Floor 0 field entry",
              regionId: "floor_0"
            }
          ];

      return {
        ...current,
        renderMode: "simple_3d",
        settings3d: getPreset3DSettings(current, "simple_3d"),
        mapTags: mergeUniqueList(current.mapTags ?? [], ["field_map", "simple_3d", "technica_3d"]),
        spawnAnchors: enemyAnchor ? [...anchors, enemyAnchor] : anchors,
        entryRules
      };
    });

    if (selectedAnchor) {
      setSelectedCell(selectedAnchor);
    }
    setTool("select");
    notify("Simple 3D field setup is ready: route, player anchor, tags, and starter enemy anchor checked.");
  }

  function prepareBespokePortalMap() {
    let selectedAnchor: { x: number; y: number } | null = null;

    patchMap((current) => {
      const starterPoint = getStarterPoint(current);
      selectedAnchor = starterPoint;
      const { anchors, anchorId } = ensurePlayerEntryAnchor(current);
      const portalAnchor =
        anchors.find((anchor) => anchor.kind === "portal_exit") ??
        {
          ...createDefaultSpawnAnchor(
            "portal_exit",
            clampTileCoordinate(starterPoint.x + 1, current.width),
            starterPoint.y,
            anchors.map((anchor) => anchor.id)
          ),
          label: "Portal Arrival",
          tags: ["portal_exit", "arrival"]
        };
      const nextAnchors = anchors.some((anchor) => anchor.id === portalAnchor.id)
        ? anchors
        : [...anchors, portalAnchor];
      const entryRules = current.entryRules?.some((entryRule) => entryRule.source === "portal")
        ? current.entryRules
        : [
            ...(current.entryRules ?? []),
            {
              ...createDefaultEntryRule(
                "portal",
                (current.entryRules ?? []).map((entryRule) => entryRule.id),
                portalAnchor.id || anchorId
              ),
              label: "Portal entry",
              sourceMapId: "source_map_id",
              portalId: "portal_id"
            }
          ];

      return {
        ...current,
        renderMode: "bespoke_3d",
        settings3d: getPreset3DSettings(current, "bespoke_3d"),
        mapTags: mergeUniqueList(current.mapTags ?? [], ["bespoke_3d", "technica_3d", "portal_destination"]),
        vertical: current.vertical ?? createDefaultVerticalLayerSystem(),
        spawnAnchors: nextAnchors,
        entryRules
      };
    });

    if (selectedAnchor) {
      setSelectedCell(selectedAnchor);
    }
    setActiveVerticalLayerId((map.vertical ?? createDefaultVerticalLayerSystem()).defaultLayerId);
    setTool("select");
    notify("Bespoke 3D portal map setup is ready with vertical data, portal route, and arrival anchor.");
  }

  function addEnemyAnchorRing() {
    patchMap((current) => {
      const center = getStarterPoint(current);
      const offsets = [
        { x: 0, y: -2 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
        { x: -2, y: 0 }
      ];
      let existingIds = (current.spawnAnchors ?? []).map((anchor) => anchor.id);
      const anchors = offsets.map((offset, index) => {
        const anchor = {
          ...createDefaultSpawnAnchor(
            "enemy",
            clampTileCoordinate(center.x + offset.x, current.width),
            clampTileCoordinate(center.y + offset.y, current.height),
            existingIds
          ),
          label: `Enemy Pocket ${index + 1}`,
          tags: ["enemy", "ambush", "field"]
        };
        existingIds = [...existingIds, anchor.id];
        return anchor;
      });

      return {
        ...current,
        spawnAnchors: [...(current.spawnAnchors ?? []), ...anchors]
      };
    });
    setTool("select");
    notify("Added four tagged enemy spawn anchors around the selected area.");
  }

  function stampRaisedPlatform() {
    let targetPoint: { x: number; y: number } | null = null;
    let targetLayerId = activeVerticalLayerId;

    patchMap((current) => {
      const center = getStarterPoint(current);
      targetPoint = center;
      const vertical = current.vertical ?? createDefaultVerticalLayerSystem();
      const layerId = vertical.layers.some((layer) => layer.id === activeVerticalLayerId)
        ? activeVerticalLayerId
        : vertical.defaultLayerId;
      targetLayerId = layerId;
      const platformCells = Array.from({ length: 9 }, (_, index) => {
        const offsetX = (index % 3) - 1;
        const offsetY = Math.floor(index / 3) - 1;
        return {
          x: clampTileCoordinate(center.x + offsetX, current.width),
          y: clampTileCoordinate(center.y + offsetY, current.height),
          offsetX,
          offsetY
        };
      });
      const currentRenderMode = current.renderMode ?? current.settings3d?.renderMode ?? "classic_2d";
      const shouldPromoteToBespoke3D = currentRenderMode === "classic_2d";

      return {
        ...current,
        renderMode: shouldPromoteToBespoke3D ? "bespoke_3d" : currentRenderMode,
        settings3d: shouldPromoteToBespoke3D ? getPreset3DSettings(current, "bespoke_3d") : current.settings3d ?? map3dSettings,
        mapTags: mergeUniqueList(current.mapTags ?? [], ["technica_3d", "raised_platform"]),
        vertical: {
          ...vertical,
          layers: vertical.layers.map((layer) => {
            if (layer.id !== layerId) {
              return layer;
            }

            return platformCells.reduce(
              (nextLayer, cell) =>
                upsertMapVerticalCell(nextLayer, cell.x, cell.y, (verticalCell) => ({
                  ...verticalCell,
                  heightOffset: Math.max(verticalCell.heightOffset, 1),
                  walkable: true,
                  edges: {
                    ...verticalCell.edges,
                    ...(cell.offsetY === -1 ? { north: "rail" as const } : {}),
                    ...(cell.offsetX === 1 ? { east: "rail" as const } : {}),
                    ...(cell.offsetY === 1 ? { south: "rail" as const } : {}),
                    ...(cell.offsetX === -1 ? { west: "rail" as const } : {})
                  },
                  metadata: {
                    ...verticalCell.metadata,
                    surface: String(verticalCell.metadata.surface ?? "raised_platform")
                  }
                })),
              layer
            );
          })
        }
      };
    });

    if (targetPoint) {
      setSelectedCell(targetPoint);
    }
    setActiveVerticalLayerId(targetLayerId);
    setTool("select");
    notify("Stamped a 3x3 raised platform on the active vertical layer.");
  }

  function updateEntryRule(index: number, updater: (entryRule: MapEntryRule) => MapEntryRule) {
    patchMap((current) => ({
      ...current,
      entryRules: (current.entryRules ?? []).map((entryRule, entryIndex) =>
        entryIndex === index ? updater(entryRule) : entryRule
      )
    }));
  }

  function addEntryRule(source: MapEntrySource) {
    patchMap((current) => {
      const playerAnchor = current.spawnAnchors?.find((anchor) => anchor.kind === "player");
      const fallbackAnchor = current.spawnAnchors?.[0];
      return {
        ...current,
        entryRules: [
          ...(current.entryRules ?? []),
          createDefaultEntryRule(source, (current.entryRules ?? []).map((entryRule) => entryRule.id), playerAnchor?.id ?? fallbackAnchor?.id ?? "player_start")
        ]
      };
    });
  }

  function ensurePlayerEntryAnchor(current: MapDocument): { anchors: MapSpawnAnchor[]; anchorId: string } {
    const anchors = current.spawnAnchors ?? [];
    const existingAnchor = anchors.find((anchor) => anchor.kind === "player") ?? anchors[0];
    if (existingAnchor) {
      return { anchors, anchorId: existingAnchor.id };
    }

    const existingIds = anchors.map((anchor) => anchor.id);
    const preferredId = existingIds.includes("player_start") ? createSequentialId("player_start", existingIds) : "player_start";
    const anchor: MapSpawnAnchor = {
      ...createDefaultSpawnAnchor(
        "player",
        selectedCell?.x ?? Math.max(1, Math.floor(current.width / 2)),
        selectedCell?.y ?? Math.max(1, Math.floor(current.height / 2)),
        existingIds
      ),
      id: preferredId,
      label: "Player Start",
      tags: ["player", "default"]
    };

    return { anchors: [...anchors, anchor], anchorId: anchor.id };
  }

  function updateRouteBuilderSource(source: MapEntrySource) {
    setRouteBuilderDraft((current) => ({
      ...current,
      source,
      label: current.label.trim() ? current.label : routeBuilderLabelForSource(source),
      regionId: source === "floor_region" && !current.regionId.trim() ? "floor_0" : current.regionId,
      theaterScreenId: source === "atlas_theater" && !current.theaterScreenId.trim() ? "room_ingress" : current.theaterScreenId,
      doorId: source === "door" && !current.doorId.trim() ? "door_id" : current.doorId,
      portalId: source === "portal" && !current.portalId.trim() ? "portal_id" : current.portalId
    }));
  }

  function createEntryRouteFromBuilder(
    current: MapDocument,
    anchorId: string,
    existingIds: string[]
  ): MapEntryRule {
    const source = routeBuilderDraft.source;
    const baseRule = createDefaultEntryRule(source, existingIds, anchorId);
    const label = routeBuilderDraft.label.trim() || routeBuilderLabelForSource(source);
    const floorOrdinal = Math.max(0, Math.round(Number(routeBuilderDraft.floorOrdinal) || 0));

    return {
      ...baseRule,
      source,
      floorOrdinal: source === "door" || source === "portal" ? undefined : floorOrdinal,
      regionId: source === "floor_region" ? routeBuilderDraft.regionId.trim() : "",
      operationId: routeBuilderDraft.operationId.trim(),
      theaterScreenId: source === "atlas_theater" ? routeBuilderDraft.theaterScreenId.trim() : "",
      sourceMapId: source === "door" || source === "portal" ? routeBuilderDraft.sourceMapId.trim() : "",
      doorId: source === "door" ? routeBuilderDraft.doorId.trim() : "",
      portalId: source === "portal" ? routeBuilderDraft.portalId.trim() : "",
      label,
      entryPointId: routeBuilderDraft.entryPointId.trim() || anchorId,
      metadata: {
        ...baseRule.metadata,
        technicaRouteBuilder: "true",
        targetMapId: current.id,
        routeSource: source
      }
    };
  }

  function applyRouteBuilderToMap() {
    let appliedRouteLabel = "";
    let appliedAnchorId = "";

    patchMap((current) => {
      const { anchors, anchorId } = ensurePlayerEntryAnchor(current);
      const existingEntryRules = current.entryRules ?? [];
      const draftRoute = createEntryRouteFromBuilder(current, routeBuilderDraft.entryPointId.trim() || anchorId, existingEntryRules.map((entryRule) => entryRule.id));
      const draftKey = getEntryRouteHandshakeKey(draftRoute);
      const existingRoute = existingEntryRules.find((entryRule) => getEntryRouteHandshakeKey(entryRule) === draftKey);
      const nextRoute = existingRoute ? { ...draftRoute, id: existingRoute.id } : draftRoute;
      appliedRouteLabel = nextRoute.label;
      appliedAnchorId = nextRoute.entryPointId;

      return {
        ...current,
        spawnAnchors: anchors,
        mapTags: mergeUniqueList(current.mapTags ?? [], ["field_map", ...activeMapRenderProfile.tags]),
        metadata: {
          ...current.metadata,
          technicaRouteHandshake: "ready",
          technicaRouteSource: nextRoute.source
        },
        entryRules: [
          ...existingEntryRules.filter((entryRule) => getEntryRouteHandshakeKey(entryRule) !== draftKey),
          nextRoute
        ]
      };
    });

    setRouteBuilderDraft((current) => ({
      ...current,
      entryPointId: appliedAnchorId || current.entryPointId
    }));
    notify(`Route handshake '${appliedRouteLabel || routeBuilderLabelForSource(routeBuilderDraft.source)}' is ready.`);
  }

  function setPlayerAnchorToSelectedTile() {
    if (!selectedCell) {
      notify("Select a tile first, then use it as the player entry anchor.");
      return;
    }

    let anchorId = "";
    patchMap((current) => {
      const anchors = current.spawnAnchors ?? [];
      const existingPlayerIndex = anchors.findIndex((anchor) => anchor.kind === "player");
      const preferredId = anchors.some((anchor) => anchor.id === "player_start")
        ? createSequentialId("player_start", anchors.map((anchor) => anchor.id))
        : "player_start";
      const nextAnchor =
        existingPlayerIndex >= 0
          ? {
              ...anchors[existingPlayerIndex],
              x: selectedCell.x,
              y: selectedCell.y,
              label: anchors[existingPlayerIndex].label || "Player Start",
              tags: mergeUniqueList(anchors[existingPlayerIndex].tags ?? [], ["player", "default"])
            }
          : {
              ...createDefaultSpawnAnchor("player", selectedCell.x, selectedCell.y, anchors.map((anchor) => anchor.id)),
              id: preferredId,
              label: "Player Start",
              tags: ["player", "default"]
            };
      anchorId = nextAnchor.id;

      return {
        ...current,
        spawnAnchors:
          existingPlayerIndex >= 0
            ? anchors.map((anchor, index) => (index === existingPlayerIndex ? nextAnchor : anchor))
            : [...anchors, nextAnchor]
      };
    });

    setRouteBuilderDraft((current) => ({ ...current, entryPointId: anchorId || current.entryPointId }));
    notify(`Player entry anchor set to ${selectedCell.x}, ${selectedCell.y}.`);
  }

  function repairRouteTargets() {
    patchMap((current) => {
      const { anchors, anchorId } = ensurePlayerEntryAnchor(current);
      const anchorIds = new Set(anchors.map((anchor) => anchor.id));

      return {
        ...current,
        spawnAnchors: anchors,
        entryRules: (current.entryRules ?? []).map((entryRule) => {
          const targetId = entryRule.entryPointId.trim();
          if (targetId && anchorIds.has(targetId)) {
            return entryRule;
          }

          return {
            ...entryRule,
            entryPointId: anchorId
          };
        })
      };
    });
  }

  function createFloorZeroRouteStarter() {
    patchMap((current) => {
      const { anchors, anchorId } = ensurePlayerEntryAnchor(current);
      const entryRules = current.entryRules ?? [];

      return {
        ...current,
        spawnAnchors: anchors,
        mapTags: mergeUniqueList(current.mapTags ?? [], activeMapRenderProfile.tags),
        entryRules: [
          ...entryRules,
          {
            ...createDefaultEntryRule("floor_region", entryRules.map((entryRule) => entryRule.id), anchorId),
            floorOrdinal: 0,
            regionId: "floor_0",
            label: "Floor 0 entry"
          }
        ]
      };
    });
  }

  function removeEntryRule(index: number) {
    patchMap((current) => ({
      ...current,
      entryRules: (current.entryRules ?? []).filter((_, entryIndex) => entryIndex !== index)
    }));
  }

  function updateSpawnAnchor(index: number, updater: (anchor: NonNullable<MapDocument["spawnAnchors"]>[number]) => NonNullable<MapDocument["spawnAnchors"]>[number]) {
    patchMap((current) => ({
      ...current,
      spawnAnchors: (current.spawnAnchors ?? []).map((anchor, anchorIndex) =>
        anchorIndex === index ? updater(anchor) : anchor
      )
    }));
  }

  function addSpawnAnchor(kind: MapSpawnAnchorKind) {
    patchMap((current) => ({
      ...current,
      spawnAnchors: [
        ...(current.spawnAnchors ?? []),
        createDefaultSpawnAnchor(
          kind,
          selectedCell?.x ?? Math.max(1, Math.floor(current.width / 2)),
          selectedCell?.y ?? Math.max(1, Math.floor(current.height / 2)),
          (current.spawnAnchors ?? []).map((anchor) => anchor.id)
        )
      ]
    }));
  }

  function removeSpawnAnchor(index: number) {
    patchMap((current) => ({
      ...current,
      spawnAnchors: (current.spawnAnchors ?? []).filter((_, anchorIndex) => anchorIndex !== index)
    }));
  }

  function focusSpawnAnchor(x: number, y: number) {
    setSelectedCell({ x, y });
    setSelectedObjectId(null);
    setSelectedZoneId(null);
    setSelectedNpcMarkerEntryKey(null);
    setTool("select");
  }

  function updateVerticalLayerSystem(updater: (current: MapVerticalLayerSystem) => MapVerticalLayerSystem) {
    patchMap((current) => {
      if (!current.vertical) {
        return current;
      }

      return {
        ...current,
        vertical: updater(current.vertical)
      };
    });
  }

  function enableVerticalLayers() {
    const nextVertical = createDefaultVerticalLayerSystem();
    patchMap((current) => {
      if (current.vertical) {
        return current;
      }

      return {
        ...current,
        vertical: nextVertical
      };
    });
    setActiveVerticalLayerId(nextVertical.defaultLayerId);
  }

  function disableVerticalLayers() {
    if (!map.vertical || !confirmAction("Remove vertical layer data from this map draft?")) {
      return;
    }

    patchMap((current) => {
      const { vertical: _vertical, ...next } = current;
      return next;
    });
    setActiveVerticalLayerId("ground");
  }

  function updateActiveVerticalLayer(updater: (layer: MapVerticalLayer) => MapVerticalLayer) {
    if (!activeVerticalLayer) {
      return;
    }

    updateVerticalLayerSystem((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === activeVerticalLayer.id ? updater(layer) : layer))
    }));
  }

  function updateActiveVerticalLayerId(nextId: string) {
    if (!activeVerticalLayer) {
      return;
    }

    const previousId = activeVerticalLayer.id;
    setActiveVerticalLayerId(nextId);
    updateVerticalLayerSystem((current) => ({
      ...current,
      defaultLayerId: current.defaultLayerId === previousId ? nextId : current.defaultLayerId,
      layers: current.layers.map((layer) => (layer.id === previousId ? { ...layer, id: nextId } : layer)),
      connectors: current.connectors.map((connector) => ({
        ...connector,
        from: connector.from.layerId === previousId ? { ...connector.from, layerId: nextId } : connector.from,
        to: connector.to.layerId === previousId ? { ...connector.to, layerId: nextId } : connector.to
      }))
    }));
  }

  function addVerticalLayer() {
    const vertical = map.vertical ?? createDefaultVerticalLayerSystem();
    const existingIds = vertical.layers.map((layer) => layer.id);
    const id = createSequentialId("layer", existingIds);
    const nextElevation =
      vertical.layers.length > 0 ? Math.max(...vertical.layers.map((layer) => layer.elevation)) + 1 : 1;
    const layer = createVerticalLayer(id, `Layer ${vertical.layers.length + 1}`, nextElevation);

    patchMap((current) => {
      const currentVertical = current.vertical ?? createDefaultVerticalLayerSystem();
      return {
        ...current,
        vertical: {
          ...currentVertical,
          layers: [...currentVertical.layers, layer]
        }
      };
    });
    setActiveVerticalLayerId(layer.id);
  }

  function removeActiveVerticalLayer() {
    if (!verticalLayerSystem || !activeVerticalLayer || verticalLayerSystem.layers.length <= 1) {
      notify("A vertical map needs at least one layer.");
      return;
    }

    if (!confirmAction(`Remove vertical layer '${activeVerticalLayer.name || activeVerticalLayer.id}'?`)) {
      return;
    }

    const remainingLayers = verticalLayerSystem.layers.filter((layer) => layer.id !== activeVerticalLayer.id);
    const nextDefaultLayerId =
      verticalLayerSystem.defaultLayerId === activeVerticalLayer.id
        ? remainingLayers[0]?.id ?? "ground"
        : verticalLayerSystem.defaultLayerId;
    setActiveVerticalLayerId(nextDefaultLayerId);

    updateVerticalLayerSystem((current) => ({
      ...current,
      defaultLayerId: nextDefaultLayerId,
      layers: current.layers.filter((layer) => layer.id !== activeVerticalLayer.id),
      connectors: current.connectors.filter(
        (connector) => connector.from.layerId !== activeVerticalLayer.id && connector.to.layerId !== activeVerticalLayer.id
      )
    }));
  }

  function updateSelectedVerticalCell(updater: (cell: MapVerticalLayer["cells"][number]) => MapVerticalLayer["cells"][number] | null) {
    if (!selectedCell || !activeVerticalLayer) {
      return;
    }

    updateActiveVerticalLayer((layer) => upsertMapVerticalCell(layer, selectedCell.x, selectedCell.y, updater));
  }

  function setSelectedVerticalCellEdge(direction: MapVerticalDirection, edgeKind: MapVerticalEdgeKind) {
    updateSelectedVerticalCell((cell) => {
      const edges = { ...cell.edges };
      if (edgeKind === "open") {
        delete edges[direction];
      } else {
        edges[direction] = edgeKind;
      }
      return {
        ...cell,
        edges
      };
    });
  }

  function clearSelectedVerticalCell() {
    updateSelectedVerticalCell(() => null);
  }

  function addVerticalConnector() {
    if (!selectedCell || !activeVerticalLayer || !verticalLayerSystem) {
      notify("Select a tile and enable vertical layers before adding a connector.");
      return;
    }

    const targetLayerId = connectorDraft.toLayerId || activeVerticalLayer.id;
    const connector: MapVerticalConnector = {
      id: createSequentialId("connector", verticalLayerSystem.connectors.map((item) => item.id)),
      kind: connectorDraft.kind,
      from: {
        layerId: activeVerticalLayer.id,
        x: selectedCell.x,
        y: selectedCell.y
      },
      to: {
        layerId: targetLayerId,
        x: Math.max(0, Math.min(map.width - 1, Number(connectorDraft.toX || 0))),
        y: Math.max(0, Math.min(map.height - 1, Number(connectorDraft.toY || 0)))
      },
      bidirectional: connectorDraft.bidirectional,
      metadata: {}
    };

    updateVerticalLayerSystem((current) => ({
      ...current,
      connectors: [...current.connectors, connector]
    }));
  }

  function removeVerticalConnector(connectorId: string) {
    updateVerticalLayerSystem((current) => ({
      ...current,
      connectors: current.connectors.filter((connector) => connector.id !== connectorId)
    }));
  }

  function clearSelection() {
    setSelectedCell(null);
    setSelectedObjectId(null);
    setSelectedZoneId(null);
    setSelectedNpcMarkerEntryKey(null);
  }

  function updateTileAt(x: number, y: number, updater: (tile: MapDocument["tiles"][number][number]) => MapDocument["tiles"][number][number]) {
    patchMap((current) => ({
      ...current,
      tiles: current.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) => (rowIndex === y && columnIndex === x ? updater(tile) : tile))
      )
    }));
  }

  function updateObjectById(objectId: string, updater: (item: MapObject) => MapObject) {
    patchMap((current) => ({
      ...current,
      objects: current.objects.map((item) => (item.id === objectId ? updater(item) : item))
    }));
  }

  function updateScenePropById(scenePropId: string, updater: (item: MapSceneProp) => MapSceneProp) {
    patchMap((current) => ({
      ...current,
      sceneProps: (current.sceneProps ?? []).map((item) => (item.id === scenePropId ? updater(item) : item))
    }));
  }

  function updateEncounterVolumeById(encounterId: string, updater: (item: MapEncounterVolume) => MapEncounterVolume) {
    patchMap((current) => ({
      ...current,
      encounterVolumes: (current.encounterVolumes ?? []).map((item) => (item.id === encounterId ? updater(item) : item))
    }));
  }

  function updateZoneById(zoneId: string, updater: (item: MapZone) => MapZone) {
    patchMap((current) => ({
      ...current,
      zones: current.zones.map((item) => (item.id === zoneId ? updater(item) : item))
    }));
  }

  function updateZoneMetadataValue(zoneId: string, key: string, value: string) {
    updateZoneById(zoneId, (zone) => ({
      ...zone,
      metadata: setRouteMetadataValue(zone.metadata, key, value)
    }));
  }

  function updateSelectedZoneRouteSource(source: MapZoneRouteSource) {
    if (!selectedZone) {
      return;
    }

    updateZoneById(selectedZone.id, (zone) => setZoneRouteSourceMetadata(zone, source));
  }

  function updateSelectedZoneTargetMapId(value: string) {
    if (!selectedZone) {
      return;
    }

    updateZoneById(selectedZone.id, (zone) => {
      let metadata = { ...zone.metadata };
      MAP_ZONE_ROUTE_TARGET_KEYS.forEach((key) => {
        delete metadata[key];
      });
      metadata = setRouteMetadataValue(metadata, "fieldMapId", value);
      return {
        ...zone,
        metadata
      };
    });
  }

  function prepareSelectedZoneAsRoute(source: MapZoneRouteSource) {
    if (!selectedZone) {
      return;
    }

    updateZoneById(selectedZone.id, (zone) => {
      const nextZone = setZoneRouteSourceMetadata(zone, source);
      return {
        ...nextZone,
        action: "custom",
        metadata: {
          ...nextZone.metadata,
          [source === "door" ? "doorId" : "portalId"]:
            nextZone.metadata[source === "door" ? "doorId" : "portalId"] || runtimeId(zone.id, source),
          fieldMapLabel: nextZone.metadata.fieldMapLabel || zone.label || zone.id
        }
      };
    });
    notify(`Zone '${selectedZone.id}' is ready for ${source} route targeting.`);
  }

  function clearSelectedZoneRouteMetadata() {
    if (!selectedZone || !confirmAction(`Clear route target metadata from zone '${selectedZone.id}'?`)) {
      return;
    }

    updateZoneById(selectedZone.id, (zone) => {
      const nextMetadata = { ...zone.metadata };
      MAP_ZONE_ROUTE_METADATA_KEYS.forEach((key) => {
        delete nextMetadata[key];
      });
      return {
        ...zone,
        metadata: nextMetadata
      };
    });
  }

  function applyBrushToWholeMap() {
    patchMap((current) => ({
      ...current,
      tiles: current.tiles.map((row) =>
        row.map((tile) => ({
          ...tile,
          terrain: brush.terrain,
          walkable: brush.walkable,
          wall: brush.wall,
          floor: brush.floor
        }))
      )
    }));
  }

  function frameMapBoundsWithWalls() {
    patchMap((current) => ({
      ...current,
      tiles: current.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) => {
          const isBoundary =
            rowIndex === 0 ||
            columnIndex === 0 ||
            rowIndex === current.height - 1 ||
            columnIndex === current.width - 1;

          if (!isBoundary) {
            return tile;
          }

          return {
            ...tile,
            terrain: brush.terrain,
            walkable: false,
            wall: true,
            floor: brush.floor
          };
        })
      )
    }));
  }

  function syncBrushFromSelectedTile() {
    if (!selectedCell) {
      notify("Select a tile first to copy its terrain and collision flags into the brush.");
      return;
    }

    const tile = map.tiles[selectedCell.y]?.[selectedCell.x];
    if (!tile) {
      return;
    }

    setBrush({
      terrain: tile.terrain,
      walkable: tile.walkable,
      wall: tile.wall,
      floor: tile.floor
    });
    setTool("paint");
  }

  function duplicateSelectedObject() {
    if (!selectedObject) {
      return;
    }

    const nextObject: MapObject = {
      ...selectedObject,
      id: createSequentialId(isEnemyObject(selectedObject) ? "enemy" : "object", map.objects.map((item) => item.id)),
      label: selectedObject.label ? `${selectedObject.label} Copy` : selectedObject.label,
      x: Math.min(map.width - selectedObject.width, selectedObject.x + 1),
      y: Math.min(map.height - selectedObject.height, selectedObject.y + 1)
    };

    patchMap((current) => ({
      ...current,
      objects: [...current.objects, nextObject]
    }));
    setSelectedObjectId(nextObject.id);
    setSelectedZoneId(null);
    setSelectedCell(null);
  }

  function duplicateSelectedSceneProp() {
    if (!selectedSceneProp) {
      return;
    }

    const nextSceneProp: MapSceneProp = {
      ...selectedSceneProp,
      id: createSequentialId("scene_prop", mapSceneProps.map((item) => item.id)),
      label: selectedSceneProp.label ? `${selectedSceneProp.label} Copy` : selectedSceneProp.label,
      x: Math.min(map.width - selectedSceneProp.width, selectedSceneProp.x + 1),
      y: Math.min(map.height - selectedSceneProp.height, selectedSceneProp.y + 1)
    };

    patchMap((current) => ({
      ...current,
      sceneProps: [...(current.sceneProps ?? []), nextSceneProp]
    }));
    setSelectedScenePropId(nextSceneProp.id);
    setSelectedObjectId(null);
    setSelectedZoneId(null);
    setSelectedCell(null);
    setSelectedNpcMarkerEntryKey(null);
  }

  function duplicateSelectedEncounterVolume() {
    if (!selectedEncounterVolume) {
      return;
    }

    const nextEncounter: MapEncounterVolume = {
      ...selectedEncounterVolume,
      id: createSequentialId("encounter", mapEncounterVolumes.map((item) => item.id)),
      label: selectedEncounterVolume.label ? `${selectedEncounterVolume.label} Copy` : selectedEncounterVolume.label,
      x: Math.min(map.width - selectedEncounterVolume.width, selectedEncounterVolume.x + 1),
      y: Math.min(map.height - selectedEncounterVolume.height, selectedEncounterVolume.y + 1)
    };

    patchMap((current) => ({
      ...current,
      encounterVolumes: [...(current.encounterVolumes ?? []), nextEncounter]
    }));
    setSelectedEncounterId(nextEncounter.id);
    setSelectedObjectId(null);
    setSelectedScenePropId(null);
    setSelectedZoneId(null);
    setSelectedCell(null);
    setSelectedNpcMarkerEntryKey(null);
  }

  function duplicateSelectedZone() {
    if (!selectedZone) {
      return;
    }

    const nextZone: MapZone = {
      ...selectedZone,
      id: createSequentialId("zone", map.zones.map((item) => item.id)),
      label: selectedZone.label ? `${selectedZone.label} Copy` : selectedZone.label,
      x: Math.min(map.width - selectedZone.width, selectedZone.x + 1),
      y: Math.min(map.height - selectedZone.height, selectedZone.y + 1)
    };

    patchMap((current) => ({
      ...current,
      zones: [...current.zones, nextZone]
    }));
    setSelectedZoneId(nextZone.id);
    setSelectedObjectId(null);
    setSelectedCell(null);
  }

  function applyBrush(x: number, y: number) {
    updateTileAt(x, y, (tile) => ({
      ...tile,
      terrain: brush.terrain,
      walkable: brush.walkable,
      wall: brush.wall,
      floor: brush.floor
    }));
    setSelectedCell({ x, y });
    setSelectedObjectId(null);
    setSelectedZoneId(null);
    setSelectedNpcMarkerEntryKey(null);
  }

  function eraseTile(x: number, y: number) {
    updateTileAt(x, y, () => createDefaultTile());
  }

  function updateObjectMetadataValue(objectId: string, key: string, value: string) {
    updateObjectById(objectId, (item) => ({
      ...item,
      metadata: {
        ...item.metadata,
        [key]: value
      }
    }));
  }

  function beginPan(pointerId: number, startX: number, startY: number) {
    if (!viewportRef.current) {
      return;
    }

    viewportRef.current.setPointerCapture(pointerId);
    setPanState({
      startX,
      startY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop
    });
  }

  function shouldShowOverlayLabel(kind: "object" | "enemy" | "zone" | "npc" | "prop" | "encounter", rect: MapRect, isSelected: boolean) {
    if (labelDensity === "always" || isSelected) {
      return true;
    }

    if (labelDensity === "minimal") {
      return false;
    }

    const footprint = rect.width * rect.height;
    if (kind === "zone") {
      return zoom >= 0.95 || footprint > 2;
    }

    if (kind === "npc") {
      return zoom >= 1.15;
    }

    if (kind === "enemy") {
      return zoom >= 1.2 || footprint > 1;
    }

    if (kind === "prop") {
      return zoom >= 1.05 || footprint > 1;
    }

    if (kind === "encounter") {
      return zoom >= 0.95 || footprint > 2;
    }

    return zoom >= 1.35 || footprint > 1;
  }

  function focusViewportOnRect(rect: MapRect, targetZoom = zoom) {
    const nextZoom = clampZoom(targetZoom);
    setZoom(nextZoom);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!viewportRef.current) {
          return;
        }

        const viewport = viewportRef.current;
        const nextCellSize = computeCellSize(map.tileSize, nextZoom, isFocusMode);
        const nextStride = nextCellSize + GRID_GAP;
        const nextCanvasWidth = map.width * nextCellSize + Math.max(0, map.width - 1) * GRID_GAP;
        const nextCanvasHeight = map.height * nextCellSize + Math.max(0, map.height - 1) * GRID_GAP;
        const nextCanvasOffset = showRulers ? RULER_SIZE : 0;
        const left = nextCanvasOffset + rect.x * nextStride;
        const top = nextCanvasOffset + rect.y * nextStride;
        const width = rect.width * nextCellSize + Math.max(0, rect.width - 1) * GRID_GAP;
        const height = rect.height * nextCellSize + Math.max(0, rect.height - 1) * GRID_GAP;
        const nextScrollLeft = left + width / 2 - viewport.clientWidth / 2;
        const nextScrollTop = top + height / 2 - viewport.clientHeight / 2;

        viewport.scrollLeft = Math.max(0, Math.min(nextCanvasOffset + nextCanvasWidth, nextScrollLeft));
        viewport.scrollTop = Math.max(0, Math.min(nextCanvasOffset + nextCanvasHeight, nextScrollTop));
      });
    });
  }

  function fitMapToViewport() {
    if (!viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    const availableWidth = Math.max(240, viewport.clientWidth - (showRulers ? RULER_SIZE : 0) - 32);
    const availableHeight = Math.max(220, viewport.clientHeight - (showRulers ? RULER_SIZE : 0) - 32);
    const baseCellSize = Math.max(map.tileSize * 0.72, 1);
    const targetZoom = clampZoom(
      Math.min(
        (availableWidth - Math.max(0, map.width - 1) * GRID_GAP) / Math.max(map.width * baseCellSize, 1),
        (availableHeight - Math.max(0, map.height - 1) * GRID_GAP) / Math.max(map.height * baseCellSize, 1)
      )
    );

    focusViewportOnRect(
      {
        x: 0,
        y: 0,
        width: map.width,
        height: map.height
      },
      targetZoom
    );
  }

  function fitSelectionToViewport() {
    if (!selectedRect || !viewportRef.current) {
      fitMapToViewport();
      return;
    }

    const viewport = viewportRef.current;
    const paddedRect = {
      x: Math.max(0, selectedRect.x - 1),
      y: Math.max(0, selectedRect.y - 1),
      width: Math.min(map.width - Math.max(0, selectedRect.x - 1), selectedRect.width + 2),
      height: Math.min(map.height - Math.max(0, selectedRect.y - 1), selectedRect.height + 2)
    };
    const availableWidth = Math.max(200, viewport.clientWidth - (showRulers ? RULER_SIZE : 0) - 72);
    const availableHeight = Math.max(180, viewport.clientHeight - (showRulers ? RULER_SIZE : 0) - 72);
    const baseCellSize = Math.max(map.tileSize * 0.72, 1);
    const targetZoom = clampZoom(
      Math.min(
        (availableWidth - Math.max(0, paddedRect.width - 1) * GRID_GAP) / Math.max(paddedRect.width * baseCellSize, 1),
        (availableHeight - Math.max(0, paddedRect.height - 1) * GRID_GAP) / Math.max(paddedRect.height * baseCellSize, 1)
      )
    );

    focusViewportOnRect(paddedRect, targetZoom);
  }

  function centerViewportOnPoint(tileX: number, tileY: number) {
    if (!viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    const clampedX = Math.max(0, Math.min(map.width - 1, tileX));
    const clampedY = Math.max(0, Math.min(map.height - 1, tileY));
    const left = canvasOffset + clampedX * cellStride + cellSize / 2 - viewport.clientWidth / 2;
    const top = canvasOffset + clampedY * cellStride + cellSize / 2 - viewport.clientHeight / 2;
    viewport.scrollLeft = Math.max(0, left);
    viewport.scrollTop = Math.max(0, top);
  }

  function centerViewportFromMinimap(clientX: number, clientY: number, bounds: DOMRect) {
    const ratioX = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(bounds.width, 1)));
    const ratioY = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(bounds.height, 1)));
    centerViewportOnPoint(ratioX * map.width, ratioY * map.height);
  }

  function handleCellPointerDown(x: number, y: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button === 1 || tool === "pan" || isSpacePanning) {
      event.preventDefault();
      beginPan(event.pointerId, event.clientX, event.clientY);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (tool === "paint") {
      applyBrush(x, y);
      setIsPainting(true);
      return;
    }

    if (tool === "erase") {
      eraseTile(x, y);
      setIsPainting(true);
      return;
    }

    if (tool === "select") {
      setSelectedCell({ x, y });
      setSelectedObjectId(null);
      setSelectedScenePropId(null);
      setSelectedEncounterId(null);
      setSelectedZoneId(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "move") {
      if (selectedObject) {
        patchMap((current) => ({
          ...current,
          objects: current.objects.map((item) => (item.id === selectedObject.id ? { ...item, x, y } : item))
        }));
        return;
      }

      if (selectedZone) {
        patchMap((current) => ({
          ...current,
          zones: current.zones.map((item) => (item.id === selectedZone.id ? { ...item, x, y } : item))
        }));
        return;
      }

      if (selectedSceneProp) {
        patchMap((current) => ({
          ...current,
          sceneProps: (current.sceneProps ?? []).map((item) =>
            item.id === selectedSceneProp.id ? { ...item, x, y } : item
          )
        }));
        return;
      }

      if (selectedEncounterVolume) {
        patchMap((current) => ({
          ...current,
          encounterVolumes: (current.encounterVolumes ?? []).map((item) =>
            item.id === selectedEncounterVolume.id ? { ...item, x, y } : item
          )
        }));
        return;
      }

      setSelectedCell({ x, y });
      return;
    }

    if (tool === "object") {
      const object = createDefaultObject(x, y, map.objects.map((item) => item.id));
      patchMap((current) => ({
        ...current,
        objects: [...current.objects, object]
      }));
      setSelectedObjectId(object.id);
      setSelectedScenePropId(null);
      setSelectedEncounterId(null);
      setSelectedZoneId(null);
      setSelectedCell(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "prop") {
      const sceneProp = createDefaultSceneProp(x, y, mapSceneProps.map((item) => item.id), activeVerticalLayer?.id);
      patchMap((current) => ({
        ...current,
        sceneProps: [...(current.sceneProps ?? []), sceneProp]
      }));
      setSelectedScenePropId(sceneProp.id);
      setSelectedObjectId(null);
      setSelectedEncounterId(null);
      setSelectedZoneId(null);
      setSelectedCell(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "enemy") {
      const object = createDefaultEnemyObject(x, y, map.objects.map((item) => item.id));
      patchMap((current) => ({
        ...current,
        objects: [...current.objects, object]
      }));
      setSelectedObjectId(object.id);
      setSelectedScenePropId(null);
      setSelectedEncounterId(null);
      setSelectedZoneId(null);
      setSelectedCell(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "zone" || tool === "encounter") {
      setZoneDrag({
        start: { x, y },
        end: { x, y }
      });
      setSelectedObjectId(null);
      setSelectedScenePropId(null);
      setSelectedEncounterId(null);
      setSelectedCell(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "npc") {
      void placeNpcOnMap(x, y);
      return;
    }
  }

  function handleCellPointerEnter(x: number, y: number) {
    setHoverCell((current) => {
      if (current?.x === x && current.y === y) {
        return current;
      }
      return { x, y };
    });

    if (tool === "paint" && isPainting) {
      applyBrush(x, y);
    }

    if (tool === "erase" && isPainting) {
      eraseTile(x, y);
    }

    if ((tool === "zone" || tool === "encounter") && zoneDrag) {
      setZoneDrag((current) => (current ? { ...current, end: { x, y } } : current));
    }
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!viewportRef.current || !panState) {
      return;
    }

    viewportRef.current.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    viewportRef.current.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  }

  function handleViewportPointerLeave() {
    setHoverCell((current) => (current ? null : current));
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.button === 1 || tool === "pan" || isSpacePanning) {
      event.preventDefault();
      beginPan(event.pointerId, event.clientX, event.clientY);
    }
  }

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!viewportRef.current) {
      return;
    }

    event.preventDefault();
    const viewport = viewportRef.current;
    const viewportBounds = viewport.getBoundingClientRect();
    const pointerX = event.clientX - viewportBounds.left;
    const pointerY = event.clientY - viewportBounds.top;
    const currentCanvasX = Math.max(0, viewport.scrollLeft + pointerX - canvasOffset);
    const currentCanvasY = Math.max(0, viewport.scrollTop + pointerY - canvasOffset);
    const ratioX = currentCanvasX / Math.max(mapCanvasWidth, 1);
    const ratioY = currentCanvasY / Math.max(mapCanvasHeight, 1);
    const nextZoom = clampZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12));

    if (nextZoom === zoom) {
      return;
    }

    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!viewportRef.current) {
          return;
        }

        const nextCellSize = computeCellSize(map.tileSize, nextZoom, isFocusMode);
        const nextCanvasWidth = map.width * nextCellSize + Math.max(0, map.width - 1) * GRID_GAP;
        const nextCanvasHeight = map.height * nextCellSize + Math.max(0, map.height - 1) * GRID_GAP;
        const nextCanvasOffset = showRulers ? RULER_SIZE : 0;
        viewportRef.current.scrollLeft = Math.max(0, nextCanvasOffset + ratioX * nextCanvasWidth - pointerX);
        viewportRef.current.scrollTop = Math.max(0, nextCanvasOffset + ratioY * nextCanvasHeight - pointerY);
      });
    });
  }

  function handleMinimapPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    centerViewportFromMinimap(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  function handleMinimapPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.buttons & 1) !== 1) {
      return;
    }

    centerViewportFromMinimap(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  function getOverlayRectStyle(x: number, y: number, width: number, height: number) {
    return {
      left: `${x * cellStride}px`,
      top: `${y * cellStride}px`,
      width: `${width * cellSize + Math.max(0, width - 1) * gridGap}px`,
      height: `${height * cellSize + Math.max(0, height - 1) * gridGap}px`
    };
  }

  function getConnectorPoint(point: { x: number; y: number }) {
    return {
      x: point.x * cellStride + cellSize / 2,
      y: point.y * cellStride + cellSize / 2
    };
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await readTextFile(file));
      const payload = parsed.payload ?? parsed;
      if (!payload.id || !payload.tiles || !payload.width) {
        notify("That file does not look like a Technica map draft or export.");
      } else if (confirmAction("Replace the current map draft with the imported file?")) {
        setMap(payload as MapDocument);
      }
    } catch {
      notify("Could not parse the selected map JSON file.");
    }

    event.target.value = "";
  }

  function handleResizeMap() {
    const nextWidth = Number(dimensionDraft.width);
    const nextHeight = Number(dimensionDraft.height);

    if (nextWidth <= 0 || nextHeight <= 0) {
      notify("Map width and height must be greater than 0.");
      return;
    }

    const isShrinking = nextWidth < map.width || nextHeight < map.height;
    if (!isShrinking || confirmAction("Shrinking the map may trim tiles outside the new bounds. Continue?")) {
      patchMap((current) => resizeMapDocument(current, nextWidth, nextHeight));
    }
  }

  function handleLoadSample() {
    if (confirmAction("Replace the current map draft with the sample map?")) {
      setMap(createSampleMap());
    }
  }

  function handleClearMap() {
    if (confirmAction("Replace the current map draft with a blank field map?")) {
      setMap(createBlankMapDocument());
      setSelectedCell(null);
      setSelectedObjectId(null);
      setSelectedZoneId(null);
    }
  }

  function handleLoadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      const payload = parsed.payload ?? parsed;
      if (!payload.id || !payload.tiles || !payload.width) {
        notify("That Chaos Core map entry does not match the Technica map format.");
        return;
      }
      setMap(touchMap(payload as MapDocument));
    } catch {
      notify("Could not load the selected map from the Chaos Core database.");
    }
  }

  async function handleSendToDesktop() {
    if (!runtime.sessionOrigin || !runtime.pairingToken) {
      notify("Open this editor through the desktop pairing URL before sending content back.");
      return;
    }

    setIsSendingToDesktop(true);
    try {
      const currentMap = touchMap(map);
      const sendResult = await submitMobileInboxEntry({
        sessionOrigin: runtime.sessionOrigin,
        pairingToken: runtime.pairingToken,
        deviceType: runtime.deviceType,
        request: {
          contentType: "map",
          contentId: currentMap.id,
          title: currentMap.name,
          summary: `${currentMap.width}x${currentMap.height} · ${currentMap.objects.filter((item) => !isEnemyObject(item)).length} objects · ${currentMap.objects.filter((item) => isEnemyObject(item)).length} enemies · ${currentMap.zones.length} zones`,
          payload: currentMap
        }
      });
      notify(sendResult.message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this map draft to the desktop inbox.");
    } finally {
      setIsSendingToDesktop(false);
    }
  }

  const mapDatabasePanel = (
    <ChaosCoreDatabasePanel
      contentType="map"
      currentDocument={map}
      buildBundle={(current) => buildMapBundleForTarget(current, "chaos-core")}
      onLoadEntry={handleLoadDatabaseEntry}
      subtitle="Publish maps directly into the Chaos Core repo and reopen the live field maps here for iteration and balance work."
      describePublishReceipt={({ bundle, loadedEntry }) => describeMapPublishReceipt({ bundle, loadedEntry })}
    />
  );

  const outboundRouteProofPanel = (
    <div className="map-route-proof-card">
      <div className="map-route-proof-card__header">
        <div>
          <strong>Outbound Door / Portal Route Proof</strong>
          <span>These are the exact interaction-zone routes Chaos Core will try before built-in actions.</span>
        </div>
        <div className="toolbar">
          <span className={outboundRouteProofs.length > 0 ? "pill accent" : "pill"}>
            {outboundRouteProofs.length} route{outboundRouteProofs.length === 1 ? "" : "s"}
          </span>
          <button type="button" className="ghost-button" onClick={() => void ensureSummaries("map", { force: true })}>
            Refresh maps
          </button>
        </div>
      </div>
      {!mapDatabaseLoaded ? (
        <small>Map database has not loaded yet. Refresh maps to verify target map ids against Chaos Core.</small>
      ) : null}
      {outboundRouteProofs.length === 0 ? (
        <div className="empty-state compact">
          No outbound routes yet. Select a zone and use Route Target to turn it into a door or portal.
        </div>
      ) : (
        <div className="database-list compact">
          {outboundRouteProofs.map((proof) => (
            <button
              key={proof.zoneId}
              type="button"
              className={proof.zoneId === selectedZoneId ? "database-entry active" : "database-entry"}
              onClick={() => {
                setSelectedZoneId(proof.zoneId);
                setSelectedObjectId(null);
                setSelectedCell(null);
                setSelectedNpcMarkerEntryKey(null);
                setTool("select");
              }}
            >
              <strong>{proof.label || proof.zoneId}</strong>
              <span>
                zone {proof.zoneId} -&gt; map {proof.targetMapId || "missing target"} via{" "}
                {proof.source || "missing source"} {proof.routeId || "missing id"}
                {proof.entryPointId ? ` -&gt; spawn ${proof.entryPointId}` : ""}
              </span>
              <small>
                {proof.warnings.length === 0
                  ? "Ready for Chaos Core route resolution"
                  : proof.warnings.join(" ")}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const selectedZoneRouteSource = selectedZone ? readZoneRouteSource(selectedZone) : "";
  const selectedZoneRouteIdKey = selectedZoneRouteSource === "portal" ? "portalId" : "doorId";
  const selectedZoneTargetMapId = selectedZone ? readZoneTargetMapId(selectedZone) : "";
  const selectedZoneEntryPointId = selectedZone ? readZoneEntryPointId(selectedZone) : "";
  const selectedZoneRouteLabel = selectedZone ? readZoneRouteLabel(selectedZone) : "";
  const selectedZoneTargetMapInOptions = selectedZoneTargetMapId
    ? mapEntries.some((entry) => entry.contentId === selectedZoneTargetMapId)
    : false;

  const selectionInspectorPanel = (
    <Panel title="Selection Inspector" subtitle="Edit the selected tile, object, zone, or NPC marker directly.">
      {selectedCell ? (
        <div className="stack-list">
          <article className="item-card">
            <div className="item-card-header">
              <h3>
                Tile {selectedCell.x}, {selectedCell.y}
              </h3>
              <div className="toolbar">
                <button type="button" className="ghost-button" onClick={syncBrushFromSelectedTile}>
                  Copy to brush
                </button>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Terrain</span>
                <select
                  value={map.tiles[selectedCell.y][selectedCell.x].terrain}
                  onChange={(event) =>
                    updateTileAt(selectedCell.x, selectedCell.y, (tile) => ({
                      ...tile,
                      terrain: event.target.value as MapBrushState["terrain"]
                    }))
                  }
                >
                  {terrainPalette.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-inline">
                <span>Walkable</span>
                <input
                  type="checkbox"
                  checked={map.tiles[selectedCell.y][selectedCell.x].walkable}
                  onChange={(event) =>
                    updateTileAt(selectedCell.x, selectedCell.y, (tile) => ({
                      ...tile,
                      walkable: event.target.checked
                    }))
                  }
                />
              </label>
              <label className="field field-inline">
                <span>Wall</span>
                <input
                  type="checkbox"
                  checked={map.tiles[selectedCell.y][selectedCell.x].wall}
                  onChange={(event) =>
                    updateTileAt(selectedCell.x, selectedCell.y, (tile) => ({
                      ...tile,
                      wall: event.target.checked
                    }))
                  }
                />
              </label>
              <label className="field field-inline">
                <span>Floor</span>
                <input
                  type="checkbox"
                  checked={map.tiles[selectedCell.y][selectedCell.x].floor}
                  onChange={(event) =>
                    updateTileAt(selectedCell.x, selectedCell.y, (tile) => ({
                      ...tile,
                      floor: event.target.checked
                    }))
                  }
                />
              </label>
              <label className="field full">
                <span>Tile metadata</span>
                <textarea
                  rows={4}
                  value={serializeKeyValueLines(map.tiles[selectedCell.y][selectedCell.x].metadata)}
                  onChange={(event) =>
                    updateTileAt(selectedCell.x, selectedCell.y, (tile) => ({
                      ...tile,
                      metadata: parseKeyValueLines(event.target.value)
                    }))
                  }
                />
              </label>
              {verticalLayerSystem && activeVerticalLayer ? (
                <>
                  <div className="field full">
                    <span>Vertical layer</span>
                    <div className="chip-row">
                      <span className="pill accent">{activeVerticalLayer.name || activeVerticalLayer.id}</span>
                      <span className="pill">
                        Elevation {activeVerticalLayer.elevation + (activeVerticalCell?.heightOffset ?? 0)}
                      </span>
                      <span className="pill">{activeVerticalCell ? "Annotated" : "Base tile"}</span>
                    </div>
                  </div>
                  <label className="field">
                    <span>Height offset</span>
                    <input
                      type="number"
                      step={0.25}
                      value={activeVerticalCell?.heightOffset ?? 0}
                      onChange={(event) =>
                        updateSelectedVerticalCell((cell) => ({
                          ...cell,
                          heightOffset: Number(event.target.value || 0)
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Layer walkability</span>
                    <select
                      value={
                        activeVerticalCell?.walkable === undefined
                          ? "inherit"
                          : activeVerticalCell.walkable
                            ? "walkable"
                            : "blocked"
                      }
                      onChange={(event) =>
                        updateSelectedVerticalCell((cell) => ({
                          ...cell,
                          walkable:
                            event.target.value === "inherit" ? undefined : event.target.value === "walkable"
                        }))
                      }
                    >
                      <option value="inherit">Inherit base tile</option>
                      <option value="walkable">Walkable on layer</option>
                      <option value="blocked">Blocked on layer</option>
                    </select>
                  </label>
                  {VERTICAL_DIRECTIONS.map((direction) => (
                    <label className="field" key={direction}>
                      <span>{direction[0].toUpperCase() + direction.slice(1)} edge</span>
                      <select
                        value={activeVerticalCell?.edges?.[direction] ?? "open"}
                        onChange={(event) =>
                          setSelectedVerticalCellEdge(direction, event.target.value as MapVerticalEdgeKind)
                        }
                      >
                        {VERTICAL_EDGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="field full">
                    <span>Vertical cell metadata</span>
                    <textarea
                      rows={3}
                      value={serializeKeyValueLines(activeVerticalCell?.metadata ?? {})}
                      onChange={(event) =>
                        updateSelectedVerticalCell((cell) => ({
                          ...cell,
                          metadata: parseKeyValueLines(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <div className="field full">
                    <span>Connector</span>
                    <div className="form-grid compact">
                      <label className="field">
                        <span>Kind</span>
                        <select
                          value={connectorDraft.kind}
                          onChange={(event) =>
                            setConnectorDraft((current) => ({
                              ...current,
                              kind: event.target.value as MapVerticalConnectorKind
                            }))
                          }
                        >
                          {VERTICAL_CONNECTOR_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>To layer</span>
                        <select
                          value={connectorDraft.toLayerId}
                          onChange={(event) =>
                            setConnectorDraft((current) => ({ ...current, toLayerId: event.target.value }))
                          }
                        >
                          {verticalLayers.map((layer) => (
                            <option key={layer.id} value={layer.id}>
                              {layer.name || layer.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>To X</span>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, map.width - 1)}
                          value={connectorDraft.toX}
                          onChange={(event) =>
                            setConnectorDraft((current) => ({
                              ...current,
                              toX: Number(event.target.value || 0)
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>To Y</span>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, map.height - 1)}
                          value={connectorDraft.toY}
                          onChange={(event) =>
                            setConnectorDraft((current) => ({
                              ...current,
                              toY: Number(event.target.value || 0)
                            }))
                          }
                        />
                      </label>
                      <label className="field field-inline">
                        <span>Two-way</span>
                        <input
                          type="checkbox"
                          checked={connectorDraft.bidirectional}
                          onChange={(event) =>
                            setConnectorDraft((current) => ({ ...current, bidirectional: event.target.checked }))
                          }
                        />
                      </label>
                    </div>
                    <div className="toolbar">
                      <button type="button" className="ghost-button" onClick={addVerticalConnector}>
                        Add connector
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={clearSelectedVerticalCell}
                        disabled={!activeVerticalCell}
                      >
                        Clear vertical cell
                      </button>
                    </div>
                    {selectedCellVerticalConnectors.length > 0 ? (
                      <div className="database-list compact">
                        {selectedCellVerticalConnectors.map((connector) => (
                          <button
                            key={connector.id}
                            type="button"
                            className="database-entry"
                            onClick={() => removeVerticalConnector(connector.id)}
                          >
                            <strong>{connector.kind}</strong>
                            <span>
                              {connector.from.layerId} {connector.from.x},{connector.from.y} to {connector.to.layerId}{" "}
                              {connector.to.x},{connector.to.y}
                            </span>
                            <small>Click to remove</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {selectedObject ? (
        <article className="item-card">
          <div className="item-card-header">
            <h3>{selectedObject.label || selectedObject.id}</h3>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={duplicateSelectedObject}>
                Duplicate
              </button>
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => {
                  if (confirmAction(`Remove object '${selectedObject.id}'?`)) {
                    patchMap((current) => ({
                      ...current,
                      objects: current.objects.filter((item) => item.id !== selectedObject.id)
                    }));
                    setSelectedObjectId(null);
                  }
                }}
              >
                Remove object
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Object id</span>
              <input
                value={selectedObject.id}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({ ...item, id: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Type</span>
              <select
                value={selectedObject.type}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({ ...item, type: event.target.value }))
                }
              >
                <option value="interactive">Interactive</option>
                <option value="station">Station</option>
                <option value="resource">Resource</option>
                <option value="enemy">Enemy</option>
                <option value="door">Door</option>
                <option value="decoration">Decoration</option>
              </select>
            </label>
            <label className="field">
              <span>Sprite</span>
              <input
                value={selectedObject.sprite}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({ ...item, sprite: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Label</span>
              <input
                value={selectedObject.label}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({ ...item, label: event.target.value }))
                }
              />
            </label>
            {!selectedEnemyObject ? (
              <label className="field">
                <span>Action</span>
                <input
                  value={selectedObject.action}
                  onChange={(event) =>
                    updateObjectById(selectedObject.id, (item) => ({ ...item, action: event.target.value }))
                  }
                />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Enemy preset</span>
                  <select
                    value={selectedEnemyObject.metadata.enemyKind || "light"}
                    onChange={(event) => updateObjectMetadataValue(selectedEnemyObject.id, "enemyKind", event.target.value)}
                  >
                    <option value="light">Light Enemy</option>
                  </select>
                </label>
                <label className="field">
                  <span>HP</span>
                  <input
                    type="number"
                    min={1}
                    value={selectedEnemyObject.metadata.hp || "3"}
                    onChange={(event) => updateObjectMetadataValue(selectedEnemyObject.id, "hp", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Speed</span>
                  <input
                    type="number"
                    min={1}
                    value={selectedEnemyObject.metadata.speed || "90"}
                    onChange={(event) => updateObjectMetadataValue(selectedEnemyObject.id, "speed", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Aggro range</span>
                  <input
                    type="number"
                    min={32}
                    value={selectedEnemyObject.metadata.aggroRange || "200"}
                    onChange={(event) =>
                      updateObjectMetadataValue(selectedEnemyObject.id, "aggroRange", event.target.value)
                    }
                  />
                </label>
              </>
            )}
            <label className="field">
              <span>X</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.width - selectedObject.width)}
                value={selectedObject.x}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({
                    ...item,
                    x: Math.max(0, Math.min(map.width - item.width, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Y</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.height - selectedObject.height)}
                value={selectedObject.y}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({
                    ...item,
                    y: Math.max(0, Math.min(map.height - item.height, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                value={selectedObject.width}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({
                    ...item,
                    width: Math.max(1, Math.min(map.width - item.x, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                value={selectedObject.height}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({
                    ...item,
                    height: Math.max(1, Math.min(map.height - item.y, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <div className="field full map-zone-route-target">
              <div className="map-zone-route-target__header">
                <div>
                  <span>Route Target</span>
                  <small>Use this when the zone is a door or portal into another Technica-authored field map.</small>
                </div>
                <div className="toolbar">
                  <button type="button" className="ghost-button" onClick={() => prepareSelectedZoneAsRoute("door")}>
                    Make door route
                  </button>
                  <button type="button" className="ghost-button" onClick={() => prepareSelectedZoneAsRoute("portal")}>
                    Make portal route
                  </button>
                </div>
              </div>
              <div className="form-grid compact">
                <label className="field">
                  <span>Route source</span>
                  <select
                    value={selectedZoneRouteSource}
                    onChange={(event) => {
                      const nextSource = event.target.value;
                      if (nextSource === "door" || nextSource === "portal") {
                        updateSelectedZoneRouteSource(nextSource);
                      } else {
                        updateZoneMetadataValue(selectedZone!.id, "fieldMapRouteSource", "");
                      }
                    }}
                  >
                    <option value="">Not a map route</option>
                    <option value="door">Door</option>
                    <option value="portal">Portal</option>
                  </select>
                </label>
                <label className="field">
                  <span>Target map</span>
                  <input
                    list="map-route-target-options"
                    value={selectedZoneTargetMapId}
                    onChange={(event) => updateSelectedZoneTargetMapId(event.target.value)}
                    placeholder="published_field_map_id"
                  />
                  <datalist id="map-route-target-options">
                    {selectedZoneTargetMapId && !selectedZoneTargetMapInOptions ? <option value={selectedZoneTargetMapId} /> : null}
                    {mapEntries.map((entry) => (
                      <option key={entry.entryKey} value={entry.contentId}>
                        {entry.title || entry.contentId}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  <span>{selectedZoneRouteSource === "portal" ? "Portal id" : "Door id"}</span>
                  <input
                    value={readMetadataText(selectedZone!.metadata, selectedZoneRouteIdKey)}
                    onChange={(event) => updateZoneMetadataValue(selectedZone!.id, selectedZoneRouteIdKey, event.target.value)}
                    placeholder={selectedZoneRouteSource === "portal" ? "portal_bespoke" : "shop_door"}
                  />
                </label>
                <label className="field">
                  <span>Target spawn anchor</span>
                  <input
                    value={selectedZoneEntryPointId}
                    onChange={(event) => updateZoneMetadataValue(selectedZone!.id, "entryPointId", event.target.value)}
                    placeholder="player_start"
                  />
                </label>
                <label className="field full">
                  <span>Route label</span>
                  <input
                    value={selectedZoneRouteLabel}
                    onChange={(event) => updateZoneMetadataValue(selectedZone!.id, "fieldMapLabel", event.target.value)}
                    placeholder="Bespoke portal"
                  />
                </label>
              </div>
              <div className="map-zone-route-proof">
                <strong>
                  {selectedZoneRouteProof?.warnings.length
                    ? "Route needs attention"
                    : selectedZoneRouteProof
                      ? "Route proof ready"
                      : "No route metadata yet"}
                </strong>
                <span>
                  zone {selectedZone!.id} -&gt; map {selectedZoneTargetMapId || "missing target"} via{" "}
                  {selectedZoneRouteSource || "missing source"}{" "}
                  {readMetadataText(selectedZone!.metadata, selectedZoneRouteIdKey) || "missing id"}
                  {selectedZoneEntryPointId ? ` -> spawn ${selectedZoneEntryPointId}` : ""}
                </span>
                {selectedZoneRouteProof?.warnings.length ? (
                  <div className="chip-row">
                    {selectedZoneRouteProof.warnings.map((warning) => (
                      <span key={warning} className="pill warning">{warning}</span>
                    ))}
                  </div>
                ) : null}
                <div className="toolbar">
                  <button type="button" className="ghost-button" onClick={() => void ensureSummaries("map", { force: true })}>
                    Verify target maps
                  </button>
                  <button type="button" className="ghost-button danger" onClick={clearSelectedZoneRouteMetadata}>
                    Clear route target
                  </button>
                </div>
              </div>
            </div>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(selectedObject.metadata)}
                onChange={(event) =>
                  updateObjectById(selectedObject.id, (item) => ({
                    ...item,
                    metadata: parseKeyValueLines(event.target.value)
                  }))
                }
              />
            </label>
          </div>
        </article>
      ) : null}

      {selectedSceneProp && !selectedObject ? (
        <article className="item-card">
          <div className="item-card-header">
            <h3>{selectedSceneProp.label || selectedSceneProp.id}</h3>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={duplicateSelectedSceneProp}>
                Duplicate
              </button>
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => {
                  if (confirmAction(`Remove 3D prop '${selectedSceneProp.id}'?`)) {
                    patchMap((current) => ({
                      ...current,
                      sceneProps: (current.sceneProps ?? []).filter((item) => item.id !== selectedSceneProp.id)
                    }));
                    setSelectedScenePropId(null);
                  }
                }}
              >
                Remove 3D prop
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Prop id</span>
              <input
                value={selectedSceneProp.id}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, id: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Kind</span>
              <select
                value={selectedSceneProp.kind}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, kind: event.target.value as MapSceneProp["kind"] }))
                }
              >
                <option value="setpiece">Setpiece</option>
                <option value="cover">Cover</option>
                <option value="door">Door</option>
                <option value="stairs">Stairs</option>
                <option value="portal">Portal</option>
                <option value="light">Light</option>
                <option value="decal">Decal</option>
              </select>
            </label>
            <label className="field">
              <span>Label</span>
              <input
                value={selectedSceneProp.label}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, label: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Layer id</span>
              <input
                value={selectedSceneProp.layerId ?? ""}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    layerId: event.target.value.trim() || undefined
                  }))
                }
                placeholder={activeVerticalLayer?.id ?? "ground"}
              />
            </label>
            <label className="field">
              <span>Model key</span>
              <input
                value={selectedSceneProp.modelKey}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, modelKey: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Model asset path</span>
              <input
                value={selectedSceneProp.modelAssetPath}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, modelAssetPath: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Material key</span>
              <input
                value={selectedSceneProp.materialKey}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, materialKey: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Scene id</span>
              <input
                value={selectedSceneProp.sceneId}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, sceneId: event.target.value }))
                }
                placeholder="Optional linked scene id"
              />
            </label>
            <label className="field">
              <span>X</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.width - selectedSceneProp.width)}
                value={selectedSceneProp.x}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    x: Math.max(0, Math.min(map.width - item.width, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Y</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.height - selectedSceneProp.height)}
                value={selectedSceneProp.y}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    y: Math.max(0, Math.min(map.height - item.height, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                value={selectedSceneProp.width}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    width: Math.max(1, Math.min(map.width - item.x, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                value={selectedSceneProp.height}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    height: Math.max(1, Math.min(map.height - item.y, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Scale</span>
              <input
                type="number"
                step="0.05"
                min={0.05}
                value={selectedSceneProp.scale}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, scale: Number(event.target.value || 1) }))
                }
              />
            </label>
            <label className="field">
              <span>Yaw</span>
              <input
                type="number"
                step="1"
                value={selectedSceneProp.rotationYaw}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, rotationYaw: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className="field">
              <span>Elevation</span>
              <input
                type="number"
                step="0.25"
                value={selectedSceneProp.elevation}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, elevation: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className="field">
              <span>Height offset</span>
              <input
                type="number"
                step="0.05"
                value={selectedSceneProp.heightOffset}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, heightOffset: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className="field field-inline">
              <span>Blocks movement</span>
              <input
                type="checkbox"
                checked={selectedSceneProp.blocksMovement}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, blocksMovement: event.target.checked }))
                }
              />
            </label>
            <label className="field field-inline">
              <span>Provides cover</span>
              <input
                type="checkbox"
                checked={selectedSceneProp.providesCover}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({ ...item, providesCover: event.target.checked }))
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(selectedSceneProp.metadata)}
                onChange={(event) =>
                  updateScenePropById(selectedSceneProp.id, (item) => ({
                    ...item,
                    metadata: parseKeyValueLines(event.target.value)
                  }))
                }
              />
            </label>
          </div>
        </article>
      ) : null}

      {selectedEncounterVolume && !selectedObject && !selectedSceneProp ? (
        <article className="item-card">
          <div className="item-card-header">
            <h3>{selectedEncounterVolume.label || selectedEncounterVolume.id}</h3>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={duplicateSelectedEncounterVolume}>
                Duplicate
              </button>
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => {
                  if (confirmAction(`Remove encounter volume '${selectedEncounterVolume.id}'?`)) {
                    patchMap((current) => ({
                      ...current,
                      encounterVolumes: (current.encounterVolumes ?? []).filter((item) => item.id !== selectedEncounterVolume.id)
                    }));
                    setSelectedEncounterId(null);
                  }
                }}
              >
                Remove encounter
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Encounter id</span>
              <input
                value={selectedEncounterVolume.id}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({ ...item, id: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Label</span>
              <input
                value={selectedEncounterVolume.label}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({ ...item, label: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Trigger mode</span>
              <select
                value={selectedEncounterVolume.triggerMode}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    triggerMode: event.target.value as MapEncounterVolume["triggerMode"]
                  }))
                }
              >
                <option value="on_enter">On enter</option>
                <option value="proximity">Proximity</option>
                <option value="interact">Interact</option>
              </select>
            </label>
            <label className="field">
              <span>Clear behavior</span>
              <select
                value={selectedEncounterVolume.clearBehavior}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    clearBehavior: event.target.value as MapEncounterVolume["clearBehavior"]
                  }))
                }
              >
                <option value="clear_volume">Clear volume</option>
                <option value="clear_room">Clear room</option>
                <option value="scripted">Scripted</option>
              </select>
            </label>
            <label className="field">
              <span>X</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.width - selectedEncounterVolume.width)}
                value={selectedEncounterVolume.x}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    x: Math.max(0, Math.min(map.width - item.width, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Y</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.height - selectedEncounterVolume.height)}
                value={selectedEncounterVolume.y}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    y: Math.max(0, Math.min(map.height - item.height, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                value={selectedEncounterVolume.width}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    width: Math.max(1, Math.min(map.width - item.x, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                value={selectedEncounterVolume.height}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    height: Math.max(1, Math.min(map.height - item.y, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Layer id</span>
              <input
                value={selectedEncounterVolume.layerId ?? ""}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    layerId: event.target.value.trim() || undefined
                  }))
                }
              />
            </label>
            <label className="field field-inline">
              <span>Starts active</span>
              <input
                type="checkbox"
                checked={selectedEncounterVolume.startsActive}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    startsActive: event.target.checked
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Player entry anchor</span>
              <input
                value={selectedEncounterVolume.playerEntryAnchorId}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    playerEntryAnchorId: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Return anchor</span>
              <input
                value={selectedEncounterVolume.fallbackReturnAnchorId}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    fallbackReturnAnchorId: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Extraction anchor</span>
              <input
                value={selectedEncounterVolume.extractionAnchorId}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    extractionAnchorId: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Tactical encounter id</span>
              <input
                value={selectedEncounterVolume.tacticalEncounterId}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    tacticalEncounterId: event.target.value
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Enemy anchor tags</span>
              <textarea
                rows={3}
                value={serializeMultilineList(selectedEncounterVolume.enemyAnchorTags)}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    enemyAnchorTags: parseMultilineList(event.target.value)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Linked field enemy ids</span>
              <textarea
                rows={3}
                value={serializeMultilineList(selectedEncounterVolume.linkedFieldEnemyIds)}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    linkedFieldEnemyIds: parseMultilineList(event.target.value)
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(selectedEncounterVolume.metadata)}
                onChange={(event) =>
                  updateEncounterVolumeById(selectedEncounterVolume.id, (item) => ({
                    ...item,
                    metadata: parseKeyValueLines(event.target.value)
                  }))
                }
              />
            </label>
          </div>
        </article>
      ) : null}

      {selectedZone ? (
        <article className="item-card">
          <div className="item-card-header">
            <h3>{selectedZone.label || selectedZone.id}</h3>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={duplicateSelectedZone}>
                Duplicate
              </button>
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => {
                  if (confirmAction(`Remove zone '${selectedZone.id}'?`)) {
                    patchMap((current) => ({
                      ...current,
                      zones: current.zones.filter((item) => item.id !== selectedZone.id)
                    }));
                    setSelectedZoneId(null);
                  }
                }}
              >
                Remove zone
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Zone id</span>
              <input
                value={selectedZone.id}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({ ...item, id: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Label</span>
              <input
                value={selectedZone.label}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({ ...item, label: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Action</span>
              <input
                value={selectedZone.action}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({ ...item, action: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>X</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.width - selectedZone.width)}
                value={selectedZone.x}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({
                    ...item,
                    x: Math.max(0, Math.min(map.width - item.width, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Y</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, map.height - selectedZone.height)}
                value={selectedZone.y}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({
                    ...item,
                    y: Math.max(0, Math.min(map.height - item.height, Number(event.target.value || 0)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                value={selectedZone.width}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({
                    ...item,
                    width: Math.max(1, Math.min(map.width - item.x, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                value={selectedZone.height}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({
                    ...item,
                    height: Math.max(1, Math.min(map.height - item.y, Number(event.target.value || 1)))
                  }))
                }
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(selectedZone.metadata)}
                onChange={(event) =>
                  updateZoneById(selectedZone.id, (item) => ({
                    ...item,
                    metadata: parseKeyValueLines(event.target.value)
                  }))
                }
              />
            </label>
          </div>
        </article>
      ) : null}

      {selectedNpcMarker && !selectedCell && !selectedObject && !selectedZone ? (
        <article className="item-card">
          <div className="item-card-header">
            <h3>{selectedNpcMarker.name}</h3>
            <div className="chip-row">
              <span className="pill">
                {selectedNpcMarker.tileX}, {selectedNpcMarker.tileY}
              </span>
              <span className="pill">{selectedNpcMarker.origin === "game" ? "Game" : "Technica"}</span>
            </div>
          </div>
          <div className="stack-list compact">
            <p className="muted">
              This marker is on <strong>{map.name}</strong>. Switch to the NPC tool and click a new tile to move it.
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSelectedNpcPlacementEntryKey(selectedNpcMarker.entryKey);
                  setTool("npc");
                }}
              >
                Move this NPC
              </button>
              <button type="button" className="ghost-button" onClick={() => setSelectedNpcMarkerEntryKey(null)}>
                Clear
              </button>
            </div>
          </div>
        </article>
      ) : null}

      {!selectedCell && !selectedObject && !selectedZone && !selectedNpcMarker ? (
        <div className="empty-state compact">
          Select a tile, object, zone, or NPC marker to edit it here. In move mode, click the grid to reposition the
          selected object or zone.
        </div>
      ) : null}
    </Panel>
  );

  const focusValidationPanel = (
    <Panel title="Validation" subtitle="Bounds, dimensions, duplicate ids, and contradictory tile flags show up here.">
      <IssueList issues={issues} emptyLabel="No validation issues. This map is ready to export." />
    </Panel>
  );

  const routeHandshakeBuilder = (
    <div className="map-route-builder-card">
      <div className="map-route-builder-card__header">
        <div>
          <strong>Route Handshake Builder</strong>
          <span>Generate the matching Chaos Core entry rule for an operation room, floor region, door, or portal.</span>
        </div>
        <span className={routeTargetsReady ? "pill accent" : "pill warning"}>
          {routeTargetsReady ? "Handshake ready" : "Needs route target"}
        </span>
      </div>
      <div className="form-grid compact">
        <label className="field">
          <span>Route source</span>
          <select value={routeBuilderDraft.source} onChange={(event) => updateRouteBuilderSource(event.target.value as MapEntrySource)}>
            <option value="atlas_theater">Atlas theater room</option>
            <option value="floor_region">Floor / region</option>
            <option value="door">Door</option>
            <option value="portal">Portal</option>
          </select>
        </label>
        <label className="field">
          <span>Route label</span>
          <input
            value={routeBuilderDraft.label}
            onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder={routeBuilderLabelForSource(routeBuilderDraft.source)}
          />
        </label>
        {routeBuilderDraft.source === "atlas_theater" ? (
          <label className="field">
            <span>Theater room id</span>
            <input
              value={routeBuilderDraft.theaterScreenId}
              onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, theaterScreenId: event.target.value }))}
              placeholder="room_ingress"
            />
          </label>
        ) : null}
        {routeBuilderDraft.source === "floor_region" ? (
          <>
            <label className="field">
              <span>Floor ordinal</span>
              <input
                type="number"
                min={0}
                value={routeBuilderDraft.floorOrdinal}
                onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, floorOrdinal: Number(event.target.value || 0) }))}
              />
            </label>
            <label className="field">
              <span>Region id</span>
              <input
                value={routeBuilderDraft.regionId}
                onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, regionId: event.target.value }))}
                placeholder="floor_0, silt_delta, fairhaven_docks"
              />
            </label>
          </>
        ) : null}
        {routeBuilderDraft.source === "door" || routeBuilderDraft.source === "portal" ? (
          <>
            <label className="field">
              <span>Source map id</span>
              <input
                value={routeBuilderDraft.sourceMapId}
                onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, sourceMapId: event.target.value }))}
                placeholder="outer_deck_overworld"
              />
            </label>
            <label className="field">
              <span>{routeBuilderDraft.source === "portal" ? "Portal id" : "Door id"}</span>
              <input
                value={routeBuilderDraft.source === "portal" ? routeBuilderDraft.portalId : routeBuilderDraft.doorId}
                onChange={(event) =>
                  setRouteBuilderDraft((current) =>
                    routeBuilderDraft.source === "portal"
                      ? { ...current, portalId: event.target.value }
                      : { ...current, doorId: event.target.value }
                  )
                }
                placeholder={routeBuilderDraft.source === "portal" ? "portal_id" : "door_id"}
              />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Operation id</span>
          <input
            value={routeBuilderDraft.operationId}
            onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, operationId: event.target.value }))}
            placeholder="Optional operation id"
          />
        </label>
        <label className="field">
          <span>Entry anchor</span>
          <select
            value={routeBuilderDraft.entryPointId}
            onChange={(event) => setRouteBuilderDraft((current) => ({ ...current, entryPointId: event.target.value }))}
          >
            <option value="">Auto-use player anchor</option>
            {(map.spawnAnchors ?? []).map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.label || anchor.id} ({anchor.id})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button type="button" className="ghost-button" onClick={applyRouteBuilderToMap}>
          Create / replace route
        </button>
        <button type="button" className="ghost-button" onClick={setPlayerAnchorToSelectedTile}>
          Use selected tile as player entry
        </button>
        <button type="button" className="ghost-button" onClick={repairRouteTargets}>
          Repair route targets
        </button>
      </div>
      <small>
        For Operation Editor room routes, use the same field map id here and the same theater room id in the operation room.
      </small>
    </div>
  );

  const mapControlsSurface = (
    <Panel
      title="Map Controls"
      subtitle="Pick a tool, paint tiles, place objects, and create interaction zones."
      actions={
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={handleLoadSample}>
            Load sample
          </button>
          <button type="button" className="ghost-button" onClick={handleClearMap}>
            Clear
          </button>
        </div>
      }
    >
      <div className="chip-row">
        <span className="pill accent">
          {map.width} x {map.height}
        </span>
        <span className="pill">{map.width * map.height} tiles</span>
        <span className="pill">{mapNonEnemyObjects.length} objects</span>
        <span className="pill">{mapEnemyObjects.length} enemies</span>
        <span className="pill">{map.zones.length} zones</span>
        <span className="pill">{mapNpcMarkers.length} NPCs</span>
        {verticalLayerSystem ? (
          <span className="pill accent">{verticalLayers.length} vertical layers</span>
        ) : (
          <span className="pill">2D runtime map</span>
        )}
        <span className="pill">Zoom {Math.round(zoom * 100)}%</span>
        {isFocusMode ? <span className="pill accent">Focus mode</span> : null}
      </div>

      <div className="map-tool-grid">
        {MAP_TOOL_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={tool === option.id ? "map-tool-button active" : "map-tool-button"}
            onClick={() => setTool(option.id)}
          >
            <strong>{option.label}</strong>
            <small>{option.shortcut}</small>
          </button>
        ))}
      </div>

      <div className="map-tool-hint">
        <strong>{activeTool.label}</strong>
        <span>{activeTool.hint}</span>
      </div>

      <div className="subsection">
        <h4>Brush Presets</h4>
        <div className="map-terrain-swatch-grid">
          {terrainPalette.map((option) => (
            <button
              key={option.value}
              type="button"
              className={brush.terrain === option.value ? "terrain-swatch active" : "terrain-swatch"}
              style={{ ["--terrain-color" as string]: option.color }}
              onClick={() => setBrush((current) => ({ ...current, terrain: option.value }))}
            >
              <span className="terrain-swatch-color" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={applyBrushToWholeMap}>
            Fill map with brush
          </button>
          <button type="button" className="ghost-button" onClick={frameMapBoundsWithWalls}>
            Frame outer walls
          </button>
          <button type="button" className="ghost-button" onClick={syncBrushFromSelectedTile} disabled={!selectedCell}>
            Copy selected tile to brush
          </button>
        </div>
      </div>

      <div className="subsection map-3d-build-kit">
        <h4>3D Build Kit</h4>
        <div className="map-selection-summary">
          <strong>Fast setup for routeable 3D field maps</strong>
          <span>
            These actions wire the common authoring pieces together: render mode, tags, entry routes, spawn anchors,
            and vertical layer hints. They do not change the Chaos Core map schema.
          </span>
          <div className="chip-row">
            <span className="pill accent">{activeMapRenderProfile.label}</span>
            <span className="pill">{entryRouteCount} routes</span>
            <span className="pill">{spawnAnchorCount} anchors</span>
            <span className="pill">{verticalCellCount} vertical cells</span>
          </div>
        </div>
        <div className="map-build-action-grid">
          <button type="button" className="map-build-action" onClick={prepareSimple3DFieldMap}>
            <strong>Simple 3D field</strong>
            <span>Mode, route, player anchor, starter enemy pocket.</span>
          </button>
          <button type="button" className="map-build-action" onClick={prepareBespokePortalMap}>
            <strong>Bespoke portal map</strong>
            <span>Vertical data, portal route, arrival anchor.</span>
          </button>
          <button type="button" className="map-build-action" onClick={addEnemyAnchorRing}>
            <strong>Enemy anchor ring</strong>
            <span>Add four tagged enemy pockets around selection.</span>
          </button>
          <button type="button" className="map-build-action" onClick={stampRaisedPlatform}>
            <strong>Raised platform</strong>
            <span>Stamp a 3x3 vertical platform on the active layer.</span>
          </button>
        </div>
      </div>

      <div className="subsection">
        <h4>3D Field Workflow</h4>
        <div className="map-mode-card-grid">
          {MAP_RENDER_MODE_PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={activeMapRenderMode === profile.id ? "map-mode-card active" : "map-mode-card"}
              onClick={() => applyMapRenderModePreset(profile.id)}
            >
              <strong>{profile.label}</strong>
              <small>{profile.summary}</small>
            </button>
          ))}
        </div>
        <div className="map-selection-summary">
          <strong>
            {activeMapRenderProfile.label} authoring // {map3dAdapter.tiles.length} adapter tiles
          </strong>
          <span>
            Technica publishes the normal field map plus a generated 3D adapter. Chaos Core keeps 2D collision, but
            renders simple/bespoke 3D maps with raised surfaces and route-aware spawn anchors.
          </span>
          <div className="chip-row">
            {map3dReadiness.map((item) => (
              <span key={item.label} className={item.ready ? "pill accent" : "pill warning"}>
                {item.ready ? "Ready" : "Needs"} {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Map mode</span>
            <select value={activeMapRenderMode} onChange={(event) => applyMapRenderModePreset(event.target.value as MapRenderMode)}>
              {MAP_RENDER_MODE_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Preview camera</span>
            <select
              value={map3dSettings.previewCamera}
              onChange={(event) =>
                updateMap3DSettings((settings) => ({
                  ...settings,
                  previewCamera: event.target.value as Map3DSettings["previewCamera"]
                }))
              }
            >
              <option value="isometric">Isometric</option>
              <option value="third_person">Third person</option>
              <option value="top_down">Top down</option>
            </select>
          </label>
          <label className="field">
            <span>Wall height</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={map3dSettings.wallHeight}
              onChange={(event) =>
                updateMap3DSettings((settings) => ({
                  ...settings,
                  wallHeight: Number(event.target.value || 0)
                }))
              }
            />
          </label>
          <label className="field">
            <span>Floor thickness</span>
            <input
              type="number"
              min={0}
              step={0.05}
              value={map3dSettings.floorThickness}
              onChange={(event) =>
                updateMap3DSettings((settings) => ({
                  ...settings,
                  floorThickness: Number(event.target.value || 0)
                }))
              }
            />
          </label>
          <label className="field">
            <span>Default 3D surface</span>
            <input
              value={map3dSettings.defaultSurface}
              onChange={(event) =>
                updateMap3DSettings((settings) => ({
                  ...settings,
                  defaultSurface: event.target.value
                }))
              }
            />
          </label>
          <label className="field full">
            <span>Map tags</span>
            <textarea
              rows={3}
              value={serializeMultilineList(map.mapTags ?? [])}
              onChange={(event) => patchMap((current) => ({ ...current, mapTags: parseMultilineList(event.target.value) }))}
            />
          </label>
          <label className="field full">
            <span>Floor / region tags</span>
            <textarea
              rows={3}
              value={serializeMultilineList(map.regionTags ?? [])}
              onChange={(event) => patchMap((current) => ({ ...current, regionTags: parseMultilineList(event.target.value) }))}
            />
          </label>
          <label className="field full">
            <span>3D metadata</span>
            <textarea
              rows={3}
              value={serializeKeyValueLines(map3dSettings.metadata)}
              onChange={(event) =>
                updateMap3DSettings((settings) => ({
                  ...settings,
                  metadata: parseKeyValueLines(event.target.value)
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="subsection">
        <h4>Entry Routing</h4>
        <div className="map-selection-summary">
          <strong>{entryRouteCount} route(s) into this map</strong>
          <span>
            Routes tell Chaos Core where this authored field map can be entered from: theater rooms, floor regions,
            doors, or portals. Each route should point at a spawn anchor.
          </span>
          <div className="chip-row">
            <span className={routeTargetsReady ? "pill accent" : "pill warning"}>
              {routeTargetsReady ? "Ready" : "Needs"} route targets
            </span>
            {blankRouteTargetCount > 0 ? <span className="pill warning">{blankRouteTargetCount} blank target(s)</span> : null}
            {missingRouteTargetIds.length > 0 ? (
              <span className="pill warning">Missing: {missingRouteTargetIds.join(", ")}</span>
            ) : null}
          </div>
        </div>
        {routeHandshakeBuilder}
        {outboundRouteProofPanel}
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={() => addEntryRule("atlas_theater")}>
            Add theater route
          </button>
          <button type="button" className="ghost-button" onClick={() => addEntryRule("floor_region")}>
            Add floor route
          </button>
          <button type="button" className="ghost-button" onClick={() => addEntryRule("door")}>
            Add door route
          </button>
          <button type="button" className="ghost-button" onClick={() => addEntryRule("portal")}>
            Add portal route
          </button>
          <button type="button" className="ghost-button" onClick={createFloorZeroRouteStarter}>
            Create floor-0 starter
          </button>
          <button type="button" className="ghost-button" onClick={repairRouteTargets}>
            Repair route targets
          </button>
        </div>
        <div className="database-list map-route-list">
          {(map.entryRules ?? []).length === 0 ? (
            <div className="empty-state compact">No entry routes yet. Add one when this map should be reachable in-game.</div>
          ) : null}
          {(map.entryRules ?? []).map((entryRule, index) => (
            <article key={`${entryRule.id}-${index}`} className="database-entry map-route-card">
              <div className="dialogue-entry-header">
                <span className="flow-badge jump">{MAP_ENTRY_SOURCE_LABELS[entryRule.source] ?? entryRule.source}</span>
                <button type="button" className="ghost-button danger" onClick={() => removeEntryRule(index)}>
                  Remove
                </button>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Route id</span>
                  <input value={entryRule.id} onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, id: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Source</span>
                  <select
                    value={entryRule.source}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, source: event.target.value as MapEntrySource }))}
                  >
                    <option value="atlas_theater">Atlas theater</option>
                    <option value="floor_region">Floor region</option>
                    <option value="door">Door</option>
                    <option value="portal">Portal</option>
                  </select>
                </label>
                <label className="field">
                  <span>Label</span>
                  <input value={entryRule.label} onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, label: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Entry anchor</span>
                  <select
                    value={entryRule.entryPointId ?? ""}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, entryPointId: event.target.value }))}
                  >
                    <option value="">No anchor selected</option>
                    {(map.spawnAnchors ?? []).map((anchor) => (
                      <option key={anchor.id} value={anchor.id}>
                        {anchor.label || anchor.id} ({anchor.id})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Floor</span>
                  <input
                    type="number"
                    min={0}
                    value={entryRule.floorOrdinal ?? 0}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, floorOrdinal: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Region id</span>
                  <input
                    value={entryRule.regionId ?? ""}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, regionId: event.target.value }))}
                    placeholder="floor_0, silt_delta, fairhaven_docks"
                  />
                </label>
                <label className="field">
                  <span>Theater screen id</span>
                  <input
                    value={entryRule.theaterScreenId ?? ""}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, theaterScreenId: event.target.value }))}
                    placeholder="theater room id"
                  />
                </label>
                <label className="field">
                  <span>Operation id</span>
                  <input
                    value={entryRule.operationId ?? ""}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, operationId: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Source map id</span>
                  <input
                    value={entryRule.sourceMapId ?? ""}
                    onChange={(event) => updateEntryRule(index, (entry) => ({ ...entry, sourceMapId: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>{entryRule.source === "portal" ? "Portal id" : "Door id"}</span>
                  <input
                    value={entryRule.source === "portal" ? entryRule.portalId ?? "" : entryRule.doorId ?? ""}
                    onChange={(event) =>
                      updateEntryRule(index, (entry) => ({
                        ...entry,
                        doorId: entry.source === "door" ? event.target.value : entry.doorId,
                        portalId: entry.source === "portal" ? event.target.value : entry.portalId
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Unlock requirements</span>
                  <textarea
                    rows={3}
                    value={serializeMultilineList(entryRule.unlockRequirements ?? [])}
                    onChange={(event) =>
                      updateEntryRule(index, (entry) => ({
                        ...entry,
                        unlockRequirements: parseMultilineList(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="subsection">
        <h4>Spawn Anchors</h4>
        <div className="map-selection-summary">
          <strong>{spawnAnchorCount} anchor(s)</strong>
          <span>
            Anchors are named spawn points for the player, portal exits, NPC staging, and enemy pockets. New anchors use
            the selected tile when one is selected.
          </span>
        </div>
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={() => addSpawnAnchor("player")}>
            Add player
          </button>
          <button type="button" className="ghost-button" onClick={() => addSpawnAnchor("portal_exit")}>
            Add portal exit
          </button>
          <button type="button" className="ghost-button" onClick={() => addSpawnAnchor("enemy")}>
            Add enemy pocket
          </button>
          <button type="button" className="ghost-button" onClick={() => addSpawnAnchor("npc")}>
            Add NPC anchor
          </button>
        </div>
        <div className="database-list map-anchor-list">
          {(map.spawnAnchors ?? []).length === 0 ? (
            <div className="empty-state compact">No spawn anchors yet. Add a player anchor before publishing routeable maps.</div>
          ) : null}
          {(map.spawnAnchors ?? []).map((anchor, index) => (
            <article key={`${anchor.id}-${index}`} className="database-entry map-anchor-card">
              <div className="dialogue-entry-header">
                <span className="flow-badge jump">{MAP_SPAWN_ANCHOR_LABELS[anchor.kind] ?? anchor.kind}</span>
                <div className="toolbar">
                  <button type="button" className="ghost-button" onClick={() => focusSpawnAnchor(anchor.x, anchor.y)}>
                    Focus
                  </button>
                  <button type="button" className="ghost-button danger" onClick={() => removeSpawnAnchor(index)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Anchor id</span>
                  <input value={anchor.id} onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, id: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Kind</span>
                  <select
                    value={anchor.kind}
                    onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, kind: event.target.value as MapSpawnAnchorKind }))}
                  >
                    <option value="player">Player</option>
                    <option value="enemy">Enemy</option>
                    <option value="npc">NPC</option>
                    <option value="portal_exit">Portal exit</option>
                    <option value="generic">Generic</option>
                  </select>
                </label>
                <label className="field">
                  <span>Label</span>
                  <input value={anchor.label} onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, label: event.target.value }))} />
                </label>
                <label className="field">
                  <span>X</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, map.width - 1)}
                    value={anchor.x}
                    onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, x: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Y</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, map.height - 1)}
                    value={anchor.y}
                    onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, y: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Layer id</span>
                  <input
                    value={anchor.layerId ?? ""}
                    onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, layerId: event.target.value }))}
                  />
                </label>
                <label className="field full">
                  <span>Tags</span>
                  <textarea
                    rows={3}
                    value={serializeMultilineList(anchor.tags ?? [])}
                    onChange={(event) => updateSpawnAnchor(index, (entry) => ({ ...entry, tags: parseMultilineList(event.target.value) }))}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="subsection">
        <h4>Vertical Layers</h4>
        {!verticalLayerSystem ? (
          <div className="toolbar">
            <button type="button" className="ghost-button" onClick={enableVerticalLayers}>
              Enable vertical layers
            </button>
          </div>
        ) : (
          <>
            <div className="chip-row">
              <span className="pill accent">{activeVerticalLayer?.name || activeVerticalLayer?.id}</span>
              <span className="pill">{verticalLayerSystem.connectors.length} connectors</span>
              <span className="pill">Step {verticalLayerSystem.elevationStep}</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Active layer</span>
                <select value={activeVerticalLayer?.id ?? ""} onChange={(event) => setActiveVerticalLayerId(event.target.value)}>
                  {verticalLayers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name || layer.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Layer id</span>
                <input
                  value={activeVerticalLayer?.id ?? ""}
                  onChange={(event) => updateActiveVerticalLayerId(event.target.value)}
                  disabled={!activeVerticalLayer}
                />
              </label>
              <label className="field">
                <span>Layer name</span>
                <input
                  value={activeVerticalLayer?.name ?? ""}
                  onChange={(event) => updateActiveVerticalLayer((layer) => ({ ...layer, name: event.target.value }))}
                  disabled={!activeVerticalLayer}
                />
              </label>
              <label className="field">
                <span>Layer elevation</span>
                <input
                  type="number"
                  step={0.25}
                  value={activeVerticalLayer?.elevation ?? 0}
                  onChange={(event) =>
                    updateActiveVerticalLayer((layer) => ({ ...layer, elevation: Number(event.target.value || 0) }))
                  }
                  disabled={!activeVerticalLayer}
                />
              </label>
              <label className="field">
                <span>Elevation step</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={verticalLayerSystem.elevationStep}
                  onChange={(event) =>
                    updateVerticalLayerSystem((current) => ({
                      ...current,
                      elevationStep: Math.max(0.1, Number(event.target.value || 1))
                    }))
                  }
                />
              </label>
              <label className="field field-inline">
                <span>Visible in 2D</span>
                <input
                  type="checkbox"
                  checked={activeVerticalLayer?.visibleIn2d ?? false}
                  onChange={(event) =>
                    updateActiveVerticalLayer((layer) => ({ ...layer, visibleIn2d: event.target.checked }))
                  }
                  disabled={!activeVerticalLayer}
                />
              </label>
              <label className="field full">
                <span>Layer metadata</span>
                <textarea
                  rows={3}
                  value={serializeKeyValueLines(activeVerticalLayer?.metadata ?? {})}
                  onChange={(event) =>
                    updateActiveVerticalLayer((layer) => ({
                      ...layer,
                      metadata: parseKeyValueLines(event.target.value)
                    }))
                  }
                  disabled={!activeVerticalLayer}
                />
              </label>
              <label className="field full">
                <span>Vertical metadata</span>
                <textarea
                  rows={3}
                  value={serializeKeyValueLines(verticalLayerSystem.metadata)}
                  onChange={(event) =>
                    updateVerticalLayerSystem((current) => ({
                      ...current,
                      metadata: parseKeyValueLines(event.target.value)
                    }))
                  }
                />
              </label>
            </div>
            <div className="toolbar split">
              <div className="toolbar">
                <button type="button" className="ghost-button" onClick={addVerticalLayer}>
                  Add layer
                </button>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={removeActiveVerticalLayer}
                  disabled={verticalLayers.length <= 1}
                >
                  Remove layer
                </button>
              </div>
              <button type="button" className="ghost-button danger" onClick={disableVerticalLayers}>
                Disable vertical data
              </button>
            </div>
          </>
        )}
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Map id</span>
          <input value={map.id} onChange={(event) => patchMap((current) => ({ ...current, id: event.target.value }))} />
        </label>
        <label className="field">
          <span>Name</span>
          <input value={map.name} onChange={(event) => patchMap((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="field">
          <span>Width</span>
          <input
            type="number"
            min={1}
            value={dimensionDraft.width}
            onChange={(event) => setDimensionDraft((current) => ({ ...current, width: Number(event.target.value || 1) }))}
          />
        </label>
        <label className="field">
          <span>Height</span>
          <input
            type="number"
            min={1}
            value={dimensionDraft.height}
            onChange={(event) => setDimensionDraft((current) => ({ ...current, height: Number(event.target.value || 1) }))}
          />
        </label>
        <label className="field">
          <span>Tile size</span>
          <input
            type="number"
            min={16}
            value={map.tileSize}
            onChange={(event) => patchMap((current) => ({ ...current, tileSize: Number(event.target.value || 16) }))}
          />
        </label>
        <label className="field">
          <span>Zoom</span>
          <input type="range" min={MIN_MAP_ZOOM} max={MAX_MAP_ZOOM} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Terrain</span>
          <select
            value={brush.terrain}
            onChange={(event) =>
              setBrush((current) => ({ ...current, terrain: event.target.value as MapBrushState["terrain"] }))
            }
          >
            {terrainPalette.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-inline">
          <span>Walkable</span>
          <input
            type="checkbox"
            checked={brush.walkable}
            onChange={(event) => setBrush((current) => ({ ...current, walkable: event.target.checked }))}
          />
        </label>
        <label className="field field-inline">
          <span>Wall</span>
          <input
            type="checkbox"
            checked={brush.wall}
            onChange={(event) => setBrush((current) => ({ ...current, wall: event.target.checked }))}
          />
        </label>
        <label className="field field-inline">
          <span>Floor</span>
          <input
            type="checkbox"
            checked={brush.floor}
            onChange={(event) => setBrush((current) => ({ ...current, floor: event.target.checked }))}
          />
        </label>
        <label className="field full">
          <span>Map metadata</span>
          <textarea
            rows={4}
            value={serializeKeyValueLines(map.metadata)}
            onChange={(event) => patchMap((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))}
          />
        </label>
      </div>

      <div className="subsection">
        <h4>Visible Layers</h4>
        <div className="toolbar">
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.walkable}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, walkable: event.target.checked }))}
            />
            Walkability
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.walls}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, walls: event.target.checked }))}
            />
            Walls
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.objects}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, objects: event.target.checked }))}
            />
            Objects
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.enemies}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, enemies: event.target.checked }))}
            />
            Enemies
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.zones}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, zones: event.target.checked }))}
            />
            Zones
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.npcs}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, npcs: event.target.checked }))}
            />
            NPCs
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={layerVisibility.vertical}
              onChange={(event) => setLayerVisibility((current) => ({ ...current, vertical: event.target.checked }))}
              disabled={!verticalLayerSystem}
            />
            Vertical
          </label>
        </div>
      </div>

      <div className="subsection">
        <h4>View Workspace</h4>
        <div className="form-grid">
          <label className="field">
            <span>Label density</span>
            <select value={labelDensity} onChange={(event) => setLabelDensity(event.target.value as MapLabelDensity)}>
              <option value="smart">Smart</option>
              <option value="always">Always</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          <label className="field field-inline">
            <span>Rulers</span>
            <input type="checkbox" checked={showRulers} onChange={(event) => setShowRulers(event.target.checked)} />
          </label>
          <label className="field field-inline">
            <span>Minimap</span>
            <input type="checkbox" checked={showMinimap} onChange={(event) => setShowMinimap(event.target.checked)} />
          </label>
          <label className="field field-inline">
            <span>Grid coords</span>
            <input
              type="checkbox"
              checked={showGridCoordinates}
              onChange={(event) => setShowGridCoordinates(event.target.checked)}
            />
          </label>
        </div>
        <div className="toolbar">
          {!runtime.isPopout ? (
            <button type="button" className="ghost-button" onClick={() => setExpandedInline((current) => !current)}>
              {isFocusMode ? "Exit expanded view" : "Expand map view"}
            </button>
          ) : null}
          {runtime.isDesktop ? (
            <button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("map", "Map Editor")}>
              Open map popout
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={fitMapToViewport}>
            Fit map
          </button>
          <button type="button" className="ghost-button" onClick={selectedRect ? fitSelectionToViewport : fitMapToViewport}>
            {selectedRect ? "Fit selection" : "Fit selection / map"}
          </button>
        </div>
      </div>

      <div className="toolbar split">
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
        <div className="toolbar">
          <button type="button" className="ghost-button" onClick={handleResizeMap}>
            Apply size
          </button>
          {runtime.isMobile ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSendToDesktop()}
              disabled={!canSendToDesktop || isSendingToDesktop}
            >
              {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
            </button>
          ) : (
            <>
              <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
                Import draft
              </button>
              <button type="button" className="ghost-button" onClick={() => downloadDraftFile("map", map.name, map)}>
                Save draft file
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={async () => {
                  try {
                    await downloadBundle(buildMapBundleForTarget(map, "chaos-core"));
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "Could not export the map bundle.");
                  }
                }}
              >
                Export bundle
              </button>
            </>
          )}
          <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
        </div>
      </div>
    </Panel>
  );

  const npcPlacementSurface = (
    <Panel
      title="NPC Placement"
      subtitle="Select an NPC from the Chaos Core database, switch to the NPC tool, and click a tile to place them on this map."
      actions={
        desktopEnabled ? (
          <button type="button" className="ghost-button" onClick={() => void ensureSummaries("npc", { force: true })}>
            Refresh NPCs
          </button>
        ) : undefined
      }
    >
      {!desktopEnabled ? (
        <div className="empty-state compact">
          Open Technica in desktop mode to place NPCs directly into the Chaos Core repo.
        </div>
      ) : null}

      <div className="form-grid">
        <label className="field full">
          <span>Placement NPC</span>
          <select
            value={selectedNpcPlacementEntryKey}
            onChange={(event) => setSelectedNpcPlacementEntryKey(event.target.value)}
            disabled={!desktopEnabled || npcEntries.length === 0}
          >
            {npcEntries.length === 0 ? <option value="">No NPCs found</option> : null}
            {npcEntries.map((entry) => (
              <option key={entry.entryKey} value={entry.entryKey}>
                {entry.title || entry.contentId} ({entry.origin === "game" ? "Game" : "Technica"})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chip-row">
        <span className="pill">{mapNpcMarkers.length} NPCs on this map</span>
        {selectedNpcPlacementEntry ? <span className="pill accent">Placing {selectedNpcPlacementEntry.title}</span> : null}
        {selectedNpcMarker ? (
          <span className="pill">
            Selected marker {selectedNpcMarker.tileX}, {selectedNpcMarker.tileY}
          </span>
        ) : null}
        {isPlacingNpc ? <span className="pill">Saving placement...</span> : null}
      </div>

      {selectedNpcMarker ? (
        <div className="map-selection-summary">
          <strong>{selectedNpcMarker.name}</strong>
          <span>
            {selectedNpcMarker.contentId} at {selectedNpcMarker.tileX}, {selectedNpcMarker.tileY}
          </span>
          <div className="toolbar">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSelectedNpcPlacementEntryKey(selectedNpcMarker.entryKey);
                setTool("npc");
              }}
            >
              Use for placement
            </button>
            <button type="button" className="ghost-button" onClick={() => setSelectedNpcMarkerEntryKey(null)}>
              Clear marker selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="database-list">
        {mapNpcMarkers.length === 0 ? (
          <div className="empty-state compact">No NPCs are assigned to this map yet.</div>
        ) : (
          mapNpcMarkers.map((marker) => (
            <button
              key={marker.entryKey}
              type="button"
              className={marker.entryKey === selectedNpcMarkerEntryKey ? "database-entry active" : "database-entry"}
              onClick={() => setSelectedNpcMarkerEntryKey(marker.entryKey)}
            >
              <strong>{marker.name}</strong>
              <span>
                {marker.contentId} at {marker.tileX}, {marker.tileY}
              </span>
              <small>{marker.origin === "game" ? "Game" : "Technica"}</small>
            </button>
          ))
        )}
      </div>
    </Panel>
  );

  const lightEnemiesSurface = (
    <Panel
      title="Light Enemies"
      subtitle="Place light field enemies that make Chaos Core switch this map into melee/ranged field combat until the room is clear."
    >
      <div className="map-selection-summary">
        <strong>Light Enemy Tool</strong>
        <span>Switch to the enemy tool, click a tile to drop a hostile, then tune its basic combat stats in the inspector.</span>
      </div>
      <div className="chip-row">
        <span className="pill">{mapEnemyObjects.length} enemies on this map</span>
        {tool === "enemy" ? <span className="pill accent">Enemy tool active</span> : null}
      </div>
      <div className="toolbar">
        <button type="button" className="ghost-button" onClick={() => setTool("enemy")}>
          Use light enemy tool
        </button>
        {selectedEnemyObject ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setSelectedObjectId(selectedEnemyObject.id);
              setTool("select");
            }}
          >
            Inspect selected enemy
          </button>
        ) : null}
      </div>
    </Panel>
  );

  const sceneWorkspaceClassName = [
    "map-scene-stage",
    showRulers ? "with-rulers" : "",
    panState || tool === "pan" || isSpacePanning ? "is-panning" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const mapSceneSurface = (
    <Panel
      title="Field Map"
      subtitle="Paint directly on the grid, inspect live coordinates, and work with objects, zones, NPC markers, and light enemies in-place."
      className="map-scene-panel"
    >
      <div className="map-scene-hud">
        <div className="map-scene-topbar">
          <div className="chip-row">
            <span className="pill accent">{activeTool.label}</span>
            <span className="pill">{activeTool.shortcut}</span>
            <span className="pill">Zoom {Math.round(zoom * 100)}%</span>
            {activeVerticalLayer ? (
              <span className="pill">
                {activeVerticalLayer.name || activeVerticalLayer.id} z{activeVerticalLayer.elevation}
              </span>
            ) : null}
            {hoverCell ? <span className="pill">Hover {hoverCell.x}, {hoverCell.y}</span> : null}
            {selectedCell ? <span className="pill">Tile {selectedCell.x}, {selectedCell.y}</span> : null}
            {selectedObject ? <span className="pill">Object {selectedObject.id}</span> : null}
            {selectedZone ? <span className="pill">Zone {selectedZone.id}</span> : null}
            {selectedNpcMarker ? <span className="pill">NPC {selectedNpcMarker.name}</span> : null}
            {selectedEnemyObject ? <span className="pill">Enemy {selectedEnemyObject.id}</span> : null}
            {isSpacePanning ? <span className="pill accent">Space pan</span> : null}
          </div>
          <div className="map-scene-topbar-actions">
            {!runtime.isPopout ? (
              <button type="button" className="ghost-button" onClick={() => setExpandedInline((current) => !current)}>
                {isFocusMode ? "Exit expanded" : "Expand"}
              </button>
            ) : null}
            {runtime.isDesktop ? (
              <button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("map", "Map Editor")}>
                Pop out
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={selectedRect ? fitSelectionToViewport : fitMapToViewport}>
              Fit
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => focusViewportOnRect(selectedRect ?? { x: 0, y: 0, width: map.width, height: map.height }, 1)}
            >
              Reset zoom
            </button>
          </div>
        </div>

        <div className="map-scene-summary-bar">
          <div className="map-selection-summary">
            <strong>{map.name}</strong>
            <span>{activeTool.hint}</span>
          </div>
          <div className="map-legend">
            <span className="map-legend-chip wall">Wall</span>
            <span className="map-legend-chip blocked">Blocked</span>
            <span className="map-legend-chip object">Object</span>
            <span className="map-legend-chip enemy">Enemy</span>
            <span className="map-legend-chip zone">Zone</span>
            <span className="map-legend-chip npc">NPC</span>
            <span className="map-legend-chip vertical">Vertical</span>
          </div>
        </div>

        <div className="map-scene-filter-bar">
          <div className="map-layer-toggle-row">
            <button
              type="button"
              className={layerVisibility.walkable ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, walkable: !current.walkable }))}
            >
              Walkability
            </button>
            <button
              type="button"
              className={layerVisibility.walls ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, walls: !current.walls }))}
            >
              Walls
            </button>
            <button
              type="button"
              className={layerVisibility.objects ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, objects: !current.objects }))}
            >
              Objects
            </button>
            <button
              type="button"
              className={layerVisibility.enemies ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, enemies: !current.enemies }))}
            >
              Enemies
            </button>
            <button
              type="button"
              className={layerVisibility.zones ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, zones: !current.zones }))}
            >
              Zones
            </button>
            <button
              type="button"
              className={layerVisibility.npcs ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, npcs: !current.npcs }))}
            >
              NPCs
            </button>
            <button
              type="button"
              className={layerVisibility.vertical ? "map-layer-toggle active" : "map-layer-toggle"}
              onClick={() => setLayerVisibility((current) => ({ ...current, vertical: !current.vertical }))}
              disabled={!verticalLayerSystem}
            >
              Vertical
            </button>
          </div>
          <div className="map-scene-filter-actions">
            <label className="inline-select map-density-select">
              <span>Labels</span>
              <select value={labelDensity} onChange={(event) => setLabelDensity(event.target.value as MapLabelDensity)}>
                <option value="smart">Smart</option>
                <option value="always">Always</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
            <label className="inline-toggle">
              <input type="checkbox" checked={showRulers} onChange={(event) => setShowRulers(event.target.checked)} />
              Rulers
            </label>
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={showGridCoordinates}
                onChange={(event) => setShowGridCoordinates(event.target.checked)}
              />
              Grid coords
            </label>
            {isFocusMode ? (
              <label className="inline-toggle">
                <input type="checkbox" checked={showMinimap} onChange={(event) => setShowMinimap(event.target.checked)} />
                Minimap
              </label>
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={tool === "pan" || isSpacePanning ? "map-viewport focus-aware pannable" : "map-viewport focus-aware"}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerLeave={handleViewportPointerLeave}
        onWheel={handleViewportWheel}
      >
        <div
          ref={canvasStageRef}
          className={sceneWorkspaceClassName}
          style={{
            width: `${sceneWidth}px`,
            height: `${sceneHeight}px`
          }}
          onPointerDown={handleViewportPointerDown}
        >
          {showRulers ? (
            <>
              <div className="map-ruler-corner" />
              <div className="map-ruler map-ruler-top">
                {topRulerMarks.map((value) => (
                  <span
                    key={`ruler-top-${value}`}
                    className="map-ruler-mark"
                    style={{ left: `${canvasOffset + value * cellStride}px`, width: `${cellSize}px` }}
                  >
                    {value}
                  </span>
                ))}
              </div>
              <div className="map-ruler map-ruler-left">
                {leftRulerMarks.map((value) => (
                  <span
                    key={`ruler-left-${value}`}
                    className="map-ruler-mark vertical"
                    style={{ top: `${canvasOffset + value * cellStride}px`, height: `${cellSize}px` }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <div
            className="map-canvas map-canvas-scene"
            style={{
              width: `${mapCanvasWidth}px`,
              height: `${mapCanvasHeight}px`,
              left: `${canvasOffset}px`,
              top: `${canvasOffset}px`
            }}
          >
            <div
              className="map-grid map-grid-window"
              style={{
                left: `${visibleTileWindow.left}px`,
                top: `${visibleTileWindow.top}px`,
                gridTemplateColumns: `repeat(${visibleTileWindow.columnCount}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${visibleTileWindow.rowCount}, ${cellSize}px)`
              }}
            >
              {visibleTileEntries.map(({ tile, rowIndex, columnIndex }) => {
                const isSelected = selectedCell?.x === columnIndex && selectedCell?.y === rowIndex;
                const showCoords =
                  showCanvasCoordinates &&
                  columnIndex % coordinateInterval === 0 &&
                  rowIndex % coordinateInterval === 0;
                const verticalCell =
                  layerVisibility.vertical && activeVerticalLayer
                    ? activeVerticalCellLookup.get(`${columnIndex},${rowIndex}`) ?? null
                    : null;
                const verticalEdgeEntries = verticalCell ? Object.entries(verticalCell.edges) : [];
                return (
                  <button
                    key={`cell-${columnIndex}-${rowIndex}`}
                    type="button"
                    className={[
                      "map-cell",
                      isSelected ? "selected" : "",
                      verticalCell ? "has-vertical-cell" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={terrainSceneStyleMap[tile.terrain] ?? terrainSceneStyles(terrainColorMap[tile.terrain])}
                    data-terrain={tile.terrain}
                    onPointerDown={(event) => handleCellPointerDown(columnIndex, rowIndex, event)}
                    onPointerEnter={() => handleCellPointerEnter(columnIndex, rowIndex)}
                    title={`${columnIndex},${rowIndex} ${tile.terrain}`}
                  >
                    <span className="map-cell-surface" />
                    <span className="map-cell-shade" />
                    {showCoords ? <span className="map-cell-coordinate">{columnIndex},{rowIndex}</span> : null}
                    {verticalCell ? (
                      <span className="map-cell-height-badge">
                        z{activeVerticalLayer.elevation + verticalCell.heightOffset}
                      </span>
                    ) : null}
                    {verticalEdgeEntries.length > 0 ? (
                      <span className="map-cell-edge-stack">
                        {verticalEdgeEntries.map(([direction, edgeKind]) => (
                          <span
                            key={`${columnIndex}-${rowIndex}-${direction}-${edgeKind}`}
                            className={`map-cell-edge map-cell-edge-${direction}`}
                            title={`${direction} ${edgeKind}`}
                          />
                        ))}
                      </span>
                    ) : null}
                    {layerVisibility.walls && tile.wall ? <span className="cell-wall" /> : null}
                    {layerVisibility.walkable && !tile.walkable ? <span className="cell-blocked" /> : null}
                    {!tile.floor ? <span className="cell-no-floor" /> : null}
                  </button>
                );
              })}
            </div>

            {layerVisibility.vertical && verticalLayerSystem && activeVerticalLayer ? (
              <svg
                className="map-vertical-connector-layer"
                width={mapCanvasWidth}
                height={mapCanvasHeight}
                viewBox={`0 0 ${mapCanvasWidth} ${mapCanvasHeight}`}
                aria-hidden="true"
              >
                {verticalLayerSystem.connectors
                  .filter(
                    (connector) =>
                      connector.from.layerId === activeVerticalLayer.id || connector.to.layerId === activeVerticalLayer.id
                  )
                  .map((connector) => {
                    const from = getConnectorPoint(connector.from);
                    const to = getConnectorPoint(connector.to);
                    return (
                      <g key={`vertical-connector-${connector.id}`}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          className="map-vertical-connector-line"
                        />
                        <circle cx={from.x} cy={from.y} r={Math.max(3, cellSize * 0.12)} className="map-vertical-connector-dot" />
                        <circle cx={to.x} cy={to.y} r={Math.max(3, cellSize * 0.12)} className="map-vertical-connector-dot target" />
                      </g>
                    );
                  })}
              </svg>
            ) : null}

            <div className="map-overlay-layer">
              {layerVisibility.objects
                ? mapNonEnemyObjects.map((item) => {
                    const rect = { x: item.x, y: item.y, width: item.width, height: item.height };
                    const showLabel = shouldShowOverlayLabel("object", rect, item.id === selectedObjectId);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          item.id === selectedObjectId
                            ? `map-overlay object selected${showLabel ? " show-label" : ""}`
                            : `map-overlay object${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedObjectId(item.id);
                          setSelectedScenePropId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("object")}</span>
                        <span className="map-overlay-label">{item.label || item.id}</span>
                        <span className="map-overlay-meta">{item.type}</span>
                      </button>
                    );
                  })
                : null}

              {layerVisibility.props
                ? mapSceneProps.map((item) => {
                    const rect = { x: item.x, y: item.y, width: item.width, height: item.height };
                    const showLabel = shouldShowOverlayLabel("prop", rect, item.id === selectedScenePropId);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          item.id === selectedScenePropId
                            ? `map-overlay prop selected${showLabel ? " show-label" : ""}`
                            : `map-overlay prop${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedScenePropId(item.id);
                          setSelectedObjectId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("prop")}</span>
                        <span className="map-overlay-label">{item.label || item.id}</span>
                        <span className="map-overlay-meta">{item.kind}</span>
                      </button>
                    );
                  })
                : null}

              {layerVisibility.enemies
                ? mapEnemyObjects.map((item) => {
                    const rect = { x: item.x, y: item.y, width: item.width, height: item.height };
                    const showLabel = shouldShowOverlayLabel("enemy", rect, item.id === selectedObjectId);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          item.id === selectedObjectId
                            ? `map-overlay enemy selected${showLabel ? " show-label" : ""}`
                            : `map-overlay enemy${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedObjectId(item.id);
                          setSelectedScenePropId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("enemy")}</span>
                        <span className="map-overlay-label">{item.label || item.id}</span>
                        <span className="map-overlay-meta">HP {item.metadata.hp || "3"}</span>
                      </button>
                    );
                  })
                : null}

              {layerVisibility.zones
                ? map.zones.map((item) => {
                    const rect = { x: item.x, y: item.y, width: item.width, height: item.height };
                    const showLabel = shouldShowOverlayLabel("zone", rect, item.id === selectedZoneId);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          item.id === selectedZoneId
                            ? `map-overlay zone selected${showLabel ? " show-label" : ""}`
                            : `map-overlay zone${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedZoneId(item.id);
                          setSelectedObjectId(null);
                          setSelectedScenePropId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("zone")}</span>
                        <span className="map-overlay-label">{item.label || item.id}</span>
                        <span className="map-overlay-meta">
                          {item.width} x {item.height}
                        </span>
                      </button>
                    );
                  })
                : null}

              {layerVisibility.encounters
                ? mapEncounterVolumes.map((item) => {
                    const rect = { x: item.x, y: item.y, width: item.width, height: item.height };
                    const showLabel = shouldShowOverlayLabel("encounter", rect, item.id === selectedEncounterId);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          item.id === selectedEncounterId
                            ? `map-overlay encounter selected${showLabel ? " show-label" : ""}`
                            : `map-overlay encounter${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEncounterId(item.id);
                          setSelectedObjectId(null);
                          setSelectedScenePropId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("encounter")}</span>
                        <span className="map-overlay-label">{item.label || item.id}</span>
                        <span className="map-overlay-meta">{item.triggerMode}</span>
                      </button>
                    );
                  })
                : null}

              {layerVisibility.npcs
                ? mapNpcMarkers.map((npc) => {
                    const rect = { x: npc.tileX, y: npc.tileY, width: 1, height: 1 };
                    const showLabel = shouldShowOverlayLabel("npc", rect, npc.entryKey === selectedNpcMarkerEntryKey);
                    return (
                      <button
                        key={npc.entryKey}
                        type="button"
                        className={
                          npc.entryKey === selectedNpcMarkerEntryKey
                            ? `map-overlay npc selected${showLabel ? " show-label" : ""}`
                            : `map-overlay npc${showLabel ? " show-label" : ""}`
                        }
                        style={getOverlayRectStyle(npc.tileX, npc.tileY, 1, 1)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNpcMarkerEntryKey(npc.entryKey);
                          setSelectedObjectId(null);
                          setSelectedScenePropId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setTool("select");
                        }}
                      >
                        <span className="map-overlay-badge">{getOverlayBadge("npc")}</span>
                        <span className="map-overlay-label">{npc.name}</span>
                        <span className="map-overlay-meta">{npc.origin === "game" ? "Game" : "Technica"}</span>
                      </button>
                    );
                  })
                : null}

              {hoverCell && tool === "paint" ? (
                <div
                  className="map-overlay preview paint-preview"
                  style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}
                >
                  <span className="map-overlay-badge">{brush.terrain.slice(0, 2).toUpperCase()}</span>
                </div>
              ) : null}

              {hoverCell && tool === "erase" ? (
                <div
                  className="map-overlay preview erase-preview"
                  style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}
                >
                  <span className="map-overlay-badge">ER</span>
                </div>
              ) : null}

              {hoverCell && tool === "object" ? (
                <div className="map-overlay object preview ghost show-label" style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}>
                  <span className="map-overlay-badge">{getOverlayBadge("object")}</span>
                  <span className="map-overlay-label">New object</span>
                </div>
              ) : null}

              {hoverCell && tool === "prop" ? (
                <div className="map-overlay prop preview ghost show-label" style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}>
                  <span className="map-overlay-badge">{getOverlayBadge("prop")}</span>
                  <span className="map-overlay-label">New 3D prop</span>
                </div>
              ) : null}

              {hoverCell && tool === "enemy" ? (
                <div className="map-overlay enemy preview ghost show-label" style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}>
                  <span className="map-overlay-badge">{getOverlayBadge("enemy")}</span>
                  <span className="map-overlay-label">Light enemy</span>
                </div>
              ) : null}

              {hoverCell && tool === "npc" && selectedNpcPlacementEntry ? (
                <div className="map-overlay npc preview ghost show-label" style={getOverlayRectStyle(hoverCell.x, hoverCell.y, 1, 1)}>
                  <span className="map-overlay-badge">{getOverlayBadge("npc")}</span>
                  <span className="map-overlay-label">{selectedNpcPlacementEntry.title || selectedNpcPlacementEntry.contentId}</span>
                </div>
              ) : null}

              {zoneDragRect ? (
                <div
                  className={tool === "encounter" ? "map-overlay encounter draft show-label" : "map-overlay zone draft show-label"}
                  style={getOverlayRectStyle(
                    zoneDragRect.x,
                    zoneDragRect.y,
                    zoneDragRect.width,
                    zoneDragRect.height
                  )}
                >
                  <span className="map-overlay-badge">{getOverlayBadge(tool === "encounter" ? "encounter" : "zone")}</span>
                  <span className="map-overlay-label">
                    {zoneDragRect.width} x {zoneDragRect.height}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isFocusMode && showMinimap ? (
        <aside className="map-minimap-panel">
          <div className="map-minimap-header">
            <strong>Overview</strong>
            <span>Drag the frame to recenter</span>
          </div>
          <svg
            className="map-minimap"
            viewBox={`0 0 ${map.width} ${map.height}`}
            role="img"
            aria-label={`${map.name} overview`}
            onPointerDown={handleMinimapPointerDown}
            onPointerMove={handleMinimapPointerMove}
          >
            {minimapTileRects}
            {layerVisibility.zones ? minimapZoneRects : null}
            {layerVisibility.objects ? minimapObjectRects : null}
            {layerVisibility.props ? minimapScenePropRects : null}
            {layerVisibility.enemies ? minimapEnemyRects : null}
            {layerVisibility.encounters ? minimapEncounterRects : null}
            {layerVisibility.npcs ? minimapNpcMarkers : null}
            <rect
              className="map-minimap-viewport"
              x={minimapViewport.x}
              y={minimapViewport.y}
              width={minimapViewport.width}
              height={minimapViewport.height}
              rx={0.4}
              ry={0.4}
            />
          </svg>
        </aside>
      ) : null}
    </Panel>
  );

  const workspaceClassName = [
    "workspace-grid",
    issues.length > 0 ? "" : "validation-collapsed",
    "map-editor-workspace",
    isFocusMode ? "map-workspace-focus-mode" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={workspaceClassName}>
      {isFocusMode ? (
        <>
          <div className="workspace-column wide map-focus-canvas-column">{mapSceneSurface}</div>
          <div className="workspace-column map-focus-sidebar-column">
            <div className="map-focus-tray">
              <div className="map-focus-tray-tabs">
                <button
                  type="button"
                  className={focusTraySection === "controls" ? "map-focus-tab active" : "map-focus-tab"}
                  onClick={() => setFocusTraySection("controls")}
                >
                  Controls
                </button>
                <button
                  type="button"
                  className={focusTraySection === "inspector" ? "map-focus-tab active" : "map-focus-tab"}
                  onClick={() => setFocusTraySection("inspector")}
                >
                  Inspector
                </button>
                <button
                  type="button"
                  className={focusTraySection === "data" ? "map-focus-tab active" : "map-focus-tab"}
                  onClick={() => setFocusTraySection("data")}
                >
                  Data
                </button>
              </div>
              <div className="map-focus-tray-body">
                {focusTraySection === "controls" ? (
                  <>
                    {mapControlsSurface}
                    {npcPlacementSurface}
                    {lightEnemiesSurface}
                  </>
                ) : null}
                {focusTraySection === "inspector" ? selectionInspectorPanel : null}
                {focusTraySection === "data" ? (
                  <>
                    {mapDatabasePanel}
                    {issues.length > 0 ? focusValidationPanel : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="workspace-column">
            {mapControlsSurface}
            {npcPlacementSurface}
            {lightEnemiesSurface}
            {mapDatabasePanel}
          </div>
          <div className="workspace-column wide">
            {mapSceneSurface}
            {selectionInspectorPanel}
          </div>
          {issues.length > 0 ? <div className="workspace-column">{focusValidationPanel}</div> : null}
        </>
      )}
    </div>
  );

  return (
    <div className={issues.length > 0 ? "workspace-grid" : "workspace-grid validation-collapsed"}>
      <div className="workspace-column">
        <Panel
          title="Map Controls"
          subtitle="Pick a tool, paint tiles, place objects, and create interaction zones."
          actions={
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={handleLoadSample}>
                Load sample
              </button>
              <button type="button" className="ghost-button" onClick={handleClearMap}>
                Clear
              </button>
            </div>
          }
        >
          <div className="chip-row">
            <span className="pill accent">
              {map.width} x {map.height}
            </span>
            <span className="pill">{map.width * map.height} tiles</span>
              <span className="pill">{mapNonEnemyObjects.length} objects</span>
              <span className="pill">{mapEnemyObjects.length} enemies</span>
              <span className="pill">{map.zones.length} zones</span>
            <span className="pill">{mapNpcMarkers.length} NPCs</span>
            <span className="pill">Zoom {Math.round(zoom * 100)}%</span>
          </div>

          <div className="map-tool-grid">
            {MAP_TOOL_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={tool === option.id ? "map-tool-button active" : "map-tool-button"}
                onClick={() => setTool(option.id)}
              >
                <strong>{option.label}</strong>
                <small>{option.shortcut}</small>
              </button>
            ))}
          </div>

          <div className="map-tool-hint">
            <strong>{activeTool.label}</strong>
            <span>{activeTool.hint}</span>
          </div>

          <div className="subsection">
            <h4>Brush Presets</h4>
            <div className="map-terrain-swatch-grid">
              {terrainPalette.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={brush.terrain === option.value ? "terrain-swatch active" : "terrain-swatch"}
                  style={{ ["--terrain-color" as string]: option.color }}
                  onClick={() => setBrush((current) => ({ ...current, terrain: option.value }))}
                >
                  <span className="terrain-swatch-color" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={applyBrushToWholeMap}>
                Fill map with brush
              </button>
              <button type="button" className="ghost-button" onClick={frameMapBoundsWithWalls}>
                Frame outer walls
              </button>
              <button type="button" className="ghost-button" onClick={syncBrushFromSelectedTile} disabled={!selectedCell}>
                Copy selected tile to brush
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Map id</span>
              <input value={map.id} onChange={(event) => patchMap((current) => ({ ...current, id: event.target.value }))} />
            </label>
            <label className="field">
              <span>Name</span>
              <input value={map.name} onChange={(event) => patchMap((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                value={dimensionDraft.width}
                onChange={(event) => setDimensionDraft((current) => ({ ...current, width: Number(event.target.value || 1) }))}
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                value={dimensionDraft.height}
                onChange={(event) => setDimensionDraft((current) => ({ ...current, height: Number(event.target.value || 1) }))}
              />
            </label>
            <label className="field">
              <span>Tile size</span>
              <input
                type="number"
                min={16}
                value={map.tileSize}
                onChange={(event) => patchMap((current) => ({ ...current, tileSize: Number(event.target.value || 16) }))}
              />
            </label>
            <label className="field">
              <span>Map mode</span>
              <select
                value={map.renderMode ?? map3dSettings.renderMode}
                onChange={(event) =>
                  patchMap((current) => {
                    const renderMode = event.target.value as Map3DSettings["renderMode"];
                    const currentSettings = current.settings3d ?? map3dSettings;
                    return {
                      ...current,
                      renderMode,
                      settings3d: {
                        ...currentSettings,
                        renderMode
                      }
                    };
                  })
                }
              >
                <option value="classic_2d">Classic 2D field map</option>
                <option value="simple_3d">Simple 3D from 2D grid</option>
                <option value="bespoke_3d">Bespoke 3D field map</option>
              </select>
            </label>
            <label className="field">
              <span>Preview camera</span>
              <select
                value={map3dSettings.previewCamera}
                onChange={(event) =>
                  patchMap((current) => ({
                    ...current,
                    settings3d: {
                      ...(current.settings3d ?? map3dSettings),
                      previewCamera: event.target.value as Map3DSettings["previewCamera"]
                    }
                  }))
                }
              >
                <option value="isometric">Isometric</option>
                <option value="third_person">Third person</option>
                <option value="top_down">Top down</option>
              </select>
            </label>
            <label className="field">
              <span>Wall height</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={map3dSettings.wallHeight}
                onChange={(event) =>
                  patchMap((current) => ({
                    ...current,
                    settings3d: {
                      ...(current.settings3d ?? map3dSettings),
                      wallHeight: Number(event.target.value || 0)
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Default 3D surface</span>
              <input
                value={map3dSettings.defaultSurface}
                onChange={(event) =>
                  patchMap((current) => ({
                    ...current,
                    settings3d: {
                      ...(current.settings3d ?? map3dSettings),
                      defaultSurface: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Zoom</span>
              <input type="range" min={0.6} max={1.8} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Terrain</span>
              <select
                value={brush.terrain}
                onChange={(event) =>
                  setBrush((current) => ({ ...current, terrain: event.target.value as MapBrushState["terrain"] }))
                }
              >
                {terrainPalette.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-inline">
              <span>Walkable</span>
              <input
                type="checkbox"
                checked={brush.walkable}
                onChange={(event) => setBrush((current) => ({ ...current, walkable: event.target.checked }))}
              />
            </label>
            <label className="field field-inline">
              <span>Wall</span>
              <input
                type="checkbox"
                checked={brush.wall}
                onChange={(event) => setBrush((current) => ({ ...current, wall: event.target.checked }))}
              />
            </label>
            <label className="field field-inline">
              <span>Floor</span>
              <input
                type="checkbox"
                checked={brush.floor}
                onChange={(event) => setBrush((current) => ({ ...current, floor: event.target.checked }))}
              />
            </label>
            <label className="field full">
              <span>Map tags</span>
              <textarea
                rows={3}
                value={serializeMultilineList(map.mapTags ?? [])}
                onChange={(event) => patchMap((current) => ({ ...current, mapTags: parseMultilineList(event.target.value) }))}
              />
            </label>
            <label className="field full">
              <span>Floor / region tags</span>
              <textarea
                rows={3}
                value={serializeMultilineList(map.regionTags ?? [])}
                onChange={(event) => patchMap((current) => ({ ...current, regionTags: parseMultilineList(event.target.value) }))}
              />
            </label>
            <label className="field full">
              <span>Map metadata</span>
              <textarea
                rows={4}
                value={serializeKeyValueLines(map.metadata)}
                onChange={(event) => patchMap((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))}
              />
            </label>
            <label className="field full">
              <span>3D metadata</span>
              <textarea
                rows={3}
                value={serializeKeyValueLines(map3dSettings.metadata)}
                onChange={(event) =>
                  patchMap((current) => ({
                    ...current,
                    settings3d: {
                      ...(current.settings3d ?? map3dSettings),
                      metadata: parseKeyValueLines(event.target.value)
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="subsection">
            <h4>Entry Rules</h4>
            <div className="map-selection-summary">
              <strong>{map.entryRules?.length ?? 0} entry rule(s)</strong>
              <span>
                Use these to connect floor regions, doors, portals, or Atlas theater screens into this authored field map.
                Atlas theater routes use the theater room id as the screen id; floor-region routes can target floor numbers,
                campaign regions, or published floor ids.
              </span>
            </div>
            {routeHandshakeBuilder}
            {outboundRouteProofPanel}
            <div className="dialogue-entry-list">
              {(map.entryRules ?? []).map((entryRule, index) => (
                <article key={`${entryRule.id}-${index}`} className="dialogue-entry-card">
                  <div className="dialogue-entry-header">
                    <span className="flow-badge jump">{entryRule.source}</span>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() =>
                        patchMap((current) => ({
                          ...current,
                          entryRules: (current.entryRules ?? []).filter((_, entryIndex) => entryIndex !== index)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Rule id</span>
                      <input
                        value={entryRule.id}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, id: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Source</span>
                      <select
                        value={entryRule.source}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, source: event.target.value as (typeof entryRule)["source"] }
                                : entry
                            )
                          }))
                        }
                      >
                        <option value="atlas_theater">Atlas theater screen</option>
                        <option value="floor_region">Floor region</option>
                        <option value="door">Door</option>
                        <option value="portal">Portal</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Floor</span>
                      <input
                        type="number"
                        min={0}
                        value={entryRule.floorOrdinal ?? 0}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, floorOrdinal: Number(event.target.value || 0) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Region id</span>
                      <input
                        value={entryRule.regionId ?? ""}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, regionId: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Theater screen id</span>
                      <input
                        value={entryRule.theaterScreenId ?? ""}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, theaterScreenId: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Door / portal id</span>
                      <input
                        value={entryRule.doorId ?? entryRule.portalId ?? ""}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    doorId: entry.source === "door" ? event.target.value : entry.doorId,
                                    portalId: entry.source === "portal" ? event.target.value : entry.portalId
                                  }
                                : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Entry anchor id</span>
                      <input
                        value={entryRule.entryPointId ?? ""}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, entryPointId: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Unlock requirements</span>
                      <textarea
                        rows={3}
                        value={serializeMultilineList(entryRule.unlockRequirements ?? [])}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            entryRules: (current.entryRules ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, unlockRequirements: parseMultilineList(event.target.value) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patchMap((current) => ({
                    ...current,
                    entryRules: [
                      ...(current.entryRules ?? []),
                      {
                        id: `entry_${(current.entryRules ?? []).length + 1}`,
                        source: "floor_region",
                        floorOrdinal: 0,
                        regionId: "",
                        operationId: "",
                        theaterScreenId: "",
                        sourceMapId: "",
                        doorId: "",
                        portalId: "",
                        label: "New Entry",
                        entryPointId: current.spawnAnchors?.find((anchor) => anchor.kind === "player")?.id ?? "player_start",
                        unlockRequirements: [],
                        metadata: {}
                      }
                    ]
                  }))
                }
              >
                Add entry rule
              </button>
            </div>
          </div>

          <div className="subsection">
            <h4>Spawn Anchors</h4>
            <div className="map-selection-summary">
              <strong>{map.spawnAnchors?.length ?? 0} anchor(s)</strong>
              <span>Anchors give 3D maps reliable player starts, enemy spawn pockets, NPC positions, and portal exits.</span>
            </div>
            <div className="dialogue-entry-list">
              {(map.spawnAnchors ?? []).map((anchor, index) => (
                <article key={`${anchor.id}-${index}`} className="dialogue-entry-card">
                  <div className="dialogue-entry-header">
                    <span className="flow-badge jump">{anchor.kind}</span>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() =>
                        patchMap((current) => ({
                          ...current,
                          spawnAnchors: (current.spawnAnchors ?? []).filter((_, anchorIndex) => anchorIndex !== index)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Anchor id</span>
                      <input
                        value={anchor.id}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, id: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Kind</span>
                      <select
                        value={anchor.kind}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, kind: event.target.value as (typeof anchor)["kind"] } : entry
                            )
                          }))
                        }
                      >
                        <option value="player">Player</option>
                        <option value="enemy">Enemy</option>
                        <option value="npc">NPC</option>
                        <option value="portal_exit">Portal exit</option>
                        <option value="generic">Generic</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>X</span>
                      <input
                        type="number"
                        min={0}
                        value={anchor.x}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, x: Number(event.target.value || 0) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Y</span>
                      <input
                        type="number"
                        min={0}
                        value={anchor.y}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, y: Number(event.target.value || 0) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Layer id</span>
                      <input
                        value={anchor.layerId ?? ""}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, layerId: event.target.value } : entry
                            )
                          }))
                        }
                      />
                    </label>
                    <label className="field full">
                      <span>Tags</span>
                      <textarea
                        rows={3}
                        value={serializeMultilineList(anchor.tags ?? [])}
                        onChange={(event) =>
                          patchMap((current) => ({
                            ...current,
                            spawnAnchors: (current.spawnAnchors ?? []).map((entry, anchorIndex) =>
                              anchorIndex === index ? { ...entry, tags: parseMultilineList(event.target.value) } : entry
                            )
                          }))
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patchMap((current) => ({
                    ...current,
                    spawnAnchors: [
                      ...(current.spawnAnchors ?? []),
                      {
                        id: `anchor_${(current.spawnAnchors ?? []).length + 1}`,
                        kind: "enemy",
                        x: selectedCell?.x ?? 1,
                        y: selectedCell?.y ?? 1,
                        label: "New Anchor",
                        tags: ["enemy"],
                        metadata: {}
                      }
                    ]
                  }))
                }
              >
                Add spawn anchor
              </button>
            </div>
          </div>

          <div className="subsection">
            <h4>3D Adapter Preview</h4>
            <div className="map-selection-summary">
              <strong>{map3dAdapter.renderMode.replace(/_/g, " ")}</strong>
              <span>
                Technica will publish a generated 3D adapter payload alongside the normal 2D field map. Chaos Core can use this as
                the simple 2D-to-3D runtime bridge while bespoke 3D authoring comes online.
              </span>
            </div>
            <div className="chip-row">
              <span className="pill">{map3dAdapter.tiles.length} adapter tiles</span>
              <span className="pill">{map3dPreview.wallTileCount} walls</span>
              <span className="pill">{map3dPreview.elevatedTileCount} elevated</span>
              <span className="pill">{map3dPreview.blockedTileCount} blocked</span>
              <span className="pill">{map3dAdapter.traversalLinks.length} traversal links</span>
              <span className="pill">{map3dAdapter.spawnAnchors.length} spawn anchors</span>
              <span className="pill">{map3dAdapter.previewCamera} camera</span>
            </div>
            <div className="map-3d-preview-shell">
              <div className="map-3d-preview-toolbar">
                <div className="chip-row">
                  <span className="pill accent">Visual adapter</span>
                  <span className="pill">Step {map3dPreview.previewStep}</span>
                  {map3dPreview.hiddenTileCount > 0 ? (
                    <span className="pill">{map3dPreview.hiddenTileCount} tiles sampled out</span>
                  ) : null}
                  {map3dPreview.noFloorTileCount > 0 ? (
                    <span className="pill warning">{map3dPreview.noFloorTileCount} no-floor</span>
                  ) : null}
                </div>
                <div className="map-3d-preview-legend">
                  <span><i className="preview-key walkable" /> Walkable</span>
                  <span><i className="preview-key wall" /> Wall</span>
                  <span><i className="preview-key anchor" /> Anchor</span>
                  <span><i className="preview-key connector" /> Connector</span>
                </div>
              </div>
              <div className="map-3d-preview-viewport" aria-label="3D adapter visual preview">
                <div
                  className="map-3d-preview-stage"
                  style={{
                    width: `${map3dPreview.stageWidth}px`,
                    height: `${map3dPreview.stageHeight}px`
                  }}
                >
                  {map3dPreview.connectorLines.length > 0 ? (
                    <svg
                      className="map-3d-preview-connectors"
                      width={map3dPreview.stageWidth}
                      height={map3dPreview.stageHeight}
                      viewBox={`0 0 ${map3dPreview.stageWidth} ${map3dPreview.stageHeight}`}
                      aria-hidden="true"
                    >
                      {map3dPreview.connectorLines.map(({ connector, from, to }) => (
                        <line
                          key={connector.id}
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          className={connector.bidirectional ? "map-3d-preview-connector two-way" : "map-3d-preview-connector"}
                        />
                      ))}
                    </svg>
                  ) : null}
                  {map3dPreview.tiles.map(({ tile, terrain, style }) => (
                    <button
                      key={`preview-tile-${tile.x}-${tile.y}`}
                      type="button"
                      className={[
                        "map-3d-preview-tile",
                        tile.wall ? "wall" : "",
                        tile.walkable ? "walkable" : "blocked",
                        tile.floor ? "" : "void",
                        tile.elevation > 0 ? "elevated" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={style}
                      title={`${tile.x},${tile.y} ${terrain} z${tile.elevation} ${tile.surface} ${tile.layerId}`}
                      onClick={() => {
                        setSelectedCell({ x: tile.x, y: tile.y });
                        setSelectedObjectId(null);
                        setSelectedZoneId(null);
                        setSelectedNpcMarkerEntryKey(null);
                        setTool("select");
                      }}
                    >
                      <span className="map-3d-preview-column" />
                      <span className="map-3d-preview-top" />
                      {tile.wall ? <span className="map-3d-preview-wall-face" /> : null}
                    </button>
                  ))}
                  {map3dPreview.anchors.map(({ anchor, style }) => (
                    <button
                      key={`preview-anchor-${anchor.id}`}
                      type="button"
                      className={`map-3d-preview-anchor ${anchor.kind}`}
                      style={style}
                      title={`${anchor.kind}: ${anchor.label || anchor.id}`}
                      onClick={() => focusSpawnAnchor(anchor.x, anchor.y)}
                    >
                      <span>{anchor.kind === "player" ? "P" : anchor.kind === "enemy" ? "E" : anchor.kind === "portal_exit" ? "X" : "A"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="map-3d-readiness-grid">
              {map3dReadiness.map((item) => (
                <span key={`adapter-preview-${item.label}`} className={item.ready ? "pill accent" : "pill warning"}>
                  {item.ready ? "Ready" : "Needs"} {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="subsection">
            <h4>Visible Layers</h4>
            <div className="toolbar">
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.walkable}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, walkable: event.target.checked }))}
                />
                Walkability
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.walls}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, walls: event.target.checked }))}
                />
                Walls
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.objects}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, objects: event.target.checked }))}
                />
                Objects
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.props}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, props: event.target.checked }))}
                />
                3D props
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.enemies}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, enemies: event.target.checked }))}
                />
                Enemies
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.zones}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, zones: event.target.checked }))}
                />
                Zones
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.encounters}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, encounters: event.target.checked }))}
                />
                Encounters
              </label>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={layerVisibility.npcs}
                  onChange={(event) => setLayerVisibility((current) => ({ ...current, npcs: event.target.checked }))}
                />
                NPCs
              </label>
            </div>
          </div>

          <div className="toolbar split">
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => {
                setSelectedCell(null);
                setSelectedObjectId(null);
                setSelectedScenePropId(null);
                setSelectedEncounterId(null);
                setSelectedZoneId(null);
                setSelectedNpcMarkerEntryKey(null);
              }}>
                Clear selection
              </button>
            </div>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={handleResizeMap}>
                Apply size
              </button>
              {runtime.isMobile ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleSendToDesktop()}
                  disabled={!canSendToDesktop || isSendingToDesktop}
                >
                  {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                </button>
              ) : (
                <>
                  <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
                    Import draft
                  </button>
                  <button type="button" className="ghost-button" onClick={() => downloadDraftFile("map", map.name, map)}>
                    Save draft file
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={async () => {
                      try {
                        await downloadBundle(buildMapBundleForTarget(map, "chaos-core"));
                      } catch (error) {
                        notify(error instanceof Error ? error.message : "Could not export the map bundle.");
                      }
                    }}
                  >
                    Export bundle
                  </button>
                </>
              )}
              <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
            </div>
          </div>
        </Panel>

        <Panel
          title="NPC Placement"
          subtitle="Select an NPC from the Chaos Core database, switch to the NPC tool, and click a tile to place them on this map."
          actions={
            desktopEnabled ? (
              <button type="button" className="ghost-button" onClick={() => void ensureSummaries("npc", { force: true })}>
                Refresh NPCs
              </button>
            ) : undefined
          }
        >
          {!desktopEnabled ? (
            <div className="empty-state compact">
              Open Technica in desktop mode to place NPCs directly into the Chaos Core repo.
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field full">
              <span>Placement NPC</span>
              <select
                value={selectedNpcPlacementEntryKey}
                onChange={(event) => setSelectedNpcPlacementEntryKey(event.target.value)}
                disabled={!desktopEnabled || npcEntries.length === 0}
              >
                {npcEntries.length === 0 ? <option value="">No NPCs found</option> : null}
                {npcEntries.map((entry) => (
                  <option key={entry.entryKey} value={entry.entryKey}>
                    {entry.title || entry.contentId} ({entry.origin === "game" ? "Game" : "Technica"})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="chip-row">
            <span className="pill">{mapNpcMarkers.length} NPCs on this map</span>
            {selectedNpcPlacementEntry ? <span className="pill accent">Placing {selectedNpcPlacementEntry!.title}</span> : null}
            {selectedNpcMarker ? (
              <span className="pill">
                Selected marker {selectedNpcMarker!.tileX}, {selectedNpcMarker!.tileY}
              </span>
            ) : null}
            {isPlacingNpc ? <span className="pill">Saving placement...</span> : null}
          </div>

          {selectedNpcMarker ? (
            <div className="map-selection-summary">
              <strong>{selectedNpcMarker!.name}</strong>
              <span>
                {selectedNpcMarker!.contentId} at {selectedNpcMarker!.tileX}, {selectedNpcMarker!.tileY}
              </span>
              <div className="toolbar">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setSelectedNpcPlacementEntryKey(selectedNpcMarker!.entryKey);
                    setTool("npc");
                  }}
                >
                  Use for placement
                </button>
                <button type="button" className="ghost-button" onClick={() => setSelectedNpcMarkerEntryKey(null)}>
                  Clear marker selection
                </button>
              </div>
            </div>
          ) : null}

          <div className="database-list">
            {mapNpcMarkers.length === 0 ? (
              <div className="empty-state compact">No NPCs are assigned to this map yet.</div>
            ) : (
              mapNpcMarkers.map((marker) => (
                <button
                  key={marker.entryKey}
                  type="button"
                  className={
                    marker.entryKey === selectedNpcMarkerEntryKey ? "database-entry active" : "database-entry"
                  }
                  onClick={() => setSelectedNpcMarkerEntryKey(marker.entryKey)}
                >
                  <strong>{marker.name}</strong>
                  <span>
                    {marker.contentId} · {marker.tileX}, {marker.tileY}
                  </span>
                  <small>{marker.origin === "game" ? "Game" : "Technica"}</small>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="Light Enemies"
          subtitle="Place light field enemies that make Chaos Core switch this map into melee/ranged field combat until the room is clear."
        >
          <div className="map-selection-summary">
            <strong>Light Enemy Tool</strong>
            <span>Switch to the enemy tool, click a tile to drop a hostile, then tune its basic combat stats in the inspector.</span>
          </div>
          <div className="chip-row">
            <span className="pill">{mapEnemyObjects.length} enemies on this map</span>
            {tool === "enemy" ? <span className="pill accent">Enemy tool active</span> : null}
          </div>
          <div className="toolbar">
            <button type="button" className="ghost-button" onClick={() => setTool("enemy")}>
              Use light enemy tool
            </button>
            {selectedEnemyObject ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSelectedObjectId(selectedEnemyObject!.id);
                  setTool("select");
                }}
              >
                Inspect selected enemy
              </button>
            ) : null}
          </div>
        </Panel>

        {mapDatabasePanel}

      </div>

      <div className="workspace-column wide">
        <Panel
          title="Field Map"
          subtitle="Paint directly on the grid, inspect live coordinates, and work with objects, zones, NPC markers, and light enemies in-place."
        >
          <div className="map-canvas-hud">
            <div className="chip-row">
              <span className="pill accent">{activeTool.label}</span>
              <span className="pill">{activeTool.shortcut}</span>
              {hoverCell ? <span className="pill">Hover {hoverCell!.x}, {hoverCell!.y}</span> : null}
              {selectedCell ? <span className="pill">Tile {selectedCell!.x}, {selectedCell!.y}</span> : null}
              {selectedObject ? <span className="pill">Object {selectedObject!.id}</span> : null}
              {selectedSceneProp ? <span className="pill">3D Prop {selectedSceneProp!.id}</span> : null}
              {selectedEncounterVolume ? <span className="pill">Encounter {selectedEncounterVolume!.id}</span> : null}
              {selectedZone ? <span className="pill">Zone {selectedZone!.id}</span> : null}
              {selectedNpcMarker ? <span className="pill">NPC {selectedNpcMarker!.name}</span> : null}
              {selectedEnemyObject ? <span className="pill">Enemy {selectedEnemyObject!.id}</span> : null}
            </div>
            <div className="map-selection-summary">
              <strong>{map.name}</strong>
              <span>{activeTool.hint}</span>
            </div>
            <div className="map-legend">
              <span className="map-legend-chip wall">Wall</span>
              <span className="map-legend-chip blocked">Blocked</span>
              <span className="map-legend-chip object">Object</span>
              <span className="map-legend-chip prop">3D Prop</span>
              <span className="map-legend-chip enemy">Enemy</span>
              <span className="map-legend-chip encounter">Encounter</span>
              <span className="map-legend-chip zone">Zone</span>
              <span className="map-legend-chip npc">NPC</span>
            </div>
          </div>
          <div
            ref={viewportRef}
            className={tool === "pan" ? "map-viewport pannable" : "map-viewport"}
            onPointerMove={handleViewportPointerMove}
            onPointerLeave={handleViewportPointerLeave}
          >
            <div
              className="map-canvas"
              style={{
                width: `${mapCanvasWidth}px`,
                height: `${mapCanvasHeight}px`
              }}
            >
              <div
                className="map-grid"
                style={{
                  gridTemplateColumns: `repeat(${map.width}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${map.height}, ${cellSize}px)`
                }}
              >
                {map.tiles.flatMap((row, rowIndex) =>
                  row.map((tile, columnIndex) => {
                    const isSelected = selectedCell?.x === columnIndex && selectedCell?.y === rowIndex;
                    return (
                      <button
                        key={`cell-${columnIndex}-${rowIndex}`}
                        type="button"
                        className={isSelected ? "map-cell selected" : "map-cell"}
                        style={{
                          background: terrainColorMap[tile.terrain]
                        }}
                        onPointerDown={(event) => handleCellPointerDown(columnIndex, rowIndex, event)}
                        onPointerEnter={() => handleCellPointerEnter(columnIndex, rowIndex)}
                        onPointerLeave={() => setHoverCell(null)}
                        title={`${columnIndex},${rowIndex} ${tile.terrain}`}
                      >
                        {layerVisibility.walls && tile.wall ? <span className="cell-wall" /> : null}
                        {layerVisibility.walkable && !tile.walkable ? <span className="cell-blocked" /> : null}
                        {!tile.floor ? <span className="cell-no-floor" /> : null}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="map-overlay-layer">
                {layerVisibility.objects
                  ? mapNonEnemyObjects.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedObjectId ? "map-overlay object selected" : "map-overlay object"}
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedObjectId(item.id);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        {item.label || item.id}
                      </button>
                    ))
                  : null}

                {layerVisibility.enemies
                  ? mapEnemyObjects.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedObjectId ? "map-overlay enemy selected" : "map-overlay enemy"}
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedObjectId(item.id);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        {item.label || item.id}
                      </button>
                    ))
                  : null}

                {layerVisibility.zones
                  ? map.zones.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedZoneId ? "map-overlay zone selected" : "map-overlay zone"}
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedZoneId(item.id);
                          setSelectedObjectId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        {item.label || item.id}
                      </button>
                    ))
                  : null}

                {layerVisibility.encounters
                  ? mapEncounterVolumes.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedEncounterId ? "map-overlay encounter selected" : "map-overlay encounter"}
                        style={getOverlayRectStyle(item.x, item.y, item.width, item.height)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEncounterId(item.id);
                          setSelectedObjectId(null);
                          setSelectedScenePropId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setSelectedNpcMarkerEntryKey(null);
                          setTool("select");
                        }}
                      >
                        {item.label || item.id}
                      </button>
                    ))
                  : null}

                {layerVisibility.npcs
                  ? mapNpcMarkers.map((npc) => (
                      <button
                        key={npc.entryKey}
                        type="button"
                        className={
                          npc.entryKey === selectedNpcMarkerEntryKey ? "map-overlay npc selected" : "map-overlay npc"
                        }
                        style={getOverlayRectStyle(npc.tileX, npc.tileY, 1, 1)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNpcMarkerEntryKey(npc.entryKey);
                          setSelectedObjectId(null);
                          setSelectedZoneId(null);
                          setSelectedCell(null);
                          setTool("select");
                        }}
                      >
                        {npc.name}
                      </button>
                    ))
                  : null}

                {zoneDrag ? (
                  <div
                    className={tool === "encounter" ? "map-overlay encounter draft" : "map-overlay zone draft"}
                    style={getOverlayRectStyle(
                      normalizeRect(zoneDrag!.start, zoneDrag!.end).x,
                      normalizeRect(zoneDrag!.start, zoneDrag!.end).y,
                      normalizeRect(zoneDrag!.start, zoneDrag!.end).width,
                      normalizeRect(zoneDrag!.start, zoneDrag!.end).height
                    )}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </Panel>

        {selectionInspectorPanel}
      </div>

      {issues.length > 0 ? (
        <div className="workspace-column">
          <Panel title="Validation" subtitle="Bounds, dimensions, duplicate ids, and contradictory tile flags show up here.">
            <IssueList issues={issues} emptyLabel="No validation issues. This map is ready to export." />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
