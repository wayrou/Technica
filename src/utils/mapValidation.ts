import type { ValidationIssue } from "../types/common";
import type { MapDocument } from "../types/map";

function isWithinBounds(x: number, y: number, width: number, height: number) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function getMapTile(document: MapDocument, x: number, y: number) {
  return document.tiles[y]?.[x] ?? null;
}

const ZONE_ROUTE_METADATA_KEYS = [
  "fieldMapId",
  "technicaFieldMapId",
  "targetImportedMapId",
  "targetMapId",
  "doorId",
  "portalId",
  "fieldMapRouteSource",
  "routeSource",
  "entryPointId",
  "fieldMapEntryPointId",
  "spawnAnchorId"
];

function readMetadataText(metadata: Record<string, string> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasRouteMetadata(metadata: Record<string, string> | undefined) {
  return ZONE_ROUTE_METADATA_KEYS.some((key) => readMetadataText(metadata, key));
}

function getZoneRouteTargetMapId(metadata: Record<string, string> | undefined) {
  return (
    readMetadataText(metadata, "fieldMapId") ||
    readMetadataText(metadata, "technicaFieldMapId") ||
    readMetadataText(metadata, "targetImportedMapId") ||
    readMetadataText(metadata, "targetMapId")
  );
}

function getZoneRouteSource(metadata: Record<string, string> | undefined) {
  const explicitSource =
    readMetadataText(metadata, "fieldMapRouteSource") ||
    readMetadataText(metadata, "routeSource");

  if (explicitSource === "door" || explicitSource === "portal") {
    return explicitSource;
  }

  if (readMetadataText(metadata, "portalId")) {
    return "portal";
  }

  if (readMetadataText(metadata, "doorId")) {
    return "door";
  }

  return "";
}

function getZoneRouteId(metadata: Record<string, string> | undefined, source: string) {
  return source === "portal" ? readMetadataText(metadata, "portalId") : readMetadataText(metadata, "doorId");
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
  const zoneRouteIds = new Set<string>();
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

    if (hasRouteMetadata(zone.metadata)) {
      const targetMapId = getZoneRouteTargetMapId(zone.metadata);
      const source = getZoneRouteSource(zone.metadata);
      const routeId = getZoneRouteId(zone.metadata, source);

      if (!targetMapId) {
        issues.push({
          severity: "warning",
          field: "zones",
          message: `Route zone '${zone.id}' should include a target field map id.`
        });
      }

      if (!source) {
        issues.push({
          severity: "warning",
          field: "zones",
          message: `Route zone '${zone.id}' should be marked as a door or portal route.`
        });
      }

      if (source === "door" && !routeId) {
        issues.push({
          severity: "warning",
          field: "zones",
          message: `Door route zone '${zone.id}' should include a door id.`
        });
      }

      if (source === "portal" && !routeId) {
        issues.push({
          severity: "warning",
          field: "zones",
          message: `Portal route zone '${zone.id}' should include a portal id.`
        });
      }

      if (source && routeId) {
        const routeKey = `${source}:${routeId.trim().toLowerCase()}`;
        if (zoneRouteIds.has(routeKey)) {
          issues.push({
            severity: "warning",
            field: "zones",
            message: `Multiple route zones use ${source} id '${routeId}'. Door and portal ids should be unique per source map.`
          });
        }
        zoneRouteIds.add(routeKey);
      }
    }
  });

  const scenePropIds = new Set<string>();
  document.sceneProps?.forEach((prop) => {
    if (!prop.id.trim()) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: "Every 3D prop needs an id."
      });
    }

    if (scenePropIds.has(prop.id)) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: `3D prop id '${prop.id}' is duplicated.`
      });
    }
    scenePropIds.add(prop.id);

    if (!isWithinBounds(prop.x, prop.y, document.width, document.height)) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: `3D prop '${prop.id}' starts outside the map bounds.`
      });
    }

    if (prop.width <= 0 || prop.height <= 0) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: `3D prop '${prop.id}' must be at least 1x1 tiles.`
      });
    }

    if (!Number.isFinite(prop.scale) || prop.scale <= 0) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: `3D prop '${prop.id}' needs a scale greater than 0.`
      });
    }

    if (!Number.isFinite(prop.elevation) || !Number.isFinite(prop.heightOffset) || !Number.isFinite(prop.rotationYaw)) {
      issues.push({
        severity: "error",
        field: "sceneProps",
        message: `3D prop '${prop.id}' has invalid elevation, offset, or rotation values.`
      });
    }

    if (!prop.modelKey.trim() && !prop.modelAssetPath.trim() && !prop.sceneId.trim()) {
      issues.push({
        severity: "warning",
        field: "sceneProps",
        message: `3D prop '${prop.id}' should include a model key, model asset path, or scene id.`
      });
    }

    if (prop.blocksMovement) {
      const overlapsWalkableTile = Array.from({ length: Math.max(1, prop.height) }, (_, yOffset) =>
        Array.from({ length: Math.max(1, prop.width) }, (_, xOffset) => ({ x: prop.x + xOffset, y: prop.y + yOffset }))
      )
        .flat()
        .some(({ x, y }) => {
          const tile = getMapTile(document, x, y);
          return tile && tile.walkable && !tile.wall;
        });

      if (overlapsWalkableTile) {
        issues.push({
          severity: "warning",
          field: "sceneProps",
          message: `3D prop '${prop.id}' blocks movement but overlaps walkable floor. Consider blocking those tiles or disabling movement blocking.`
        });
      }
    }
  });

  const encounterVolumeIds = new Set<string>();
  document.encounterVolumes?.forEach((volume) => {
    if (!volume.id.trim()) {
      issues.push({
        severity: "error",
        field: "encounterVolumes",
        message: "Every encounter volume needs an id."
      });
    }

    if (encounterVolumeIds.has(volume.id)) {
      issues.push({
        severity: "error",
        field: "encounterVolumes",
        message: `Encounter volume id '${volume.id}' is duplicated.`
      });
    }
    encounterVolumeIds.add(volume.id);

    if (!isWithinBounds(volume.x, volume.y, document.width, document.height)) {
      issues.push({
        severity: "error",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' starts outside the map bounds.`
      });
    }

    if (volume.width <= 0 || volume.height <= 0) {
      issues.push({
        severity: "error",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' must be at least 1x1 tiles.`
      });
    }

    if (!volume.playerEntryAnchorId.trim()) {
      issues.push({
        severity: "warning",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' should point at a player entry anchor.`
      });
    } else if (!(document.spawnAnchors ?? []).some((anchor) => anchor.id === volume.playerEntryAnchorId)) {
      issues.push({
        severity: "warning",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' references missing player entry anchor '${volume.playerEntryAnchorId}'.`
      });
    }

    if (volume.fallbackReturnAnchorId.trim() && !(document.spawnAnchors ?? []).some((anchor) => anchor.id === volume.fallbackReturnAnchorId)) {
      issues.push({
        severity: "warning",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' references missing return anchor '${volume.fallbackReturnAnchorId}'.`
      });
    }

    if (volume.extractionAnchorId.trim() && !(document.spawnAnchors ?? []).some((anchor) => anchor.id === volume.extractionAnchorId)) {
      issues.push({
        severity: "warning",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' references missing extraction anchor '${volume.extractionAnchorId}'.`
      });
    }

    if (volume.enemyAnchorTags.length === 0) {
      issues.push({
        severity: "warning",
        field: "encounterVolumes",
        message: `Encounter volume '${volume.id}' should include enemy anchor tags so Chaos Core can stage hostiles predictably.`
      });
    }
  });

  const spawnAnchorIds = new Set<string>();
  const spawnAnchorKindById = new Map<string, string>();
  document.spawnAnchors?.forEach((anchor) => {
    if (!anchor.id.trim()) {
      issues.push({
        severity: "error",
        field: "spawnAnchors",
        message: "Every spawn anchor needs an id."
      });
    }

    if (spawnAnchorIds.has(anchor.id)) {
      issues.push({
        severity: "error",
        field: "spawnAnchors",
        message: `Spawn anchor id '${anchor.id}' is duplicated.`
      });
    }
    spawnAnchorIds.add(anchor.id);
    spawnAnchorKindById.set(anchor.id, anchor.kind);

    if (!isWithinBounds(anchor.x, anchor.y, document.width, document.height)) {
      issues.push({
        severity: "error",
        field: "spawnAnchors",
        message: `Spawn anchor '${anchor.id}' is outside the map bounds.`
      });
    } else {
      const anchorTile = getMapTile(document, anchor.x, anchor.y);
      if (anchorTile && (!anchorTile.walkable || anchorTile.wall)) {
        issues.push({
          severity: "warning",
          field: "spawnAnchors",
          message: `Spawn anchor '${anchor.id}' is on a blocked tile. Entry routes should land on walkable floor.`
        });
      }
    }
  });

  const entryRuleIds = new Set<string>();
  document.entryRules?.forEach((entryRule) => {
    if (!entryRule.id.trim()) {
      issues.push({
        severity: "error",
        field: "entryRules",
        message: "Every entry rule needs an id."
      });
    }

    if (entryRuleIds.has(entryRule.id)) {
      issues.push({
        severity: "error",
        field: "entryRules",
        message: `Entry rule id '${entryRule.id}' is duplicated.`
      });
    }
    entryRuleIds.add(entryRule.id);

    if (!entryRule.entryPointId.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Entry rule '${entryRule.id}' should point at a spawn anchor.`
      });
    } else if (!spawnAnchorIds.has(entryRule.entryPointId)) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Entry rule '${entryRule.id}' points to missing spawn anchor '${entryRule.entryPointId}'.`
      });
    } else {
      const targetKind = spawnAnchorKindById.get(entryRule.entryPointId);
      if (targetKind === "enemy" || targetKind === "npc") {
        issues.push({
          severity: "warning",
          field: "entryRules",
          message: `Entry rule '${entryRule.id}' points to a ${targetKind} anchor. Player entries usually target player, portal exit, or generic anchors.`
        });
      }
    }

    if (entryRule.source === "floor_region" && entryRule.floorOrdinal !== undefined && entryRule.floorOrdinal < 0) {
      issues.push({
        severity: "error",
        field: "entryRules",
        message: `Entry rule '${entryRule.id}' has an invalid floor number.`
      });
    }

    if (entryRule.source === "floor_region" && entryRule.floorOrdinal === undefined && !entryRule.regionId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Floor-region entry rule '${entryRule.id}' should include a floor number or region id.`
      });
    }

    if (entryRule.source === "atlas_theater" && !entryRule.theaterScreenId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Atlas theater entry rule '${entryRule.id}' should include the target theater room/screen id.`
      });
    }

    if (entryRule.source === "door" && !entryRule.doorId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Door entry rule '${entryRule.id}' should include the source door id.`
      });
    }

    if (entryRule.source === "door" && !entryRule.sourceMapId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Door entry rule '${entryRule.id}' should include the source map id so Chaos Core knows which door leads here.`
      });
    }

    if (entryRule.source === "portal" && !entryRule.portalId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Portal entry rule '${entryRule.id}' should include the source portal id.`
      });
    }

    if (entryRule.source === "portal" && !entryRule.sourceMapId?.trim()) {
      issues.push({
        severity: "warning",
        field: "entryRules",
        message: `Portal entry rule '${entryRule.id}' should include the source map id so Chaos Core knows which portal leads here.`
      });
    }
  });

  if ((document.renderMode === "simple_3d" || document.renderMode === "bespoke_3d") && (document.entryRules?.length ?? 0) === 0) {
    issues.push({
      severity: "warning",
      field: "entryRules",
      message: "3D maps should usually have at least one entry route so they can be reached from theater, floor, door, or portal flows."
    });
  }

  if ((document.renderMode === "simple_3d" || document.renderMode === "bespoke_3d") && !document.vertical) {
    issues.push({
      severity: "warning",
      field: "renderMode",
      message: "3D maps can export from flat 2D data, but vertical layers give Chaos Core better height and traversal hints."
    });
  }

  if ((document.renderMode ?? document.settings3d?.renderMode) === "classic_2d" && (document.sceneProps?.length ?? 0) > 0) {
    issues.push({
      severity: "warning",
      field: "sceneProps",
      message: "This map has authored 3D props, but the render mode is still Classic 2D. Switch to Simple 3D or Bespoke 3D to use them fully."
    });
  }

  if ((document.renderMode === "simple_3d" || document.renderMode === "bespoke_3d") && (document.encounterVolumes?.length ?? 0) === 0) {
    issues.push({
      severity: "warning",
      field: "encounterVolumes",
      message: "3D field maps work best with at least one authored encounter volume or explicit safe traversal plan."
    });
  }

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
