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
import type { MapBrushState, MapDocument, MapObject, MapZone } from "../../types/map";
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
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
import { createSequentialId } from "../../utils/id";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import { openTechnicaPopout } from "../../utils/popout";
import { validateMapDocument } from "../../utils/mapValidation";
import {
  createBlankMapDocument,
  createDefaultTile,
  normalizeRect,
  resizeMapDocument,
  terrainColorMap,
  terrainPalette
} from "./mapUtils";

type MapTool = "paint" | "erase" | "select" | "move" | "object" | "zone" | "npc" | "enemy" | "pan";

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
  { id: "zone", label: "Zone", shortcut: "Z", hint: "Drag out a trigger or interaction rectangle." },
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
  z: "zone",
  n: "npc",
  l: "enemy",
  h: "pan"
};

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

function getOverlayBadge(kind: "object" | "enemy" | "zone" | "npc") {
  switch (kind) {
    case "enemy":
      return "EN";
    case "zone":
      return "ZN";
    case "npc":
      return "NP";
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
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [dimensionDraft, setDimensionDraft] = useState({ width: map.width, height: map.height });
  const [layerVisibility, setLayerVisibility] = useState({
    walkable: true,
    walls: true,
    objects: true,
    zones: true,
    npcs: true,
    enemies: true
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
  const issues = useMemo(() => validateMapDocument(deferredMap), [deferredMap]);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);
  const isFocusMode = runtime.isPopout || expandedInline;
  const selectedObject = map.objects.find((item) => item.id === selectedObjectId) ?? null;
  const selectedEnemyObject = selectedObject && isEnemyObject(selectedObject) ? selectedObject : null;
  const selectedZone = map.zones.find((item) => item.id === selectedZoneId) ?? null;
  const mapEnemyObjects = useMemo(
    () => map.objects.filter((item) => isEnemyObject(item)),
    [map.objects]
  );
  const mapNonEnemyObjects = useMemo(
    () => map.objects.filter((item) => !isEnemyObject(item)),
    [map.objects]
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
  }, [selectedCell, selectedNpcMarker, selectedObject, selectedZone]);
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
    if (!isFocusMode) {
      return;
    }

    if (selectedCell || selectedObject || selectedZone || selectedNpcMarker) {
      setFocusTraySection("inspector");
    }
  }, [isFocusMode, selectedCell, selectedNpcMarker, selectedObject, selectedZone]);

  useEffect(() => {
    if (!isPainting && !zoneDrag && !panState) {
      return;
    }

    function finishInteractions() {
      setIsPainting(false);
      setPanState(null);
      if (zoneDrag) {
        const rect = normalizeRect(zoneDrag.start, zoneDrag.end);
        const zone = createDefaultZone(rect.x, rect.y, rect.width, rect.height, map.zones.map((item) => item.id));
        setMap((current) =>
          touchMap({
            ...current,
            zones: [...current.zones, zone]
          })
        );
        setSelectedZoneId(zone.id);
        setSelectedObjectId(null);
        setSelectedCell(null);
      }
      setZoneDrag(null);
    }

    window.addEventListener("pointerup", finishInteractions);
    return () => window.removeEventListener("pointerup", finishInteractions);
  }, [isPainting, panState, setMap, zoneDrag]);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      setSelectedNpcPlacementEntryKey("");
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    void ensureSummaries("npc");
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

  function updateZoneById(zoneId: string, updater: (item: MapZone) => MapZone) {
    patchMap((current) => ({
      ...current,
      zones: current.zones.map((item) => (item.id === zoneId ? updater(item) : item))
    }));
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

  function shouldShowOverlayLabel(kind: "object" | "enemy" | "zone" | "npc", rect: MapRect, isSelected: boolean) {
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
      setSelectedZoneId(null);
      setSelectedCell(null);
      setSelectedNpcMarkerEntryKey(null);
      return;
    }

    if (tool === "zone") {
      setZoneDrag({
        start: { x, y },
        end: { x, y }
      });
      setSelectedObjectId(null);
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

    if (tool === "zone" && zoneDrag) {
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
    />
  );

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
                return (
                  <button
                    key={`cell-${columnIndex}-${rowIndex}`}
                    type="button"
                    className={isSelected ? "map-cell selected" : "map-cell"}
                    style={terrainSceneStyleMap[tile.terrain] ?? terrainSceneStyles(terrainColorMap[tile.terrain])}
                    data-terrain={tile.terrain}
                    onPointerDown={(event) => handleCellPointerDown(columnIndex, rowIndex, event)}
                    onPointerEnter={() => handleCellPointerEnter(columnIndex, rowIndex)}
                    title={`${columnIndex},${rowIndex} ${tile.terrain}`}
                  >
                    <span className="map-cell-surface" />
                    <span className="map-cell-shade" />
                    {showCoords ? <span className="map-cell-coordinate">{columnIndex},{rowIndex}</span> : null}
                    {layerVisibility.walls && tile.wall ? <span className="cell-wall" /> : null}
                    {layerVisibility.walkable && !tile.walkable ? <span className="cell-blocked" /> : null}
                    {!tile.floor ? <span className="cell-no-floor" /> : null}
                  </button>
                );
              })}
            </div>

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
                  className="map-overlay zone draft show-label"
                  style={getOverlayRectStyle(
                    zoneDragRect.x,
                    zoneDragRect.y,
                    zoneDragRect.width,
                    zoneDragRect.height
                  )}
                >
                  <span className="map-overlay-badge">{getOverlayBadge("zone")}</span>
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
            {layerVisibility.enemies ? minimapEnemyRects : null}
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
            </div>
          </div>

          <div className="toolbar split">
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => {
                setSelectedCell(null);
                setSelectedObjectId(null);
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
              <span className="map-legend-chip enemy">Enemy</span>
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
                    className="map-overlay zone draft"
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
