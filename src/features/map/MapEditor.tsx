import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { createSampleMap } from "../../data/sampleMap";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { ExportTarget } from "../../types/common";
import type { MapBrushState, MapDocument, MapObject, MapZone } from "../../types/map";
import { isoNow } from "../../utils/date";
import { confirmAction, notify } from "../../utils/dialogs";
import { buildMapBundleForTarget, createDraftEnvelope, downloadBundle, downloadDraftFile } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
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

type MapTool = "paint" | "erase" | "select" | "move" | "object" | "zone" | "pan";

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

export function MapEditor() {
  const [map, setMap] = usePersistentState("technica.map.document", createSampleMap());
  const [exportTarget, setExportTarget] = usePersistentState<ExportTarget>("technica.map.exportTarget", "generic");
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
    zones: true
  });
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
  const issues = validateMapDocument(map);
  const selectedObject = map.objects.find((item) => item.id === selectedObjectId) ?? null;
  const selectedZone = map.zones.find((item) => item.id === selectedZoneId) ?? null;
  const cellSize = Math.max(28, Math.round(map.tileSize * 0.72 * zoom));

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
            {(["paint", "erase", "select", "move", "object", "zone", "pan"] as MapTool[]).map((option) => (
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
            </div>
            <div className="toolbar">
              <label className="inline-select">
                <span>Export target</span>
                <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}>
                  <option value="generic">Generic</option>
                  <option value="chaos-core">Chaos Core</option>
                </select>
              </label>
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
                    await downloadBundle(buildMapBundleForTarget(map, exportTarget));
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

              {layerVisibility.objects
                ? map.objects.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedObjectId ? "map-overlay object selected" : "map-overlay object"}
                      style={{
                        gridColumn: `${item.x + 1} / span ${item.width}`,
                        gridRow: `${item.y + 1} / span ${item.height}`
                      }}
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
                      style={{
                        gridColumn: `${item.x + 1} / span ${item.width}`,
                        gridRow: `${item.y + 1} / span ${item.height}`
                      }}
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

              {zoneDrag ? (
                <div
                  className="map-overlay zone draft"
                  style={{
                    gridColumn: `${normalizeRect(zoneDrag.start, zoneDrag.end).x + 1} / span ${normalizeRect(
                      zoneDrag.start,
                      zoneDrag.end
                    ).width}`,
                    gridRow: `${normalizeRect(zoneDrag.start, zoneDrag.end).y + 1} / span ${normalizeRect(
                      zoneDrag.start,
                      zoneDrag.end
                    ).height}`
                  }}
                />
              ) : null}
            </div>
          </div>
        </Panel>
      </div>

      <div className="workspace-column">
        <Panel title="Validation" subtitle="Bounds, dimensions, duplicate ids, and contradictory tile flags show up here.">
          <IssueList issues={issues} emptyLabel="No validation issues. This map is ready to export." />
        </Panel>

        <Panel title="Map Preview JSON" subtitle="The exported map JSON updates as you paint and edit.">
          <pre className="json-preview tall">{JSON.stringify(map, null, 2)}</pre>
        </Panel>

        <Panel title="Draft Envelope" subtitle="Map drafts can be exported and reimported without losing Technica metadata.">
          <pre className="json-preview">{JSON.stringify(createDraftEnvelope("map", map), null, 2)}</pre>
        </Panel>
      </div>
    </div>
  );
}
