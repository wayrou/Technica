import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { createSampleMap } from "../../data/sampleMap";
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
import {
  isTauriRuntime,
  listChaosCoreDatabase,
  loadChaosCoreDatabaseEntry,
  publishChaosCoreBundle,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";
import { createSequentialId } from "../../utils/id";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import { validateMapDocument } from "../../utils/mapValidation";
import {
  createBlankMapDocument,
  createDefaultTile,
  normalizeRect,
  resizeMapDocument,
  terrainColorMap,
  terrainPalette
} from "./mapUtils";

type MapTool = "paint" | "erase" | "select" | "move" | "object" | "zone" | "npc" | "pan";

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

function touchMap(document: MapDocument) {
  return {
    ...document,
    updatedAt: isoNow()
  };
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

export function MapEditor() {
  const [map, setMap] = usePersistentState("technica.map.document", createSampleMap());
  const [repoPath] = usePersistentState("technica.chaosCoreRepoPath", "");
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
    npcs: true
  });
  const [npcEntries, setNpcEntries] = useState<ChaosCoreDatabaseEntry[]>([]);
  const [mapNpcMarkers, setMapNpcMarkers] = useState<MapNpcMarker[]>([]);
  const [selectedNpcEntryKey, setSelectedNpcEntryKey] = useState("");
  const [isPlacingNpc, setIsPlacingNpc] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [zoneDrag, setZoneDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const deferredMap = useDeferredValue(map);
  const issues = useMemo(() => validateMapDocument(deferredMap), [deferredMap]);
  const selectedObject = map.objects.find((item) => item.id === selectedObjectId) ?? null;
  const selectedZone = map.zones.find((item) => item.id === selectedZoneId) ?? null;
  const selectedNpcEntry = npcEntries.find((entry) => entry.entryKey === selectedNpcEntryKey) ?? null;
  const cellSize = Math.max(28, Math.round(map.tileSize * 0.72 * zoom));
  const gridGap = 1;
  const cellStride = cellSize + gridGap;
  const mapCanvasWidth = map.width * cellSize + Math.max(0, map.width - 1) * gridGap;
  const mapCanvasHeight = map.height * cellSize + Math.max(0, map.height - 1) * gridGap;

  useEffect(() => {
    setDimensionDraft({ width: map.width, height: map.height });
  }, [map.height, map.width]);

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
    let cancelled = false;

    async function refreshMapNpcs() {
      if (!isTauriRuntime() || !repoPath.trim()) {
        setNpcEntries([]);
        setMapNpcMarkers([]);
        setSelectedNpcEntryKey("");
        return;
      }

      try {
        const entries = await listChaosCoreDatabase(repoPath.trim(), "npc");
        const loadedEntries: Array<MapNpcMarker | null> = await Promise.all(
          entries.map(async (entry) => {
            try {
              const loaded = await loadChaosCoreDatabaseEntry(repoPath.trim(), "npc", entry.entryKey);
              const parsed = JSON.parse(loaded.editorContent ?? loaded.sourceContent ?? loaded.runtimeContent);
              if (!isNpcDocument(parsed)) {
                return null;
              }

              return {
                entryKey: entry.entryKey,
                contentId: entry.contentId,
                name: parsed.name || entry.title || entry.contentId,
                mapId: parsed.mapId,
                tileX: Number(parsed.tileX ?? 0),
                tileY: Number(parsed.tileY ?? 0),
                origin: entry.origin,
                sourceFile: entry.sourceFile
              };
            } catch {
              return null;
            }
          })
        );

        if (cancelled) {
          return;
        }

        const nextMarkers = loadedEntries.filter((entry): entry is MapNpcMarker => entry !== null);
        setNpcEntries(entries);
        setMapNpcMarkers(nextMarkers.filter((entry) => entry.mapId === map.id));
        setSelectedNpcEntryKey((current) => {
          if (current && entries.some((entry) => entry.entryKey === current)) {
            return current;
          }
          return entries[0]?.entryKey ?? "";
        });
      } catch {
        if (!cancelled) {
          setNpcEntries([]);
          setMapNpcMarkers([]);
          setSelectedNpcEntryKey("");
        }
      }
    }

    void refreshMapNpcs();

    return () => {
      cancelled = true;
    };
  }, [map.id, repoPath]);

  async function placeNpcOnMap(x: number, y: number) {
    if (!isTauriRuntime()) {
      notify("NPC placement writes directly into the Chaos Core repo and requires Technica desktop mode.");
      return;
    }

    if (!repoPath.trim()) {
      notify("Set the Chaos Core repo path in the database panel before placing NPCs.");
      return;
    }

    if (!selectedNpcEntry) {
      notify("Select an NPC from the placement dropdown before clicking a map tile.");
      return;
    }

    setIsPlacingNpc(true);
    try {
      const loaded = await loadChaosCoreDatabaseEntry(repoPath.trim(), "npc", selectedNpcEntry.entryKey);
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

      setMapNpcMarkers((current) => [
        ...current.filter((marker) => marker.entryKey !== selectedNpcEntry.entryKey),
        {
          entryKey: selectedNpcEntry.entryKey,
          contentId: selectedNpcEntry.contentId,
          name: nextNpcDocument.name,
          mapId: nextNpcDocument.mapId,
          tileX: nextNpcDocument.tileX,
          tileY: nextNpcDocument.tileY,
          origin: selectedNpcEntry.origin,
          sourceFile: selectedNpcEntry.sourceFile
        }
      ]);
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

  function applyBrush(x: number, y: number) {
    patchMap((current) => ({
      ...current,
      tiles: current.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) =>
          rowIndex === y && columnIndex === x
            ? {
                ...tile,
                terrain: brush.terrain,
                walkable: brush.walkable,
                wall: brush.wall,
                floor: brush.floor
              }
            : tile
        )
      )
    }));
    setSelectedCell({ x, y });
    setSelectedObjectId(null);
    setSelectedZoneId(null);
  }

  function eraseTile(x: number, y: number) {
    patchMap((current) => ({
      ...current,
      tiles: current.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) => (rowIndex === y && columnIndex === x ? createDefaultTile() : tile))
      )
    }));
  }

  function handleCellPointerDown(x: number, y: number, event: ReactPointerEvent<HTMLButtonElement>) {
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
      return;
    }

    if (tool === "zone") {
      setZoneDrag({
        start: { x, y },
        end: { x, y }
      });
      setSelectedObjectId(null);
      return;
    }

    if (tool === "npc") {
      void placeNpcOnMap(x, y);
      return;
    }

    if (tool === "pan" && viewportRef.current) {
      viewportRef.current.setPointerCapture(event.pointerId);
      setPanState({
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewportRef.current.scrollLeft,
        scrollTop: viewportRef.current.scrollTop
      });
    }
  }

  function handleCellPointerEnter(x: number, y: number) {
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

  return (
    <div className="workspace-grid">
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
          <div className="tool-strip">
            {(["paint", "erase", "select", "move", "object", "zone", "npc", "pan"] as MapTool[]).map((option) => (
              <button
                key={option}
                className={tool === option ? "tool-button active" : "tool-button"}
                onClick={() => setTool(option)}
              >
                {option}
              </button>
            ))}
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

          <div className="toolbar split">
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
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={handleResizeMap}>
                Apply size
              </button>
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
              <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
            </div>
          </div>
        </Panel>

        <Panel
          title="NPC Placement"
          subtitle="Select an NPC from the Chaos Core database, switch to the NPC tool, and click a tile to place them on this map."
        >
          {!isTauriRuntime() ? (
            <div className="empty-state compact">
              Open Technica in desktop mode to place NPCs directly into the Chaos Core repo.
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field full">
              <span>NPC</span>
              <select
                value={selectedNpcEntryKey}
                onChange={(event) => setSelectedNpcEntryKey(event.target.value)}
                disabled={!isTauriRuntime() || npcEntries.length === 0}
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
            {selectedNpcEntry ? <span className="pill accent">Placing {selectedNpcEntry.title}</span> : null}
            {isPlacingNpc ? <span className="pill">Saving placement...</span> : null}
          </div>

          <div className="database-list">
            {mapNpcMarkers.length === 0 ? (
              <div className="empty-state compact">No NPCs are assigned to this map yet.</div>
            ) : (
              mapNpcMarkers.map((marker) => (
                <button
                  key={marker.entryKey}
                  type="button"
                  className={
                    marker.entryKey === selectedNpcEntryKey ? "database-entry active" : "database-entry"
                  }
                  onClick={() => setSelectedNpcEntryKey(marker.entryKey)}
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

        <Panel title="Selection Inspector" subtitle="Edit the selected tile, object, or zone directly.">
          {selectedCell ? (
            <div className="stack-list">
              <article className="item-card">
                <div className="item-card-header">
                  <h3>
                    Tile {selectedCell.x}, {selectedCell.y}
                  </h3>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Terrain</span>
                    <select
                      value={map.tiles[selectedCell.y][selectedCell.x].terrain}
                      onChange={(event) =>
                        patchMap((current) => ({
                          ...current,
                          tiles: current.tiles.map((row, rowIndex) =>
                            row.map((tile, columnIndex) =>
                              rowIndex === selectedCell.y && columnIndex === selectedCell.x
                                ? { ...tile, terrain: event.target.value as MapBrushState["terrain"] }
                                : tile
                            )
                          )
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
                        patchMap((current) => ({
                          ...current,
                          tiles: current.tiles.map((row, rowIndex) =>
                            row.map((tile, columnIndex) =>
                              rowIndex === selectedCell.y && columnIndex === selectedCell.x
                                ? { ...tile, walkable: event.target.checked }
                                : tile
                            )
                          )
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
                        patchMap((current) => ({
                          ...current,
                          tiles: current.tiles.map((row, rowIndex) =>
                            row.map((tile, columnIndex) =>
                              rowIndex === selectedCell.y && columnIndex === selectedCell.x
                                ? { ...tile, wall: event.target.checked }
                                : tile
                            )
                          )
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
                        patchMap((current) => ({
                          ...current,
                          tiles: current.tiles.map((row, rowIndex) =>
                            row.map((tile, columnIndex) =>
                              rowIndex === selectedCell.y && columnIndex === selectedCell.x
                                ? { ...tile, floor: event.target.checked }
                                : tile
                            )
                          )
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
                        patchMap((current) => ({
                          ...current,
                          tiles: current.tiles.map((row, rowIndex) =>
                            row.map((tile, columnIndex) =>
                              rowIndex === selectedCell.y && columnIndex === selectedCell.x
                                ? { ...tile, metadata: parseKeyValueLines(event.target.value) }
                                : tile
                            )
                          )
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
              <div className="form-grid">
                <label className="field">
                  <span>Object id</span>
                  <input
                    value={selectedObject.id}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, id: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Type</span>
                  <input
                    value={selectedObject.type}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, type: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Sprite</span>
                  <input
                    value={selectedObject.sprite}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, sprite: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Label</span>
                  <input
                    value={selectedObject.label}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, label: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Action</span>
                  <input
                    value={selectedObject.action}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, action: event.target.value } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, width: Number(event.target.value || 1) } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, height: Number(event.target.value || 1) } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id ? { ...item, metadata: parseKeyValueLines(event.target.value) } : item
                        )
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
              <div className="form-grid">
                <label className="field">
                  <span>Zone id</span>
                  <input
                    value={selectedZone.id}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, id: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Label</span>
                  <input
                    value={selectedZone.label}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, label: event.target.value } : item
                        )
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Action</span>
                  <input
                    value={selectedZone.action}
                    onChange={(event) =>
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, action: event.target.value } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, width: Number(event.target.value || 1) } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, height: Number(event.target.value || 1) } : item
                        )
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
                      patchMap((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === selectedZone.id ? { ...item, metadata: parseKeyValueLines(event.target.value) } : item
                        )
                      }))
                    }
                  />
                </label>
              </div>
            </article>
          ) : null}

          {!selectedCell && !selectedObject && !selectedZone ? (
            <div className="empty-state compact">
              Select a tile, object, or zone to edit it here. In move mode, click the grid to reposition the selected
              object or zone.
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="workspace-column wide">
        <Panel
          title="Field Map"
          subtitle="Paint directly on the grid. Drag with the zone tool to create an interaction area."
        >
          <div
            ref={viewportRef}
            className={tool === "pan" ? "map-viewport pannable" : "map-viewport"}
            onPointerMove={handleViewportPointerMove}
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
                  ? map.objects.map((item) => (
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
                          npc.entryKey === selectedNpcEntryKey ? "map-overlay npc selected" : "map-overlay npc"
                        }
                        style={getOverlayRectStyle(npc.tileX, npc.tileY, 1, 1)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNpcEntryKey(npc.entryKey);
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
                      normalizeRect(zoneDrag.start, zoneDrag.end).x,
                      normalizeRect(zoneDrag.start, zoneDrag.end).y,
                      normalizeRect(zoneDrag.start, zoneDrag.end).width,
                      normalizeRect(zoneDrag.start, zoneDrag.end).height
                    )}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </Panel>

        <ChaosCoreDatabasePanel
          contentType="map"
          currentDocument={map}
          buildBundle={(current) => buildMapBundleForTarget(current, "chaos-core")}
          onLoadEntry={handleLoadDatabaseEntry}
          subtitle="Publish maps directly into the Chaos Core repo and reopen the live field maps here for iteration and balance work."
        />
      </div>

      <div className="workspace-column">
        <Panel title="Validation" subtitle="Bounds, dimensions, duplicate ids, and contradictory tile flags show up here.">
          <IssueList issues={issues} emptyLabel="No validation issues. This map is ready to export." />
        </Panel>
      </div>
    </div>
  );
}
