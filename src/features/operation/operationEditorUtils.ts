import {
  createOperationFloorDocument,
  createOperationRoomDocument,
  getDefaultOperationClearMode,
  getDefaultOperationCoreSlotCapacity,
  getDefaultOperationFortificationCapacity,
  getDefaultOperationPowerSource,
  getDefaultOperationRoomTags,
  getDefaultOperationRoomType,
  humanizeOperationIdentifier,
  normalizeOperationDocument,
  type OperationDocument,
  type OperationFloorDocument,
  type OperationRoomDocument,
  type OperationTheaterRoomRole,
} from "../../types/operation";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

export const roomRoleLabels: Record<OperationTheaterRoomRole, string> = {
  ingress: "Ingress",
  frontline: "Frontline",
  relay: "Relay",
  field: "Field",
  resource_pocket: "Resource Pocket",
  core: "Core Candidate",
  power: "Power",
  elite: "Elite",
  objective: "Objective",
};

export const roomRoleColors: Record<OperationTheaterRoomRole, string> = {
  ingress: "#85f3ff",
  frontline: "#ffb347",
  relay: "#b4c9ff",
  field: "#7fe08b",
  resource_pocket: "#f8de72",
  core: "#b7ffbf",
  power: "#f598ff",
  elite: "#ff7d7d",
  objective: "#ff5d5d",
};

export function touchOperation(document: OperationDocument): OperationDocument {
  return {
    ...normalizeOperationDocument(document),
    updatedAt: isoNow()
  };
}

export function isOperationDocument(value: unknown): value is OperationDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "codename" in value &&
      "floors" in value &&
      Array.isArray((value as { floors: unknown[] }).floors)
  );
}

export function formatChoiceLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function serializeDelimitedList(values: string[]) {
  return values.join(", ");
}

export function parseDelimitedList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

export function createSelectionPathSummary(floor: OperationFloorDocument) {
  const roomById = new Map(floor.rooms.map((room) => [room.id, room]));
  const startId = floor.startingRoomId;
  const objectiveIds = new Set(
    floor.rooms
      .filter((room) => room.role === "objective" || room.tags.includes("objective"))
      .map((room) => room.id)
  );

  if (!startId || !roomById.has(startId)) {
    return {
      reachableCount: 0,
      pathLengthToObjective: null as number | null
    };
  }

  const visited = new Set<string>([startId]);
  const distances = new Map<string, number>([[startId, 0]]);
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentRoom = roomById.get(currentId);
    for (const connectionId of currentRoom?.connections ?? []) {
      if (!roomById.has(connectionId) || visited.has(connectionId)) {
        continue;
      }
      visited.add(connectionId);
      distances.set(connectionId, (distances.get(currentId) ?? 0) + 1);
      queue.push(connectionId);
    }
  }

  const pathLengthToObjective = Array.from(objectiveIds)
    .map((roomId) => distances.get(roomId))
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right)[0] ?? null;

  return {
    reachableCount: visited.size,
    pathLengthToObjective
  };
}

export function buildPreviewGeometry(floor: OperationFloorDocument) {
  if (floor.rooms.length === 0) {
    return {
      width: 640,
      height: 360,
      nodes: [] as Array<{ room: OperationRoomDocument; x: number; y: number }>,
      edges: [] as Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }>
    };
  }

  const scale = 180;
  const padding = 120;
  const minX = Math.min(...floor.rooms.map((room) => room.x));
  const maxX = Math.max(...floor.rooms.map((room) => room.x));
  const minY = Math.min(...floor.rooms.map((room) => room.y));
  const maxY = Math.max(...floor.rooms.map((room) => room.y));
  const width = Math.max(640, ((maxX - minX) * scale) + (padding * 2));
  const height = Math.max(360, ((maxY - minY) * scale) + (padding * 2));

  const nodes = floor.rooms.map((room) => ({
    room,
    x: padding + ((room.x - minX) * scale),
    y: padding + ((room.y - minY) * scale)
  }));

  const nodeById = new Map(nodes.map((node) => [node.room.id, node]));
  const edgeKeys = new Set<string>();
  const edges: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }> = [];

  floor.rooms.forEach((room) => {
    room.connections.forEach((connectionId) => {
      const fromNode = nodeById.get(room.id);
      const toNode = nodeById.get(connectionId);
      if (!fromNode || !toNode) {
        return;
      }
      const key = [room.id, connectionId].sort().join("::");
      if (edgeKeys.has(key)) {
        return;
      }
      edgeKeys.add(key);
      edges.push({
        id: key,
        from: { x: fromNode.x, y: fromNode.y },
        to: { x: toNode.x, y: toNode.y }
      });
    });
  });

  return { width, height, nodes, edges };
}

export function applyRoomRolePreset(room: OperationRoomDocument, role: OperationTheaterRoomRole): OperationRoomDocument {
  const clearMode = getDefaultOperationClearMode(role);
  const roomClass = room.roomClass || "standard";
  return {
    ...room,
    role,
    clearMode,
    type: getDefaultOperationRoomType(role, clearMode),
    tags: getDefaultOperationRoomTags(role),
    isPowerSource: getDefaultOperationPowerSource(role),
    coreSlotCapacity: getDefaultOperationCoreSlotCapacity(role, roomClass),
    fortificationCapacity: getDefaultOperationFortificationCapacity(role)
  };
}

export function createDefaultFloor(document: OperationDocument) {
  return createOperationFloorDocument(
    {
      id: `floor_${document.floors.length + 1}`,
      name: `Floor ${document.floors.length + 1}`,
      floorOrdinal: document.floors.length + 1,
      sectorLabel: `Sector ${document.floors.length + 1}`,
      originLabel: `${document.zoneName} ingress`,
    },
    document.floors.length
  );
}

export function createConnectedRoom(
  floor: OperationFloorDocument,
  anchorRoom: OperationRoomDocument | null,
  role: OperationTheaterRoomRole = "frontline"
) {
  const nextRoomIndex = floor.rooms.length;
  const nextRoomId = `${floor.id}_room_${nextRoomIndex + 1}`;
  return {
    room: createOperationRoomDocument(
      {
        id: nextRoomId,
        label: humanizeOperationIdentifier(nextRoomId),
        role,
        x: (anchorRoom?.x ?? 0) + 1.2,
        y: anchorRoom?.y ?? 0,
        depthFromUplink: Math.max(0, (anchorRoom?.depthFromUplink ?? 0) + 1),
        connections: anchorRoom ? [anchorRoom.id] : []
      },
      nextRoomIndex
    ),
    nextRoomIndex
  };
}

export function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: OperationDocument) => void) {
  try {
    const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
    if (!isOperationDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica operation format.");
      return;
    }
    setDocument(touchOperation(parsed));
  } catch {
    notify("Could not load the selected operation from the Chaos Core database.");
  }
}
