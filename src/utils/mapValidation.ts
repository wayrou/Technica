import type { ValidationIssue } from "../types/common";
import type { MapDocument } from "../types/map";

function isWithinBounds(x: number, y: number, width: number, height: number) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function validateMapDocument(document: MapDocument) {
  const issues: ValidationIssue[] = [];

  if (!document.id.trim()) {
    issues.push({
      severity: "error",
      field: "id",
      message: "Map id is required."
    });
  }

  if (!document.name.trim()) {
    issues.push({
      severity: "error",
      field: "name",
      message: "Map name is required."
    });
  }

  if (document.width <= 0 || document.height <= 0) {
    issues.push({
      severity: "error",
      message: "Map width and height must be greater than 0."
    });
  }

  if (document.tiles.length !== document.height) {
    issues.push({
      severity: "error",
      message: "Tile rows do not match the configured map height."
    });
  }

  document.tiles.forEach((row, rowIndex) => {
    if (row.length !== document.width) {
      issues.push({
        severity: "error",
        message: `Tile row ${rowIndex} does not match the configured map width.`
      });
    }

    row.forEach((tile, columnIndex) => {
      if (tile.wall && tile.walkable) {
        issues.push({
          severity: "warning",
          message: `Tile ${columnIndex},${rowIndex} is marked as both wall and walkable.`
        });
      }
    });
  });

  const objectIds = new Set<string>();
  document.objects.forEach((item) => {
    if (objectIds.has(item.id)) {
      issues.push({
        severity: "error",
        message: `Map object id '${item.id}' is duplicated.`
      });
    }
    objectIds.add(item.id);

    if (!isWithinBounds(item.x, item.y, document.width, document.height)) {
      issues.push({
        severity: "error",
        message: `Object '${item.id}' starts outside the map bounds.`
      });
    }

    if (item.type.trim().toLowerCase() === "enemy") {
      const hp = Number(item.metadata.hp ?? "3");
      const speed = Number(item.metadata.speed ?? "90");

      if (!Number.isFinite(hp) || hp <= 0) {
        issues.push({
          severity: "warning",
          message: `Enemy '${item.id}' should have an HP value greater than 0.`
        });
      }

      if (!Number.isFinite(speed) || speed <= 0) {
        issues.push({
          severity: "warning",
          message: `Enemy '${item.id}' should have a movement speed greater than 0.`
        });
      }
    }
  });

  const zoneIds = new Set<string>();
  document.zones.forEach((zone) => {
    if (zoneIds.has(zone.id)) {
      issues.push({
        severity: "error",
        message: `Map zone id '${zone.id}' is duplicated.`
      });
    }
    zoneIds.add(zone.id);

    if (!isWithinBounds(zone.x, zone.y, document.width, document.height)) {
      issues.push({
        severity: "error",
        message: `Zone '${zone.id}' starts outside the map bounds.`
      });
    }
  });

  if (document.vertical) {
    if (document.vertical.elevationStep <= 0 || !Number.isFinite(document.vertical.elevationStep)) {
      issues.push({
        severity: "error",
        field: "vertical.elevationStep",
        message: "Vertical layer elevation step must be greater than 0."
      });
    }

    if (document.vertical.layers.length === 0) {
      issues.push({
        severity: "error",
        field: "vertical.layers",
        message: "Vertical layer mode needs at least one layer."
      });
    }

    const layerIds = new Set<string>();
    document.vertical.layers.forEach((layer) => {
      if (!layer.id.trim()) {
        issues.push({
          severity: "error",
          field: "vertical.layers",
          message: "Every vertical layer needs an id."
        });
      }

      if (layerIds.has(layer.id)) {
        issues.push({
          severity: "error",
          field: "vertical.layers",
          message: `Vertical layer id '${layer.id}' is duplicated.`
        });
      }
      layerIds.add(layer.id);

      if (!Number.isFinite(layer.elevation)) {
        issues.push({
          severity: "error",
          field: "vertical.layers",
          message: `Vertical layer '${layer.id}' has an invalid elevation.`
        });
      }

      const cellKeys = new Set<string>();
      layer.cells.forEach((cell) => {
        const key = `${cell.x},${cell.y}`;
        if (cellKeys.has(key)) {
          issues.push({
            severity: "error",
            field: "vertical.layers.cells",
            message: `Vertical layer '${layer.id}' has duplicate cell data at ${key}.`
          });
        }
        cellKeys.add(key);

        if (!isWithinBounds(cell.x, cell.y, document.width, document.height)) {
          issues.push({
            severity: "error",
            field: "vertical.layers.cells",
            message: `Vertical layer '${layer.id}' has a cell outside the map bounds at ${key}.`
          });
        }

        if (!Number.isFinite(cell.heightOffset)) {
          issues.push({
            severity: "error",
            field: "vertical.layers.cells",
            message: `Vertical layer '${layer.id}' has an invalid height offset at ${key}.`
          });
        }
      });
    });

    if (!layerIds.has(document.vertical.defaultLayerId)) {
      issues.push({
        severity: "error",
        field: "vertical.defaultLayerId",
        message: `Default vertical layer '${document.vertical.defaultLayerId}' does not exist.`
      });
    }

    const connectorIds = new Set<string>();
    document.vertical.connectors.forEach((connector) => {
      if (connectorIds.has(connector.id)) {
        issues.push({
          severity: "error",
          field: "vertical.connectors",
          message: `Vertical connector id '${connector.id}' is duplicated.`
        });
      }
      connectorIds.add(connector.id);

      if (!layerIds.has(connector.from.layerId)) {
        issues.push({
          severity: "error",
          field: "vertical.connectors",
          message: `Vertical connector '${connector.id}' references missing source layer '${connector.from.layerId}'.`
        });
      }

      if (!layerIds.has(connector.to.layerId)) {
        issues.push({
          severity: "error",
          field: "vertical.connectors",
          message: `Vertical connector '${connector.id}' references missing target layer '${connector.to.layerId}'.`
        });
      }

      if (!isWithinBounds(connector.from.x, connector.from.y, document.width, document.height)) {
        issues.push({
          severity: "error",
          field: "vertical.connectors",
          message: `Vertical connector '${connector.id}' starts outside the map bounds.`
        });
      }

      if (!isWithinBounds(connector.to.x, connector.to.y, document.width, document.height)) {
        issues.push({
          severity: "error",
          field: "vertical.connectors",
          message: `Vertical connector '${connector.id}' ends outside the map bounds.`
        });
      }

      if (
        connector.from.layerId === connector.to.layerId &&
        connector.from.x === connector.to.x &&
        connector.from.y === connector.to.y
      ) {
        issues.push({
          severity: "warning",
          field: "vertical.connectors",
          message: `Vertical connector '${connector.id}' links a tile to itself.`
        });
      }
    });
  }

  return issues;
}
