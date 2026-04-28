import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP } from "../types/common";
import type { MapDocument, MapTile } from "../types/map";
import { isoNow } from "../utils/date";

function createTile(terrain: MapTile["terrain"], walkable = true): MapTile {
  return {
    terrain,
    walkable,
    wall: false,
    floor: true,
    metadata: {}
  };
}

export function createSampleMap(): MapDocument {
  const timestamp = isoNow();
  const width = 12;
  const height = 10;
  const tiles = Array.from({ length: height }, (_, rowIndex) =>
    Array.from({ length: width }, (_, columnIndex) => {
      if (rowIndex === 0 || rowIndex === height - 1 || columnIndex === 0 || columnIndex === width - 1) {
        return {
          ...createTile("stone", false),
          wall: true
        };
      }

      if (rowIndex === 4 && columnIndex > 2 && columnIndex < 9) {
        return createTile("road");
      }

      if (rowIndex > 6 && columnIndex > 7) {
        return createTile("water", false);
      }

      return createTile("grass");
    })
  );

  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: "oak_square",
    name: "Oak Square",
    width,
    height,
    tileSize: 48,
    tiles,
    objects: [
      {
        id: "courier_board",
        type: "station",
        sprite: "notice_board",
        label: "Courier Board",
        action: "open_board",
        x: 5,
        y: 3,
        width: 2,
        height: 1,
        metadata: {
          questId: "check_the_courier_board",
          dialogueId: "village_guide_intro"
        }
      }
    ],
    zones: [
      {
        id: "courier_board_interact",
        label: "COURIER BOARD",
        action: "custom",
        x: 5,
        y: 3,
        width: 2,
        height: 1,
        metadata: {
          handlerId: "open_board",
          questId: "check_the_courier_board",
          dialogueId: "village_guide_intro"
        }
      }
    ],
    sceneProps: [
      {
        id: "oak_square_lantern_cluster",
        kind: "light",
        label: "Lantern Cluster",
        x: 4,
        y: 2,
        width: 2,
        height: 1,
        layerId: "ground",
        elevation: 0,
        heightOffset: 0.2,
        rotationYaw: 20,
        scale: 1,
        modelKey: "lantern_cluster_a",
        modelAssetPath: "",
        materialKey: "warm_brass",
        sceneId: "",
        blocksMovement: false,
        providesCover: false,
        metadata: {
          lightProfile: "market_warm"
        }
      },
      {
        id: "oak_square_boarding_crates",
        kind: "cover",
        label: "Boarding Crates",
        x: 7,
        y: 4,
        width: 2,
        height: 1,
        layerId: "ground",
        elevation: 0,
        heightOffset: 0,
        rotationYaw: 0,
        scale: 1,
        modelKey: "crate_stack_a",
        modelAssetPath: "",
        materialKey: "weathered_wood",
        sceneId: "",
        blocksMovement: true,
        providesCover: true,
        metadata: {
          coverRating: "half"
        }
      }
    ],
    encounterVolumes: [
      {
        id: "oak_square_market_skirmish",
        label: "Market Skirmish",
        x: 6,
        y: 4,
        width: 3,
        height: 2,
        layerId: "ground",
        triggerMode: "on_enter",
        startsActive: true,
        playerEntryAnchorId: "player_start",
        fallbackReturnAnchorId: "player_start",
        extractionAnchorId: "",
        enemyAnchorTags: ["enemy", "field"],
        linkedFieldEnemyIds: [],
        tacticalEncounterId: "",
        clearBehavior: "clear_volume",
        metadata: {
          battleLabel: "Square Sweep"
        }
      }
    ],
    renderMode: "simple_3d",
    mapTags: ["settlement", "field"],
    regionTags: ["oak_square"],
    entryRules: [
      {
        id: "entry_from_floor_region",
        source: "floor_region",
        floorOrdinal: 0,
        regionId: "oak_square",
        label: "Enter Oak Square",
        entryPointId: "player_start",
        unlockRequirements: [],
        metadata: {}
      }
    ],
    spawnAnchors: [
      {
        id: "player_start",
        kind: "player",
        x: 2,
        y: 2,
        label: "Player Start",
        tags: ["default"],
        metadata: {}
      },
      {
        id: "enemy_lane",
        kind: "enemy",
        x: 8,
        y: 5,
        label: "Enemy Lane",
        tags: ["enemy", "field"],
        metadata: {}
      }
    ],
    settings3d: {
      renderMode: "simple_3d",
      wallHeight: 1,
      floorThickness: 0.2,
      previewCamera: "isometric",
      defaultSurface: "field",
      metadata: {}
    },
    metadata: {
      biome: "village",
      lighting: "morning"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
