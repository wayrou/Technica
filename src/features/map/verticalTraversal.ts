import type { MapDocument, MapVerticalConnector, MapVerticalLayerSystem, MapVerticalPoint } from "../../types/map";
import { getMapVerticalCell } from "./mapUtils";

function getVerticalLayer(vertical: MapVerticalLayerSystem | undefined, layerId: string) {
  return vertical?.layers.find((layer) => layer.id === layerId) ?? null;
}

export function getVerticalPointHeight(
  document: MapDocument,
  point: MapVerticalPoint,
): number | null {
  const vertical = document.vertical;
  const layer = getVerticalLayer(vertical, point.layerId);
  if (!layer) {
    return null;
  }

  const cell = getMapVerticalCell(layer, point.x, point.y);
  return layer.elevation + (cell?.heightOffset ?? 0);
}

export function hasVerticalTraversalSurface(
  document: MapDocument,
  point: MapVerticalPoint,
): boolean {
  const tile = document.tiles[point.y]?.[point.x];
  if (!tile || !tile.floor || tile.wall || !tile.walkable) {
    return false;
  }

  const vertical = document.vertical;
  if (!vertical) {
    return true;
  }

  const layer = getVerticalLayer(vertical, point.layerId);
  if (!layer) {
    return false;
  }

  if (point.layerId === vertical.defaultLayerId) {
    const cell = getMapVerticalCell(layer, point.x, point.y);
    return cell?.walkable !== false;
  }

  const cell = getMapVerticalCell(layer, point.x, point.y);
  return Boolean(cell && cell.walkable !== false);
}

export function describeVerticalConnector(
  document: MapDocument,
  connector: MapVerticalConnector,
): string {
  const fromHeight = getVerticalPointHeight(document, connector.from);
  const toHeight = getVerticalPointHeight(document, connector.to);
  const delta =
    fromHeight !== null && toHeight !== null
      ? `${toHeight > fromHeight ? "+" : ""}${(toHeight - fromHeight).toFixed(2)}z`
      : "height ?";
  return `${connector.kind} ${connector.from.layerId} ${connector.from.x},${connector.from.y} -> ${connector.to.layerId} ${connector.to.x},${connector.to.y} (${delta})`;
}

export function getVerticalConnectorAdvisories(
  document: MapDocument,
  connector: MapVerticalConnector,
): string[] {
  const advisories: string[] = [];
  const fromHeight = getVerticalPointHeight(document, connector.from);
  const toHeight = getVerticalPointHeight(document, connector.to);
  const sameEndpoint =
    connector.from.layerId === connector.to.layerId
    && connector.from.x === connector.to.x
    && connector.from.y === connector.to.y;
  const deltaHeight = fromHeight !== null && toHeight !== null ? toHeight - fromHeight : null;

  if (!hasVerticalTraversalSurface(document, connector.from)) {
    advisories.push("Source tile is not a valid traversable surface on its layer.");
  }

  if (!hasVerticalTraversalSurface(document, connector.to)) {
    advisories.push("Target tile is not a valid traversable surface on its layer.");
  }

  if (fromHeight === null || toHeight === null) {
    advisories.push("Connector height cannot be resolved because one endpoint layer is missing.");
  }

  if ((connector.kind === "stairs" || connector.kind === "ramp" || connector.kind === "ladder" || connector.kind === "elevator") && sameEndpoint) {
    advisories.push(`${connector.kind} should usually change tile or layer instead of linking a tile to itself.`);
  }

  if ((connector.kind === "stairs" || connector.kind === "ramp" || connector.kind === "ladder" || connector.kind === "elevator") && deltaHeight === 0) {
    advisories.push(`${connector.kind} does not change height. Double-check that this traversal really needs a vertical connector.`);
  }

  if (connector.kind === "drop" && connector.bidirectional) {
    advisories.push("Drop connectors are usually one-way.");
  }

  if ((connector.kind === "stairs" || connector.kind === "ramp" || connector.kind === "elevator") && !connector.bidirectional) {
    advisories.push(`${connector.kind} is usually two-way unless you want a one-way traversal gate.`);
  }

  if (connector.kind === "grapple" && deltaHeight !== null && deltaHeight < 0) {
    advisories.push("Grapple connector goes downward. Verify this should not be a drop or jump instead.");
  }

  return advisories;
}
