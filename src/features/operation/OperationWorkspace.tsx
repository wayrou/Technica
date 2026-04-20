import { useEffect, useMemo, useState } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import {
  operationFieldMapRouteSources,
  operationRoomTypes,
  operationTheaterClearModes,
  operationTheaterKeyTypes,
  operationTheaterLayoutStyles,
  operationTheaterRoomClasses,
  operationTheaterRoomRoles,
  type OperationDocument,
  type OperationFloorDocument,
  type OperationRoomDocument,
  type OperationTheaterRoomRole,
  normalizeOperationDocument,
} from "../../types/operation";
import { buildOperationBundleForTarget } from "../../utils/exporters";
import { confirmAction, notify } from "../../utils/dialogs";
import { runtimeId } from "../../utils/id";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import type { StructuredStudioContext } from "../content/StructuredDocumentStudio";
import {
  applyRoomRolePreset,
  buildPreviewGeometry,
  createConnectedRoom,
  createDefaultFloor,
  createSelectionPathSummary,
  formatChoiceLabel,
  loadDatabaseEntry,
  parseDelimitedList,
  roomRoleColors,
  roomRoleLabels,
  serializeDelimitedList,
} from "./operationEditorUtils";

interface OperationWorkspaceProps extends StructuredStudioContext<OperationDocument> {}

function getOperationRoomFieldRouteLabel(room: OperationRoomDocument) {
  return room.fieldMapLabel?.trim() || `${room.label} field map`;
}

function getOperationRoomEntryAnchorId(room: OperationRoomDocument) {
  return room.fieldMapEntryPointId?.trim() || "player_start";
}

function createFieldRouteHintRows(
  operation: OperationDocument,
  floor: OperationFloorDocument,
  room: OperationRoomDocument
) {
  const source = room.fieldMapRouteSource;
  const baseRows = [
    ["Field map id", room.fieldMapId?.trim() || "Set field map id"],
    ["Map route source", source],
    ["Operation id", runtimeId(operation.id)],
    ["Entry anchor id", runtimeId(getOperationRoomEntryAnchorId(room), "spawn")],
    ["Route label", getOperationRoomFieldRouteLabel(room)]
  ];

  if (source === "atlas_theater") {
    return [
      ...baseRows,
      ["Theater screen id", runtimeId(room.id)]
    ];
  }

  if (source === "floor_region") {
    return [
      ...baseRows,
      ["Floor ordinal", String(floor.floorOrdinal)],
      ["Recommended region id", runtimeId(room.id)],
      ["Alternate region ids", [runtimeId(floor.id), runtimeId(floor.sectorLabel)].filter(Boolean).join(", ")]
    ];
  }

  if (source === "door") {
    return [
      ...baseRows,
      ["Door id", room.fieldMapDoorId?.trim() ? runtimeId(room.fieldMapDoorId) : "Set door id"]
    ];
  }

  return [
    ...baseRows,
    ["Portal id", room.fieldMapPortalId?.trim() ? runtimeId(room.fieldMapPortalId) : "Set portal id"]
  ];
}

function formatFieldRouteHintText(operation: OperationDocument, floor: OperationFloorDocument, room: OperationRoomDocument) {
  return createFieldRouteHintRows(operation, floor, room)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function OperationWorkspace({
  document,
  setDocument,
  patchDocument,
  loadSample,
  clearDocument,
  importDraft,
  saveDraft,
  exportBundle,
  isMobile,
  canSendToDesktop,
  isSendingToDesktop,
  sendToDesktop,
}: OperationWorkspaceProps) {
  const normalizedDocument = useMemo(() => normalizeOperationDocument(document), [document]);
  const [selectedFloorId, setSelectedFloorId] = useState(normalizedDocument.floors[0]?.id ?? "");
  const [selectedRoomId, setSelectedRoomId] = useState(normalizedDocument.floors[0]?.rooms[0]?.id ?? "");

  useEffect(() => {
    const nextFloorId =
      normalizedDocument.floors.find((floor) => floor.id === selectedFloorId)?.id
      ?? normalizedDocument.floors[0]?.id
      ?? "";

    if (nextFloorId !== selectedFloorId) {
      setSelectedFloorId(nextFloorId);
    }

    const nextFloor = normalizedDocument.floors.find((floor) => floor.id === nextFloorId);
    const nextRoomId =
      nextFloor?.rooms.find((room) => room.id === selectedRoomId)?.id
      ?? nextFloor?.rooms[0]?.id
      ?? "";

    if (nextRoomId !== selectedRoomId) {
      setSelectedRoomId(nextRoomId);
    }
  }, [normalizedDocument, selectedFloorId, selectedRoomId]);

  const totalRoomCount = normalizedDocument.floors.reduce((total, floor) => total + floor.rooms.length, 0);
  const selectedFloorIndex = normalizedDocument.floors.findIndex((floor) => floor.id === selectedFloorId);
  const selectedFloor =
    normalizedDocument.floors[selectedFloorIndex] ?? normalizedDocument.floors[0] ?? null;
  const selectedRoom = selectedFloor?.rooms.find((room) => room.id === selectedRoomId) ?? selectedFloor?.rooms[0] ?? null;
  const previewGeometry = selectedFloor ? buildPreviewGeometry(selectedFloor) : buildPreviewGeometry(createDefaultFloor(normalizedDocument));
  const floorPathSummary = selectedFloor ? createSelectionPathSummary(selectedFloor) : { reachableCount: 0, pathLengthToObjective: null };
  const selectedRoomFieldRouteHints =
    selectedFloor && selectedRoom ? createFieldRouteHintRows(normalizedDocument, selectedFloor, selectedRoom) : [];
  const selectedRoomFieldRouteReady =
    Boolean(selectedRoom?.fieldMapId?.trim()) &&
    (!selectedRoom || selectedRoom.fieldMapRouteSource !== "door" || Boolean(selectedRoom.fieldMapDoorId?.trim())) &&
    (!selectedRoom || selectedRoom.fieldMapRouteSource !== "portal" || Boolean(selectedRoom.fieldMapPortalId?.trim()));

  function updateOperation(updater: (current: OperationDocument) => OperationDocument) {
    patchDocument((current) => updater(normalizeOperationDocument(current)));
  }

  function updateSelectedFloor(updater: (floor: OperationFloorDocument) => OperationFloorDocument) {
    if (!selectedFloor) {
      return;
    }

    updateOperation((current) => ({
      ...current,
      floors: current.floors.map((floor) => (floor.id === selectedFloor.id ? updater(floor) : floor))
    }));
  }

  function updateSelectedRoom(updater: (room: OperationRoomDocument) => OperationRoomDocument) {
    if (!selectedFloor || !selectedRoom) {
      return;
    }

    updateOperation((current) => ({
      ...current,
      floors: current.floors.map((floor) =>
        floor.id !== selectedFloor.id
          ? floor
          : {
              ...floor,
              rooms: floor.rooms.map((room) => (room.id === selectedRoom.id ? updater(room) : room))
            }
      )
    }));
  }

  function markSelectedRoomAsFieldMapRoute() {
    updateSelectedRoom((room) => ({
      ...room,
      type: "field_node",
      clearMode: "field",
      fieldMapRouteSource: "atlas_theater",
      fieldMapLabel: room.fieldMapLabel || getOperationRoomFieldRouteLabel(room),
      tags: Array.from(new Set([...room.tags, "field_route", "technica_field_map"]))
    }));
  }

  function setSelectedRoomFieldRoutePreset(source: OperationRoomDocument["fieldMapRouteSource"]) {
    updateSelectedRoom((room) => ({
      ...room,
      type: "field_node",
      clearMode: "field",
      fieldMapRouteSource: source,
      fieldMapEntryPointId: room.fieldMapEntryPointId || "player_start",
      fieldMapDoorId: source === "door" ? room.fieldMapDoorId || `${room.id}_door` : room.fieldMapDoorId,
      fieldMapPortalId: source === "portal" ? room.fieldMapPortalId || `${room.id}_portal` : room.fieldMapPortalId,
      fieldMapLabel: room.fieldMapLabel || getOperationRoomFieldRouteLabel(room),
      tags: Array.from(new Set([...room.tags, "field_route", "technica_field_map", source]))
    }));
  }

  function clearSelectedRoomFieldMapRoute() {
    updateSelectedRoom((room) => ({
      ...room,
      fieldMapId: "",
      fieldMapEntryPointId: "",
      fieldMapRouteSource: "atlas_theater",
      fieldMapDoorId: "",
      fieldMapPortalId: "",
      fieldMapLabel: ""
    }));
  }

  function copySelectedRoomFieldRouteHints() {
    if (!selectedFloor || !selectedRoom) {
      return;
    }

    const text = formatFieldRouteHintText(normalizedDocument, selectedFloor, selectedRoom);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
    if (!clipboard?.writeText) {
      notify(text);
      return;
    }

    void clipboard
      .writeText(text)
      .then(() => notify("Copied the matching Map Editor route hints."))
      .catch(() => notify(text));
  }

  function addFloor() {
    const nextFloor = createDefaultFloor(normalizedDocument);
    updateOperation((current) => ({
      ...current,
      floors: [...current.floors, nextFloor]
    }));
    setSelectedFloorId(nextFloor.id);
    setSelectedRoomId(nextFloor.rooms[0]?.id ?? "");
  }

  function removeFloor() {
    if (!selectedFloor) {
      return;
    }
    if (normalizedDocument.floors.length <= 1) {
      notify("Operations need at least one floor.");
      return;
    }
    if (!confirmAction(`Remove floor '${selectedFloor.name}'?`)) {
      return;
    }

    const remainingFloors = normalizedDocument.floors.filter((floor) => floor.id !== selectedFloor.id);
    updateOperation((current) => ({
      ...current,
      floors: current.floors.filter((floor) => floor.id !== selectedFloor.id)
    }));
    setSelectedFloorId(remainingFloors[0]?.id ?? "");
    setSelectedRoomId(remainingFloors[0]?.rooms[0]?.id ?? "");
  }

  function addRoom(role: OperationTheaterRoomRole = "frontline") {
    if (!selectedFloor) {
      return;
    }

    const anchorRoom = selectedRoom ?? selectedFloor.rooms[0] ?? null;
    const { room: nextRoom } = createConnectedRoom(selectedFloor, anchorRoom, role);
    updateSelectedFloor((floor) => ({
      ...floor,
      rooms: floor.rooms.map((room) =>
        room.id === anchorRoom?.id && !room.connections.includes(nextRoom.id)
          ? { ...room, connections: [...room.connections, nextRoom.id] }
          : room
      ).concat(nextRoom)
    }));
    setSelectedRoomId(nextRoom.id);
  }

  function duplicateRoom() {
    if (!selectedFloor || !selectedRoom) {
      return;
    }

    const { room: duplicateRoom } = createConnectedRoom(selectedFloor, selectedRoom, selectedRoom.role);
    updateSelectedFloor((floor) => ({
      ...floor,
      rooms: floor.rooms.map((room) =>
        room.id === selectedRoom.id && !room.connections.includes(duplicateRoom.id)
          ? { ...room, connections: [...room.connections, duplicateRoom.id] }
          : room
      ).concat({
        ...duplicateRoom,
        label: `${selectedRoom.label} Copy`,
        x: selectedRoom.x + 0.8,
        y: selectedRoom.y + 0.5
      })
    }));
    setSelectedRoomId(duplicateRoom.id);
  }

  function removeRoom() {
    if (!selectedFloor || !selectedRoom) {
      return;
    }
    if (selectedFloor.rooms.length <= 1) {
      notify("Every floor needs at least one room.");
      return;
    }
    if (!confirmAction(`Remove room '${selectedRoom.label}'?`)) {
      return;
    }

    const remainingRooms = selectedFloor.rooms.filter((room) => room.id !== selectedRoom.id);
    updateSelectedFloor((floor) => ({
      ...floor,
      startingRoomId: floor.startingRoomId === selectedRoom.id ? (remainingRooms[0]?.id ?? "") : floor.startingRoomId,
      rooms: floor.rooms
        .filter((room) => room.id !== selectedRoom.id)
        .map((room) => ({
          ...room,
          connections: room.connections.filter((connectionId) => connectionId !== selectedRoom.id)
        }))
    }));
    setSelectedRoomId(remainingRooms[0]?.id ?? "");
  }

  function toggleConnection(targetRoomId: string) {
    if (!selectedFloor || !selectedRoom || selectedRoom.id === targetRoomId) {
      return;
    }

    updateSelectedFloor((floor) => {
      const isConnected = selectedRoom.connections.includes(targetRoomId);
      return {
        ...floor,
        rooms: floor.rooms.map((room) => {
          if (room.id === selectedRoom.id) {
            return {
              ...room,
              connections: isConnected
                ? room.connections.filter((connectionId) => connectionId !== targetRoomId)
                : [...room.connections, targetRoomId]
            };
          }

          if (room.id === targetRoomId) {
            return {
              ...room,
              connections: isConnected
                ? room.connections.filter((connectionId) => connectionId !== selectedRoom.id)
                : room.connections.includes(selectedRoom.id)
                  ? room.connections
                  : [...room.connections, selectedRoom.id]
            };
          }

          return room;
        })
      };
    });
  }

  return (
    <>
      <Panel
        title="Operation Briefing"
        subtitle="Author theater-facing operation briefs and structured floor plans without falling back to raw room JSON."
        actions={
          <div className="toolbar">
            <button type="button" className="ghost-button" onClick={loadSample}>
              Load sample
            </button>
            <button type="button" className="ghost-button" onClick={clearDocument}>
              Clear
            </button>
          </div>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Operation id</span>
            <input value={normalizedDocument.id} onChange={(event) => updateOperation((current) => ({ ...current, id: event.target.value }))} />
          </label>
          <label className="field">
            <span>Codename</span>
            <input value={normalizedDocument.codename} onChange={(event) => updateOperation((current) => ({ ...current, codename: event.target.value }))} />
          </label>
          <label className="field">
            <span>Zone name</span>
            <input value={normalizedDocument.zoneName} onChange={(event) => updateOperation((current) => ({ ...current, zoneName: event.target.value }))} />
          </label>
          <label className="field">
            <span>Sprawl direction</span>
            <select
              value={normalizedDocument.sprawlDirection}
              onChange={(event) => updateOperation((current) => ({ ...current, sprawlDirection: event.target.value as OperationDocument["sprawlDirection"] }))}
            >
              {["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"].map((direction) => (
                <option key={direction} value={direction}>
                  {formatChoiceLabel(direction)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Recommended power</span>
            <input type="number" value={normalizedDocument.recommendedPower} onChange={(event) => updateOperation((current) => ({ ...current, recommendedPower: Number(event.target.value || 0) }))} />
          </label>
          <label className="field">
            <span>Floor count</span>
            <input value={normalizedDocument.floors.length} disabled />
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea rows={3} value={normalizedDocument.description} onChange={(event) => updateOperation((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Objective</span>
            <textarea rows={2} value={normalizedDocument.objective} onChange={(event) => updateOperation((current) => ({ ...current, objective: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Beginning state</span>
            <textarea rows={2} value={normalizedDocument.beginningState} onChange={(event) => updateOperation((current) => ({ ...current, beginningState: event.target.value }))} />
          </label>
          <label className="field full">
            <span>End state</span>
            <textarea rows={2} value={normalizedDocument.endState} onChange={(event) => updateOperation((current) => ({ ...current, endState: event.target.value }))} />
          </label>
          <label className="field full">
            <span>Metadata</span>
            <textarea rows={4} value={serializeKeyValueLines(normalizedDocument.metadata)} onChange={(event) => updateOperation((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))} />
          </label>
        </div>

        <div className="toolbar split">
          <div className="chip-row">
            <span className="pill">{normalizedDocument.floors.length} floor(s)</span>
            <span className="pill">{totalRoomCount} room(s)</span>
            <span className="pill accent">Theater-first authoring</span>
          </div>
          <div className="toolbar">
            {isMobile ? (
              <button type="button" className="primary-button" onClick={() => void sendToDesktop()} disabled={!canSendToDesktop || isSendingToDesktop}>
                {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
              </button>
            ) : (
              <>
                <button type="button" className="ghost-button" onClick={importDraft}>
                  Import draft
                </button>
                <button type="button" className="ghost-button" onClick={saveDraft}>
                  Save draft file
                </button>
                <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                  Export bundle
                </button>
              </>
            )}
          </div>
        </div>
      </Panel>
      <Panel
        title="Theater Floor Planner"
        subtitle="Author sector metadata, room roles, and the actual flow from ingress to objective instead of hand-editing floor JSON."
        actions={
          <div className="toolbar">
            <button type="button" className="ghost-button" onClick={addFloor}>
              Add floor
            </button>
            <button type="button" className="ghost-button" onClick={removeFloor} disabled={!selectedFloor}>
              Remove floor
            </button>
            <button type="button" className="ghost-button" onClick={() => addRoom("frontline")} disabled={!selectedFloor}>
              Add room
            </button>
            <button type="button" className="ghost-button" onClick={duplicateRoom} disabled={!selectedRoom}>
              Duplicate room
            </button>
            <button type="button" className="ghost-button" onClick={removeRoom} disabled={!selectedRoom}>
              Remove room
            </button>
          </div>
        }
      >
        <div className="operation-editor-layout">
          <aside className="operation-editor-sidebar">
            <div className="operation-sidebar-header">
              <div>
                <strong>Floors</strong>
                <p>Pick a floor, then shape its theater route.</p>
              </div>
              <button type="button" className="ghost-button" onClick={addFloor}>
                Add floor
              </button>
            </div>

            <div className="operation-floor-list">
              {normalizedDocument.floors.map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  className={`operation-floor-card${floor.id === selectedFloor?.id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedFloorId(floor.id);
                    setSelectedRoomId(floor.rooms[0]?.id ?? "");
                  }}
                >
                  <span className="operation-floor-card__title">{floor.name}</span>
                  <span className="operation-floor-card__meta">Floor {floor.floorOrdinal} · {floor.sectorLabel}</span>
                  <span className="operation-floor-card__meta">{floor.rooms.length} room(s)</span>
                </button>
              ))}
            </div>

            {selectedFloor ? (
              <>
                <div className="operation-sidebar-header compact">
                  <div>
                    <strong>Rooms</strong>
                    <p>{selectedFloor.name}</p>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => addRoom("frontline")}>
                    Add room
                  </button>
                </div>
                <div className="operation-room-list">
                  {selectedFloor.rooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={`operation-room-card${room.id === selectedRoom?.id ? " selected" : ""}`}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      <span className="operation-room-card__swatch" style={{ backgroundColor: roomRoleColors[room.role] }} />
                      <span className="operation-room-card__body">
                        <strong>{room.label}</strong>
                        <small>{roomRoleLabels[room.role]} · depth {room.depthFromUplink}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </aside>

          <div className="operation-editor-main">
            {selectedFloor ? (
              <>
                <div className="operation-summary-strip">
                  <span className="pill">{selectedFloor.rooms.filter((room) => room.role === "ingress").length} ingress</span>
                  <span className="pill">{selectedFloor.rooms.filter((room) => room.role === "objective").length} objective</span>
                  <span className="pill">{selectedFloor.rooms.filter((room) => room.isPowerSource).length} power source</span>
                  <span className="pill">{floorPathSummary.reachableCount}/{selectedFloor.rooms.length} reachable</span>
                  <span className="pill accent">
                    {floorPathSummary.pathLengthToObjective === null ? "No authored objective path" : `${floorPathSummary.pathLengthToObjective} hops to objective`}
                  </span>
                </div>

                <div className="operation-preview-card">
                  <div className="operation-preview-card__header">
                    <div>
                      <h3>Theater route preview</h3>
                      <p>Local coordinates and authored connections are rendered here so you can see the route at a glance.</p>
                    </div>
                    <div className="chip-row">
                      {operationTheaterRoomRoles.map((role) => (
                        <span key={role} className="pill subdued">
                          <span className="operation-legend-dot" style={{ backgroundColor: roomRoleColors[role] }} />
                          {roomRoleLabels[role]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="operation-preview-stage">
                    <svg className="operation-preview-svg" viewBox={`0 0 ${previewGeometry.width} ${previewGeometry.height}`} preserveAspectRatio="xMidYMid meet">
                      {previewGeometry.edges.map((edge) => (
                        <line key={edge.id} x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} className="operation-preview-edge" />
                      ))}

                      {previewGeometry.nodes.map((node) => {
                        const isSelected = node.room.id === selectedRoom?.id;
                        const radius = node.room.roomClass === "mega" ? 34 : 24;
                        return (
                          <g key={node.room.id} className={`operation-preview-node${isSelected ? " selected" : ""}`} onClick={() => setSelectedRoomId(node.room.id)}>
                            <circle cx={node.x} cy={node.y} r={radius} fill={roomRoleColors[node.room.role]} opacity={isSelected ? 0.95 : 0.82} />
                            <circle cx={node.x} cy={node.y} r={radius + 10} className="operation-preview-node-ring" />
                            <text x={node.x} y={node.y + 5} textAnchor="middle" className="operation-preview-node-label">
                              {node.room.label.slice(0, 16)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="operation-empty-state">Add a floor to begin authoring theater flow.</div>
            )}
          </div>
        </div>
      </Panel>
      {selectedFloor ? (
        <Panel title="Floor & Room Inspectors" subtitle="Tune floor metadata and the currently selected room without dropping back to raw JSON.">
          <div className="operation-editor-detail-grid">
            <div className="operation-editor-inspector">
              <div className="operation-inspector-header">
                <div>
                  <h3>Floor inspector</h3>
                  <p>Sector-facing fields that map closest to Chaos Core’s theater summary.</p>
                </div>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Floor id</span>
                  <input value={selectedFloor.id} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, id: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Floor name</span>
                  <input value={selectedFloor.name} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Floor ordinal</span>
                  <input type="number" value={selectedFloor.floorOrdinal} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, floorOrdinal: Number(event.target.value || 1) }))} />
                </label>
                <label className="field">
                  <span>Atlas floor id</span>
                  <input value={selectedFloor.atlasFloorId} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, atlasFloorId: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Starting room</span>
                  <select value={selectedFloor.startingRoomId} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, startingRoomId: event.target.value }))}>
                    {selectedFloor.rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Layout style</span>
                  <select value={selectedFloor.layoutStyle} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, layoutStyle: event.target.value as OperationFloorDocument["layoutStyle"] }))}>
                    {operationTheaterLayoutStyles.map((layoutStyle) => (
                      <option key={layoutStyle} value={layoutStyle}>
                        {formatChoiceLabel(layoutStyle)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Sector label</span>
                  <input value={selectedFloor.sectorLabel} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, sectorLabel: event.target.value }))} />
                </label>
                <label className="field full">
                  <span>Threat level</span>
                  <input value={selectedFloor.threatLevel} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, threatLevel: event.target.value }))} />
                </label>
                <label className="field full">
                  <span>Origin label</span>
                  <input value={selectedFloor.originLabel} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, originLabel: event.target.value }))} />
                </label>
                <label className="field full">
                  <span>Passive effect text</span>
                  <textarea rows={3} value={selectedFloor.passiveEffectText} onChange={(event) => updateSelectedFloor((floor) => ({ ...floor, passiveEffectText: event.target.value }))} />
                </label>
              </div>
            </div>

            <div className="operation-editor-inspector">
              <div className="operation-inspector-header">
                <div>
                  <h3>Room inspector</h3>
                  <p>Role, encounter, and sector-capacity data for the currently selected room.</p>
                </div>
                {selectedRoom ? (
                  <button type="button" className="ghost-button" onClick={() => updateSelectedRoom((room) => applyRoomRolePreset(room, room.role))}>
                    Reapply role defaults
                  </button>
                ) : null}
              </div>

              {selectedRoom ? (
                <div className="form-grid">
                  <label className="field">
                    <span>Room id</span>
                    <input value={selectedRoom.id} onChange={(event) => updateSelectedRoom((room) => ({ ...room, id: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Room label</span>
                    <input value={selectedRoom.label} onChange={(event) => updateSelectedRoom((room) => ({ ...room, label: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Role</span>
                    <select value={selectedRoom.role} onChange={(event) => updateSelectedRoom((room) => applyRoomRolePreset(room, event.target.value as OperationTheaterRoomRole))}>
                      {operationTheaterRoomRoles.map((role) => (
                        <option key={role} value={role}>
                          {roomRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Encounter surface</span>
                    <select value={selectedRoom.type} onChange={(event) => updateSelectedRoom((room) => ({ ...room, type: event.target.value as OperationRoomDocument["type"] }))}>
                      {operationRoomTypes.map((type) => (
                        <option key={type} value={type}>
                          {formatChoiceLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Local X</span>
                    <input type="number" value={selectedRoom.x} onChange={(event) => updateSelectedRoom((room) => ({ ...room, x: Number(event.target.value || 0) }))} />
                  </label>
                  <label className="field">
                    <span>Local Y</span>
                    <input type="number" value={selectedRoom.y} onChange={(event) => updateSelectedRoom((room) => ({ ...room, y: Number(event.target.value || 0) }))} />
                  </label>
                  <label className="field">
                    <span>Depth from uplink</span>
                    <input type="number" value={selectedRoom.depthFromUplink} onChange={(event) => updateSelectedRoom((room) => ({ ...room, depthFromUplink: Number(event.target.value || 0) }))} />
                  </label>
                  <label className="field">
                    <span>Room class</span>
                    <select value={selectedRoom.roomClass} onChange={(event) => updateSelectedRoom((room) => ({ ...room, roomClass: event.target.value as OperationRoomDocument["roomClass"] }))}>
                      {operationTheaterRoomClasses.map((roomClass) => (
                        <option key={roomClass} value={roomClass}>
                          {formatChoiceLabel(roomClass)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Clear mode</span>
                    <select value={selectedRoom.clearMode} onChange={(event) => updateSelectedRoom((room) => ({ ...room, clearMode: event.target.value as OperationRoomDocument["clearMode"] }))}>
                      {operationTheaterClearModes.map((clearMode) => (
                        <option key={clearMode} value={clearMode}>
                          {formatChoiceLabel(clearMode)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Sector tag</span>
                    <input value={selectedRoom.sectorTag} onChange={(event) => updateSelectedRoom((room) => ({ ...room, sectorTag: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Battle map id</span>
                    <input value={selectedRoom.battleMapId ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, battleMapId: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Battle template</span>
                    <input value={selectedRoom.battleTemplate ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, battleTemplate: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Event template</span>
                    <input value={selectedRoom.eventTemplate ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, eventTemplate: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Tactical encounter</span>
                    <input value={selectedRoom.tacticalEncounter ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, tacticalEncounter: event.target.value }))} />
                  </label>
                  <div className="field full operation-field-route-card">
                    <div className="operation-field-route-card__header">
                      <div>
                        <span>Technica field map entrance</span>
                        <p>Use this room as an Atlas theater door into a published 2D or 3D field map.</p>
                      </div>
                      <span className={`pill ${selectedRoomFieldRouteReady ? "accent" : "warning"}`}>
                        {selectedRoomFieldRouteReady ? "Handshake ready" : "Needs route data"}
                      </span>
                    </div>
                    <div className="operation-field-route-contract">
                      <div className="operation-field-route-contract__header">
                        <strong>Matching Map Editor values</strong>
                        <button type="button" className="ghost-button" onClick={copySelectedRoomFieldRouteHints}>
                          Copy hints
                        </button>
                      </div>
                      <div className="operation-field-route-contract__grid">
                        {selectedRoomFieldRouteHints.map(([label, value]) => (
                          <div key={`${label}-${value}`}>
                            <span>{label}</span>
                            <code>{value}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="form-grid compact">
                      <label className="field">
                        <span>Field map id</span>
                        <input value={selectedRoom.fieldMapId ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapId: event.target.value }))} placeholder="outer_deck_overworld" />
                      </label>
                      <label className="field">
                        <span>Route source</span>
                        <select value={selectedRoom.fieldMapRouteSource} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapRouteSource: event.target.value as OperationRoomDocument["fieldMapRouteSource"] }))}>
                          {operationFieldMapRouteSources.map((source) => (
                            <option key={source} value={source}>
                              {formatChoiceLabel(source)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Entry spawn anchor id</span>
                        <input value={selectedRoom.fieldMapEntryPointId ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapEntryPointId: event.target.value }))} placeholder="player_start" />
                      </label>
                      <label className="field">
                        <span>Route label</span>
                        <input value={selectedRoom.fieldMapLabel ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapLabel: event.target.value }))} placeholder={`${selectedRoom.label} field map`} />
                      </label>
                      <label className="field">
                        <span>Door id</span>
                        <input value={selectedRoom.fieldMapDoorId ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapDoorId: event.target.value }))} placeholder="door id for door routes" />
                      </label>
                      <label className="field">
                        <span>Portal id</span>
                        <input value={selectedRoom.fieldMapPortalId ?? ""} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fieldMapPortalId: event.target.value }))} placeholder="portal id for portal routes" />
                      </label>
                    </div>
                    <div className="toolbar">
                      <button type="button" className="ghost-button" onClick={markSelectedRoomAsFieldMapRoute}>
                        Use this room as theater route
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setSelectedRoomFieldRoutePreset("floor_region")}>
                        Floor route preset
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setSelectedRoomFieldRoutePreset("door")}>
                        Door preset
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setSelectedRoomFieldRoutePreset("portal")}>
                        Portal preset
                      </button>
                      <button type="button" className="ghost-button danger" onClick={clearSelectedRoomFieldMapRoute}>
                        Clear field route
                      </button>
                    </div>
                    <small>
                      Exported to Chaos Core as an explicit room-to-map route. If the map has a matching spawn anchor, the theater button will enter at that anchor.
                    </small>
                  </div>
                  <label className="field">
                    <span>Core slot capacity</span>
                    <input type="number" value={selectedRoom.coreSlotCapacity} onChange={(event) => updateSelectedRoom((room) => ({ ...room, coreSlotCapacity: Number(event.target.value || 0) }))} />
                  </label>
                  <label className="field">
                    <span>Fortification capacity</span>
                    <input type="number" value={selectedRoom.fortificationCapacity} onChange={(event) => updateSelectedRoom((room) => ({ ...room, fortificationCapacity: Number(event.target.value || 0) }))} />
                  </label>
                  <label className="field">
                    <span>Required key</span>
                    <select value={selectedRoom.requiredKeyType} onChange={(event) => updateSelectedRoom((room) => ({ ...room, requiredKeyType: event.target.value as OperationRoomDocument["requiredKeyType"] }))}>
                      <option value="">None</option>
                      {operationTheaterKeyTypes.map((keyType) => (
                        <option key={keyType} value={keyType}>
                          {formatChoiceLabel(keyType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Granted key</span>
                    <select value={selectedRoom.grantsKeyType} onChange={(event) => updateSelectedRoom((room) => ({ ...room, grantsKeyType: event.target.value as OperationRoomDocument["grantsKeyType"] }))}>
                      <option value="">None</option>
                      {operationTheaterKeyTypes.map((keyType) => (
                        <option key={keyType} value={keyType}>
                          {formatChoiceLabel(keyType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field checkbox-field">
                    <span>Power source</span>
                    <input type="checkbox" checked={selectedRoom.isPowerSource} onChange={(event) => updateSelectedRoom((room) => ({ ...room, isPowerSource: event.target.checked }))} />
                  </label>
                  <label className="field full">
                    <span>Tags</span>
                    <input value={serializeDelimitedList(selectedRoom.tags)} onChange={(event) => updateSelectedRoom((room) => ({ ...room, tags: parseDelimitedList(event.target.value) }))} />
                  </label>
                  <label className="field full">
                    <span>Shop inventory ids</span>
                    <textarea rows={2} value={serializeDelimitedList(selectedRoom.shopInventory)} onChange={(event) => updateSelectedRoom((room) => ({ ...room, shopInventory: parseDelimitedList(event.target.value) }))} />
                  </label>
                  <label className="field full">
                    <span>Metadata</span>
                    <textarea rows={3} value={serializeKeyValueLines(selectedRoom.metadata)} onChange={(event) => updateSelectedRoom((room) => ({ ...room, metadata: parseKeyValueLines(event.target.value) }))} />
                  </label>

                  <div className="field full">
                    <span>Connections</span>
                    <div className="operation-connection-grid">
                      {selectedFloor.rooms.filter((room) => room.id !== selectedRoom.id).map((room) => (
                        <label key={room.id} className="operation-connection-option">
                          <input type="checkbox" checked={selectedRoom.connections.includes(room.id)} onChange={() => toggleConnection(room.id)} />
                          <span>
                            {room.label}
                            <small>{roomRoleLabels[room.role]}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="operation-empty-state">Select a room from the sidebar or create a new one to edit theater room details.</div>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      <ChaosCoreDatabasePanel
        contentType="operation"
        currentDocument={normalizedDocument}
        buildBundle={(current) => buildOperationBundleForTarget(normalizeOperationDocument(current), "chaos-core")}
        onLoadEntry={(entry: LoadedChaosCoreDatabaseEntry) => loadDatabaseEntry(entry, setDocument)}
        subtitle="Publish operations into the Chaos Core repo and reopen those stored records here for theater layout, route, and balance revisions."
      />
    </>
  );
}
