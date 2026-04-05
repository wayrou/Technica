import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { parseDialogueSource } from "../src/utils/dialogueParser";
import { isoNow } from "../src/utils/date";
import { runtimeId } from "../src/utils/id";

export type ContentType =
  | "dialogue"
  | "quest"
  | "map"
  | "npc"
  | "item"
  | "gear"
  | "card"
  | "unit"
  | "operation"
  | "class"
  | "schema";

type EntryOrigin = "game" | "technica";

export type DatabaseEntrySummary = {
  entryKey: string;
  contentId: string;
  title: string;
  runtimeFile: string;
  sourceFile?: string;
  origin: EntryOrigin;
  summaryData?: Record<string, unknown>;
};

export type LoadedDatabaseEntry = DatabaseEntrySummary & {
  runtimeContent: string;
  sourceContent?: string;
  editorContent?: string;
};

type SnapshotEntry = DatabaseEntrySummary & {
  runtimeData: unknown;
  editorData?: unknown;
};

type GeneratedRecord = {
  entryKey: string;
  contentId: string;
  title: string;
  runtimeFile: string;
  runtimeContent: string;
  sourceFile?: string;
  sourceContent?: string;
  readmeFile?: string;
};

type DisabledRecord = {
  id: string;
  contentType: ContentType;
  origin: "game";
  disabledAt: string;
};

type RuntimeCardShape = {
  id: string;
  name: string;
  description: string;
  cardType: "core" | "class" | "equipment" | "gambit";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  category: "attack" | "defense" | "utility" | "mobility" | "buff" | "debuff" | "steam" | "chaos";
  strainCost: number;
  targetType: "enemy" | "self" | "tile" | "ally";
  range: number;
  damage?: number;
  effects: Array<Record<string, unknown>>;
  sourceClassId?: string;
  sourceEquipmentId?: string;
  metadata?: Record<string, unknown>;
};

type RuntimeItemShape = {
  id: string;
  name: string;
  description: string;
  kind: "resource" | "equipment" | "consumable";
  stackable: boolean;
  quantity: number;
  massKg: number;
  bulkBu: number;
  powerW: number;
  metadata?: Record<string, unknown>;
};

type RuntimeNpcShape = {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  routeMode: "fixed" | "random" | "none";
  routePoints?: Array<{ id: string; x: number; y: number }>;
  dialogueId?: string;
  portraitKey?: string;
  spriteKey?: string;
  portraitPath?: string;
  spritePath?: string;
  metadata?: Record<string, unknown>;
};

type TsExpressionMarker = {
  __technicaTsExpression: string;
};

export const CONTENT_TYPES: ContentType[] = [
  "dialogue",
  "quest",
  "map",
  "npc",
  "item",
  "gear",
  "card",
  "unit",
  "operation",
  "class",
  "schema"
];

const CONTENT_EXTENSIONS: Record<ContentType, string> = {
  dialogue: ".dialogue.json",
  quest: ".quest.json",
  map: ".fieldmap.json",
  npc: ".npc.json",
  item: ".item.json",
  gear: ".gear.json",
  card: ".card.json",
  unit: ".unit.json",
  operation: ".operation.json",
  class: ".class.json",
  schema: ".schema.json"
};

const BUILT_IN_MAP_IDS = ["base_camp", "free_zone_1", "quarters"];

export function installNodeStubs() {
  const root = globalThis as Record<string, unknown>;

  if (!("window" in root)) {
    root.window = root;
  }

  if (!("localStorage" in root)) {
    const storage = new Map<string, string>();
    root.localStorage = {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    };
  }

  if (!("document" in root)) {
    root.document = {
      documentElement: {
        style: {
          setProperty() {
            return undefined;
          }
        },
        classList: {
          add() {
            return undefined;
          },
          remove() {
            return undefined;
          }
        }
      }
    };
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function tsExpression(expression: string): TsExpressionMarker {
  return {
    __technicaTsExpression: expression
  };
}

function isTsExpressionMarker(value: unknown): value is TsExpressionMarker {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 1 &&
      typeof (value as Record<string, unknown>).__technicaTsExpression === "string"
  );
}

function sanitizeJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function humanizeId(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function relativeToRepo(repoPath: string, targetPath: string) {
  return path.relative(repoPath, targetPath).replace(/\\/g, "/");
}

function toKeyValueRecord(record: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      ])
  );
}

function createDocumentBase() {
  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica" as const,
    createdAt: isoNow(),
    updatedAt: isoNow()
  };
}

function normalizeQuestObjectiveType(type: string) {
  switch (type) {
    case "talk_to_npc":
      return "talk" as const;
    case "reach_location":
      return "visit" as const;
    case "kill_enemies":
    case "kill_specific_enemy":
    case "clear_node":
    case "complete_battle":
      return "defeat" as const;
    case "collect_item":
    case "collect_resource":
    case "spend_wad":
    case "craft_item":
      return "collect" as const;
    default:
      return "custom" as const;
  }
}

function mapRuntimeTileType(type: string) {
  switch (type) {
    case "grass":
      return { terrain: "grass", wall: false, floor: true, metadata: {} };
    case "stone":
      return { terrain: "stone", wall: false, floor: true, metadata: {} };
    case "dirt":
      return { terrain: "road", wall: false, floor: true, metadata: { visualTerrain: "dirt" } };
    case "floor":
      return { terrain: "stone", wall: false, floor: true, metadata: { runtimeType: "floor" } };
    case "wall":
      return { terrain: "stone", wall: true, floor: false, metadata: { runtimeType: "wall" } };
    default:
      return { terrain: "grass", wall: false, floor: true, metadata: { runtimeType: type } };
  }
}

function runtimeMapToEditorDocument(runtimeMap: any) {
  return {
    ...createDocumentBase(),
    id: runtimeMap.id,
    name: runtimeMap.name,
    width: runtimeMap.width,
    height: runtimeMap.height,
    tileSize: 64,
    tiles: runtimeMap.tiles.map((row: any[]) =>
      row.map((tile) => {
        const mapped = mapRuntimeTileType(tile.type);
        return {
          terrain: mapped.terrain,
          walkable: Boolean(tile.walkable),
          wall: mapped.wall,
          floor: mapped.floor,
          metadata: toKeyValueRecord({
            ...mapped.metadata,
            ...(tile.metadata ?? {})
          })
        };
      })
    ),
    objects: (runtimeMap.objects ?? []).map((object: any) => ({
      id: object.id,
      type: object.type,
      sprite: object.sprite ?? "",
      label: object.metadata?.name ?? object.label ?? humanizeId(object.id),
      action: object.metadata?.action ?? object.type ?? "interact",
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      metadata: toKeyValueRecord({
        ...(object.metadata ?? {})
      })
    })),
    zones: (runtimeMap.interactionZones ?? []).map((zone: any) => ({
      id: zone.id,
      label: zone.label,
      action: zone.action,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      metadata: toKeyValueRecord({
        ...(zone.metadata ?? {})
      })
    })),
    metadata: toKeyValueRecord(runtimeMap.metadata)
  };
}

function runtimeQuestToEditorDocument(runtimeQuest: any) {
  const metadata = runtimeQuest.metadata ?? {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags.map(String) : [];
  const prerequisites = Array.isArray(metadata.prerequisites) ? metadata.prerequisites.map(String) : [];
  const followUpQuestIds = Array.isArray(metadata.followUpQuestIds) ? metadata.followUpQuestIds.map(String) : [];

  const objectives = (runtimeQuest.objectives ?? []).map((objective: any) => ({
    id: objective.id,
    title: objective.description || humanizeId(objective.id),
    description: objective.description || "",
    type: normalizeQuestObjectiveType(String(objective.type ?? "")),
    target: String(objective.target ?? ""),
    optional: Boolean(objective.optional),
    targetCount: Number(objective.required ?? 1),
    notes: objective.current ? `Current runtime progress: ${objective.current}` : ""
  }));

  const rewards: Array<Record<string, unknown>> = [];
  if (runtimeQuest.rewards?.wad) {
    rewards.push({ id: "reward_wad", type: "currency", label: "WAD", amount: runtimeQuest.rewards.wad, value: "wad", metadata: {} });
  }
  if (runtimeQuest.rewards?.xp) {
    rewards.push({ id: "reward_xp", type: "xp", label: "XP", amount: runtimeQuest.rewards.xp, value: "party_xp", metadata: {} });
  }
  for (const item of runtimeQuest.rewards?.items ?? []) {
    rewards.push({
      id: `reward_item_${runtimeId(item.id, "item")}`,
      type: "item",
      label: item.id,
      amount: Number(item.quantity ?? 1),
      value: item.id,
      metadata: {}
    });
  }
  for (const [resourceId, amount] of Object.entries(runtimeQuest.rewards?.resources ?? {})) {
    rewards.push({
      id: `reward_resource_${runtimeId(resourceId, resourceId)}`,
      type: "custom",
      label: humanizeId(resourceId),
      amount: Number(amount ?? 0),
      value: resourceId,
      metadata: { rewardKind: "resource" }
    });
  }
  for (const cardId of runtimeQuest.rewards?.cards ?? []) {
    rewards.push({
      id: `reward_card_${runtimeId(cardId, "card")}`,
      type: "custom",
      label: cardId,
      amount: 1,
      value: cardId,
      metadata: { rewardKind: "card" }
    });
  }
  for (const gearId of runtimeQuest.rewards?.equipment ?? []) {
    rewards.push({
      id: `reward_gear_${runtimeId(gearId, "gear")}`,
      type: "custom",
      label: gearId,
      amount: 1,
      value: gearId,
      metadata: { rewardKind: "gear" }
    });
  }
  for (const recipeId of runtimeQuest.rewards?.recipes ?? []) {
    rewards.push({
      id: `reward_recipe_${runtimeId(recipeId, "recipe")}`,
      type: "custom",
      label: recipeId,
      amount: 1,
      value: recipeId,
      metadata: { rewardKind: "recipe" }
    });
  }
  if (runtimeQuest.rewards?.unitRecruit) {
    rewards.push({
      id: `reward_unit_${runtimeId(runtimeQuest.rewards.unitRecruit, "unit")}`,
      type: "custom",
      label: runtimeQuest.rewards.unitRecruit,
      amount: 1,
      value: runtimeQuest.rewards.unitRecruit,
      metadata: { rewardKind: "unitRecruit" }
    });
  }

  return {
    ...createDocumentBase(),
    id: runtimeQuest.id,
    title: runtimeQuest.title,
    summary: typeof metadata.summary === "string" ? metadata.summary : runtimeQuest.description,
    description: runtimeQuest.description,
    questType: runtimeQuest.questType,
    difficultyTier: runtimeQuest.difficultyTier,
    status: runtimeQuest.status ?? "available",
    tags,
    prerequisites,
    followUpQuestIds,
    rewards,
    states: [
      {
        id: "state_active",
        label: "Active",
        description: "Quest is in progress.",
        terminal: false,
        kind: "active"
      },
      {
        id: "state_success",
        label: "Success",
        description: "Quest completed successfully.",
        terminal: true,
        kind: "success"
      },
      {
        id: "state_failure",
        label: "Failure",
        description: "Quest failed.",
        terminal: true,
        kind: "failure"
      }
    ],
    objectives,
    steps: [
      {
        id: "step_main",
        title: "Complete objectives",
        summary: runtimeQuest.description,
        objectiveIds: objectives.map((objective: any) => objective.id),
        successStateId: "state_success",
        branches: []
      }
    ],
    initialStepId: "step_main",
    successStateId: "state_success",
    failureStateId: "state_failure",
    metadata: toKeyValueRecord(
      Object.fromEntries(
        Object.entries(metadata).filter(([key]) => !["summary", "tags", "prerequisites", "followUpQuestIds"].includes(key))
      )
    )
  };
}

function runtimeItemToEditorDocument(runtimeItem: RuntimeItemShape) {
  return {
    ...createDocumentBase(),
    id: runtimeItem.id,
    name: runtimeItem.name,
    description: runtimeItem.description,
    kind: runtimeItem.kind,
    stackable: runtimeItem.stackable,
    quantity: runtimeItem.quantity,
    massKg: runtimeItem.massKg,
    bulkBu: runtimeItem.bulkBu,
    powerW: runtimeItem.powerW,
    metadata: toKeyValueRecord(runtimeItem.metadata)
  };
}

function runtimeNpcToEditorDocument(runtimeNpc: RuntimeNpcShape) {
  return {
    ...createDocumentBase(),
    id: runtimeNpc.id,
    name: runtimeNpc.name,
    mapId: runtimeNpc.mapId,
    tileX: Number(runtimeNpc.x ?? 0),
    tileY: Number(runtimeNpc.y ?? 0),
    routeMode: runtimeNpc.routeMode ?? "none",
    routePoints: (runtimeNpc.routePoints ?? []).map((point) => ({
      id: point.id,
      x: Number(point.x ?? 0),
      y: Number(point.y ?? 0)
    })),
    dialogueId: runtimeNpc.dialogueId ?? runtimeNpc.id,
    portraitKey: runtimeNpc.portraitKey ?? "",
    spriteKey: runtimeNpc.spriteKey ?? "",
    metadata: toKeyValueRecord({
      ...(runtimeNpc.metadata ?? {}),
      ...(runtimeNpc.portraitPath ? { portraitPath: runtimeNpc.portraitPath } : {}),
      ...(runtimeNpc.spritePath ? { spritePath: runtimeNpc.spritePath } : {})
    })
  };
}

function runtimeGearToEditorDocument(runtimeGear: any) {
  return {
    ...createDocumentBase(),
    id: runtimeGear.id,
    name: runtimeGear.name,
    description: runtimeGear.description ?? "",
    slot: runtimeGear.slot,
    weaponType: runtimeGear.weaponType,
    isMechanical: Boolean(runtimeGear.isMechanical),
    stats: {
      atk: Number(runtimeGear.stats?.atk ?? 0),
      def: Number(runtimeGear.stats?.def ?? 0),
      agi: Number(runtimeGear.stats?.agi ?? 0),
      acc: Number(runtimeGear.stats?.acc ?? 0),
      hp: Number(runtimeGear.stats?.hp ?? 0)
    },
    cardsGranted: [...(runtimeGear.cardsGranted ?? [])],
    moduleSlots: Number(runtimeGear.moduleSlots ?? 0),
    attachedModules: [...(runtimeGear.attachedModules ?? [])],
    wear: Number(runtimeGear.wear ?? 0),
    inventory: {
      massKg: Number(runtimeGear.inventory?.massKg ?? 0),
      bulkBu: Number(runtimeGear.inventory?.bulkBu ?? 0),
      powerW: Number(runtimeGear.inventory?.powerW ?? 0),
      startingOwned: runtimeGear.inventory?.startingOwned ?? true
    },
    metadata: toKeyValueRecord({
      ...(runtimeGear.metadata ?? {}),
      ...(runtimeGear.iconPath ? { iconPath: runtimeGear.iconPath } : {})
    })
  };
}

function runtimeCardToEditorDocument(runtimeCard: RuntimeCardShape) {
  return {
    ...createDocumentBase(),
    id: runtimeCard.id,
    name: runtimeCard.name,
    description: runtimeCard.description,
    cardType: runtimeCard.cardType,
    rarity: runtimeCard.rarity,
    category: runtimeCard.category,
    strainCost: runtimeCard.strainCost,
    targetType: runtimeCard.targetType,
    range: runtimeCard.range,
    damage: runtimeCard.damage,
    effects: (runtimeCard.effects ?? []).map((effect) => ({
      type: String(effect.type ?? ""),
      amount: typeof effect.amount === "number" ? effect.amount : undefined,
      duration: typeof effect.duration === "number" ? effect.duration : undefined,
      stat: typeof effect.stat === "string" ? effect.stat : undefined,
      tiles: typeof effect.tiles === "number" ? effect.tiles : undefined
    })),
    sourceClassId: runtimeCard.sourceClassId,
    sourceEquipmentId: runtimeCard.sourceEquipmentId,
    metadata: toKeyValueRecord(runtimeCard.metadata)
  };
}

function runtimeClassToEditorDocument(runtimeClass: any) {
  return {
    ...createDocumentBase(),
    id: runtimeClass.id,
    name: runtimeClass.name,
    description: runtimeClass.description,
    tier: runtimeClass.tier,
    baseStats: {
      maxHp: Number(runtimeClass.baseStats?.maxHp ?? 1),
      atk: Number(runtimeClass.baseStats?.atk ?? 0),
      def: Number(runtimeClass.baseStats?.def ?? 0),
      agi: Number(runtimeClass.baseStats?.agi ?? 0),
      acc: Number(runtimeClass.baseStats?.acc ?? 0)
    },
    weaponTypes: [...(runtimeClass.weaponTypes ?? [])],
    unlockConditions: (runtimeClass.unlockConditions ?? []).map((condition: any) => ({
      type: condition.type,
      requiredClassId: condition.requiredClass ?? condition.requiredClassId,
      requiredRank: condition.requiredRank,
      description: condition.description
    })),
    innateAbility: runtimeClass.innateAbility ?? "",
    metadata: toKeyValueRecord(runtimeClass.metadata)
  };
}

function createSchemaWalletFromPartialWallet(wallet: Record<string, unknown> | undefined) {
  return {
    metalScrap: Number(wallet?.metalScrap ?? 0),
    wood: Number(wallet?.wood ?? 0),
    chaosShards: Number(wallet?.chaosShards ?? 0),
    steamComponents: Number(wallet?.steamComponents ?? 0)
  };
}

function createSchemaOperationalRequirementsFromRuntime(value: Record<string, unknown> | undefined) {
  return {
    powerWatts: Number(value?.powerWatts ?? 0),
    commsBw: Number(value?.commsBw ?? 0),
    supplyCrates: Number(value?.supplyCrates ?? 0)
  };
}

function runtimeSchemaToEditorDocument(runtimeSchema: any) {
  const isFortification = runtimeSchema.kind === "fortification";

  return {
    ...createDocumentBase(),
    id: String(runtimeSchema.id ?? "schema_entry"),
    name: String(runtimeSchema.name ?? runtimeSchema.displayName ?? runtimeSchema.id ?? "Schema Entry"),
    kind: isFortification ? "fortification" : "core",
    shortCode: String(runtimeSchema.shortCode ?? ""),
    category: isFortification ? "" : String(runtimeSchema.category ?? "logistics"),
    description: String(runtimeSchema.description ?? ""),
    operationalRequirements: createSchemaOperationalRequirementsFromRuntime(runtimeSchema.operationalRequirements),
    powerOutputWatts: Number(runtimeSchema.powerOutputWatts ?? 0),
    powerOutputMode: runtimeSchema.powerOutputMode === "add_input" ? "add_input" : "fixed",
    commsOutputBw: Number(runtimeSchema.commsOutputBw ?? 0),
    commsOutputMode: runtimeSchema.commsOutputMode === "add_input" ? "add_input" : "fixed",
    supplyOutputCrates: Number(runtimeSchema.supplyOutputCrates ?? 0),
    supplyOutputMode: runtimeSchema.supplyOutputMode === "add_input" ? "add_input" : "fixed",
    buildCost: createSchemaWalletFromPartialWallet(runtimeSchema.buildCost),
    upkeep: createSchemaWalletFromPartialWallet(runtimeSchema.upkeep),
    wadUpkeepPerTick: isFortification ? 0 : Number(runtimeSchema.wadUpkeepPerTick ?? 0),
    incomePerTick: isFortification
      ? createSchemaWalletFromPartialWallet(undefined)
      : createSchemaWalletFromPartialWallet(runtimeSchema.incomePerTick),
    supportRadius: Number(runtimeSchema.supportRadius ?? 0),
    unlockSource: runtimeSchema.unlockSource === "starter" ? "starter" : "schema",
    unlockCost: createSchemaWalletFromPartialWallet(runtimeSchema.unlockCost),
    unlockWadCost: Number(runtimeSchema.unlockWadCost ?? 0),
    preferredRoomTags: Array.isArray(runtimeSchema.preferredRoomTags)
      ? runtimeSchema.preferredRoomTags.map(String)
      : [],
    tagOutputModifiers: Array.isArray(runtimeSchema.tagOutputModifiers)
      ? runtimeSchema.tagOutputModifiers
          .filter((modifier): modifier is Record<string, unknown> => Boolean(modifier && typeof modifier === "object"))
          .map((modifier, index) => ({
            id: String(modifier.id ?? `schema_modifier_${index + 1}`),
            tag: String(modifier.tag ?? ""),
            output: createSchemaWalletFromPartialWallet(
              modifier.output && typeof modifier.output === "object" && !Array.isArray(modifier.output)
                ? (modifier.output as Record<string, unknown>)
                : undefined
            ),
            note: String(modifier.note ?? "")
          }))
      : [],
    placeholder: Boolean(runtimeSchema.placeholder)
  };
}

function runtimeUnitToEditorDocument(runtimeUnit: any, state: any) {
  const rosterIds = new Set(state.profile?.rosterUnitIds ?? []);
  const partyIds = new Set(state.partyUnitIds ?? []);
  return {
    ...createDocumentBase(),
    id: runtimeUnit.id,
    name: runtimeUnit.name,
    description: runtimeUnit.description ?? "",
    currentClassId: runtimeUnit.unitClass ?? runtimeUnit.currentClassId ?? "",
    stats: {
      maxHp: Number(runtimeUnit.maxHp ?? runtimeUnit.stats?.maxHp ?? 1),
      atk: Number(runtimeUnit.stats?.atk ?? 0),
      def: Number(runtimeUnit.stats?.def ?? 0),
      agi: Number(runtimeUnit.agi ?? runtimeUnit.stats?.agi ?? 0),
      acc: Number(runtimeUnit.stats?.acc ?? 0)
    },
    loadout: {
      primaryWeapon: runtimeUnit.loadout?.primaryWeapon ?? "",
      secondaryWeapon: runtimeUnit.loadout?.secondaryWeapon ?? "",
      helmet: runtimeUnit.loadout?.helmet ?? "",
      chestpiece: runtimeUnit.loadout?.chestpiece ?? "",
      accessory1: runtimeUnit.loadout?.accessory1 ?? "",
      accessory2: runtimeUnit.loadout?.accessory2 ?? ""
    },
    traits: Array.isArray(runtimeUnit.traits) ? runtimeUnit.traits.map(String) : [],
    pwr: Number(runtimeUnit.pwr ?? 1),
    recruitCost: Number(runtimeUnit.recruitCost ?? 0),
    startingInRoster: rosterIds.has(runtimeUnit.id),
    deployInParty: partyIds.has(runtimeUnit.id),
    metadata: toKeyValueRecord(runtimeUnit.metadata)
  };
}

function runtimeOperationToEditorDocument(runtimeOperation: any) {
  const floors = (runtimeOperation.floors ?? []).map((floor: any, floorIndex: number) => {
    const rooms = floor.rooms ?? floor.nodes ?? [];
    return {
      id: floor.id ?? `floor_${floorIndex + 1}`,
      name: floor.name ?? `Floor ${floorIndex + 1}`,
      startingRoomId: floor.startingRoomId ?? runtimeOperation.currentRoomId ?? rooms[0]?.id ?? "",
      rooms: rooms.map((room: any) => ({
        id: room.id,
        label: room.label ?? humanizeId(room.id),
        type: room.type ?? "battle",
        x: Number(room.position?.x ?? room.x ?? 0),
        y: Number(room.position?.y ?? room.y ?? 0),
        connections: [...(room.connections ?? [])],
        battleTemplate: room.battleTemplate,
        eventTemplate: room.eventTemplate,
        shopInventory: [...(room.shopInventory ?? [])],
        metadata: toKeyValueRecord(room.metadata)
      }))
    };
  });

  return {
    ...createDocumentBase(),
    id: runtimeOperation.id ?? runtimeId(runtimeOperation.codename, "operation"),
    codename: runtimeOperation.codename ?? "Untitled Operation",
    description: runtimeOperation.description ?? "",
    recommendedPower: Number(runtimeOperation.recommendedPower ?? runtimeOperation.metadata?.recommendedPower ?? 1),
    floors,
    metadata: toKeyValueRecord(runtimeOperation.metadata)
  };
}

function legacyDialogueToEditorDocument(dialogueId: string, title: string, lines: string[]) {
  const rawSource = [
    `@id ${dialogueId}`,
    `@title ${title}`,
    "@scene base_camp",
    "",
    ":start",
    ...lines.map((line) => `${title}: ${line}`),
    "END"
  ].join("\n");

  return parseDialogueSource(rawSource).document;
}

function buildEditorDocumentFromRuntime(contentType: ContentType, runtimeData: any) {
  switch (contentType) {
    case "map":
      return runtimeMapToEditorDocument(runtimeData);
    case "quest":
      return runtimeQuestToEditorDocument(runtimeData);
    case "dialogue":
      if (Array.isArray(runtimeData.lines)) {
        return legacyDialogueToEditorDocument(runtimeData.id, runtimeData.title, runtimeData.lines);
      }
      if (runtimeData.source?.rawSource) {
        return parseDialogueSource(String(runtimeData.source.rawSource)).document;
      }
      return parseDialogueSource(
        `@id ${runtimeData.id}\n@title ${runtimeData.title}\n@scene ${runtimeData.sceneId ?? "scene_id"}\n\n:start\nNarrator: Imported runtime dialogue has no raw source.\nEND\n`
      ).document;
    case "item":
      return runtimeItemToEditorDocument(runtimeData);
    case "npc":
      return runtimeNpcToEditorDocument(runtimeData);
    case "gear":
      return runtimeGearToEditorDocument(runtimeData);
    case "card":
      return runtimeCardToEditorDocument(runtimeData);
    case "unit":
      return runtimeUnitToEditorDocument(runtimeData, { profile: { rosterUnitIds: [] }, partyUnitIds: [] });
    case "operation":
      return runtimeOperationToEditorDocument(runtimeData);
    case "class":
      return runtimeClassToEditorDocument(runtimeData);
    case "schema":
      return runtimeSchemaToEditorDocument(runtimeData);
  }
}

async function importRepoModule<TModule>(repoPath: string, relativePath: string): Promise<TModule> {
  const absolutePath = path.join(repoPath, relativePath);
  const stats = await fs.stat(absolutePath);
  const moduleUrl = `${pathToFileURL(absolutePath).href}?v=${stats.mtimeMs}`;
  return import(moduleUrl) as Promise<TModule>;
}

async function readTextIfExists(filePath: string) {
  if (!existsSync(filePath)) {
    return undefined;
  }
  return fs.readFile(filePath, "utf8");
}

async function findGeneratedSourceFile(sourceDir: string, contentId: string) {
  if (!existsSync(sourceDir)) {
    return undefined;
  }

  const entries = await fs.readdir(sourceDir);
  return entries
    .filter((fileName) => fileName.startsWith(contentId))
    .sort((left, right) => {
      const score = (value: string) => {
        if (value.endsWith(".source.json")) return 0;
        if (value.endsWith(".dialogue.txt")) return 1;
        if (value.endsWith(".README.md")) return 3;
        return 2;
      };
      return score(left) - score(right);
    })[0];
}

function parseContentId(value: any, fallback: string) {
  return String(value?.id ?? value?.contentId ?? fallback);
}

function parseTitle(value: any, fallback: string) {
  return String(value?.title ?? value?.name ?? value?.codename ?? fallback);
}

function toSummaryNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toSummaryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatSummaryTurns(duration?: number) {
  if (!duration || duration <= 0) {
    return "";
  }

  return duration === 1 ? " for 1 turn" : ` for ${duration} turns`;
}

function formatCardEffectLine(effect: Record<string, unknown>) {
  const effectType = toSummaryString(effect.type)?.trim().toLowerCase();
  const amount = toSummaryNumber(effect.amount);
  const duration = toSummaryNumber(effect.duration);
  const tiles = toSummaryNumber(effect.tiles);
  const stat = toSummaryString(effect.stat);

  if (!effectType) {
    return "Custom effect.";
  }

  switch (effectType) {
    case "damage":
    case "deal_damage":
      return amount ? `Deal ${amount} damage.` : "Deal damage.";
    case "heal":
      return amount ? `Restore ${amount} HP.` : "Restore HP.";
    case "def_up":
      return `Gain +${amount ?? 0} DEF${formatSummaryTurns(duration)}.`;
    case "atk_up":
      return `Gain +${amount ?? 0} ATK${formatSummaryTurns(duration)}.`;
    case "acc_up":
      return `Gain +${amount ?? 0} ACC${formatSummaryTurns(duration)}.`;
    case "agi_up":
      return `Gain +${amount ?? 0} AGI${formatSummaryTurns(duration)}.`;
    case "def_down":
      return `Inflict -${amount ?? 0} DEF${formatSummaryTurns(duration)}.`;
    case "atk_down":
      return `Inflict -${amount ?? 0} ATK${formatSummaryTurns(duration)}.`;
    case "acc_down":
      return `Inflict -${amount ?? 0} ACC${formatSummaryTurns(duration)}.`;
    case "push":
      return `Push ${tiles ?? amount ?? 1} tile${(tiles ?? amount ?? 1) === 1 ? "" : "s"}.`;
    case "move":
      return `Move ${tiles ?? amount ?? 1} tile${(tiles ?? amount ?? 1) === 1 ? "" : "s"}.`;
    case "stun":
      return `Stun${formatSummaryTurns(duration || 1)}.`;
    case "burn":
      return amount
        ? `Inflict Burn for ${amount} damage${formatSummaryTurns(duration)}.`
        : `Inflict Burn${formatSummaryTurns(duration)}.`;
    default: {
      const details = [
        amount !== undefined ? `${amount}` : "",
        stat ? humanizeId(stat) : "",
        tiles !== undefined ? `${tiles} tile${tiles === 1 ? "" : "s"}` : "",
        duration !== undefined ? `${duration} turn${duration === 1 ? "" : "s"}` : ""
      ]
        .filter(Boolean)
        .join(" ");
      return details ? `${humanizeId(effectType)} ${details}.` : `${humanizeId(effectType)}.`;
    }
  }
}

function buildCardEffectLines(runtimeData: any) {
  const effectLines = Array.isArray(runtimeData.effects)
    ? runtimeData.effects
        .filter((effect: unknown): effect is Record<string, unknown> => Boolean(effect) && typeof effect === "object")
        .map((effect) => formatCardEffectLine(effect))
        .filter(Boolean)
    : [];

  if (
    typeof runtimeData.damage === "number" &&
    !effectLines.some((line) => line.toLowerCase().includes("damage"))
  ) {
    effectLines.unshift(`Deal ${runtimeData.damage} damage.`);
  }

  return effectLines;
}

function buildEntrySummaryData(contentType: ContentType, runtimeData: any, editorData?: any) {
  switch (contentType) {
    case "npc": {
      return {
        mapId: String(editorData?.mapId ?? runtimeData?.mapId ?? ""),
        tileX: Number(editorData?.tileX ?? runtimeData?.tileX ?? runtimeData?.x ?? 0),
        tileY: Number(editorData?.tileY ?? runtimeData?.tileY ?? runtimeData?.y ?? 0)
      };
    }
    case "gear": {
      const slot = toSummaryString(runtimeData?.slot);
      return slot ? { slot } : undefined;
    }
    case "card": {
      return {
        strainCost: Number(runtimeData?.strainCost ?? 0),
        category: String(runtimeData?.category ?? runtimeData?.type ?? runtimeData?.cardType ?? "card"),
        rarity: String(runtimeData?.rarity ?? "common"),
        targetType: String(runtimeData?.targetType ?? "self"),
        range: Number(runtimeData?.range ?? 0),
        description: String(runtimeData?.description ?? ""),
        effectLines: buildCardEffectLines(runtimeData),
        artPath: typeof runtimeData?.artPath === "string" ? runtimeData.artPath : undefined,
        sourceClassId: typeof runtimeData?.sourceClassId === "string" ? runtimeData.sourceClassId : undefined,
        sourceEquipmentId:
          typeof runtimeData?.sourceEquipmentId === "string" ? runtimeData.sourceEquipmentId : undefined
      };
    }
    case "operation": {
      return {
        floorCount: Array.isArray(editorData?.floors)
          ? editorData.floors.length
          : Array.isArray(runtimeData?.floors)
            ? runtimeData.floors.length
            : runtimeData?.floor
              ? 1
              : 0
      };
    }
    case "class": {
      return typeof runtimeData?.tier === "number" ? { tier: runtimeData.tier } : undefined;
    }
      case "schema": {
        return {
          kind: String(editorData?.kind ?? runtimeData?.kind ?? "core"),
          category:
            typeof editorData?.category === "string" && editorData.category.trim()
              ? editorData.category
              : typeof runtimeData?.category === "string" && runtimeData.category.trim()
                ? runtimeData.category
                : undefined,
          unlockSource:
            typeof editorData?.unlockSource === "string" && editorData.unlockSource.trim()
              ? editorData.unlockSource
              : typeof runtimeData?.unlockSource === "string" && runtimeData.unlockSource.trim()
                ? runtimeData.unlockSource
                : undefined
        };
      }
      default:
        return undefined;
    }
  }

async function readGeneratedRecords(repoPath: string, contentType: ContentType) {
  const runtimeDir = path.join(repoPath, "src", "content", "technica", "generated", contentType);
  const sourceDir = path.join(repoPath, "src", "content", "technica", "source", contentType);
  const extension = CONTENT_EXTENSIONS[contentType];
  const records = new Map<string, GeneratedRecord>();

  if (!existsSync(runtimeDir)) {
    return records;
  }

  const fileNames = await fs.readdir(runtimeDir);
  for (const fileName of fileNames) {
    if (!fileName.endsWith(extension)) {
      continue;
    }

    const runtimePath = path.join(runtimeDir, fileName);
    const runtimeContent = await fs.readFile(runtimePath, "utf8");
    const runtimeData = JSON.parse(runtimeContent);
    const contentId = parseContentId(runtimeData, fileName.replace(extension, ""));
    const sourceFile = await findGeneratedSourceFile(sourceDir, contentId);
    const sourceContent = sourceFile ? await readTextIfExists(path.join(sourceDir, sourceFile)) : undefined;

    records.set(contentId, {
      entryKey: `technica:${contentId}`,
      contentId,
      title: parseTitle(runtimeData, contentId),
      runtimeFile: relativeToRepo(repoPath, runtimePath),
      runtimeContent,
      sourceFile: sourceFile ? relativeToRepo(repoPath, path.join(sourceDir, sourceFile)) : undefined,
      sourceContent
    });
  }

  return records;
}

async function readDisabledContentIds(repoPath: string, contentType: ContentType) {
  const disabledDir = path.join(repoPath, "src", "content", "technica", "disabled", contentType);
  const ids = new Set<string>();

  if (!existsSync(disabledDir)) {
    return ids;
  }

  const fileNames = await fs.readdir(disabledDir);
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".disabled.json")) {
      continue;
    }

    const disabledContent = JSON.parse(
      await fs.readFile(path.join(disabledDir, fileName), "utf8")
    ) as DisabledRecord;

    if (disabledContent.origin === "game" && disabledContent.contentType === contentType) {
      ids.add(disabledContent.id);
    }
  }

  return ids;
}

function buildSnapshotEntry(
  contentType: ContentType,
  origin: EntryOrigin,
  contentId: string,
  title: string,
  runtimeFile: string,
  sourceFile: string | undefined,
  runtimeData: unknown,
  editorData?: unknown
) {
  return {
    entryKey: `${origin}:${contentId}`,
    contentId,
    title,
    runtimeFile,
    sourceFile,
    origin,
    summaryData: buildEntrySummaryData(contentType, runtimeData, editorData),
    runtimeData,
    editorData
  } satisfies SnapshotEntry;
}

function hasTopLevelObjectEntry(sourceText: string, declarationName: string, key: string) {
  const sourceFile = ts.createSourceFile(
    `${declarationName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const objectLiteral = findObjectLiteralInitializer(sourceFile, declarationName);
  if (!objectLiteral) {
    return false;
  }

  return objectLiteral.properties.some((property) => getObjectPropertyName(property) === key);
}

function pruneSchemaSourceWallet(value: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries({
      metalScrap: Number(value?.metalScrap ?? 0),
      wood: Number(value?.wood ?? 0),
      chaosShards: Number(value?.chaosShards ?? 0),
      steamComponents: Number(value?.steamComponents ?? 0)
    }).filter(([, amount]) => Number.isFinite(amount) && amount > 0)
  );
}

function pruneSchemaRoomTags(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}

function pruneSchemaOperationalRequirements(value: Record<string, unknown> | undefined) {
  const requirements = Object.fromEntries(
    Object.entries({
      powerWatts: Number(value?.powerWatts ?? 0),
      commsBw: Number(value?.commsBw ?? 0),
      supplyCrates: Number(value?.supplyCrates ?? 0)
    }).filter(([, amount]) => Number.isFinite(amount) && amount > 0)
  );

  return Object.keys(requirements).length > 0 ? requirements : undefined;
}

function pruneSchemaTagOutputModifiers(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const modifiers = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const tag = typeof entry.tag === "string" ? entry.tag.trim() : "";
      if (!tag) {
        return undefined;
      }

      return pruneEmpty({
        tag,
        output: pruneSchemaSourceWallet(
          entry.output && typeof entry.output === "object" && !Array.isArray(entry.output)
            ? (entry.output as Record<string, unknown>)
            : undefined
        ),
        note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : undefined
      });
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  return modifiers.length > 0 ? modifiers : undefined;
}

function normalizeBuiltInSchemaForSource(runtimeData: any, existingValue: any) {
  const isFortification = runtimeData?.kind === "fortification";
  const baseRecord =
    existingValue && typeof existingValue === "object" && !Array.isArray(existingValue) ? existingValue : {};
  const nextRecord: Record<string, unknown> = {
    ...baseRecord,
    id: String(runtimeData?.id ?? baseRecord.id ?? "schema_entry"),
    displayName: String(runtimeData?.name ?? baseRecord.displayName ?? baseRecord.id ?? "Schema Entry"),
    description: String(runtimeData?.description ?? baseRecord.description ?? ""),
    buildCost: pruneSchemaSourceWallet(runtimeData?.buildCost),
    unlockSource: runtimeData?.unlockSource === "starter" ? "starter" : "schema"
  };

  const preferredRoomTags = pruneSchemaRoomTags(runtimeData?.preferredRoomTags);
  if (preferredRoomTags) {
    nextRecord.preferredRoomTags = preferredRoomTags;
  } else {
    delete nextRecord.preferredRoomTags;
  }

  if (nextRecord.unlockSource === "schema") {
    nextRecord.unlockCost = pruneSchemaSourceWallet(runtimeData?.unlockCost);
    nextRecord.unlockWadCost = Number(runtimeData?.unlockWadCost ?? baseRecord.unlockWadCost ?? 0);
  } else {
    delete nextRecord.unlockCost;
    delete nextRecord.unlockWadCost;
  }

  if (runtimeData?.placeholder) {
    nextRecord.placeholder = true;
  } else {
    delete nextRecord.placeholder;
  }

  if (isFortification) {
    delete nextRecord.shortCode;
    delete nextRecord.category;
    delete nextRecord.operationalRequirements;
    delete nextRecord.powerOutputWatts;
    delete nextRecord.powerOutputMode;
    delete nextRecord.commsOutputBw;
    delete nextRecord.commsOutputMode;
    delete nextRecord.supplyOutputCrates;
    delete nextRecord.supplyOutputMode;
    delete nextRecord.upkeep;
    delete nextRecord.wadUpkeepPerTick;
    delete nextRecord.incomePerTick;
    delete nextRecord.supportRadius;
    delete nextRecord.tagOutputModifiers;
  } else {
    const shortCode = String(runtimeData?.shortCode ?? baseRecord.shortCode ?? "").trim();
    const operationalRequirements = pruneSchemaOperationalRequirements(runtimeData?.operationalRequirements);
    const tagOutputModifiers = pruneSchemaTagOutputModifiers(runtimeData?.tagOutputModifiers);
    const powerOutputWatts = Number(runtimeData?.powerOutputWatts ?? 0);
    const powerOutputMode = runtimeData?.powerOutputMode === "add_input" ? "add_input" : "fixed";
    const commsOutputBw = Number(runtimeData?.commsOutputBw ?? 0);
    const commsOutputMode = runtimeData?.commsOutputMode === "add_input" ? "add_input" : "fixed";
    const supplyOutputCrates = Number(runtimeData?.supplyOutputCrates ?? 0);
    const supplyOutputMode = runtimeData?.supplyOutputMode === "add_input" ? "add_input" : "fixed";

    if (shortCode) {
      nextRecord.shortCode = shortCode;
    } else {
      delete nextRecord.shortCode;
    }

    nextRecord.category = String(runtimeData?.category ?? baseRecord.category ?? "logistics");

    if (operationalRequirements) {
      nextRecord.operationalRequirements = operationalRequirements;
    } else {
      delete nextRecord.operationalRequirements;
    }

    if (powerOutputWatts > 0) {
      nextRecord.powerOutputWatts = powerOutputWatts;
    } else {
      delete nextRecord.powerOutputWatts;
    }
    if (powerOutputMode === "add_input") {
      nextRecord.powerOutputMode = "add_input";
    } else {
      delete nextRecord.powerOutputMode;
    }

    if (commsOutputBw > 0) {
      nextRecord.commsOutputBw = commsOutputBw;
    } else {
      delete nextRecord.commsOutputBw;
    }
    if (commsOutputMode === "add_input") {
      nextRecord.commsOutputMode = "add_input";
    } else {
      delete nextRecord.commsOutputMode;
    }

    if (supplyOutputCrates > 0) {
      nextRecord.supplyOutputCrates = supplyOutputCrates;
    } else {
      delete nextRecord.supplyOutputCrates;
    }
    if (supplyOutputMode === "add_input") {
      nextRecord.supplyOutputMode = "add_input";
    } else {
      delete nextRecord.supplyOutputMode;
    }

    nextRecord.upkeep = pruneSchemaSourceWallet(runtimeData?.upkeep);
    nextRecord.wadUpkeepPerTick = Number(runtimeData?.wadUpkeepPerTick ?? baseRecord.wadUpkeepPerTick ?? 0);
    nextRecord.incomePerTick = pruneSchemaSourceWallet(runtimeData?.incomePerTick);
    nextRecord.supportRadius = Number(runtimeData?.supportRadius ?? baseRecord.supportRadius ?? 0);

    if (tagOutputModifiers) {
      nextRecord.tagOutputModifiers = tagOutputModifiers;
    } else {
      delete nextRecord.tagOutputModifiers;
    }
  }

  return nextRecord;
}

function normalizeClassId(value: string) {
  if (value === "watchGuard") {
    return "watch_guard";
  }
  return value;
}

function normalizeRange(range: string | undefined) {
  if (!range) {
    return 1;
  }
  if (/self/i.test(range)) {
    return 0;
  }
  const match = range.match(/R\((\d+)(?:-(\d+))?\)/i);
  if (!match) {
    return 1;
  }
  return Number(match[2] ?? match[1]);
}

function inferTargetType(description: string, range: string | undefined) {
  const lower = description.toLowerCase();
  if (/self/i.test(range ?? "")) {
    return "self" as const;
  }
  if (lower.includes("ally") || lower.includes("heal")) {
    return "ally" as const;
  }
  if (lower.includes("tile") || lower.includes("trap")) {
    return "tile" as const;
  }
  return "enemy" as const;
}

async function listBuiltInEntries(
  repoPath: string,
  contentType: ContentType,
  disabledIds: Set<string>
): Promise<SnapshotEntry[]> {
  switch (contentType) {
    case "map": {
      const generated = await readGeneratedRecords(repoPath, "map");
      const maps = await importRepoModule<{ getFieldMap: (mapId: string) => any }>(repoPath, "src/field/maps.ts");
      return BUILT_IN_MAP_IDS
        .filter((mapId) => !generated.has(mapId) && !disabledIds.has(mapId))
        .map((mapId) => {
          const runtimeData = sanitizeJson(maps.getFieldMap(mapId));
          return buildSnapshotEntry(
            "map",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/field/maps.ts",
            "src/field/maps.ts",
            runtimeData,
            runtimeMapToEditorDocument(runtimeData)
          );
        });
    }

    case "quest": {
      const { QUEST_DATABASE } = await importRepoModule<{ QUEST_DATABASE: Record<string, any> }>(repoPath, "src/quests/questData.ts");
      return Object.values(QUEST_DATABASE)
        .filter((runtimeData) => !disabledIds.has(runtimeData.id))
        .map((runtimeData) =>
          buildSnapshotEntry(
            "quest",
            "game",
            runtimeData.id,
            runtimeData.title,
            "src/quests/questData.ts",
            "src/quests/questData.ts",
            sanitizeJson(runtimeData),
            runtimeQuestToEditorDocument(runtimeData)
          )
        );
    }

    case "dialogue": {
      const { NPC_DIALOGUE } = await importRepoModule<{ NPC_DIALOGUE: Record<string, string[]> }>(repoPath, "src/field/npcs.ts");
      return Object.entries(NPC_DIALOGUE)
        .filter(([dialogueId]) => !disabledIds.has(dialogueId))
        .map(([dialogueId, lines]) => {
          const title = humanizeId(dialogueId.replace(/^npc_/, ""));
          const runtimeData = { id: dialogueId, title, lines };
          return buildSnapshotEntry(
            "dialogue",
            "game",
            dialogueId,
            title,
            "src/field/npcs.ts",
            "src/field/npcs.ts",
            runtimeData,
            legacyDialogueToEditorDocument(dialogueId, title, lines)
          );
        });
    }

    case "npc": {
      const generated = await readGeneratedRecords(repoPath, "npc");
      const { BUILT_IN_NPCS } = await importRepoModule<{
        BUILT_IN_NPCS: Array<{
          id: string;
          name: string;
          mapId: string;
          tileX: number;
          tileY: number;
          routeMode?: "fixed" | "random" | "none";
          dialogueId?: string;
          portraitKey?: string;
          spriteKey?: string;
          portraitPath?: string;
          spritePath?: string;
          routePoints?: Array<{ id?: string; x: number; y: number }>;
        }>;
      }>(repoPath, "src/field/npcs.ts");

      return BUILT_IN_NPCS
        .filter((runtimeData) => !generated.has(runtimeData.id) && !disabledIds.has(runtimeData.id))
        .map((runtimeData) =>
          buildSnapshotEntry(
            "npc",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/field/npcs.ts",
            "src/field/npcs.ts",
            sanitizeJson({
              id: runtimeData.id,
              name: runtimeData.name,
              mapId: runtimeData.mapId,
              x: runtimeData.tileX,
              y: runtimeData.tileY,
              routeMode: runtimeData.routeMode ?? "random",
              routePoints: runtimeData.routePoints ?? [],
              dialogueId: runtimeData.dialogueId,
              portraitKey: runtimeData.portraitKey,
              spriteKey: runtimeData.spriteKey,
              portraitPath: runtimeData.portraitPath,
              spritePath: runtimeData.spritePath,
              metadata: {}
            } satisfies RuntimeNpcShape),
            runtimeNpcToEditorDocument({
              id: runtimeData.id,
              name: runtimeData.name,
              mapId: runtimeData.mapId,
              x: runtimeData.tileX,
              y: runtimeData.tileY,
              routeMode: runtimeData.routeMode ?? "random",
              routePoints: runtimeData.routePoints ?? [],
              dialogueId: runtimeData.dialogueId,
              portraitKey: runtimeData.portraitKey,
              spriteKey: runtimeData.spriteKey,
              portraitPath: runtimeData.portraitPath,
              spritePath: runtimeData.spritePath,
              metadata: {}
            })
          )
        );
    }

    case "item": {
      const { CONSUMABLE_DATABASE } = await importRepoModule<{ CONSUMABLE_DATABASE: Record<string, any> }>(repoPath, "src/core/crafting.ts");
      const consumables = Object.values(CONSUMABLE_DATABASE)
        .filter((item) => !disabledIds.has(item.id))
        .map((item) =>
          buildSnapshotEntry(
            "item",
            "game",
            item.id,
            item.name,
            "src/core/crafting.ts",
            "src/core/crafting.ts",
            {
              id: item.id,
              name: item.name,
              description: item.description ?? "",
              kind: "consumable",
              stackable: true,
              quantity: 1,
              massKg: 1,
              bulkBu: 1,
              powerW: 0,
              metadata: {
                effect: item.effect,
                value: String(item.value ?? 1)
              }
            } satisfies RuntimeItemShape,
            runtimeItemToEditorDocument({
              id: item.id,
              name: item.name,
              description: item.description ?? "",
              kind: "consumable",
              stackable: true,
              quantity: 1,
              massKg: 1,
              bulkBu: 1,
              powerW: 0,
              metadata: {
                effect: item.effect,
                value: String(item.value ?? 1)
              }
            })
          )
        );

      const resources: SnapshotEntry[] = [
        {
          id: "metalScrap",
          name: "Metal Scrap",
          description: "Reusable metal salvage for crafting and repairs."
        },
        {
          id: "wood",
          name: "Wood",
          description: "Basic organic material used in construction and crafting."
        },
        {
          id: "chaosShards",
          name: "Chaos Shards",
          description: "Volatile crystal resource used in arcane and advanced crafting."
        },
        {
          id: "steamComponents",
          name: "Steam Components",
          description: "Mechanical resource used for powered and industrial builds."
        }
      ].map((resource) =>
        buildSnapshotEntry(
          "item",
          "game",
          resource.id,
          resource.name,
          "src/core/types.ts",
          "src/core/types.ts",
          {
            id: resource.id,
            name: resource.name,
            description: resource.description,
            kind: "resource",
            stackable: true,
            quantity: 1,
            massKg: 1,
            bulkBu: 1,
            powerW: 0,
            metadata: {}
          } satisfies RuntimeItemShape,
          runtimeItemToEditorDocument({
            id: resource.id,
            name: resource.name,
            description: resource.description,
            kind: "resource",
            stackable: true,
            quantity: 1,
            massKg: 1,
            bulkBu: 1,
            powerW: 0,
            metadata: {}
          })
        )
      ).filter((entry) => !disabledIds.has(entry.contentId));

      return [...consumables, ...resources];
    }

    case "gear": {
      const equipment = await importRepoModule<{
        STARTER_WEAPONS: any[];
        STARTER_HELMETS: any[];
        STARTER_CHESTPIECES: any[];
        STARTER_ACCESSORIES: any[];
      }>(repoPath, "src/core/equipment.ts");

      const collections = [
        { file: "src/data/weapons.ts", items: equipment.STARTER_WEAPONS },
        { file: "src/data/armor.ts", items: equipment.STARTER_HELMETS },
        { file: "src/data/armor.ts", items: equipment.STARTER_CHESTPIECES },
        { file: "src/data/armor.ts", items: equipment.STARTER_ACCESSORIES }
      ];

      return collections.flatMap((collection) =>
        collection.items
          .filter((runtimeData: any) => !disabledIds.has(runtimeData.id))
          .map((runtimeData: any) =>
            buildSnapshotEntry(
              "gear",
              "game",
              runtimeData.id,
              runtimeData.name,
              collection.file,
              collection.file,
              sanitizeJson(runtimeData),
              runtimeGearToEditorDocument(runtimeData)
            )
          )
      );
    }

    case "card": {
      const equipment = await importRepoModule<{
        CORE_CARDS: any[];
        CLASS_CARDS: Record<string, any[]>;
        EQUIPMENT_CARDS: any[];
      }>(repoPath, "src/core/equipment.ts");
      const modules = await importRepoModule<{ MODULE_CARDS: any[] }>(repoPath, "src/data/modules.ts");
      const { LIBRARY_CARD_DATABASE } = await importRepoModule<{ LIBRARY_CARD_DATABASE: Record<string, any> }>(repoPath, "src/core/gearWorkbench.ts");
      const { createNewGameState } = await importRepoModule<{ createNewGameState: () => any }>(repoPath, "src/core/initialState.ts");
      const gameState = createNewGameState();
      const cards = new Map<string, SnapshotEntry>();

      const addCard = (card: any, sourceFile: string, extras?: Partial<RuntimeCardShape>) => {
        const battleCard = gameState.cardsById?.[card.id];
        const libraryCard = LIBRARY_CARD_DATABASE?.[card.id];
        const runtimeData: RuntimeCardShape = {
          id: card.id,
          name: card.name,
          description: card.description ?? battleCard?.description ?? "",
          cardType: extras?.cardType ?? card.type ?? "equipment",
          rarity: extras?.rarity ?? libraryCard?.rarity ?? "common",
          category: extras?.category ?? libraryCard?.category ?? "utility",
          strainCost: Number(card.strainCost ?? battleCard?.strainCost ?? 0),
          targetType: extras?.targetType ?? battleCard?.targetType ?? inferTargetType(card.description ?? "", card.range),
          range: extras?.range ?? Number(battleCard?.range ?? normalizeRange(card.range)),
          damage: extras?.damage ?? (typeof card.damage === "number" ? card.damage : undefined),
          effects: sanitizeJson(extras?.effects ?? battleCard?.effects ?? []),
          sourceClassId: extras?.sourceClassId ?? card.sourceClassId,
          sourceEquipmentId: extras?.sourceEquipmentId ?? card.sourceEquipmentId,
          metadata: {}
        };

        cards.set(
          runtimeData.id,
          buildSnapshotEntry(
            "card",
            "game",
            runtimeData.id,
            runtimeData.name,
            sourceFile,
            sourceFile,
            runtimeData,
            runtimeCardToEditorDocument(runtimeData)
          )
        );
      };

      equipment.CORE_CARDS.forEach((card) => addCard(card, "src/data/cards/coreCards.ts", { cardType: "core" }));
      equipment.EQUIPMENT_CARDS.forEach((card) => addCard(card, "src/data/cards/equipmentCards.ts", { cardType: card.type ?? "equipment" }));
      modules.MODULE_CARDS.forEach((card) => addCard(card, "src/data/modules.ts", { cardType: card.type ?? "equipment" }));
      Object.entries(equipment.CLASS_CARDS).forEach(([classId, classCards]) => {
        classCards.forEach((card) =>
          addCard(card, "src/data/cards/classCards.ts", {
            cardType: "class",
            sourceClassId: normalizeClassId(classId)
          })
        );
      });

      return Array.from(cards.values()).filter((entry) => !disabledIds.has(entry.contentId));
    }

    case "class": {
      const { CLASS_DEFINITIONS } = await importRepoModule<{ CLASS_DEFINITIONS: Record<string, any> }>(repoPath, "src/core/classes.ts");
      return Object.values(CLASS_DEFINITIONS)
        .filter((runtimeData) => !disabledIds.has(runtimeData.id))
        .map((runtimeData) =>
          buildSnapshotEntry(
            "class",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/core/classes.ts",
            "src/core/classes.ts",
            sanitizeJson(runtimeData),
            runtimeClassToEditorDocument(runtimeData)
          )
        );
    }

    case "schema": {
      const generated = await readGeneratedRecords(repoPath, "schema");
      const {
        SCHEMA_CORE_DEFINITIONS,
        SCHEMA_FORTIFICATION_DEFINITIONS
      } = await importRepoModule<{
        SCHEMA_CORE_DEFINITIONS: Record<string, any>;
        SCHEMA_FORTIFICATION_DEFINITIONS: Record<string, any>;
      }>(repoPath, "src/core/schemaSystem.ts");

      const coreEntries = Object.values(SCHEMA_CORE_DEFINITIONS)
        .map((definition) => sanitizeJson({ ...definition, kind: "core", name: definition.displayName }))
        .filter((runtimeData) => !generated.has(runtimeData.id) && !disabledIds.has(runtimeData.id))
        .map((runtimeData) =>
          buildSnapshotEntry(
            "schema",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/core/schemaSystem.ts",
            "src/core/schemaSystem.ts",
            runtimeData,
            runtimeSchemaToEditorDocument(runtimeData)
          )
        );

      const fortificationEntries = Object.values(SCHEMA_FORTIFICATION_DEFINITIONS)
        .map((definition) => sanitizeJson({ ...definition, kind: "fortification", name: definition.displayName }))
        .filter((runtimeData) => !generated.has(runtimeData.id) && !disabledIds.has(runtimeData.id))
        .map((runtimeData) =>
          buildSnapshotEntry(
            "schema",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/core/schemaSystem.ts",
            "src/core/schemaSystem.ts",
            runtimeData,
            runtimeSchemaToEditorDocument(runtimeData)
          )
        );

      return [...coreEntries, ...fortificationEntries];
    }

    case "unit": {
      const { createNewGameState } = await importRepoModule<{ createNewGameState: () => any }>(repoPath, "src/core/initialState.ts");
      const state = createNewGameState();
      const rosterIds = new Set(state.profile?.rosterUnitIds ?? []);

      return Object.values(state.unitsById ?? {})
        .filter((unit: any) => (!unit.isEnemy || rosterIds.has(unit.id)) && !disabledIds.has(unit.id))
        .map((runtimeData: any) =>
          buildSnapshotEntry(
            "unit",
            "game",
            runtimeData.id,
            runtimeData.name,
            "src/core/initialState.ts",
            "src/core/initialState.ts",
            sanitizeJson(runtimeData),
            runtimeUnitToEditorDocument(runtimeData, state)
          )
        );
    }

    case "operation": {
      const { createNewGameState } = await importRepoModule<{ createNewGameState: () => any }>(repoPath, "src/core/initialState.ts");
      const state = createNewGameState();
      if (!state.operation) {
        return [];
      }

      const runtimeData = sanitizeJson(state.operation);
      if (disabledIds.has(runtimeData.id ?? runtimeId(runtimeData.codename, "operation"))) {
        return [];
      }
      return [
        buildSnapshotEntry(
          "operation",
          "game",
          runtimeData.id ?? runtimeId(runtimeData.codename, "operation"),
          runtimeData.codename ?? "Operation",
          "src/core/initialState.ts",
          "src/core/initialState.ts",
          runtimeData,
          runtimeOperationToEditorDocument(runtimeData)
        )
      ];
    }
  }
}

export async function buildSnapshot(repoPath: string, contentType: ContentType) {
  const generated = await readGeneratedRecords(repoPath, contentType);
  const disabledIds = await readDisabledContentIds(repoPath, contentType);
  const builtIn = await listBuiltInEntries(repoPath, contentType, disabledIds);
  const entries: SnapshotEntry[] = [...builtIn];

  generated.forEach((record) => {
    const runtimeData = JSON.parse(record.runtimeContent);
    let editorData: unknown;

    if (record.sourceFile?.endsWith(".source.json") && record.sourceContent) {
      editorData = JSON.parse(record.sourceContent);
    } else if (record.sourceFile?.endsWith(".dialogue.txt") && record.sourceContent) {
      editorData = parseDialogueSource(record.sourceContent).document;
    } else {
      editorData = buildEditorDocumentFromRuntime(contentType, runtimeData);
    }

    entries.push({
      entryKey: record.entryKey,
      contentId: record.contentId,
      title: record.title,
      runtimeFile: record.runtimeFile,
      sourceFile: record.sourceFile,
      origin: "technica",
      runtimeData,
      editorData
    });
  });

  entries.sort((left, right) => {
    const titleDiff = left.title.localeCompare(right.title);
    if (titleDiff !== 0) {
      return titleDiff;
    }
    return left.entryKey.localeCompare(right.entryKey);
  });

  return {
    entries,
    generated
  };
}

export async function listEntries(
  repoPath: string,
  contentType: ContentType,
  snapshot?: Awaited<ReturnType<typeof buildSnapshot>>
) {
  const resolvedSnapshot = snapshot ?? (await buildSnapshot(repoPath, contentType));

  return resolvedSnapshot.entries.map((entry) => ({
    entryKey: entry.entryKey,
    contentId: entry.contentId,
    title: entry.title,
    runtimeFile: entry.runtimeFile,
    sourceFile: entry.sourceFile,
    origin: entry.origin,
    summaryData: entry.summaryData
  })) satisfies DatabaseEntrySummary[];
}

export async function loadEntry(
  repoPath: string,
  contentType: ContentType,
  entryKey: string,
  snapshot?: Awaited<ReturnType<typeof buildSnapshot>>
) {
  const resolvedSnapshot = snapshot ?? (await buildSnapshot(repoPath, contentType));
  const entry = resolvedSnapshot.entries.find((candidate) => candidate.entryKey === entryKey);

  if (!entry) {
    throw new Error(`Could not find '${entryKey}' in the Chaos Core ${contentType} database.`);
  }

  let sourceContent: string | undefined;
  if (entry.sourceFile) {
    sourceContent = await readTextIfExists(path.join(repoPath, entry.sourceFile));
  }

  const generatedRecord = resolvedSnapshot.generated.get(entry.contentId);
  if (generatedRecord && generatedRecord.entryKey === entryKey) {
    return {
      entryKey: generatedRecord.entryKey,
      contentId: generatedRecord.contentId,
      title: generatedRecord.title,
      runtimeFile: generatedRecord.runtimeFile,
      sourceFile: generatedRecord.sourceFile,
      origin: "technica",
      runtimeContent: generatedRecord.runtimeContent,
      sourceContent: generatedRecord.sourceContent,
      editorContent:
        generatedRecord.sourceFile?.endsWith(".source.json") && generatedRecord.sourceContent
          ? generatedRecord.sourceContent
          : generatedRecord.sourceFile?.endsWith(".dialogue.txt") && generatedRecord.sourceContent
            ? prettyJson(parseDialogueSource(generatedRecord.sourceContent).document)
            : prettyJson(buildEditorDocumentFromRuntime(contentType, JSON.parse(generatedRecord.runtimeContent)))
    } satisfies LoadedDatabaseEntry;
  }

  return {
    entryKey: entry.entryKey,
    contentId: entry.contentId,
    title: entry.title,
    runtimeFile: entry.runtimeFile,
    sourceFile: entry.sourceFile,
    origin: entry.origin,
    summaryData: entry.summaryData,
    runtimeContent: prettyJson(entry.runtimeData),
    sourceContent,
    editorContent: entry.editorData ? prettyJson(entry.editorData) : undefined
  } satisfies LoadedDatabaseEntry;
}

export async function listAllEntries(repoPath: string) {
  const entriesByType = await Promise.all(
    CONTENT_TYPES.map(async (contentType) => ({
      contentType,
      entries: await listEntries(repoPath, contentType)
    }))
  );

  return Object.fromEntries(
    entriesByType.map(({ contentType, entries }) => [contentType, entries])
  ) as Record<ContentType, DatabaseEntrySummary[]>;
}

function getObjectPropertyName(property: ts.ObjectLiteralElementLike) {
  if (!("name" in property) || !property.name) {
    return null;
  }

  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }

  return null;
}

function findObjectLiteralInitializer(sourceFile: ts.SourceFile, declarationName: string) {
  let objectLiteral: ts.ObjectLiteralExpression | null = null;

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      objectLiteral = node.initializer;
      return;
    }

    if (!objectLiteral) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return objectLiteral;
}

function findArrayLiteralInitializer(sourceFile: ts.SourceFile, declarationName: string) {
  let arrayLiteral: ts.ArrayLiteralExpression | null = null;

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      arrayLiteral = node.initializer;
      return;
    }

    if (!arrayLiteral) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return arrayLiteral;
}

function findFunctionBody(sourceFile: ts.SourceFile, functionName: string) {
  let functionBody: ts.Block | null = null;

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.text === functionName &&
      node.body
    ) {
      functionBody = node.body;
      return;
    }

    if (!functionBody) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return functionBody;
}

function getObjectLiteralId(objectLiteral: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) {
  const property = objectLiteral.properties.find((entry) => getObjectPropertyName(entry) === "id");
  if (!property || !ts.isPropertyAssignment(property)) {
    return null;
  }

  if (
    ts.isStringLiteral(property.initializer) ||
    ts.isNoSubstitutionTemplateLiteral(property.initializer) ||
    ts.isIdentifier(property.initializer)
  ) {
    return property.initializer.getText(sourceFile).replace(/^['"`]|['"`]$/g, "");
  }

  return null;
}

function serializeTsValue(value: unknown, depth = 1): string {
  if (value === undefined) {
    return "undefined";
  }

  if (isTsExpressionMarker(value)) {
    return value.__technicaTsExpression;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const currentIndent = "  ".repeat(depth);
    const nextIndent = "  ".repeat(depth + 1);
    return [
      "[",
      ...value.map((entry) => `${nextIndent}${serializeTsValue(entry, depth + 1)},`),
      `${currentIndent}]`
    ].join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== undefined
    );

    if (entries.length === 0) {
      return "{}";
    }

    const currentIndent = "  ".repeat(depth);
    const nextIndent = "  ".repeat(depth + 1);
    return [
      "{",
      ...entries.map(([key, entry]) => `${nextIndent}${JSON.stringify(key)}: ${serializeTsValue(entry, depth + 1)},`),
      `${currentIndent}}`
    ].join("\n");
  }

  return JSON.stringify(String(value));
}

function upsertTopLevelObjectEntry(
  sourceText: string,
  declarationName: string,
  previousKey: string,
  nextKey: string,
  nextValue: unknown
) {
  const sourceFile = ts.createSourceFile(
    `${declarationName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const objectLiteral = findObjectLiteralInitializer(sourceFile, declarationName);
  if (!objectLiteral) {
    throw new Error(`Could not find '${declarationName}' in the target source file.`);
  }

  const previousProperty = objectLiteral.properties.find(
    (property) => getObjectPropertyName(property) === previousKey
  );
  const nextProperty = objectLiteral.properties.find(
    (property) => getObjectPropertyName(property) === nextKey
  );

  if (previousProperty && nextProperty && previousProperty !== nextProperty) {
    throw new Error(
      `Cannot rename '${previousKey}' to '${nextKey}' because '${nextKey}' already exists in '${declarationName}'.`
    );
  }

  const nextEntryText = `${JSON.stringify(nextKey)}: ${serializeTsValue(nextValue, 1)}`;
  const targetProperty = previousProperty ?? nextProperty;
  if (targetProperty) {
    return `${sourceText.slice(0, targetProperty.getStart(sourceFile))}${nextEntryText}${sourceText.slice(targetProperty.end)}`;
  }

  const closingBraceIndex = objectLiteral.end - 1;
  if (sourceText[closingBraceIndex] !== "}") {
    throw new Error(`Could not find the closing brace for '${declarationName}'.`);
  }

  const insertion = objectLiteral.properties.length > 0
    ? `\n\n  ${nextEntryText},\n`
    : `\n  ${nextEntryText},\n`;

  return `${sourceText.slice(0, closingBraceIndex)}${insertion}${sourceText.slice(closingBraceIndex)}`;
}

function removeArrayObjectEntry(sourceText: string, declarationName: string, contentId: string) {
  const sourceFile = ts.createSourceFile(
    `${declarationName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const arrayLiteral = findArrayLiteralInitializer(sourceFile, declarationName);
  if (!arrayLiteral) {
    return sourceText;
  }

  const targetElement = arrayLiteral.elements.find(
    (element) => ts.isObjectLiteralExpression(element) && getObjectLiteralId(element, sourceFile) === contentId
  );

  if (!targetElement) {
    return sourceText;
  }

  let removeStart = targetElement.getStart(sourceFile);
  let removeEnd = targetElement.end;

  while (removeEnd < sourceText.length && /[\s,]/.test(sourceText[removeEnd])) {
    if (sourceText[removeEnd] === ",") {
      removeEnd += 1;
      break;
    }
    removeEnd += 1;
  }

  while (removeStart > 0 && /[ \t]/.test(sourceText[removeStart - 1])) {
    removeStart -= 1;
  }

  if (removeStart > 0 && sourceText[removeStart - 1] === "\n") {
    removeStart -= 1;
  }

  return `${sourceText.slice(0, removeStart)}${sourceText.slice(removeEnd)}`;
}

function upsertArrayObjectEntry(
  sourceText: string,
  declarationName: string,
  previousId: string,
  nextId: string,
  nextValue: unknown
) {
  const sourceFile = ts.createSourceFile(
    `${declarationName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const arrayLiteral = findArrayLiteralInitializer(sourceFile, declarationName);
  if (!arrayLiteral) {
    throw new Error(`Could not find '${declarationName}' in the target source file.`);
  }

  const previousElement = arrayLiteral.elements.find(
    (element) => ts.isObjectLiteralExpression(element) && getObjectLiteralId(element, sourceFile) === previousId
  );
  const nextElement = arrayLiteral.elements.find(
    (element) => ts.isObjectLiteralExpression(element) && getObjectLiteralId(element, sourceFile) === nextId
  );

  if (previousElement && nextElement && previousElement !== nextElement) {
    throw new Error(
      `Cannot rename '${previousId}' to '${nextId}' because '${nextId}' already exists in '${declarationName}'.`
    );
  }

  const nextEntryText = `${serializeTsValue(nextValue, 1)}`;
  const targetElement = previousElement ?? nextElement;
  if (targetElement) {
    return `${sourceText.slice(0, targetElement.getStart(sourceFile))}${nextEntryText}${sourceText.slice(targetElement.end)}`;
  }

  const closingBracketIndex = arrayLiteral.end - 1;
  if (sourceText[closingBracketIndex] !== "]") {
    throw new Error(`Could not find the closing bracket for '${declarationName}'.`);
  }

  const insertion = arrayLiteral.elements.length > 0
    ? `\n    ${nextEntryText},\n`
    : `\n    ${nextEntryText},\n`;

  return `${sourceText.slice(0, closingBracketIndex)}${insertion}${sourceText.slice(closingBracketIndex)}`;
}

function removeCardFromClassCards(sourceText: string, contentId: string) {
  const sourceFile = ts.createSourceFile(
    "classCards.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const objectLiteral = findObjectLiteralInitializer(sourceFile, "CLASS_CARDS");
  if (!objectLiteral) {
    return sourceText;
  }

  let nextSourceText = sourceText;
  [...objectLiteral.properties].reverse().forEach((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) {
      return;
    }

    property.initializer.elements.forEach((element) => {
      if (ts.isObjectLiteralExpression(element) && getObjectLiteralId(element, sourceFile) === contentId) {
        nextSourceText = removeArrayElementByRange(nextSourceText, element.getStart(sourceFile), element.end);
      }
    });
  });

  return nextSourceText;
}

function removeArrayElementByRange(sourceText: string, start: number, end: number) {
  let removeStart = start;
  let removeEnd = end;

  while (removeEnd < sourceText.length && /[\s,]/.test(sourceText[removeEnd])) {
    if (sourceText[removeEnd] === ",") {
      removeEnd += 1;
      break;
    }
    removeEnd += 1;
  }

  while (removeStart > 0 && /[ \t]/.test(sourceText[removeStart - 1])) {
    removeStart -= 1;
  }

  if (removeStart > 0 && sourceText[removeStart - 1] === "\n") {
    removeStart -= 1;
  }

  return `${sourceText.slice(0, removeStart)}${sourceText.slice(removeEnd)}`;
}

function replaceDeclarationInitializerInFunction(
  sourceText: string,
  functionName: string,
  declarationName: string,
  nextValue: unknown,
  depth = 1
) {
  const sourceFile = ts.createSourceFile(
    `${functionName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const functionBody = findFunctionBody(sourceFile, functionName);
  if (!functionBody) {
    throw new Error(`Could not find '${functionName}' in the target source file.`);
  }

  let initializer: ts.Expression | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName &&
      node.initializer
    ) {
      initializer = node.initializer;
      return;
    }

    if (!initializer) {
      ts.forEachChild(node, visit);
    }
  }

  visit(functionBody);

  if (!initializer) {
    throw new Error(
      `Could not find '${declarationName}' inside '${functionName}' in the target source file.`
    );
  }

  return `${sourceText.slice(0, initializer.getStart(sourceFile))}${serializeTsValue(nextValue, depth)}${sourceText.slice(initializer.end)}`;
}

function replaceObjectLiteralByIdInFunction(
  sourceText: string,
  functionName: string,
  previousContentId: string,
  nextValue: unknown,
  depth = 2
) {
  const sourceFile = ts.createSourceFile(
    `${functionName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const functionBody = findFunctionBody(sourceFile, functionName);
  if (!functionBody) {
    throw new Error(`Could not find '${functionName}' in the target source file.`);
  }

  const matches: ts.ObjectLiteralExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node) && getObjectLiteralId(node, sourceFile) === previousContentId) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(functionBody);

  if (matches.length === 0) {
    throw new Error(
      `Could not find built-in '${previousContentId}' inside '${functionName}'.`
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Found multiple '${previousContentId}' object literals inside '${functionName}'. Write-back needs a unique built-in ID.`
    );
  }

  const targetObject = matches[0];
  return `${sourceText.slice(0, targetObject.getStart(sourceFile))}${serializeTsValue(nextValue, depth)}${sourceText.slice(targetObject.end)}`;
}

function upsertClassCardEntry(
  sourceText: string,
  previousId: string,
  nextId: string,
  classId: string,
  nextValue: unknown
) {
  const sourceFile = ts.createSourceFile(
    "classCards.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const objectLiteral = findObjectLiteralInitializer(sourceFile, "CLASS_CARDS");
  if (!objectLiteral) {
    throw new Error("Could not find 'CLASS_CARDS' in the target source file.");
  }

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) {
      continue;
    }

    const existingElement = property.initializer.elements.find(
      (element) =>
        ts.isObjectLiteralExpression(element) &&
        [previousId, nextId].includes(getObjectLiteralId(element, sourceFile) ?? "")
    );
    if (existingElement) {
      return `${sourceText.slice(0, existingElement.getStart(sourceFile))}${serializeTsValue(nextValue, 2)}${sourceText.slice(existingElement.end)}`;
    }
  }

  const targetProperty = objectLiteral.properties.find(
    (property) => getObjectPropertyName(property) === classId || normalizeClassId(getObjectPropertyName(property) ?? "") === classId
  );

  if (!targetProperty || !ts.isPropertyAssignment(targetProperty) || !ts.isArrayLiteralExpression(targetProperty.initializer)) {
    throw new Error(`Could not find a class card bucket for '${classId}' in CLASS_CARDS.`);
  }

  const arrayLiteral = targetProperty.initializer;
  const closingBracketIndex = arrayLiteral.end - 1;
  const insertion = arrayLiteral.elements.length > 0
    ? `\n        ${serializeTsValue(nextValue, 2)},\n    `
    : `\n        ${serializeTsValue(nextValue, 2)},\n    `;

  return `${sourceText.slice(0, closingBracketIndex)}${insertion}${sourceText.slice(closingBracketIndex)}`;
}

function cardSourceFileForRuntimeCard(runtimeData: any, fallbackSourceFile: string) {
  if (runtimeData.type === "core") {
    return "src/data/cards/coreCards.ts";
  }

  if (runtimeData.type === "class") {
    return "src/data/cards/classCards.ts";
  }

  if (typeof runtimeData.sourceEquipmentId === "string" && runtimeData.sourceEquipmentId.startsWith("module_")) {
    return "src/data/modules.ts";
  }

  if (fallbackSourceFile) {
    return fallbackSourceFile;
  }

  return "src/data/cards/equipmentCards.ts";
}

function gearSourceFileForRuntimeGear(runtimeData: any) {
  return runtimeData.slot === "weapon" ? "src/data/weapons.ts" : "src/data/armor.ts";
}

function gearDeclarationNameForSlot(slot: string) {
  switch (slot) {
    case "weapon":
      return "STARTER_WEAPONS";
    case "helmet":
      return "STARTER_HELMETS";
    case "chestpiece":
      return "STARTER_CHESTPIECES";
    case "accessory":
      return "STARTER_ACCESSORIES";
    default:
      throw new Error(`Unsupported gear slot '${slot}' for built-in write-back.`);
  }
}

function cardDeclarationNameForRuntimeCard(runtimeData: any, sourceFile: string) {
  if (sourceFile === "src/data/cards/coreCards.ts") {
    return "CORE_CARDS";
  }

  if (sourceFile === "src/data/modules.ts") {
    return "MODULE_CARDS";
  }

  if (sourceFile === "src/data/cards/equipmentCards.ts") {
    return "RAW_EQUIPMENT_CARDS";
  }

  if (sourceFile === "src/data/cards/classCards.ts") {
    return "CLASS_CARDS";
  }

  if (runtimeData.type === "core") {
    return "CORE_CARDS";
  }

  if (runtimeData.type === "class") {
    return "CLASS_CARDS";
  }

  return "RAW_EQUIPMENT_CARDS";
}

function normalizeQuestForBuiltInSource(runtimeData: any) {
  return {
    id: String(runtimeData.id),
    title: String(runtimeData.title ?? runtimeData.id ?? "Untitled Quest"),
    description: String(runtimeData.description ?? ""),
    questType: runtimeData.questType ?? "exploration",
    difficultyTier: Number(runtimeData.difficultyTier ?? 1),
    objectives: (runtimeData.objectives ?? []).map((objective: any) => ({
      id: String(objective.id ?? runtimeId(String(objective.description ?? "objective"), "objective")),
      type: objective.type ?? "reach_location",
      target: objective.target ?? "",
      current: Number(objective.current ?? 0),
      required: Number(objective.required ?? 1),
      description: String(objective.description ?? "")
    })),
    rewards: runtimeData.rewards ?? {},
    status: runtimeData.status ?? "available",
    metadata: runtimeData.metadata ?? undefined
  };
}

function normalizeClassForBuiltInSource(runtimeData: any) {
  return {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Untitled Class"),
    description: String(runtimeData.description ?? ""),
    tier: Number(runtimeData.tier ?? 0),
    baseStats: {
      maxHp: Number(runtimeData.baseStats?.maxHp ?? 0),
      atk: Number(runtimeData.baseStats?.atk ?? 0),
      def: Number(runtimeData.baseStats?.def ?? 0),
      agi: Number(runtimeData.baseStats?.agi ?? 0),
      acc: Number(runtimeData.baseStats?.acc ?? 0)
    },
    weaponTypes: Array.isArray(runtimeData.weaponTypes) ? runtimeData.weaponTypes.map(String) : [],
    unlockConditions: (runtimeData.unlockConditions ?? []).map((condition: any) => ({
      type: condition.type ?? "milestone",
      requiredClass: condition.requiredClass ?? condition.requiredClassId ?? undefined,
      requiredRank: condition.requiredRank ?? undefined,
      description: condition.description ?? undefined
    })),
    innateAbility: runtimeData.innateAbility ?? undefined
  };
}

function toEquipmentCardRange(range: unknown) {
  if (typeof range === "string") {
    return range;
  }

  if (typeof range === "number") {
    return range <= 0 ? "R(Self)" : `R(${range})`;
  }

  return undefined;
}

function normalizeGearForBuiltInSource(runtimeData: any) {
  const slot = String(runtimeData.slot ?? "weapon");
  const basePayload = {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Untitled Gear"),
    description: runtimeData.description ? String(runtimeData.description) : undefined,
    slot,
    stats: {
      atk: Number(runtimeData.stats?.atk ?? 0),
      def: Number(runtimeData.stats?.def ?? 0),
      agi: Number(runtimeData.stats?.agi ?? 0),
      acc: Number(runtimeData.stats?.acc ?? 0),
      hp: Number(runtimeData.stats?.hp ?? 0)
    },
    cardsGranted: Array.isArray(runtimeData.cardsGranted) ? runtimeData.cardsGranted.map(String) : [],
    inventory: runtimeData.inventory
      ? {
          massKg: Number(runtimeData.inventory.massKg ?? 0),
          bulkBu: Number(runtimeData.inventory.bulkBu ?? 0),
          powerW: Number(runtimeData.inventory.powerW ?? 0),
          startingOwned: Boolean(runtimeData.inventory.startingOwned ?? true)
        }
      : undefined,
    iconPath: runtimeData.iconPath ? String(runtimeData.iconPath) : undefined,
    metadata: runtimeData.metadata ?? undefined
  };

  if (slot !== "weapon") {
    return basePayload;
  }

  return {
    ...basePayload,
    slot: "weapon",
    weaponType: runtimeData.weaponType ? String(runtimeData.weaponType) : "sword",
    isMechanical: Boolean(runtimeData.isMechanical),
    moduleSlots: Number(runtimeData.moduleSlots ?? 0),
    attachedModules: Array.isArray(runtimeData.attachedModules) ? runtimeData.attachedModules.map(String) : [],
    wear: Number(runtimeData.wear ?? 0)
  };
}

function normalizeCardForBuiltInSource(runtimeData: any) {
  return {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Untitled Card"),
    type: runtimeData.type ?? runtimeData.cardType ?? "equipment",
    strainCost: Number(runtimeData.strainCost ?? 0),
    description: String(runtimeData.description ?? ""),
    range: toEquipmentCardRange(runtimeData.range),
    damage: typeof runtimeData.damage === "number" ? runtimeData.damage : undefined,
    sourceEquipmentId:
      runtimeData.type === "class" || runtimeData.cardType === "class"
        ? undefined
        : runtimeData.sourceEquipmentId
          ? String(runtimeData.sourceEquipmentId)
          : undefined,
    artPath: runtimeData.artPath ? String(runtimeData.artPath) : undefined
  };
}

function normalizeConsumableForBuiltInSource(runtimeData: any) {
  const metadata = runtimeData.metadata ?? {};
  const parsedValue = Number(metadata.value ?? runtimeData.quantity ?? 1);

  return {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Untitled Consumable"),
    description: String(runtimeData.description ?? ""),
    effect: String(metadata.effect ?? "heal"),
    value: Number.isFinite(parsedValue) ? parsedValue : 1
  };
}

function nullableSourceId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUnitForBuiltInSource(runtimeData: any) {
  const stats = {
    maxHp: Number(runtimeData.stats?.maxHp ?? runtimeData.maxHp ?? 1),
    atk: Number(runtimeData.stats?.atk ?? 0),
    def: Number(runtimeData.stats?.def ?? 0),
    agi: Number(runtimeData.stats?.agi ?? runtimeData.agi ?? 0),
    acc: Number(runtimeData.stats?.acc ?? 0)
  };
  const currentClassId = String(
    runtimeData.currentClassId ?? runtimeData.unitClass ?? runtimeData.classId ?? "squire"
  ).trim() || "squire";
  const description = String(runtimeData.description ?? "").trim();
  const pwr = Number(runtimeData.pwr ?? 1);
  const recruitCost = Number(runtimeData.recruitCost ?? 0);

  return {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Unnamed Unit"),
    description: description || undefined,
    isEnemy: false,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    agi: stats.agi,
    pos: null,
    hand: [],
    drawPile: [],
    discardPile: [],
    strain: 0,
    classId: currentClassId,
    unitClass: currentClassId,
    stats,
    deck: tsExpression("baseDeck"),
    loadout: {
      primaryWeapon: nullableSourceId(runtimeData.loadout?.primaryWeapon),
      secondaryWeapon: nullableSourceId(runtimeData.loadout?.secondaryWeapon),
      helmet: nullableSourceId(runtimeData.loadout?.helmet),
      chestpiece: nullableSourceId(runtimeData.loadout?.chestpiece),
      accessory1: nullableSourceId(runtimeData.loadout?.accessory1),
      accessory2: nullableSourceId(runtimeData.loadout?.accessory2)
    },
    affinities: tsExpression("createDefaultAffinities()"),
    startingInRoster: runtimeData.startingInRoster !== false,
    deployInParty: Boolean(runtimeData.deployInParty),
    pwr: Number.isFinite(pwr) ? pwr : 1,
    recruitCost: Number.isFinite(recruitCost) ? recruitCost : 0,
    traits: Array.isArray(runtimeData.traits) ? runtimeData.traits.map(String) : []
  };
}

function normalizeOperationRoomsForBuiltInSource(floorData: any) {
  const rooms = Array.isArray(floorData?.rooms)
    ? floorData.rooms
    : Array.isArray(floorData?.nodes)
      ? floorData.nodes
      : [];

  return rooms.map((room: any) => ({
    id: String(room.id ?? runtimeId(String(room.label ?? "room"), "room")),
    type: room.type ?? "battle",
    label: String(room.label ?? humanizeId(String(room.id ?? "room"))),
    position: {
      x: Number(room.position?.x ?? room.x ?? 0),
      y: Number(room.position?.y ?? room.y ?? 0)
    },
    connections: Array.isArray(room.connections) ? room.connections.map(String) : [],
    battleTemplate: room.battleTemplate ? String(room.battleTemplate) : undefined,
    eventTemplate: room.eventTemplate ? String(room.eventTemplate) : undefined,
    shopInventory: Array.isArray(room.shopInventory) ? room.shopInventory.map(String) : undefined
  }));
}

function normalizeOperationForBuiltInSource(runtimeData: any) {
  const floors = Array.isArray(runtimeData.floors) ? runtimeData.floors : [];
  if (floors.length !== 1) {
    throw new Error(
      `Built-in operation write-back currently supports exactly one floor in 'src/core/initialState.ts'. '${runtimeData.id ?? "operation"}' has ${floors.length}.`
    );
  }

  const [floorData] = floors;
  const nodes = normalizeOperationRoomsForBuiltInSource(floorData);
  if (nodes.length === 0) {
    throw new Error(
      `Built-in operation '${runtimeData.id ?? "operation"}' must have at least one room before publishing to 'src/core/initialState.ts'.`
    );
  }

  const startingNodeId = String(
    floorData.startingRoomId ?? floorData.startingNodeId ?? runtimeData.currentRoomId ?? nodes[0].id
  );
  const currentFloorIndex = Number(runtimeData.currentFloorIndex ?? 0);

  return {
    nodes,
    floor: {
      id: String(floorData.id ?? "floor_1"),
      name: String(floorData.name ?? "Floor 1"),
      nodes: tsExpression("nodes"),
      startingNodeId
    },
    operation: {
      id: String(runtimeData.id),
      codename: String(runtimeData.codename ?? runtimeData.id ?? "Operation"),
      description: String(runtimeData.description ?? ""),
      currentFloorIndex: Number.isFinite(currentFloorIndex) ? currentFloorIndex : 0,
      floors: [tsExpression("floor")],
      currentRoomId: String(runtimeData.currentRoomId ?? startingNodeId)
    }
  };
}

function mapSourceFunctionForBuiltInMap(contentId: string) {
  switch (contentId) {
    case "base_camp":
      return "createBaseCampMap";
    case "free_zone_1":
      return "createFreeZoneMap";
    case "quarters":
      return "createQuartersMap";
    default:
      throw new Error(
        `Built-in map '${contentId}' does not have a dedicated source write-back function in 'src/field/maps.ts'.`
      );
  }
}

function normalizeFieldTileType(type: unknown, walkable: boolean) {
  switch (type) {
    case "floor":
    case "wall":
    case "grass":
    case "dirt":
    case "stone":
      return type;
    default:
      return walkable ? "floor" : "wall";
  }
}

function normalizeMapForBuiltInSource(runtimeData: any) {
  const width = Number(runtimeData.width ?? 1);
  const height = Number(runtimeData.height ?? 1);
  const tiles = Array.isArray(runtimeData.tiles) ? runtimeData.tiles : [];
  const normalizedTiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const tile = tiles[y]?.[x] ?? { x, y, walkable: true, type: "floor" };
      const walkable = Boolean(tile.walkable);
      return {
        x,
        y,
        walkable,
        type: normalizeFieldTileType(tile.type, walkable)
      };
    })
  );

  return {
    id: String(runtimeData.id),
    name: String(runtimeData.name ?? runtimeData.id ?? "Field Map"),
    width,
    height,
    tiles: normalizedTiles,
    objects: (runtimeData.objects ?? []).map((object: any) => ({
      id: String(object.id ?? runtimeId(String(object.metadata?.name ?? "object"), "object")),
      x: Number(object.x ?? 0),
      y: Number(object.y ?? 0),
      width: Number(object.width ?? 1),
      height: Number(object.height ?? 1),
      type: object.type ?? "station",
      sprite: object.sprite ? String(object.sprite) : undefined,
      metadata: object.metadata ?? undefined
    })),
    interactionZones: (runtimeData.interactionZones ?? runtimeData.zones ?? []).map((zone: any) => ({
      id: String(zone.id ?? runtimeId(String(zone.label ?? "interaction"), "interaction")),
      x: Number(zone.x ?? 0),
      y: Number(zone.y ?? 0),
      width: Number(zone.width ?? 1),
      height: Number(zone.height ?? 1),
      action: zone.action ?? "custom",
      label: String(zone.label ?? humanizeId(String(zone.id ?? "INTERACTION"))),
      metadata: zone.metadata ?? undefined
    }))
  };
}

function normalizeNpcForBuiltInSource(runtimeData: any) {
  const routePoints = Array.isArray(runtimeData.routePoints)
    ? runtimeData.routePoints
        .map((point: any, index: number) => ({
          id: String(point?.id ?? runtimeId(`route_point_${index + 1}`, "route_point")),
          x: Number(point?.x ?? 0),
          y: Number(point?.y ?? 0)
        }))
        .filter((point: { id: string }) => point.id.trim())
    : [];

  const normalizedNpc: Record<string, unknown> = {
    id: String(runtimeData.id ?? "npc_entry"),
    name: String(runtimeData.name ?? "NPC"),
    mapId: String(runtimeData.mapId ?? "base_camp"),
    tileX: Number(runtimeData.x ?? runtimeData.tileX ?? 0),
    tileY: Number(runtimeData.y ?? runtimeData.tileY ?? 0),
    routeMode: runtimeData.routeMode ?? "none"
  };

  if (runtimeData.dialogueId) {
    normalizedNpc.dialogueId = String(runtimeData.dialogueId);
  }

  if (runtimeData.portraitKey) {
    normalizedNpc.portraitKey = String(runtimeData.portraitKey);
  }

  if (runtimeData.spriteKey) {
    normalizedNpc.spriteKey = String(runtimeData.spriteKey);
  }

  if (runtimeData.portraitPath) {
    normalizedNpc.portraitPath = String(runtimeData.portraitPath);
  }

  if (runtimeData.spritePath) {
    normalizedNpc.spritePath = String(runtimeData.spritePath);
  }

  if (routePoints.length > 0) {
    normalizedNpc.routePoints = routePoints;
  }

  return normalizedNpc;
}

function flattenDialogueGraphForBuiltInSource(runtimeData: any) {
  if (Array.isArray(runtimeData.lines)) {
    return runtimeData.lines.map(String);
  }

  const nodes = Array.isArray(runtimeData.nodes) ? runtimeData.nodes : [];
  if (nodes.length === 0) {
    throw new Error(
      `Built-in dialogue '${runtimeData.id ?? "dialogue"}' has no runtime nodes to write back into 'src/field/npcs.ts'.`
    );
  }

  const nodeById = new Map<string, any>();
  nodes.forEach((node: any) => {
    if (node?.id) {
      nodeById.set(String(node.id), node);
    }
  });

  let currentNodeId = String(runtimeData.entryNodeId ?? nodes[0]?.id ?? "");
  const visited = new Set<string>();
  const lines: string[] = [];

  while (currentNodeId) {
    if (visited.has(currentNodeId)) {
      throw new Error(
        `Built-in dialogue '${runtimeData.id ?? "dialogue"}' loops at '${currentNodeId}', which cannot be flattened into NPC_DIALOGUE string arrays.`
      );
    }
    visited.add(currentNodeId);

    const node = nodeById.get(currentNodeId);
    if (!node) {
      throw new Error(
        `Built-in dialogue '${runtimeData.id ?? "dialogue"}' references missing node '${currentNodeId}'.`
      );
    }

    if (node.condition) {
      throw new Error(
        `Built-in dialogue '${runtimeData.id ?? "dialogue"}' uses a condition on '${currentNodeId}', which cannot be represented in NPC_DIALOGUE string arrays. Publish it as a Technica dialogue override instead.`
      );
    }

    if (node.type === "line") {
      lines.push(String(node.text ?? ""));
      currentNodeId = node.nextNodeId ? String(node.nextNodeId) : "";
      continue;
    }

    if (node.type === "jump") {
      currentNodeId = node.targetNodeId ? String(node.targetNodeId) : "";
      continue;
    }

    if (node.type === "end") {
      break;
    }

    throw new Error(
      `Built-in dialogue '${runtimeData.id ?? "dialogue"}' contains '${node.type}' node '${currentNodeId}', which cannot be represented in NPC_DIALOGUE string arrays. Publish it as a Technica dialogue override instead.`
    );
  }

  if (lines.length === 0) {
    throw new Error(
      `Built-in dialogue '${runtimeData.id ?? "dialogue"}' must contain at least one line before publishing to NPC_DIALOGUE.`
    );
  }

  return lines;
}

function replaceFunctionBody(sourceText: string, functionName: string, nextBody: string) {
  const sourceFile = ts.createSourceFile(
    `${functionName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const functionBody = findFunctionBody(sourceFile, functionName);
  if (!functionBody) {
    throw new Error(`Could not find '${functionName}' in the target source file.`);
  }

  return `${sourceText.slice(0, functionBody.getStart(sourceFile))}{\n${nextBody}\n}${sourceText.slice(functionBody.end)}`;
}

async function writeBuiltInItemEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/core/crafting.ts") {
    throw new Error(
      `Built-in resource rows like '${previousContentId}' are hardcoded in Chaos Core and do not have a safe native item table write-back path yet.`
    );
  }

  if (String(runtimeData.kind ?? "consumable") !== "consumable") {
    throw new Error(
      `Built-in '${runtimeData.kind}' item '${previousContentId}' does not map to CONSUMABLE_DATABASE. Edit consumables here, and use Gear Editor for equipment.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in consumable '${previousContentId}' is not supported yet because recipe rows reference resultItemId separately.`
    );
  }

  const sourcePath = path.join(repoPath, "src", "core", "crafting.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextSourceText = upsertTopLevelObjectEntry(
    sourceText,
    "CONSUMABLE_DATABASE",
    previousContentId,
    nextContentId,
    normalizeConsumableForBuiltInSource(runtimeData)
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/core/crafting.ts"
  };
}

async function writeBuiltInGearEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  const nextContentId = String(runtimeData.id ?? previousContentId);
  const nextSourceRelativePath = gearSourceFileForRuntimeGear(runtimeData);
  const nextDeclaration = gearDeclarationNameForSlot(String(runtimeData.slot ?? "weapon"));
  const nextPayload = normalizeGearForBuiltInSource({ ...runtimeData, id: nextContentId });

  if (sourceRelativePath === nextSourceRelativePath) {
    const sourcePath = path.join(repoPath, nextSourceRelativePath);
    let sourceText = await fs.readFile(sourcePath, "utf8");

    if (nextSourceRelativePath === "src/data/armor.ts") {
      const declarationNames = ["STARTER_HELMETS", "STARTER_CHESTPIECES", "STARTER_ACCESSORIES"];
      declarationNames
        .filter((declarationName) => declarationName !== nextDeclaration)
        .forEach((declarationName) => {
          sourceText = removeArrayObjectEntry(sourceText, declarationName, previousContentId);
        });
    }

    sourceText = upsertArrayObjectEntry(
      sourceText,
      nextDeclaration,
      previousContentId,
      nextContentId,
      nextPayload
    );
    await fs.writeFile(sourcePath, sourceText, "utf8");

    return {
      entryKey: `game:${nextContentId}`,
      contentId: nextContentId,
      runtimeFile: nextSourceRelativePath
    };
  }

  const oldSourcePath = path.join(repoPath, sourceRelativePath);
  let oldSourceText = await fs.readFile(oldSourcePath, "utf8");
  if (sourceRelativePath === "src/data/weapons.ts") {
    oldSourceText = removeArrayObjectEntry(oldSourceText, "STARTER_WEAPONS", previousContentId);
  } else if (sourceRelativePath === "src/data/armor.ts") {
    ["STARTER_HELMETS", "STARTER_CHESTPIECES", "STARTER_ACCESSORIES"].forEach((declarationName) => {
      oldSourceText = removeArrayObjectEntry(oldSourceText, declarationName, previousContentId);
    });
  }
  await fs.writeFile(oldSourcePath, oldSourceText, "utf8");

  const nextSourcePath = path.join(repoPath, nextSourceRelativePath);
  const nextSourceText = upsertArrayObjectEntry(
    await fs.readFile(nextSourcePath, "utf8"),
    nextDeclaration,
    previousContentId,
    nextContentId,
    nextPayload
  );
  await fs.writeFile(nextSourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: nextSourceRelativePath
  };
}

async function writeBuiltInCardEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  const nextContentId = String(runtimeData.id ?? previousContentId);
  const nextSourceRelativePath = cardSourceFileForRuntimeCard(runtimeData, sourceRelativePath);
  const nextDeclaration = cardDeclarationNameForRuntimeCard(runtimeData, nextSourceRelativePath);
  const nextPayload = normalizeCardForBuiltInSource({ ...runtimeData, id: nextContentId });

  if (sourceRelativePath !== nextSourceRelativePath) {
    const oldSourcePath = path.join(repoPath, sourceRelativePath);
    let oldSourceText = await fs.readFile(oldSourcePath, "utf8");
    if (sourceRelativePath === "src/data/cards/classCards.ts") {
      oldSourceText = removeCardFromClassCards(oldSourceText, previousContentId);
    } else {
      const oldDeclaration = cardDeclarationNameForRuntimeCard(runtimeData, sourceRelativePath);
      oldSourceText = removeArrayObjectEntry(oldSourceText, oldDeclaration, previousContentId);
    }
    await fs.writeFile(oldSourcePath, oldSourceText, "utf8");
  }

  const nextSourcePath = path.join(repoPath, nextSourceRelativePath);
  let nextSourceText = await fs.readFile(nextSourcePath, "utf8");

  if (nextDeclaration === "CLASS_CARDS") {
    nextSourceText = sourceRelativePath === nextSourceRelativePath
      ? upsertClassCardEntry(
          nextSourceText,
          previousContentId,
          nextContentId,
          normalizeClassId(String(runtimeData.sourceClassId ?? "freelancer")),
          nextPayload
        )
      : upsertClassCardEntry(
          removeCardFromClassCards(nextSourceText, previousContentId),
          previousContentId,
          nextContentId,
          normalizeClassId(String(runtimeData.sourceClassId ?? "freelancer")),
          nextPayload
        );
  } else {
    nextSourceText = upsertArrayObjectEntry(
      nextSourceText,
      nextDeclaration,
      previousContentId,
      nextContentId,
      nextPayload
    );
  }

  await fs.writeFile(nextSourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: nextSourceRelativePath
  };
}

async function writeBuiltInSchemaEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/core/schemaSystem.ts") {
    throw new Error(
      `Built-in schema '${previousContentId}' must be written back through 'src/core/schemaSystem.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in schema '${previousContentId}' is not supported yet because Chaos Core core/fortification ids are fixed type keys.`
    );
  }

  const sourcePath = path.join(repoPath, "src", "core", "schemaSystem.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const existsInCore = hasTopLevelObjectEntry(sourceText, "SCHEMA_CORE_DEFINITIONS", previousContentId);
  const existsInFortifications = hasTopLevelObjectEntry(
    sourceText,
    "SCHEMA_FORTIFICATION_DEFINITIONS",
    previousContentId
  );

  if (!existsInCore && !existsInFortifications) {
    throw new Error(`Could not find built-in schema '${previousContentId}' in Chaos Core's schema definitions.`);
  }

  const currentKind = existsInFortifications ? "fortification" : "core";
  const nextKind = runtimeData?.kind === "fortification" ? "fortification" : "core";
  if (currentKind !== nextKind) {
    throw new Error(
      `Changing built-in schema '${previousContentId}' between core and fortification is not supported yet. Keep the same authorization type for live game edits.`
    );
  }

  const declarationName =
    currentKind === "fortification" ? "SCHEMA_FORTIFICATION_DEFINITIONS" : "SCHEMA_CORE_DEFINITIONS";
  const schemaModule = await importRepoModule<{
    SCHEMA_CORE_DEFINITIONS: Record<string, any>;
    SCHEMA_FORTIFICATION_DEFINITIONS: Record<string, any>;
  }>(repoPath, "src/core/schemaSystem.ts");
  const existingValue =
    currentKind === "fortification"
      ? schemaModule.SCHEMA_FORTIFICATION_DEFINITIONS[previousContentId]
      : schemaModule.SCHEMA_CORE_DEFINITIONS[previousContentId];
  const nextPayload = normalizeBuiltInSchemaForSource({ ...runtimeData, kind: nextKind }, existingValue);
  const nextSourceText = upsertTopLevelObjectEntry(
    sourceText,
    declarationName,
    previousContentId,
    nextContentId,
    nextPayload
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/core/schemaSystem.ts"
  };
}

async function writeBuiltInUnitEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/core/initialState.ts") {
    throw new Error(
      `Built-in unit '${previousContentId}' must be written back through 'src/core/initialState.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in starter unit '${previousContentId}' is not supported yet because the surrounding disable guards are still keyed to that ID.`
    );
  }

  const sourcePath = path.join(repoPath, "src", "core", "initialState.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextSourceText = replaceObjectLiteralByIdInFunction(
    sourceText,
    "createStarterUnits",
    previousContentId,
    normalizeUnitForBuiltInSource({
      ...runtimeData,
      id: nextContentId
    }),
    2
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/core/initialState.ts"
  };
}

async function writeBuiltInOperationEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/core/initialState.ts") {
    throw new Error(
      `Built-in operation '${previousContentId}' must be written back through 'src/core/initialState.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in operation '${previousContentId}' is not supported yet because the operation lookup and disable guards are still keyed to that ID.`
    );
  }

  const sourcePath = path.join(repoPath, "src", "core", "initialState.ts");
  const normalized = normalizeOperationForBuiltInSource({
    ...runtimeData,
    id: nextContentId
  });

  let nextSourceText = await fs.readFile(sourcePath, "utf8");
  nextSourceText = replaceDeclarationInitializerInFunction(
    nextSourceText,
    "createOperationIronGate",
    "nodes",
    normalized.nodes,
    1
  );
  nextSourceText = replaceDeclarationInitializerInFunction(
    nextSourceText,
    "createOperationIronGate",
    "floor",
    normalized.floor,
    1
  );
  nextSourceText = replaceDeclarationInitializerInFunction(
    nextSourceText,
    "createOperationIronGate",
    "operation",
    normalized.operation,
    1
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/core/initialState.ts"
  };
}

async function writeBuiltInMapEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/field/maps.ts") {
    throw new Error(
      `Built-in map '${previousContentId}' must be written back through 'src/field/maps.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in map '${previousContentId}' is not supported yet because the map registry and transition metadata are still keyed to that ID.`
    );
  }

  const functionName = mapSourceFunctionForBuiltInMap(previousContentId);
  const normalizedMap = normalizeMapForBuiltInSource({
    ...runtimeData,
    id: nextContentId
  });
  const sourcePath = path.join(repoPath, "src", "field", "maps.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextBody = `  return ${serializeTsValue(normalizedMap, 1)};`;
  const nextSourceText = replaceFunctionBody(sourceText, functionName, nextBody);

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/field/maps.ts"
  };
}

async function writeBuiltInDialogueEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/field/npcs.ts") {
    throw new Error(
      `Built-in dialogue '${previousContentId}' must be written back through 'src/field/npcs.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  if (nextContentId !== previousContentId) {
    throw new Error(
      `Renaming built-in dialogue '${previousContentId}' is not supported yet because existing NPC references are keyed to that dialogue ID.`
    );
  }

  const sourcePath = path.join(repoPath, "src", "field", "npcs.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextSourceText = upsertTopLevelObjectEntry(
    sourceText,
    "NPC_DIALOGUE",
    previousContentId,
    nextContentId,
    flattenDialogueGraphForBuiltInSource(runtimeData)
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/field/npcs.ts"
  };
}

async function writeBuiltInNpcEntry(
  repoPath: string,
  previousContentId: string,
  sourceRelativePath: string,
  runtimeData: any
) {
  if (sourceRelativePath !== "src/field/npcs.ts") {
    throw new Error(
      `Built-in NPC '${previousContentId}' must be written back through 'src/field/npcs.ts'.`
    );
  }

  const nextContentId = String(runtimeData.id ?? previousContentId);
  const sourcePath = path.join(repoPath, "src", "field", "npcs.ts");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextSourceText = upsertArrayObjectEntry(
    sourceText,
    "BUILT_IN_NPCS",
    previousContentId,
    nextContentId,
    normalizeNpcForBuiltInSource({
      ...runtimeData,
      id: nextContentId
    })
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: "src/field/npcs.ts"
  };
}

async function writeBuiltInEntry(
  repoPath: string,
  contentType: ContentType,
  entryKey: string,
  payloadPath: string,
  sourceRelativePath = ""
) {
  const [origin, previousContentId] = entryKey.split(":");
  if (origin !== "game" || !previousContentId) {
    throw new Error(`Write-back only supports built-in game rows. Received '${entryKey}'.`);
  }

  const runtimeData = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const nextContentId = String(runtimeData.id ?? previousContentId);

  let sourcePath: string;
  let declarationName: string;
  let sourcePayload: unknown;

  switch (contentType) {
    case "quest":
      sourcePath = path.join(repoPath, "src", "quests", "questData.ts");
      declarationName = "QUEST_DATABASE";
      sourcePayload = normalizeQuestForBuiltInSource({
        ...runtimeData,
        id: nextContentId
      });
      break;
    case "class":
      sourcePath = path.join(repoPath, "src", "core", "classes.ts");
      declarationName = "CLASS_DEFINITIONS";
      sourcePayload = normalizeClassForBuiltInSource({
        ...runtimeData,
        id: nextContentId
      });
      break;
    case "schema":
      return writeBuiltInSchemaEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/core/schemaSystem.ts",
        runtimeData
      );
    case "gear":
      return writeBuiltInGearEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || gearSourceFileForRuntimeGear(runtimeData),
        runtimeData
      );
    case "item":
      return writeBuiltInItemEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/core/crafting.ts",
        runtimeData
      );
    case "card":
      return writeBuiltInCardEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || cardSourceFileForRuntimeCard(runtimeData, ""),
        runtimeData
      );
    case "map":
      return writeBuiltInMapEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/field/maps.ts",
        runtimeData
      );
    case "dialogue":
      return writeBuiltInDialogueEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/field/npcs.ts",
        runtimeData
      );
    case "npc":
      return writeBuiltInNpcEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/field/npcs.ts",
        runtimeData
      );
    case "unit":
      return writeBuiltInUnitEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/core/initialState.ts",
        runtimeData
      );
    case "operation":
      return writeBuiltInOperationEntry(
        repoPath,
        previousContentId,
        sourceRelativePath || "src/core/initialState.ts",
        runtimeData
      );
    default:
      throw new Error(
        `Built-in source write-back is not implemented for '${contentType}' yet. This tab still publishes Technica overrides.`
      );
  }

  const sourceText = await fs.readFile(sourcePath, "utf8");
  const nextSourceText = upsertTopLevelObjectEntry(
    sourceText,
    declarationName,
    previousContentId,
    nextContentId,
    sourcePayload
  );

  await fs.writeFile(sourcePath, nextSourceText, "utf8");

  return {
    entryKey: `game:${nextContentId}`,
    contentId: nextContentId,
    runtimeFile: relativeToRepo(repoPath, sourcePath)
  };
}

export async function main() {
  installNodeStubs();

  const [, , command, repoPath, contentType, entryKey, payloadPath, sourceRelativePath] = process.argv;
  if (command !== "list" && command !== "load" && command !== "writeback") {
    throw new Error("Expected command 'list', 'load', or 'writeback'.");
  }

  if (!repoPath || !contentType) {
    throw new Error(
      "Usage: tsx chaosCoreDatabaseSnapshot.ts <list|load|writeback> <repoPath> <contentType> [entryKey] [payloadPath]"
    );
  }

  const normalizedContentType = contentType as ContentType;
  if (!Object.hasOwn(CONTENT_EXTENSIONS, normalizedContentType)) {
    throw new Error(`Unsupported content type '${contentType}'.`);
  }

  const result = command === "list"
    ? await listEntries(repoPath, normalizedContentType)
    : command === "load"
      ? await loadEntry(repoPath, normalizedContentType, entryKey ?? "")
      : await writeBuiltInEntry(
          repoPath,
          normalizedContentType,
          entryKey ?? "",
          payloadPath ?? "",
          sourceRelativePath ?? ""
        );

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectExecution =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
