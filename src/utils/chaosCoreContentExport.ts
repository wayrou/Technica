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
import type { ClassDocument, ClassUnlockConditionDocument } from "../types/class";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import type { UnitDocument } from "../types/unit";
import { createImageAssetExport } from "./assets";
import { isoNow } from "./date";
import { createWorkspaceReferenceIndex } from "./chaosCoreExport";
import { runtimeId, slugify } from "./id";

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

function createManifest(
  contentType: ExportManifest["contentType"],
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
    targetGame: "chaos-core",
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

function buildGearDependencies(document: GearDocument): ExportDependency[] {
  return document.cardsGranted.map((cardId) => ({
    contentType: "card" as const,
    id: runtimeId(cardId),
    relation: "grants-card"
  }));
}

export function buildChaosCoreGearBundle(
  document: GearDocument,
  references = createWorkspaceReferenceIndex({ gear: document })
): ExportBundle {
  buildGearDependencies(document).forEach((dependency) => {
    assertKnownReference(dependency.id, references.cardIds, "Gear export", "card id");
  });

  const contentId = runtimeId(document.id || document.name, "gear");
  const entryFile = `${contentId}.gear.json`;
  const sourceFile = `${contentId}.source.json`;
  const iconAsset = document.iconAsset ? createImageAssetExport(contentId, "icon", document.iconAsset) : null;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    slot: document.slot,
    weaponType: document.weaponType,
    isMechanical: document.isMechanical,
    stats: document.stats,
    cardsGranted: document.cardsGranted.map((cardId) => runtimeId(cardId)),
    moduleSlots: document.moduleSlots,
    attachedModules: document.attachedModules,
    wear: document.wear,
    inventory: document.inventory,
    iconPath: iconAsset?.runtimePath,
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "gear",
    "equipment.v1",
    contentId,
    document.name,
    "Chaos Core runtime equipment export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(iconAsset ? [iconAsset.runtimePath] : []), "README.md"],
    buildGearDependencies(document)
  );

  const readme = `# Chaos Core Gear Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported gear registers into Chaos Core's equipment pool and base storage when marked as starting owned.
- Granted card ids are normalized for direct deck and catalog use.
- Attached gear icons resolve through \`iconPath\` when present.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-gear-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      ...(iconAsset ? [iconAsset.file] : []),
      { name: "README.md", content: readme }
    ]
  };
}

export function buildChaosCoreItemBundle(
  document: ItemDocument,
  _references = createWorkspaceReferenceIndex({ item: document })
): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "item");
  const entryFile = `${contentId}.item.json`;
  const sourceFile = `${contentId}.source.json`;
  const iconAsset = document.iconAsset ? createImageAssetExport(contentId, "icon", document.iconAsset) : null;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    kind: document.kind,
    stackable: document.stackable,
    quantity: document.quantity,
    massKg: document.massKg,
    bulkBu: document.bulkBu,
    powerW: document.powerW,
    iconPath: iconAsset?.runtimePath,
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "item",
    "inventory-item.v1",
    contentId,
    document.name,
    "Chaos Core runtime inventory item export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(iconAsset ? [iconAsset.runtimePath] : []), "README.md"],
    []
  );

  const readme = `# Chaos Core Item Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported items land in Chaos Core base storage using their explicit mass, bulk, and power values.
- Stackable items preserve quantity.
- Attached item icons resolve through \`iconPath\` when present.
- \`${sourceFile}\` preserves the authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-item-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      ...(iconAsset ? [iconAsset.file] : []),
      { name: "README.md", content: readme }
    ]
  };
}

export function buildChaosCoreNpcBundle(
  document: NpcDocument,
  references = createWorkspaceReferenceIndex({ npc: document })
): ExportBundle {
  if (document.mapId) {
    assertKnownReference(document.mapId, references.mapIds, "NPC export", "map id");
  }

  if (document.dialogueId) {
    assertKnownReference(document.dialogueId, references.dialogueIds, "NPC export", "dialogue id");
  }

  const contentId = runtimeId(document.id || document.name, "npc");
  const entryFile = `${contentId}.npc.json`;
  const sourceFile = `${contentId}.source.json`;
  const portraitAsset = document.portraitAsset ? createImageAssetExport(contentId, "portrait", document.portraitAsset) : null;
  const spriteAsset = document.spriteAsset ? createImageAssetExport(contentId, "sprite", document.spriteAsset) : null;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    mapId: runtimeId(document.mapId, "base_camp"),
    x: document.tileX,
    y: document.tileY,
    routeMode: document.routeMode,
    routePoints: document.routePoints.map((point) => ({
      id: runtimeId(point.id, "route_point"),
      x: point.x,
      y: point.y
    })),
    dialogueId: document.dialogueId ? runtimeId(document.dialogueId) : undefined,
    portraitKey: document.portraitKey || undefined,
    spriteKey: document.spriteKey || undefined,
    portraitPath: portraitAsset?.runtimePath,
    spritePath: spriteAsset?.runtimePath,
    metadata: coerceRecord(document.metadata)
  });

  const dependencies: ExportDependency[] = [
    {
      contentType: "map",
      id: runtimeId(document.mapId, "base_camp"),
      relation: "spawn-map"
    },
    ...(document.dialogueId
      ? [
          {
            contentType: "dialogue" as const,
            id: runtimeId(document.dialogueId),
            relation: "dialogue"
          }
        ]
      : [])
  ];

  const manifest = createManifest(
    "npc",
    "npc.v1",
    contentId,
    document.name,
    "Chaos Core runtime field NPC export.",
    entryFile,
    [
      "manifest.json",
      entryFile,
      sourceFile,
      ...(portraitAsset ? [portraitAsset.runtimePath] : []),
      ...(spriteAsset ? [spriteAsset.runtimePath] : []),
      "README.md"
    ],
    dependencies
  );

  const readme = `# Chaos Core NPC Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported NPCs spawn on their declared map id and can use fixed, random, or no movement routes.
- Dialogue references use \`dialogueId\` so the Dialogue Editor can reuse speaker names and runtime conversations.
- Portrait and sprite assets resolve through \`portraitPath\` and \`spritePath\` when present.
- \`${sourceFile}\` preserves the original Technica NPC document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-npc-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      ...(portraitAsset ? [portraitAsset.file] : []),
      ...(spriteAsset ? [spriteAsset.file] : []),
      { name: "README.md", content: readme }
    ]
  };
}

function buildCardDependencies(document: CardDocument): ExportDependency[] {
  const dependencies: ExportDependency[] = [];

  if (document.sourceClassId) {
    dependencies.push({
      contentType: "class",
      id: runtimeId(document.sourceClassId),
      relation: "source-class"
    });
  }

  if (document.sourceEquipmentId) {
    dependencies.push({
      contentType: "gear",
      id: runtimeId(document.sourceEquipmentId),
      relation: "source-gear"
    });
  }

  return dependencies;
}

export function buildChaosCoreCardBundle(
  document: CardDocument,
  references = createWorkspaceReferenceIndex({ card: document })
): ExportBundle {
  buildCardDependencies(document).forEach((dependency) => {
    if (dependency.contentType === "class") {
      assertKnownReference(dependency.id, references.classIds, "Card export", "class id");
    }
    if (dependency.contentType === "gear") {
      assertKnownReference(dependency.id, references.gearIds, "Card export", "gear id");
    }
  });

  const contentId = runtimeId(document.id || document.name, "card");
  const entryFile = `${contentId}.card.json`;
  const sourceFile = `${contentId}.source.json`;
  const artAsset = document.artAsset ? createImageAssetExport(contentId, "art", document.artAsset) : null;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    type: document.cardType,
    rarity: document.rarity,
    category: document.category,
    strainCost: document.strainCost,
    targetType: document.targetType,
    range: document.range,
    damage: document.damage,
    effects: document.effects,
    sourceClassId: document.sourceClassId ? runtimeId(document.sourceClassId) : undefined,
    sourceEquipmentId: document.sourceEquipmentId ? runtimeId(document.sourceEquipmentId) : undefined,
    artPath: artAsset?.runtimePath,
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "card",
    "battle-card.v1",
    contentId,
    document.name,
    "Chaos Core runtime battle card export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(artAsset ? [artAsset.runtimePath] : []), "README.md"],
    buildCardDependencies(document)
  );

  const readme = `# Chaos Core Card Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported cards populate both the battle card runtime and Chaos Core's card library metadata.
- Class and gear source references are normalized when provided.
- Attached card art resolves through \`artPath\` when present.
- \`${sourceFile}\` preserves the authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-card-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      ...(artAsset ? [artAsset.file] : []),
      { name: "README.md", content: readme }
    ]
  };
}

function buildUnitDependencies(document: UnitDocument): ExportDependency[] {
  const dependencies: ExportDependency[] = [];

  if (document.currentClassId) {
    dependencies.push({
      contentType: "class",
      id: runtimeId(document.currentClassId),
      relation: "current-class"
    });
  }

  const gearRefs = Object.values(document.loadout).filter(Boolean);
  gearRefs.forEach((gearId, index) => {
    dependencies.push({
      contentType: "gear",
      id: runtimeId(gearId),
      relation: `loadout-slot-${index + 1}`
    });
  });

  return dependencies;
}

export function buildChaosCoreUnitBundle(
  document: UnitDocument,
  references = createWorkspaceReferenceIndex({ unit: document })
): ExportBundle {
  buildUnitDependencies(document).forEach((dependency) => {
    if (dependency.contentType === "class") {
      assertKnownReference(dependency.id, references.classIds, "Unit export", "class id");
    }
    if (dependency.contentType === "gear") {
      assertKnownReference(dependency.id, references.gearIds, "Unit export", "gear id");
    }
  });

  const contentId = runtimeId(document.id || document.name, "unit");
  const entryFile = `${contentId}.unit.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    currentClassId: runtimeId(document.currentClassId),
    stats: document.stats,
    loadout: {
      primaryWeapon: document.loadout.primaryWeapon ? runtimeId(document.loadout.primaryWeapon) : undefined,
      secondaryWeapon: document.loadout.secondaryWeapon ? runtimeId(document.loadout.secondaryWeapon) : undefined,
      helmet: document.loadout.helmet ? runtimeId(document.loadout.helmet) : undefined,
      chestpiece: document.loadout.chestpiece ? runtimeId(document.loadout.chestpiece) : undefined,
      accessory1: document.loadout.accessory1 ? runtimeId(document.loadout.accessory1) : undefined,
      accessory2: document.loadout.accessory2 ? runtimeId(document.loadout.accessory2) : undefined
    },
    traits: document.traits,
    pwr: document.pwr,
    recruitCost: document.recruitCost,
    startingInRoster: document.startingInRoster,
    deployInParty: document.deployInParty,
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "unit",
    "unit-template.v1",
    contentId,
    document.name,
    "Chaos Core runtime unit template export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildUnitDependencies(document)
  );

  const readme = `# Chaos Core Unit Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported units can be added straight into the roster and optionally the current party.
- Loadout references are normalized to imported or built-in gear ids.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-unit-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function buildOperationDependencies(document: OperationDocument): ExportDependency[] {
  const dependencies: ExportDependency[] = [];

  document.floors.forEach((floor) => {
    floor.rooms.forEach((room) => {
      room.shopInventory.forEach((gearId) => {
        dependencies.push({
          contentType: "gear",
          id: runtimeId(gearId),
          relation: `shop-inventory:${runtimeId(room.id)}`
        });
      });
    });
  });

  return dependencies;
}

export function buildChaosCoreOperationBundle(
  document: OperationDocument,
  references = createWorkspaceReferenceIndex({ operation: document })
): ExportBundle {
  buildOperationDependencies(document).forEach((dependency) => {
    assertKnownReference(dependency.id, references.gearIds, "Operation export", "gear id");
  });

  const contentId = runtimeId(document.id || document.codename, "operation");
  const entryFile = `${contentId}.operation.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    codename: document.codename,
    description: document.description,
    recommendedPower: document.recommendedPower,
    floors: document.floors.map((floor) => ({
      id: runtimeId(floor.id),
      name: floor.name,
      startingRoomId: runtimeId(floor.startingRoomId),
      rooms: floor.rooms.map((room) =>
        pruneEmpty({
          id: runtimeId(room.id),
          label: room.label,
          type: room.type,
          position: { x: room.x, y: room.y },
          connections: room.connections.map((connectionId) => runtimeId(connectionId)),
          battleTemplate: room.battleTemplate,
          eventTemplate: room.eventTemplate,
          shopInventory: room.shopInventory.map((gearId) => runtimeId(gearId)),
          metadata: coerceRecord(room.metadata)
        })
      )
    })),
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "operation",
    "operation.v1",
    contentId,
    document.codename,
    "Chaos Core runtime operation export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildOperationDependencies(document)
  );

  const readme = `# Chaos Core Operation Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported operations appear in Chaos Core's operation select screen as direct-run missions.
- Room coordinates, connections, and optional shop inventory are exported explicitly.
- \`${sourceFile}\` preserves the authoring document.
`;

  return {
    bundleName: `${slugify(document.codename, contentId)}-chaos-core-operation-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function buildClassDependencies(document: ClassDocument): ExportDependency[] {
  return document.unlockConditions.flatMap((condition: ClassUnlockConditionDocument) => {
    if (condition.type !== "class_rank" || !condition.requiredClassId) {
      return [];
    }
    return [
      {
        contentType: "class" as const,
        id: runtimeId(condition.requiredClassId),
        relation: "unlock-condition"
      }
    ];
  });
}

export function buildChaosCoreClassBundle(
  document: ClassDocument,
  references = createWorkspaceReferenceIndex({ class: document })
): ExportBundle {
  buildClassDependencies(document).forEach((dependency) => {
    assertKnownReference(dependency.id, references.classIds, "Class export", "class id");
  });

  const contentId = runtimeId(document.id || document.name, "class");
  const entryFile = `${contentId}.class.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    tier: document.tier,
    baseStats: document.baseStats,
    weaponTypes: document.weaponTypes,
    unlockConditions: document.unlockConditions.map((condition) =>
      pruneEmpty({
        type: condition.type,
        requiredClassId: condition.requiredClassId ? runtimeId(condition.requiredClassId) : undefined,
        requiredRank: condition.requiredRank,
        description: condition.description
      })
    ),
    innateAbility: document.innateAbility,
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "class",
    "class.v1",
    contentId,
    document.name,
    "Chaos Core runtime class definition export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildClassDependencies(document)
  );

  const readme = `# Chaos Core Class Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported classes register beside built-in classes and appear in class management flows.
- Unlock conditions preserve rank and milestone metadata.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-class-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}
