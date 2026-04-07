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

  return issues;
}
