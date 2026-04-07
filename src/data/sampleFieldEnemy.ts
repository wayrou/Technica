import type { FieldEnemyDocument } from "../types/fieldEnemy";
import { isoNow } from "../utils/date";

function createBaseFieldEnemy(): FieldEnemyDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "field_enemy_new",
    name: "Untitled Field Enemy",
    description: "",
    kind: "light",
    spriteKey: "",
    stats: {
      maxHp: 6,
      speed: 90,
      aggroRange: 200,
      width: 40,
      height: 40,
    },
    spawn: {
      mapIds: [],
      floorOrdinals: [],
      spawnCount: 2,
    },
    drops: {
      wad: 0,
      resources: {
        metalScrap: 0,
        wood: 0,
        chaosShards: 0,
        steamComponents: 0,
      },
      items: [],
    },
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createBlankFieldEnemy(): FieldEnemyDocument {
  return createBaseFieldEnemy();
}

export function createSampleFieldEnemy(): FieldEnemyDocument {
  const timestamp = isoNow();

  return {
    ...createBaseFieldEnemy(),
    id: "field_enemy_brass_scuttler",
    name: "Brass Scuttler",
    description: "A light skirmisher that prowls collapsed survey corridors and stripped relay rooms.",
    spriteKey: "enemy_brass_scuttler",
    stats: {
      maxHp: 8,
      speed: 105,
      aggroRange: 224,
      width: 42,
      height: 42,
    },
    spawn: {
      mapIds: ["game:glass_harbor_ruins"],
      floorOrdinals: [1, 2],
      spawnCount: 3,
    },
    drops: {
      wad: 6,
      resources: {
        metalScrap: 1,
        wood: 0,
        chaosShards: 0,
        steamComponents: 0,
      },
      items: [
        {
          id: "consumable_field_ration",
          quantity: 1,
          chance: 0.2,
        },
      ],
    },
    metadata: {
      faction: "scavenger",
      behavior: "rushdown",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
