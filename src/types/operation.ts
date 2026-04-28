import type { KeyValueRecord } from "./common";

export type OperationRoomType =
  | "tavern"
  | "battle"
  | "event"
  | "shop"
  | "rest"
  | "boss"
  | "field_node"
  | "key_room"
  | "elite"
  | "treasure";

export const operationRoomTypes: OperationRoomType[] = [
  "tavern",
  "battle",
  "event",
  "shop",
  "rest",
  "boss",
  "field_node",
  "key_room",
  "elite",
  "treasure"
];

export type OperationTheaterLayoutStyle = "vector_lance" | "split_fan" | "central_bloom" | "offset_arc";

export const operationTheaterLayoutStyles: OperationTheaterLayoutStyle[] = [
  "vector_lance",
  "split_fan",
  "central_bloom",
  "offset_arc"
];

export type OperationSprawlDirection =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export const operationSprawlDirections: OperationSprawlDirection[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
];

export type OperationTheaterRoomRole =
  | "ingress"
  | "frontline"
  | "relay"
  | "field"
  | "resource_pocket"
  | "core"
  | "power"
  | "elite"
  | "objective";

export const operationTheaterRoomRoles: OperationTheaterRoomRole[] = [
  "ingress",
  "frontline",
  "relay",
  "field",
  "resource_pocket",
  "core",
  "power",
  "elite",
  "objective"
];

export type OperationTheaterClearMode = "battle" | "field" | "empty";

export const operationTheaterClearModes: OperationTheaterClearMode[] = ["battle", "field", "empty"];

export type OperationFieldMapRouteSource = "atlas_theater" | "floor_region" | "door" | "portal";

export const operationFieldMapRouteSources: OperationFieldMapRouteSource[] = [
  "atlas_theater",
  "floor_region",
  "door",
  "portal"
];

export type OperationTheaterRoomClass = "standard" | "mega";

export const operationTheaterRoomClasses: OperationTheaterRoomClass[] = ["standard", "mega"];

export type OperationTheaterKeyType = "triangle" | "square" | "circle" | "spade" | "star";

export const operationTheaterKeyTypes: OperationTheaterKeyType[] = ["triangle", "square", "circle", "spade", "star"];

export interface OperationRoomDocument {
  id: string;
  label: string;
  type: OperationRoomType;
  role: OperationTheaterRoomRole;
  x: number;
  y: number;
  depthFromUplink: number;
  connections: string[];
  clearMode: OperationTheaterClearMode;
  roomClass: OperationTheaterRoomClass;
  sectorTag: string;
  tags: string[];
  battleMapId?: string;
  battleTemplate?: string;
  eventTemplate?: string;
  tacticalEncounter?: string;
  fieldMapId?: string;
  fieldMapEntryPointId?: string;
  fieldMapEncounterVolumeId?: string;
  fieldMapReturnAnchorId?: string;
  fieldMapExtractionAnchorId?: string;
  fieldMapRouteSource: OperationFieldMapRouteSource;
  fieldMapDoorId?: string;
  fieldMapPortalId?: string;
  fieldMapLabel?: string;
  shopInventory: string[];
  coreSlotCapacity: number;
  fortificationCapacity: number;
  requiredKeyType: OperationTheaterKeyType | "";
  grantsKeyType: OperationTheaterKeyType | "";
  isPowerSource: boolean;
  metadata: KeyValueRecord;
}

export interface OperationFloorDocument {
  id: string;
  name: string;
  floorOrdinal: number;
  atlasFloorId: string;
  startingRoomId: string;
  sectorLabel: string;
  passiveEffectText: string;
  threatLevel: string;
  layoutStyle: OperationTheaterLayoutStyle;
  originLabel: string;
  rooms: OperationRoomDocument[];
}

export interface OperationDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  codename: string;
  description: string;
  objective: string;
  beginningState: string;
  endState: string;
  zoneName: string;
  sprawlDirection: OperationSprawlDirection;
  recommendedPower: number;
  floors: OperationFloorDocument[];
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_ROOM_TYPES = new Set<OperationRoomType>(operationRoomTypes);
const KNOWN_LAYOUT_STYLES = new Set<OperationTheaterLayoutStyle>(operationTheaterLayoutStyles);
const KNOWN_SPRAWL_DIRECTIONS = new Set<OperationSprawlDirection>(operationSprawlDirections);
const KNOWN_ROOM_ROLES = new Set<OperationTheaterRoomRole>(operationTheaterRoomRoles);
const KNOWN_CLEAR_MODES = new Set<OperationTheaterClearMode>(operationTheaterClearModes);
const KNOWN_FIELD_MAP_ROUTE_SOURCES = new Set<OperationFieldMapRouteSource>(operationFieldMapRouteSources);
const KNOWN_ROOM_CLASSES = new Set<OperationTheaterRoomClass>(operationTheaterRoomClasses);
const KNOWN_KEY_TYPES = new Set<OperationTheaterKeyType>(operationTheaterKeyTypes);

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback: number) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number, minimum = 0) {
  const normalized = Math.round(normalizeFiniteNumber(value, fallback));
  return normalized < minimum ? fallback : normalized;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
        .filter(Boolean)
    )
  );
}

function normalizeKeyValueRecord(value: unknown): KeyValueRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
      .map(([key, entry]) => [key, typeof entry === "string" ? entry : JSON.stringify(entry)])
  );
}

function normalizeRoomType(value: unknown, fallback: OperationRoomType): OperationRoomType {
  return KNOWN_ROOM_TYPES.has(value as OperationRoomType) ? (value as OperationRoomType) : fallback;
}

function normalizeLayoutStyle(value: unknown, fallback: OperationTheaterLayoutStyle): OperationTheaterLayoutStyle {
  return KNOWN_LAYOUT_STYLES.has(value as OperationTheaterLayoutStyle)
    ? (value as OperationTheaterLayoutStyle)
    : fallback;
}

function normalizeSprawlDirection(value: unknown, fallback: OperationSprawlDirection): OperationSprawlDirection {
  return KNOWN_SPRAWL_DIRECTIONS.has(value as OperationSprawlDirection)
    ? (value as OperationSprawlDirection)
    : fallback;
}

function normalizeRoomRole(value: unknown, fallback: OperationTheaterRoomRole): OperationTheaterRoomRole {
  return KNOWN_ROOM_ROLES.has(value as OperationTheaterRoomRole) ? (value as OperationTheaterRoomRole) : fallback;
}

function normalizeClearMode(value: unknown, fallback: OperationTheaterClearMode): OperationTheaterClearMode {
  return KNOWN_CLEAR_MODES.has(value as OperationTheaterClearMode)
    ? (value as OperationTheaterClearMode)
    : fallback;
}

function normalizeFieldMapRouteSource(
  value: unknown,
  fallback: OperationFieldMapRouteSource
): OperationFieldMapRouteSource {
  return KNOWN_FIELD_MAP_ROUTE_SOURCES.has(value as OperationFieldMapRouteSource)
    ? (value as OperationFieldMapRouteSource)
    : fallback;
}

function normalizeRoomClass(value: unknown, fallback: OperationTheaterRoomClass): OperationTheaterRoomClass {
  return KNOWN_ROOM_CLASSES.has(value as OperationTheaterRoomClass)
    ? (value as OperationTheaterRoomClass)
    : fallback;
}

function normalizeKeyType(value: unknown): OperationTheaterKeyType | "" {
  return KNOWN_KEY_TYPES.has(value as OperationTheaterKeyType) ? (value as OperationTheaterKeyType) : "";
}

export function humanizeOperationIdentifier(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

export function getDefaultOperationRoomType(role: OperationTheaterRoomRole, clearMode?: OperationTheaterClearMode): OperationRoomType {
  switch (role) {
    case "ingress":
      return "rest";
    case "frontline":
      return "battle";
    case "relay":
      return "event";
    case "field":
      return clearMode === "field" ? "field_node" : "battle";
    case "resource_pocket":
      return clearMode === "field" ? "field_node" : "treasure";
    case "core":
      return clearMode === "empty" ? "rest" : "battle";
    case "power":
      return "event";
    case "elite":
      return "elite";
    case "objective":
      return "boss";
    default:
      return "battle";
  }
}

export function getDefaultOperationClearMode(role: OperationTheaterRoomRole): OperationTheaterClearMode {
  switch (role) {
    case "ingress":
    case "power":
      return "empty";
    case "field":
      return "field";
    case "resource_pocket":
      return "field";
    default:
      return "battle";
  }
}

export function getDefaultOperationRoomTags(role: OperationTheaterRoomRole): string[] {
  switch (role) {
    case "ingress":
      return ["ingress", "uplink"];
    case "frontline":
      return ["frontier"];
    case "relay":
      return ["junction", "relay"];
    case "field":
      return ["core_candidate", "metal_rich", "timber_rich", "salvage_rich"];
    case "resource_pocket":
      return ["core_candidate", "resource_pocket", "salvage_rich"];
    case "core":
      return ["core_candidate", "command_suitable"];
    case "power":
      return ["power_source", "steam_vent"];
    case "elite":
      return ["elite", "frontier"];
    case "objective":
      return ["objective", "elite", "survey_highground"];
    default:
      return [];
  }
}

export function getDefaultOperationCoreSlotCapacity(role: OperationTheaterRoomRole, roomClass: OperationTheaterRoomClass = "standard") {
  if (roomClass === "mega") {
    return 2;
  }

  switch (role) {
    case "ingress":
    case "relay":
    case "field":
    case "resource_pocket":
    case "core":
    case "objective":
      return 1;
    default:
      return 0;
  }
}

export function getDefaultOperationFortificationCapacity(role: OperationTheaterRoomRole) {
  switch (role) {
    case "ingress":
    case "objective":
      return 4;
    default:
      return 3;
  }
}

export function getDefaultOperationPowerSource(role: OperationTheaterRoomRole) {
  return role === "ingress" || role === "power";
}

export function inferOperationRoomRole(value: {
  role?: unknown;
  type?: unknown;
  tags?: unknown;
  isPowerSource?: unknown;
}) {
  const explicitRole = normalizeRoomRole(value.role, "frontline");
  if (value.role) {
    return explicitRole;
  }

  const tags = normalizeStringList(value.tags);
  if (tags.includes("ingress") || tags.includes("uplink")) {
    return "ingress";
  }
  if (tags.includes("objective")) {
    return "objective";
  }
  if (tags.includes("power_source") || value.isPowerSource === true) {
    return "power";
  }
  if (tags.includes("resource_pocket")) {
    return "resource_pocket";
  }
  if (tags.includes("command_suitable")) {
    return "core";
  }
  if (tags.includes("junction") || tags.includes("relay")) {
    return "relay";
  }
  if (tags.includes("elite")) {
    return "elite";
  }

  switch (value.type) {
    case "rest":
    case "tavern":
      return "ingress";
    case "boss":
      return "objective";
    case "elite":
      return "elite";
    case "event":
      return "relay";
    case "field_node":
      return "field";
    case "treasure":
      return "resource_pocket";
    default:
      return "frontline";
  }
}

export function createOperationRoomDocument(seed: Partial<OperationRoomDocument> = {}, index = 0): OperationRoomDocument {
  const role = inferOperationRoomRole(seed);
  const roomClass = normalizeRoomClass(seed.roomClass, "standard");
  const clearMode = normalizeClearMode(seed.clearMode, getDefaultOperationClearMode(role));
  const normalizedTags = normalizeStringList(seed.tags);
  const fallbackTags = getDefaultOperationRoomTags(role);
  const resolvedTags = normalizedTags.length > 0 ? normalizedTags : fallbackTags;
  const fallbackId = seed.id?.trim() || `room_${index + 1}`;
  const normalizedMetadata = normalizeKeyValueRecord(seed.metadata);

  return {
    id: fallbackId,
    label: normalizeText(seed.label, humanizeOperationIdentifier(fallbackId)),
    type: normalizeRoomType(seed.type, getDefaultOperationRoomType(role, clearMode)),
    role,
    x: normalizeFiniteNumber(seed.x, normalizeFiniteNumber((seed as { localPosition?: { x?: unknown } }).localPosition?.x, 0)),
    y: normalizeFiniteNumber(seed.y, normalizeFiniteNumber((seed as { localPosition?: { y?: unknown } }).localPosition?.y, 0)),
    depthFromUplink: normalizePositiveInteger(seed.depthFromUplink, Math.max(0, index), 0),
    connections: normalizeStringList(seed.connections ?? (seed as { adjacency?: unknown }).adjacency),
    clearMode,
    roomClass,
    sectorTag: normalizeText(seed.sectorTag, `sector_${Math.max(1, index + 1)}`),
    tags: resolvedTags,
    battleMapId: normalizeText(seed.battleMapId),
    battleTemplate: normalizeText(seed.battleTemplate),
    eventTemplate: normalizeText(seed.eventTemplate),
    tacticalEncounter: normalizeText(seed.tacticalEncounter),
    fieldMapId: normalizeText(seed.fieldMapId, normalizedMetadata.fieldMapId || normalizedMetadata.targetMap),
    fieldMapEntryPointId: normalizeText(
      seed.fieldMapEntryPointId,
      normalizedMetadata.fieldMapEntryPointId || normalizedMetadata.entryPointId
    ),
    fieldMapEncounterVolumeId: normalizeText(
      seed.fieldMapEncounterVolumeId,
      normalizedMetadata.fieldMapEncounterVolumeId || normalizedMetadata.encounterVolumeId
    ),
    fieldMapReturnAnchorId: normalizeText(
      seed.fieldMapReturnAnchorId,
      normalizedMetadata.fieldMapReturnAnchorId || normalizedMetadata.returnAnchorId
    ),
    fieldMapExtractionAnchorId: normalizeText(
      seed.fieldMapExtractionAnchorId,
      normalizedMetadata.fieldMapExtractionAnchorId || normalizedMetadata.extractionAnchorId
    ),
    fieldMapRouteSource: normalizeFieldMapRouteSource(
      seed.fieldMapRouteSource || normalizedMetadata.fieldMapRouteSource,
      "atlas_theater"
    ),
    fieldMapDoorId: normalizeText(seed.fieldMapDoorId, normalizedMetadata.fieldMapDoorId || normalizedMetadata.doorId),
    fieldMapPortalId: normalizeText(
      seed.fieldMapPortalId,
      normalizedMetadata.fieldMapPortalId || normalizedMetadata.portalId
    ),
    fieldMapLabel: normalizeText(seed.fieldMapLabel, normalizedMetadata.fieldMapLabel),
    shopInventory: normalizeStringList(seed.shopInventory),
    coreSlotCapacity: normalizePositiveInteger(
      seed.coreSlotCapacity,
      getDefaultOperationCoreSlotCapacity(role, roomClass),
      0
    ),
    fortificationCapacity: normalizePositiveInteger(
      seed.fortificationCapacity,
      getDefaultOperationFortificationCapacity(role),
      0
    ),
    requiredKeyType: normalizeKeyType(seed.requiredKeyType),
    grantsKeyType: normalizeKeyType(seed.grantsKeyType),
    isPowerSource:
      typeof seed.isPowerSource === "boolean" ? seed.isPowerSource : getDefaultOperationPowerSource(role),
    metadata: normalizedMetadata
  };
}

export function createOperationFloorDocument(seed: Partial<OperationFloorDocument> = {}, index = 0): OperationFloorDocument {
  const fallbackId = seed.id?.trim() || `floor_${index + 1}`;
  const rooms = Array.isArray(seed.rooms) ? seed.rooms.map((room, roomIndex) => createOperationRoomDocument(room, roomIndex)) : [];
  const resolvedRooms = rooms.length > 0 ? rooms : [createOperationRoomDocument({ role: "ingress", id: "room_ingress", label: "Ingress", x: 0, y: 0 }, 0)];
  const startingRoomId =
    normalizeText(seed.startingRoomId).trim()
    || resolvedRooms.find((room) => room.role === "ingress")?.id
    || resolvedRooms[0]?.id
    || "";

  return {
    id: fallbackId,
    name: normalizeText(seed.name, humanizeOperationIdentifier(fallbackId)),
    floorOrdinal: normalizePositiveInteger(seed.floorOrdinal, index + 1, 1),
    atlasFloorId: normalizeText(seed.atlasFloorId),
    startingRoomId,
    sectorLabel: normalizeText(seed.sectorLabel, `Sector ${index + 1}`),
    passiveEffectText: normalizeText(seed.passiveEffectText, "Stable theater. No passive effect recorded yet."),
    threatLevel: normalizeText(seed.threatLevel, "Moderate"),
    layoutStyle: normalizeLayoutStyle(seed.layoutStyle, "vector_lance"),
    originLabel: normalizeText(seed.originLabel, "HAVEN uplink ingress"),
    rooms: resolvedRooms
  };
}

export function normalizeOperationDocument(seed: Partial<OperationDocument> = {}): OperationDocument {
  const id = normalizeText(seed.id, "new_operation");
  const floors = Array.isArray(seed.floors)
    ? seed.floors.map((floor, floorIndex) => createOperationFloorDocument(floor, floorIndex))
    : [];

  const resolvedFloors =
    floors.length > 0
      ? floors
      : [createOperationFloorDocument({ id: "floor_1", name: "Floor 1" }, 0)];

  const zoneName = normalizeText(seed.zoneName, humanizeOperationIdentifier(id));

  return {
    schemaVersion: normalizeText(seed.schemaVersion, "1.0.0"),
    sourceApp: "Technica",
    id,
    codename: normalizeText(seed.codename, humanizeOperationIdentifier(id).toUpperCase()),
    description: normalizeText(seed.description),
    objective: normalizeText(seed.objective, "Push from the ingress lane to the objective room and stabilize the theater."),
    beginningState: normalizeText(
      seed.beginningState,
      `${zoneName} synchronized. The ingress route is mapped and ready for deployment.`
    ),
    endState: normalizeText(
      seed.endState,
      `${zoneName} stabilized. Objective secured and theater control extended outward.`
    ),
    zoneName,
    sprawlDirection: normalizeSprawlDirection(seed.sprawlDirection, "east"),
    recommendedPower: normalizePositiveInteger(seed.recommendedPower, 25, 1),
    floors: resolvedFloors,
    metadata: normalizeKeyValueRecord(seed.metadata),
    createdAt: normalizeText(seed.createdAt),
    updatedAt: normalizeText(seed.updatedAt)
  };
}
