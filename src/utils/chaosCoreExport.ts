import {
  TECHNICA_SCHEMA_VERSION,
  TECHNICA_SOURCE_APP,
  TECHNICA_SOURCE_APP_VERSION,
  type ExportBundle,
  type ExportDependency,
  type ExportManifest,
  type KeyValueRecord
} from "../types/common";
import type { CardDocument } from "../types/card";
import type { ClassDocument } from "../types/class";
import type { DialogueChoice, DialogueDocument, DialogueEntry, DialogueLabel, DialogueLine } from "../types/dialogue";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { MapDocument, MapObject, MapTile, MapZone, TerrainType } from "../types/map";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import type { QuestDocument, QuestObjective, QuestReward } from "../types/quest";
import type { UnitDocument } from "../types/unit";
import { isoNow } from "./date";
import { extractDialogueOccurrenceRules } from "./dialogueOccurrence";
import { runtimeId, slugify } from "./id";

export interface WorkspaceReferenceIndex {
  dialogueIds: Set<string>;
  questIds: Set<string>;
  mapIds: Set<string>;
  gearIds: Set<string>;
  itemIds: Set<string>;
  cardIds: Set<string>;
  unitIds: Set<string>;
  operationIds: Set<string>;
  classIds: Set<string>;
  npcIds: Set<string>;
  sceneIds: Set<string>;
  locationIds: Set<string>;
}

interface ChaosCoreFieldTile {
  x: number;
  y: number;
  walkable: boolean;
  type: "floor" | "wall" | "grass" | "dirt" | "stone";
  metadata?: Record<string, unknown>;
}

interface ChaosCoreFieldObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "station" | "resource" | "enemy" | "door" | "decoration";
  sprite?: string;
  metadata?: Record<string, unknown>;
}

interface ChaosCoreInteractionZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action:
    | "shop"
    | "workshop"
    | "roster"
    | "loadout"
    | "ops_terminal"
    | "quest_board"
    | "tavern"
    | "gear_workbench"
    | "port"
    | "dispatch"
    | "quarters"
    | "black_market"
    | "stable"
    | "comms-array"
    | "mini_core"
    | "fcp_test"
    | "free_zone_entry"
    | "base_camp_entry"
    | "custom";
  label: string;
  metadata?: Record<string, unknown>;
}

interface ChaosCoreFieldMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: ChaosCoreFieldTile[][];
  objects: ChaosCoreFieldObject[];
  interactionZones: ChaosCoreInteractionZone[];
  metadata?: Record<string, unknown>;
}

interface ChaosCoreQuestObjective {
  id: string;
  type:
    | "kill_enemies"
    | "kill_specific_enemy"
    | "clear_node"
    | "collect_item"
    | "collect_resource"
    | "reach_location"
    | "talk_to_npc"
    | "complete_battle"
    | "spend_wad"
    | "craft_item";
  target: string | number;
  current: number;
  required: number;
  description: string;
}

interface ChaosCoreQuestReward {
  wad?: number;
  xp?: number;
  resources?: Record<string, number>;
  items?: Array<{ id: string; quantity: number }>;
}

interface ChaosCoreQuest {
  id: string;
  title: string;
  description: string;
  questType: "hunt" | "escort" | "exploration" | "delivery" | "collection" | "clear";
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  objectives: ChaosCoreQuestObjective[];
  rewards: ChaosCoreQuestReward;
  status: "available" | "active" | "completed" | "failed";
  metadata?: Record<string, unknown>;
}

interface DialogueEffect {
  type: "set_flag";
  key: string;
  value: string | number | boolean;
}

interface DialogueChoiceNodeChoice {
  id: string;
  text: string;
  targetNodeId: string;
  condition?: string;
  tags?: string[];
  effects?: DialogueEffect[];
  metadata?: Record<string, unknown>;
}

type ChaosCoreDialogueNode =
  | {
      id: string;
      type: "line";
      speaker: string;
      text: string;
      mood?: string;
      portraitKey?: string;
      sceneId?: string;
      condition?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      nextNodeId?: string;
    }
  | {
      id: string;
      type: "choice_set";
      choices: DialogueChoiceNodeChoice[];
    }
  | {
      id: string;
      type: "effect";
      effects: DialogueEffect[];
      nextNodeId?: string;
      condition?: string;
    }
  | {
      id: string;
      type: "jump";
      targetNodeId: string;
      condition?: string;
    }
  | {
      id: string;
      type: "end";
    };

interface ChaosCoreDialogue {
  id: string;
  title: string;
  sceneId: string;
  entryNodeId: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  nodes: ChaosCoreDialogueNode[];
  source?: {
    rawSource: string;
  };
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function pruneEmpty<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value
      .map((entry) => pruneEmpty(entry))
      .filter((entry) => entry !== undefined && entry !== null) as TValue;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, pruneEmpty(entry)] as const)
      .filter(([, entry]) => {
        if (entry === undefined || entry === null) {
          return false;
        }

        if (Array.isArray(entry)) {
          return entry.length > 0;
        }

        if (typeof entry === "object") {
          return Object.keys(entry).length > 0;
        }

        return true;
      });

    return Object.fromEntries(entries) as TValue;
  }

  return value;
}

function coercePrimitive(value: string) {
  const trimmed = value.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return trimmed;
}

function coerceNonNullPrimitive(value: string) {
  const coerced = coercePrimitive(value);
  return coerced === null ? "null" : coerced;
}

function coerceRecord(record: KeyValueRecord) {
  return Object.entries(record).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[key] = coercePrimitive(value);
    return accumulator;
  }, {});
}

function dedupeDependencies(dependencies: ExportDependency[]) {
  const seen = new Set<string>();
  return dependencies.filter((dependency) => {
    const key = `${dependency.contentType}:${dependency.id}:${dependency.relation}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function ensureUnique(ids: string[], label: string) {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate ids: ${Array.from(new Set(duplicates)).join(", ")}`);
  }
}

function createManifest(
  contentType: "dialogue" | "quest" | "map",
  targetGame: string,
  targetSchemaVersion: string,
  contentId: string,
  title: string,
  description: string,
  entryFile: string,
  files: string[],
  dependencies: ExportDependency[]
): ExportManifest {
  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: contentType,
    contentType,
    targetGame,
    targetSchemaVersion,
    exportedAt: isoNow(),
    contentId,
    title,
    description,
    entryFile,
    dependencies: dedupeDependencies(dependencies),
    files
  };
}

function readStoredDocument<TValue>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as TValue;
  } catch {
    return null;
  }
}

export function createWorkspaceReferenceIndex(documents?: {
  dialogue?: DialogueDocument;
  quest?: QuestDocument;
  map?: MapDocument;
  gear?: GearDocument;
  item?: ItemDocument;
  card?: CardDocument;
  unit?: UnitDocument;
  operation?: OperationDocument;
  class?: ClassDocument;
  npc?: NpcDocument;
}): WorkspaceReferenceIndex {
  const dialogueDocument =
    documents?.dialogue ?? readStoredDocument<DialogueDocument>("technica.dialogue.document") ?? null;
  const questDocument = documents?.quest ?? readStoredDocument<QuestDocument>("technica.quest.document") ?? null;
  const mapDocument = documents?.map ?? readStoredDocument<MapDocument>("technica.map.document") ?? null;
  const gearDocument = documents?.gear ?? readStoredDocument<GearDocument>("technica.gear.document") ?? null;
  const itemDocument = documents?.item ?? readStoredDocument<ItemDocument>("technica.item.document") ?? null;
  const cardDocument = documents?.card ?? readStoredDocument<CardDocument>("technica.card.document") ?? null;
  const unitDocument = documents?.unit ?? readStoredDocument<UnitDocument>("technica.unit.document") ?? null;
  const operationDocument =
    documents?.operation ?? readStoredDocument<OperationDocument>("technica.operation.document") ?? null;
  const classDocument = documents?.class ?? readStoredDocument<ClassDocument>("technica.class.document") ?? null;
  const npcDocument = documents?.npc ?? readStoredDocument<NpcDocument>("technica.npc.document") ?? null;
  const dialogueId = documents?.dialogue?.id;

  const dialogueIds = new Set<string>();
  const questIds = new Set<string>();
  const mapIds = new Set<string>();
  const gearIds = new Set<string>();
  const itemIds = new Set<string>();
  const cardIds = new Set<string>();
  const unitIds = new Set<string>();
  const operationIds = new Set<string>();
  const classIds = new Set<string>();
  const npcIds = new Set<string>();
  const sceneIds = new Set<string>();
  const locationIds = new Set<string>();

  if (documents?.dialogue) {
    dialogueIds.add(runtimeId(documents.dialogue.id));
    if (documents.dialogue.sceneId) {
      sceneIds.add(runtimeId(documents.dialogue.sceneId));
    }
  }
  if (documents?.quest) {
    questIds.add(runtimeId(documents.quest.id));
  }
  if (documents?.map) {
    mapIds.add(runtimeId(documents.map.id));
    sceneIds.add(runtimeId(documents.map.id));
    documents.map.objects.forEach((item) => locationIds.add(runtimeId(item.id)));
    documents.map.zones.forEach((item) => locationIds.add(runtimeId(item.id)));
  }
  if (documents?.gear) {
    gearIds.add(runtimeId(documents.gear.id));
  }
  if (documents?.item) {
    itemIds.add(runtimeId(documents.item.id));
  }
  if (documents?.card) {
    cardIds.add(runtimeId(documents.card.id));
  }
  if (documents?.unit) {
    unitIds.add(runtimeId(documents.unit.id));
  }
  if (documents?.operation) {
    operationIds.add(runtimeId(documents.operation.id));
  }
  if (documents?.class) {
    classIds.add(runtimeId(documents.class.id));
  }
  if (documents?.npc) {
    npcIds.add(runtimeId(documents.npc.id));
  }

  if (typeof window !== "undefined") {
    const rawDialogueSource = window.localStorage.getItem("technica.dialogue.source");
    if (rawDialogueSource && !dialogueId) {
      try {
        const lines = rawDialogueSource.split(/\r?\n/);
        const idLine = lines.find((line) => line.trim().startsWith("@id "));
        const sceneLine = lines.find((line) => line.trim().startsWith("@scene "));
        if (idLine) {
          dialogueIds.add(runtimeId(idLine.trim().slice(4)));
        }
        if (sceneLine) {
          sceneIds.add(runtimeId(sceneLine.trim().slice(7)));
        }
      } catch {
        // Ignore malformed stored source.
      }
    }
  }

  if (questDocument) {
    questIds.add(runtimeId(questDocument.id));
  }
  if (mapDocument) {
    mapIds.add(runtimeId(mapDocument.id));
    sceneIds.add(runtimeId(mapDocument.id));
    mapDocument.objects.forEach((item) => locationIds.add(runtimeId(item.id)));
    mapDocument.zones.forEach((item) => locationIds.add(runtimeId(item.id)));
  }
  if (gearDocument) {
    gearIds.add(runtimeId(gearDocument.id));
  }
  if (itemDocument) {
    itemIds.add(runtimeId(itemDocument.id));
  }
  if (cardDocument) {
    cardIds.add(runtimeId(cardDocument.id));
  }
  if (unitDocument) {
    unitIds.add(runtimeId(unitDocument.id));
  }
  if (operationDocument) {
    operationIds.add(runtimeId(operationDocument.id));
  }
  if (classDocument) {
    classIds.add(runtimeId(classDocument.id));
  }
  if (npcDocument) {
    npcIds.add(runtimeId(npcDocument.id));
  }

  return {
    dialogueIds,
    questIds,
    mapIds,
    gearIds,
    itemIds,
    cardIds,
    unitIds,
    operationIds,
    classIds,
    npcIds,
    sceneIds,
    locationIds
  };
}

function assertKnownReference(
  id: string | undefined,
  bucket: Set<string>,
  label: string,
  relation: string,
  ignoreWhenEmpty = true
) {
  if (!id) {
    return;
  }

  if (ignoreWhenEmpty && bucket.size === 0) {
    return;
  }

  if (!bucket.has(runtimeId(id))) {
    throw new Error(`${label} references missing ${relation} '${id}'.`);
  }
}

function mapTerrainType(terrain: TerrainType, walkable: boolean): { type: ChaosCoreFieldTile["type"]; metadata?: Record<string, unknown> } {
  switch (terrain) {
    case "grass":
      return { type: "grass" };
    case "road":
      return { type: "dirt", metadata: { visualTerrain: "road" } };
    case "stone":
      return { type: walkable ? "stone" : "wall" };
    case "water":
      return { type: "wall", metadata: { visualTerrain: "water" } };
    case "forest":
      return { type: "grass", metadata: { visualTerrain: "forest" } };
    case "sand":
      return { type: "dirt", metadata: { visualTerrain: "sand" } };
    default:
      return { type: "floor", metadata: { visualTerrain: terrain } };
  }
}

function mapObjectType(type: string, action: string) {
  const normalized = runtimeId(type);
  if (normalized === "station" || normalized === "resource" || normalized === "enemy" || normalized === "door" || normalized === "decoration") {
    return normalized;
  }
  if (action) {
    return "station";
  }
  return "decoration";
}

function mapInteractionAction(action: string) {
  const allowedActions = new Set([
    "shop",
    "workshop",
    "roster",
    "loadout",
    "ops_terminal",
    "quest_board",
    "tavern",
    "gear_workbench",
    "port",
    "dispatch",
    "quarters",
    "black_market",
    "stable",
    "comms-array",
    "mini_core",
    "fcp_test",
    "free_zone_entry",
    "base_camp_entry",
    "custom"
  ]);

  const normalized = action.trim();
  if (allowedActions.has(normalized)) {
    return normalized as ChaosCoreInteractionZone["action"];
  }

  return "custom";
}

function normalizeZoneLabel(label: string, fallback: string) {
  const value = label.trim() || fallback.trim();
  return value.toUpperCase();
}

function createMapInteractionZoneFromObject(object: MapObject): MapZone | null {
  const hasInteraction = object.action.trim() || object.metadata.questId || object.metadata.dialogueId || object.metadata.targetMap;
  if (!hasInteraction) {
    return null;
  }

  return {
    id: `${runtimeId(object.id)}_interact`,
    label: object.label || object.id,
    action: object.action || "custom",
    x: object.x,
    y: object.y,
    width: object.width,
      height: object.height,
      metadata: {
        ...object.metadata,
        handlerId: object.action || "custom"
      }
    };
}

function shareZoneRect(zone: MapZone, object: MapObject) {
  return (
    zone.x === object.x &&
    zone.y === object.y &&
    zone.width === object.width &&
    zone.height === object.height
  );
}

function buildMapDependencies(objects: MapObject[], zones: MapZone[]): ExportDependency[] {
  const dependencies: ExportDependency[] = [];

  const appendMetadataDependencies = (metadata: KeyValueRecord, relationPrefix: string) => {
    if (metadata.questId) {
      dependencies.push({ contentType: "quest", id: runtimeId(metadata.questId), relation: `${relationPrefix}-quest` });
    }
    if (metadata.dialogueId) {
      dependencies.push({ contentType: "dialogue", id: runtimeId(metadata.dialogueId), relation: `${relationPrefix}-dialogue` });
    }
    if (metadata.targetMap) {
      dependencies.push({ contentType: "map", id: runtimeId(metadata.targetMap), relation: `${relationPrefix}-target-map` });
    }
    if (metadata.sceneId) {
      dependencies.push({ contentType: "scene", id: runtimeId(metadata.sceneId), relation: `${relationPrefix}-scene` });
    }
  };

  objects.forEach((object) => appendMetadataDependencies(object.metadata, `object:${runtimeId(object.id)}`));
  zones.forEach((zone) => appendMetadataDependencies(zone.metadata, `interaction:${runtimeId(zone.id)}`));

  return dependencies;
}

export function buildChaosCoreMapBundle(document: MapDocument, references = createWorkspaceReferenceIndex({ map: document })): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "field_map");
  const mergedZones = [
    ...document.zones,
    ...document.objects
      .filter((object) => !document.zones.some((zone) => shareZoneRect(zone, object)))
      .map((object) => createMapInteractionZoneFromObject(object))
      .filter((zone): zone is MapZone => zone !== null)
  ];

  const normalizedObjectIds = document.objects.map((item) => runtimeId(item.id));
  const normalizedZoneIds = mergedZones.map((item) => runtimeId(item.id));
  ensureUnique(normalizedObjectIds, "Map objects");
  ensureUnique(normalizedZoneIds, "Interaction zones");

  buildMapDependencies(document.objects, mergedZones).forEach((dependency) => {
    if (dependency.contentType === "dialogue") {
      assertKnownReference(dependency.id, references.dialogueIds, "Map export", "dialogue id");
    }
    if (dependency.contentType === "quest") {
      assertKnownReference(dependency.id, references.questIds, "Map export", "quest id");
    }
    if (dependency.contentType === "map") {
      assertKnownReference(dependency.id, references.mapIds, "Map export", "map id");
    }
    if (dependency.contentType === "scene") {
      assertKnownReference(dependency.id, references.sceneIds, "Map export", "scene id");
    }
  });

  const runtimeMap: ChaosCoreFieldMap = pruneEmpty({
    id: contentId,
    name: document.name,
    width: document.width,
    height: document.height,
    tiles: document.tiles.map((row, y) =>
      row.map((tile, x) => {
        const mapped = mapTerrainType(tile.terrain, tile.walkable);
        return pruneEmpty({
          x,
          y,
          walkable: tile.walkable && mapped.type !== "wall",
          type: tile.wall ? "wall" : mapped.type,
          metadata: {
            ...mapped.metadata,
            ...coerceRecord(tile.metadata)
          }
        });
      })
    ),
    objects: document.objects.map((object) =>
      pruneEmpty({
        id: runtimeId(object.id),
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        type: mapObjectType(object.type, object.action),
        sprite: object.sprite || undefined,
        metadata: {
          ...(object.label ? { name: object.label } : {}),
          ...(runtimeId(object.type) !== mapObjectType(object.type, object.action)
            ? { sourceObjectType: object.type }
            : {}),
          ...coerceRecord(object.metadata)
        }
      })
    ),
    interactionZones: mergedZones.map((zone) =>
      pruneEmpty({
        id: runtimeId(zone.id),
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        action: mapInteractionAction(zone.action),
        label: normalizeZoneLabel(zone.label, zone.id),
        metadata: {
          ...(mapInteractionAction(zone.action) === "custom" && zone.action ? { handlerId: zone.action } : {}),
          ...coerceRecord(zone.metadata)
        }
      })
    ),
    metadata: coerceRecord(document.metadata)
  });

  const entryFile = `${contentId}.fieldmap.json`;
  const sourceFile = `${contentId}.source.json`;
  const manifest = createManifest(
    "map",
    "chaos-core",
    "field-map.v1",
    contentId,
    document.name,
    "Chaos Core runtime field map export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildMapDependencies(document.objects, mergedZones)
  );

  const readme = `# Chaos Core Map Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- The runtime file already matches Chaos Core's field map shape closely.
- \`interactionZones\` are exported explicitly for all interactive map content.
- \`${sourceFile}\` preserves the original Technica authoring model.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-map-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeMap) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function mapQuestObjectiveType(type: QuestObjective["type"]): ChaosCoreQuestObjective["type"] {
  switch (type) {
    case "talk":
      return "talk_to_npc";
    case "visit":
      return "reach_location";
    case "collect":
      return "collect_item";
    case "defeat":
      return "kill_specific_enemy";
    default:
      throw new Error(`Quest objective type '${type}' is not supported by the Chaos Core export.`);
  }
}

function buildQuestRewards(rewards: QuestReward[]) {
  const runtimeRewards: ChaosCoreQuestReward = {};
  const extensionEffects: Array<{ key: string; value: string | number | boolean }> = [];
  const extensionRewards: QuestReward[] = [];

  rewards.forEach((reward) => {
    if (reward.type === "xp") {
      runtimeRewards.xp = (runtimeRewards.xp ?? 0) + reward.amount;
      return;
    }

    if (reward.type === "currency") {
      const currencyKey = runtimeId(reward.value || reward.label, "wad");
      if (currencyKey === "wad") {
        runtimeRewards.wad = (runtimeRewards.wad ?? 0) + reward.amount;
      } else {
        runtimeRewards.resources = {
          ...(runtimeRewards.resources ?? {}),
          [currencyKey]: ((runtimeRewards.resources ?? {})[currencyKey] ?? 0) + reward.amount
        };
      }
      return;
    }

    if (reward.type === "item") {
      runtimeRewards.items = [...(runtimeRewards.items ?? []), { id: runtimeId(reward.value || reward.label), quantity: reward.amount }];
      return;
    }

    if (reward.type === "flag") {
      extensionEffects.push({
        key: runtimeId(reward.value || reward.label),
        value: true
      });
      return;
    }

    extensionRewards.push(reward);
  });

  return {
    runtimeRewards: pruneEmpty(runtimeRewards),
    extensionEffects,
    extensionRewards
  };
}

function extractQuestDependencies(document: QuestDocument): ExportDependency[] {
  const dependencies: ExportDependency[] = [];

  document.prerequisites.forEach((entry) => {
    const [type, rawId] = entry.split(":");
    if (!rawId) {
      return;
    }
    if (type === "dialogue") {
      dependencies.push({ contentType: "dialogue", id: runtimeId(rawId), relation: "prerequisite" });
    } else if (type === "quest") {
      dependencies.push({ contentType: "quest", id: runtimeId(rawId), relation: "prerequisite" });
    }
  });

  document.followUpQuestIds.forEach((questId) => {
    dependencies.push({ contentType: "quest", id: runtimeId(questId), relation: "follow-up" });
  });

  document.requiredQuestIds.forEach((questId) => {
    dependencies.push({ contentType: "quest", id: runtimeId(questId), relation: "unlock-requires-quest" });
  });

  return dependencies;
}

export function buildChaosCoreQuestBundle(document: QuestDocument, references = createWorkspaceReferenceIndex({ quest: document })): ExportBundle {
  const contentId = runtimeId(document.id || document.title, "quest");
  const normalizedObjectiveIds = document.objectives.map((objective) => runtimeId(objective.id));
  ensureUnique(normalizedObjectiveIds, "Quest objectives");

  extractQuestDependencies(document).forEach((dependency) => {
    if (dependency.contentType === "dialogue") {
      assertKnownReference(dependency.id, references.dialogueIds, "Quest export", "dialogue id");
    }
  });

  document.objectives.forEach((objective) => {
    if (objective.type === "visit") {
      assertKnownReference(objective.target, references.locationIds, "Quest export", "location target");
    }
  });

  const { runtimeRewards, extensionEffects, extensionRewards } = buildQuestRewards(document.rewards);

  const runtimeQuest: ChaosCoreQuest = pruneEmpty({
    id: contentId,
    title: document.title,
    description: document.summary || document.description,
    questType: document.questType,
    difficultyTier: document.difficultyTier,
    status: document.status || "available",
    objectives: document.objectives.map((objective) => ({
      id: runtimeId(objective.id),
      type: mapQuestObjectiveType(objective.type),
      target: objective.target,
      current: 0,
      required: objective.targetCount,
      description: objective.description || objective.title
    })),
    rewards: runtimeRewards,
    metadata: pruneEmpty({
      summary: document.summary || undefined,
      tags: document.tags,
      prerequisites: document.prerequisites,
      requiredQuestIds: document.requiredQuestIds.map((entry) => runtimeId(entry)),
      followUpQuestIds: document.followUpQuestIds.map((entry) => runtimeId(entry)),
      chaosCoreExtensions: {
        onComplete: extensionEffects.length > 0 ? { setFlags: extensionEffects } : undefined,
        unsupportedRewards: extensionRewards.length > 0 ? extensionRewards : undefined
      }
    })
  });

  const entryFile = `${contentId}.quest.json`;
  const sourceFile = `${contentId}.source.json`;
  const manifest = createManifest(
    "quest",
    "chaos-core",
    "quest.v1",
    contentId,
    document.title,
    "Chaos Core runtime quest export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    extractQuestDependencies(document)
  );

  const readme = `# Chaos Core Quest Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- The runtime file is shaped for Chaos Core's quest system.
- Authoring-only quest flow details are preserved in \`${sourceFile}\`.
- Unsupported reward/effect concepts are preserved in \`metadata.chaosCoreExtensions\`.
`;

  return {
    bundleName: `${slugify(document.title, contentId)}-chaos-core-quest-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeQuest) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function dialogueEntryNodeId(label: string, entry: DialogueEntry, index: number, choiceSetIndex: number) {
  if (entry.kind === "line") {
    return index === 0 ? runtimeId(label) : `${runtimeId(label)}_line_${index + 1}`;
  }
  if (entry.kind === "choice") {
    return choiceSetIndex === 0 ? `${runtimeId(label)}_choices` : `${runtimeId(label)}_choices_${choiceSetIndex + 1}`;
  }
  if (entry.kind === "set") {
    return `${runtimeId(label)}_effect_${index + 1}`;
  }
  if (entry.kind === "jump") {
    return `${runtimeId(label)}_jump_${index + 1}`;
  }
  return `${runtimeId(label)}_end`;
}

function extractEffectsFromChoice(choice: DialogueChoice): DialogueEffect[] {
  return Object.entries(choice.setFlags).map(([key, value]) => ({
    type: "set_flag",
    key: runtimeId(key),
    value: coerceNonNullPrimitive(value)
  }));
}

function extractEffectsFromSet(entry: DialogueEntry): DialogueEffect[] {
  if (entry.kind !== "set") {
    return [];
  }
  return [
    {
      type: "set_flag",
      key: runtimeId(entry.flag),
      value: coerceNonNullPrimitive(entry.value)
    }
  ];
}

function buildDialogueDependencies(document: DialogueDocument): ExportDependency[] {
  const dependencies: ExportDependency[] = [];
  if (document.sceneId) {
    dependencies.push({ contentType: "scene", id: runtimeId(document.sceneId), relation: "scene" });
  }

  const occurrenceRules = extractDialogueOccurrenceRules(document.metadata);
  if (occurrenceRules.npcId) {
    dependencies.push({
      contentType: "npc",
      id: runtimeId(occurrenceRules.npcId),
      relation: "assigned-npc"
    });
  }

  occurrenceRules.requiredGearIds.forEach((gearId) => {
    dependencies.push({
      contentType: "gear",
      id: runtimeId(gearId),
      relation: "unlock-requires-gear"
    });
  });

  occurrenceRules.requiredQuestIds.forEach((questId) => {
    dependencies.push({
      contentType: "quest",
      id: runtimeId(questId),
      relation: "unlock-requires-quest"
    });
  });

  occurrenceRules.requiredItemIds.forEach((itemId) => {
    dependencies.push({
      contentType: "item",
      id: runtimeId(itemId),
      relation: "unlock-requires-item"
    });
  });

  occurrenceRules.requiredFieldModIds.forEach((fieldModId) => {
    dependencies.push({
      contentType: "fieldmod",
      id: runtimeId(fieldModId),
      relation: "unlock-requires-fieldmod"
    });
  });

  occurrenceRules.requiredSchemaIds.forEach((schemaId) => {
    dependencies.push({
      contentType: "schema",
      id: runtimeId(schemaId),
      relation: "unlock-requires-schema"
    });
  });

  return dependencies;
}

export function buildChaosCoreDialogueBundle(document: DialogueDocument, references = createWorkspaceReferenceIndex({ dialogue: document })): ExportBundle {
  const contentId = runtimeId(document.id || document.title, "dialogue");
  assertKnownReference(document.sceneId, references.sceneIds, "Dialogue export", "scene id");

  const labelIds = new Set(document.labels.map((label) => label.label));
  document.labels.forEach((label) => {
    label.entries.forEach((entry) => {
      if ((entry.kind === "choice" || entry.kind === "jump") && !labelIds.has(entry.target)) {
        throw new Error(`Dialogue label '${label.label}' references missing target '${entry.target}'.`);
      }
    });
    if (label.autoContinueTarget && !labelIds.has(label.autoContinueTarget)) {
      throw new Error(
        `Dialogue label '${label.label}' uses missing post-choice continuation target '${label.autoContinueTarget}'.`
      );
    }
  });

  const entryNodeByLabel = new Map<string, string>();
  document.labels.forEach((label) => {
    const firstEntry = label.entries[0];
    if (!firstEntry) {
      throw new Error(`Dialogue label '${label.label}' is empty.`);
    }
    entryNodeByLabel.set(label.label, dialogueEntryNodeId(label.label, firstEntry, 0, 0));
  });

  const nodes: ChaosCoreDialogueNode[] = [];
  document.labels.forEach((label) => {
    let index = 0;
    let choiceSetIndex = 0;

    while (index < label.entries.length) {
      const entry = label.entries[index];
      const nextEntry = label.entries[index + 1];
      const currentNodeId = dialogueEntryNodeId(label.label, entry, index, choiceSetIndex);

      if (entry.kind === "line") {
        const nextNodeId =
          nextEntry
            ? nextEntry.kind === "choice"
              ? dialogueEntryNodeId(label.label, nextEntry, index + 1, choiceSetIndex)
              : dialogueEntryNodeId(label.label, nextEntry, index + 1, choiceSetIndex)
            : label.autoContinueTarget
              ? entryNodeByLabel.get(label.autoContinueTarget) ?? runtimeId(label.autoContinueTarget)
              : undefined;

        nodes.push(
          pruneEmpty({
            id: currentNodeId,
            type: "line" as const,
            speaker: entry.speaker,
            text: entry.text,
            mood: entry.mood,
            portraitKey: entry.portraitKey,
            sceneId: entry.sceneId,
            condition: entry.condition,
            tags: entry.tags,
            metadata: coerceRecord(entry.metadata),
            nextNodeId
          })
        );
        index += 1;
        continue;
      }

      if (entry.kind === "choice") {
        const choices: DialogueChoice[] = [];
        while (index < label.entries.length && label.entries[index].kind === "choice") {
          choices.push(label.entries[index] as DialogueChoice);
          index += 1;
        }

        nodes.push({
          id: currentNodeId,
          type: "choice_set",
          choices: choices.map((choice) =>
            pruneEmpty({
              id: runtimeId(choice.text, `choice_${choices.indexOf(choice) + 1}`),
              text: choice.text,
              targetNodeId: entryNodeByLabel.get(choice.target) ?? runtimeId(choice.target),
              condition: choice.condition,
              tags: choice.tags,
              effects: extractEffectsFromChoice(choice),
              metadata: coerceRecord(choice.metadata)
            })
          )
        });
        choiceSetIndex += 1;
        continue;
      }

      if (entry.kind === "set") {
        nodes.push(
          pruneEmpty({
            id: currentNodeId,
            type: "effect" as const,
            effects: extractEffectsFromSet(entry),
            nextNodeId: nextEntry
              ? dialogueEntryNodeId(label.label, nextEntry, index + 1, choiceSetIndex)
              : label.autoContinueTarget
                ? entryNodeByLabel.get(label.autoContinueTarget) ?? runtimeId(label.autoContinueTarget)
                : undefined
          })
        );
        index += 1;
        continue;
      }

      if (entry.kind === "jump") {
        nodes.push({
          id: currentNodeId,
          type: "jump",
          targetNodeId: entryNodeByLabel.get(entry.target) ?? runtimeId(entry.target),
          condition: entry.condition
        });
        index += 1;
        continue;
      }

      nodes.push({
        id: currentNodeId,
        type: "end"
      });
      index += 1;
    }
  });

  ensureUnique(nodes.map((node) => node.id), "Dialogue nodes");

  const runtimeDialogue: ChaosCoreDialogue = pruneEmpty({
    id: contentId,
    title: document.title,
    sceneId: runtimeId(document.sceneId),
    entryNodeId: entryNodeByLabel.get(document.entryLabel) ?? runtimeId(document.entryLabel),
    tags: document.tags,
    metadata: coerceRecord(document.metadata),
    nodes,
    source: {
      rawSource: document.rawSource
    }
  });

  const entryFile = `${contentId}.dialogue.json`;
  const sourceFile = `${contentId}.source.json`;
  const rawSourceFile = `${contentId}.dialogue.txt`;
  const manifest = createManifest(
    "dialogue",
    "chaos-core",
    "dialogue.v1",
    contentId,
    document.title,
    "Chaos Core runtime dialogue graph export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, rawSourceFile, "README.md"],
    buildDialogueDependencies(document)
  );

  const readme = `# Chaos Core Dialogue Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- The runtime file contains a normalized dialogue node graph with stable node ids.
- Structured effects are exported explicitly; the runtime does not need to re-parse author text.
- \`${sourceFile}\` and \`${rawSourceFile}\` preserve the Technica authoring source.
`;

  return {
    bundleName: `${slugify(document.title, contentId)}-chaos-core-dialogue-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDialogue) },
      { name: sourceFile, content: prettyJson(document) },
      { name: rawSourceFile, content: document.rawSource },
      { name: "README.md", content: readme }
    ]
  };
}
