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
import type { ChassisDocument } from "../types/chassis";
import type { ChatterDocument } from "../types/chatter";
import type { ClassDocument, ClassUnlockConditionDocument } from "../types/class";
import type { CodexDocument } from "../types/codex";
import type { CraftingDocument } from "../types/crafting";
import type { DishDocument } from "../types/dish";
import type { DoctrineDocument } from "../types/doctrine";
import type { FactionDocument } from "../types/faction";
import type { FieldEnemyDocument } from "../types/fieldEnemy";
import type { FieldModDocument } from "../types/fieldmod";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { KeyItemDocument } from "../types/keyItem";
import type { MailDocument } from "../types/mail";
import type { NpcDocument } from "../types/npc";
import { normalizeOperationDocument, type OperationDocument } from "../types/operation";
import { toPartialResourceWalletDocument } from "../types/resources";
import type { SchemaDocument } from "../types/schema";
import type { UnitDocument } from "../types/unit";
import { createImageAssetExport } from "./assets";
import { createLegacyCardEffectsFromFlow } from "./cardComposer";
import { isoNow } from "./date";
import { summarizeEffectFlow } from "./effectFlow";
import { createWorkspaceReferenceIndex } from "./chaosCoreExport";
import { normalizeGearDocument } from "./gearDocuments";
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

function toPartialResourceWallet(wallet: Record<string, number>) {
  return toPartialResourceWalletDocument(wallet);
}

function toRuntimeMerchantListing(merchant: { soldAtMerchant?: boolean; merchantFloor?: number } | undefined) {
  return merchant?.soldAtMerchant
    ? {
        floorOrdinal: merchant.merchantFloor,
      }
    : undefined;
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

function splitMailBodyPages(content: string) {
  return content
    .split(/\r?\n\s*\r?\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toRuntimeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
        .filter(Boolean)
        .map((entry) => runtimeId(entry))
    )
  );
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
  const normalizedDocument = normalizeGearDocument(document);
  return normalizedDocument.cardsGranted.map((cardId) => ({
    contentType: "card" as const,
    id: runtimeId(cardId),
    relation: "grants-card"
  }));
}

export function buildChaosCoreGearBundle(
  document: GearDocument,
  references = createWorkspaceReferenceIndex({ gear: document })
): ExportBundle {
  const normalizedDocument = normalizeGearDocument(document);

  buildGearDependencies(normalizedDocument).forEach((dependency) => {
    assertKnownReference(dependency.id, references.cardIds, "Gear export", "card id");
  });

  const contentId = runtimeId(normalizedDocument.id || normalizedDocument.name, "gear");
  const entryFile = `${contentId}.gear.json`;
  const sourceFile = `${contentId}.source.json`;
  const iconAsset = normalizedDocument.iconAsset
    ? createImageAssetExport(contentId, "icon", normalizedDocument.iconAsset)
    : null;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: normalizedDocument.name,
    description: normalizedDocument.description,
    slot: normalizedDocument.slot,
    weaponType: normalizedDocument.weaponType,
    isMechanical: normalizedDocument.isMechanical,
    stats: normalizedDocument.stats,
    cardsGranted: normalizedDocument.cardsGranted.map((cardId) => runtimeId(cardId)),
    moduleSlots: normalizedDocument.moduleSlots,
    attachedModules: normalizedDocument.attachedModules,
    wear: normalizedDocument.wear,
    inventory: normalizedDocument.inventory,
    acquisition: {
      shop: normalizedDocument.acquisition.shop.enabled
        ? {
            unlockFloor: normalizedDocument.acquisition.shop.unlockFloor,
            notes: normalizedDocument.acquisition.shop.notes
          }
        : undefined,
      merchant: toRuntimeMerchantListing(normalizedDocument.merchant),
      enemyDrop: normalizedDocument.acquisition.enemyDrop.enabled
        ? {
            enemyUnitIds: normalizedDocument.acquisition.enemyDrop.enemyUnitIds.map((enemyUnitId) => runtimeId(enemyUnitId)),
            notes: normalizedDocument.acquisition.enemyDrop.notes
          }
        : undefined,
      victoryReward: normalizedDocument.acquisition.victoryReward.enabled
        ? {
            floorOrdinals: normalizedDocument.acquisition.victoryReward.floorOrdinals,
            regionIds: normalizedDocument.acquisition.victoryReward.regionIds.map((regionId) => runtimeId(regionId)),
            notes: normalizedDocument.acquisition.victoryReward.notes
          }
        : undefined,
      otherSourcesNotes: normalizedDocument.acquisition.otherSourcesNotes || undefined
    },
    iconPath: iconAsset?.runtimePath,
    metadata: coerceRecord(normalizedDocument.metadata)
  });

  const manifest = createManifest(
    "gear",
    "equipment.v1",
    contentId,
    normalizedDocument.name,
    "Chaos Core runtime equipment export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(iconAsset ? [iconAsset.runtimePath] : []), "README.md"],
    buildGearDependencies(normalizedDocument)
  );

  const readme = `# Chaos Core Gear Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported gear registers into Chaos Core's equipment pool and base storage when marked as starting owned.
- Acquisition metadata preserves shop availability, enemy drop references, and floor or region victory reward hooks for future runtime adapters.
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
      { name: sourceFile, content: prettyJson(normalizedDocument) },
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
  const isWeaponChassis = document.archetype === "weapon_chassis";
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    kind: isWeaponChassis ? "equipment" : document.kind,
    archetype: document.archetype,
    stackable: isWeaponChassis ? false : document.stackable,
    quantity: isWeaponChassis ? 1 : document.quantity,
    massKg: document.massKg,
    bulkBu: document.bulkBu,
    powerW: document.powerW,
    acquisition: isWeaponChassis
      ? undefined
      : {
          startsWithPlayer: document.acquisition.startsWithPlayer,
          havenShop: document.acquisition.havenShop.enabled
            ? {
                unlockFloor: document.acquisition.havenShop.unlockFloor,
                notes: document.acquisition.havenShop.notes
              }
            : undefined,
          merchant: toRuntimeMerchantListing(document.merchant),
          fieldMapResource: document.acquisition.fieldMapResource.enabled
            ? {
                mapId: runtimeId(document.acquisition.fieldMapResource.mapId),
                resourceNodeId: runtimeId(document.acquisition.fieldMapResource.resourceNodeId),
                notes: document.acquisition.fieldMapResource.notes
              }
            : undefined,
          enemyDrop: document.acquisition.enemyDrop.enabled
            ? {
                enemyUnitIds: document.acquisition.enemyDrop.enemyUnitIds.map((enemyUnitId) => runtimeId(enemyUnitId)),
                notes: document.acquisition.enemyDrop.notes
              }
            : undefined,
          otherSourcesNotes: document.acquisition.otherSourcesNotes || undefined
        },
    weaponChassis: isWeaponChassis
      ? {
          stability: document.weaponChassis.stability,
          cardSlots: document.weaponChassis.cardSlots
        }
      : undefined,
    iconPath: isWeaponChassis ? undefined : iconAsset?.runtimePath,
    metadata: isWeaponChassis ? undefined : coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "item",
    "inventory-item.v2",
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
- Acquisition metadata preserves whether the player starts with the item, whether HAVEN sells it, and whether it can be found in the field or on enemies.
- Weapon chassis exports flag themselves explicitly and keep stability plus card-slot metadata beside the base inventory footprint.
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

export function buildChaosCoreKeyItemBundle(document: KeyItemDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "key_item");
  const entryFile = `${contentId}.key_item.json`;
  const sourceFile = `${contentId}.source.json`;
  const iconAsset = document.iconAsset ? createImageAssetExport(contentId, "icon", document.iconAsset) : null;
  const preservedIconPath = !iconAsset && document.iconPath?.trim() ? document.iconPath.trim() : undefined;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    kind: "key_item",
    stackable: false,
    quantity: 1,
    massKg: 0,
    bulkBu: 0,
    powerW: 0,
    iconPath: iconAsset?.runtimePath ?? preservedIconPath,
    questOnly: true
  });

  const manifest = createManifest(
    "key_item",
    "key-item.v1",
    contentId,
    document.name,
    "Chaos Core runtime key item export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(iconAsset ? [iconAsset.runtimePath] : []), "README.md"],
    []
  );

  const readme = `# Chaos Core Key Item Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported key items register as quest-only inventory content.
- Key items appear in Chaos Core inventory views once they are granted by quests or scripts.
- Attached key item icons resolve through \`iconPath\` when present.
- \`${sourceFile}\` preserves the authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-key-item-export`,
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

export function buildChaosCoreFactionBundle(document: FactionDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "faction");
  const entryFile = `${contentId}.faction.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description
  });

  const manifest = createManifest(
    "faction",
    "faction.v1",
    contentId,
    document.name,
    "Chaos Core runtime faction export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  const readme = `# Chaos Core Faction Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported factions register into Chaos Core's Technica content library for reuse by units, NPCs, and field enemies.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-faction-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function buildChassisDependencies(document: ChassisDocument): ExportDependency[] {
  return document.requiredQuestIds.map((questId) => ({
    contentType: "quest" as const,
    id: runtimeId(questId),
    relation: "requires-completed-quest"
  }));
}

export function buildChaosCoreChassisBundle(
  document: ChassisDocument,
  references = createWorkspaceReferenceIndex({})
): ExportBundle {
  buildChassisDependencies(document).forEach((dependency) => {
    assertKnownReference(dependency.id, references.questIds, "Chassis export", "quest id");
  });

  const contentId = runtimeId(document.id || document.name, "chassis");
  const entryFile = `${contentId}.chassis.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    slotType: document.slotType,
    baseMassKg: document.kg,
    baseBulkBu: document.bu,
    basePowerW: document.w,
    baseStability: document.stability,
    maxCardSlots: document.cardSlots,
    allowedCardTags: document.allowedCardTags,
    allowedCardFamilies: document.allowedCardFamilies,
    description: document.description,
    buildCost: toPartialResourceWallet(document.buildCost),
    unlockAfterFloor: document.unlockAfterFloor,
    availableInHavenShop: document.availableInHavenShop,
    havenShopUnlockAfterFloor: document.availableInHavenShop
      ? document.havenShopUnlockAfterFloor
      : undefined,
    merchant: toRuntimeMerchantListing(document.merchant),
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId))
  });

  const manifest = createManifest(
    "chassis",
    "gear-chassis.v2",
    contentId,
    document.name,
    "Chaos Core runtime chassis export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildChassisDependencies(document)
  );

  const readme = `# Chaos Core Chassis Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported chassis register into Chaos Core's gear-builder catalog alongside built-in chassis.
- Build cost uses the full resource wallet, including advanced materials.
- \`unlockAfterFloor\` gates general chassis availability, while \`availableInHavenShop\` and \`havenShopUnlockAfterFloor\` control HAVEN shop listing.
- \`requiredQuestIds\` still gate unlockable visibility.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-chassis-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

function buildDoctrineDependencies(document: DoctrineDocument): ExportDependency[] {
  return document.requiredQuestIds.map((questId) => ({
    contentType: "quest" as const,
    id: runtimeId(questId),
    relation: "requires-completed-quest"
  }));
}

export function buildChaosCoreDoctrineBundle(
  document: DoctrineDocument,
  references = createWorkspaceReferenceIndex({})
): ExportBundle {
  buildDoctrineDependencies(document).forEach((dependency) => {
    assertKnownReference(dependency.id, references.questIds, "Doctrine export", "quest id");
  });

  const contentId = runtimeId(document.id || document.name, "doctrine");
  const entryFile = `${contentId}.doctrine.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    shortDescription: document.shortDescription,
    intentTags: document.intentTags,
    stabilityModifier: document.stabilityModifier,
    strainBias: document.strainBias,
    procBias: document.procBias,
    buildCostModifier: toPartialResourceWallet(document.buildCostModifier),
    doctrineRules: document.doctrineRules,
    description: document.description,
    unlockAfterFloor: document.unlockAfterFloor,
    merchant: toRuntimeMerchantListing(document.merchant),
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId))
  });

  const manifest = createManifest(
    "doctrine",
    "gear-doctrine.v2",
    contentId,
    document.name,
    "Chaos Core runtime doctrine export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildDoctrineDependencies(document)
  );

  const readme = `# Chaos Core Doctrine Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported doctrines register into Chaos Core's gear-builder catalog alongside built-in doctrines.
- Build-cost modifiers use the full resource wallet, including advanced materials.
- \`unlockAfterFloor\` and \`requiredQuestIds\` gate shop/workbench availability.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-doctrine-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

export function buildChaosCoreChatterBundle(document: ChatterDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.location, "chatter");
  const entryFile = `${contentId}.chatter.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    location: document.location,
    content: document.content,
    aerissResponse: document.aerissResponse,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  });

  const manifest = createManifest(
    "chatter",
    "chatter.v1",
    contentId,
    `${document.location} chatter`,
    "Chaos Core runtime chatter export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  const readme = `# Chaos Core Chatter Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported chatter registers into Chaos Core's ambient node chatter pools.
- \`location\` currently supports \`black_market\`, \`tavern\`, and \`port\`.
- \`aerissResponse\` is used directly when the player clicks on that chatter line.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(`${document.location}-chatter`, contentId)}-chaos-core-chatter-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      { name: "README.md", content: readme }
    ]
  };
}

export function buildChaosCoreCraftingBundle(document: CraftingDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "recipe");
  const entryFile = `${contentId}.crafting.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    category: document.category,
    description: document.description,
    cost: document.cost,
    resultItemId: document.grants[0]?.itemId ? runtimeId(document.grants[0].itemId) : undefined,
    resultQuantity: document.grants[0]?.quantity ?? undefined,
    grants: document.grants.map((grant) => ({
      itemId: runtimeId(grant.itemId),
      quantity: grant.quantity
    })),
    requiresItemId: document.requiresItemId ? runtimeId(document.requiresItemId) : undefined,
    acquisition: {
      method: document.acquisitionMethod,
      purchaseVendor: document.purchaseVendor || undefined,
      purchaseCostWad: document.acquisitionMethod === "purchased" ? document.purchaseCostWad : undefined,
      unlockFloor: document.acquisitionMethod === "unlock_floor" ? document.unlockFloor : undefined,
      merchant: toRuntimeMerchantListing(document.merchant),
      requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId)),
      notes: document.notes || undefined
    },
    metadata: coerceRecord(document.metadata)
  });

  const manifest = createManifest(
    "crafting",
    "crafting-recipe.v1",
    contentId,
    document.name,
    "Chaos Core-targeted crafting recipe export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-crafting-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Crafting Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Recipes preserve resource costs, crafted grant items, and optional base-item requirements for upgrades.
- Acquisition metadata captures whether the recipe starts known, must be purchased, or unlocks after a floor threshold.
- \`${sourceFile}\` preserves the original Technica recipe document.
`
      }
    ]
  };
}

export function buildChaosCoreDishBundle(document: DishDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "dish");
  const entryFile = `${contentId}.dish.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    cost: document.cost,
    unlockAfterOperationFloor: document.unlockAfterOperationFloor,
    merchant: toRuntimeMerchantListing(document.merchant),
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId)),
    effect: document.effect,
    description: document.description
  });

  const manifest = createManifest(
    "dish",
    "dish.v1",
    contentId,
    document.name,
    "Chaos Core-targeted tavern dish export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-dish-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Dish Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Dishes capture tavern or mess-hall purchase cost, effect text, and player-facing description.
- \`unlockAfterOperationFloor\` gates when the dish becomes available after campaign progression.
- \`${sourceFile}\` preserves the original Technica dish document.
`
      }
    ]
  };
}

export function buildChaosCoreFieldModBundle(document: FieldModDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "field_mod");
  const entryFile = `${contentId}.fieldmod.json`;
  const sourceFile = `${contentId}.source.json`;
  const summaryText = `${document.trigger}: ${summarizeEffectFlow(document.effectFlow).join(" Then ")}`.trim();
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: summaryText,
    effects: document.effects || summaryText,
    trigger: document.trigger,
    chance: document.chance,
    stackMode: document.stackMode,
    maxStacks: document.maxStacks,
    effectFlow: document.effectFlow,
    scope: document.scope,
    cost: document.cost,
    rarity: document.rarity,
    unlockAfterOperationFloor: document.unlockAfterOperationFloor,
    merchant: toRuntimeMerchantListing(document.merchant),
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId))
  });

  const manifest = createManifest(
    "fieldmod",
    "field-mod.v2",
    contentId,
    document.name,
    "Chaos Core-targeted field mod export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-fieldmod-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Field Mod Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Field mods now export trigger metadata plus a shared effect-flow graph for Chaos Core's proc executor.
- \`description\` and \`effects\` remain as compatibility summaries for UI surfaces that still expect plain text.
- \`unlockAfterOperationFloor\` gates when the field mod becomes available after campaign progression.
- \`${sourceFile}\` preserves the original Technica field mod document.
`
      }
    ]
  };
}

export function buildChaosCoreSchemaBundle(document: SchemaDocument): ExportBundle {
  const isFortification = document.kind === "fortification";
  const contentId = runtimeId(document.id || document.name, document.kind);
  const entryFile = `${contentId}.schema.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    displayName: document.name,
    description: document.description,
    buildCost: toPartialResourceWallet(document.buildCost),
    unlockSource: document.unlockSource,
    unlockCost: document.unlockSource === "schema" ? toPartialResourceWallet(document.unlockCost) : undefined,
    unlockWadCost: document.unlockSource === "schema" ? document.unlockWadCost : undefined,
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId)),
    preferredRoomTags: document.preferredRoomTags,
    placeholder: document.placeholder || undefined,
    kind: document.kind,
    ...(isFortification
      ? {}
      : {
          shortCode: document.shortCode.trim() || undefined,
          category: document.category.trim() || undefined,
          operationalRequirements: pruneEmpty({
            powerWatts: document.operationalRequirements.powerWatts,
            commsBw: document.operationalRequirements.commsBw,
            supplyCrates: document.operationalRequirements.supplyCrates
          }),
          powerOutputWatts: document.powerOutputWatts || undefined,
          powerOutputMode: document.powerOutputMode !== "fixed" ? document.powerOutputMode : undefined,
          commsOutputBw: document.commsOutputBw || undefined,
          commsOutputMode: document.commsOutputMode !== "fixed" ? document.commsOutputMode : undefined,
          supplyOutputCrates: document.supplyOutputCrates || undefined,
          supplyOutputMode: document.supplyOutputMode !== "fixed" ? document.supplyOutputMode : undefined,
          upkeep: toPartialResourceWallet(document.upkeep),
          wadUpkeepPerTick: document.wadUpkeepPerTick,
          incomePerTick: toPartialResourceWallet(document.incomePerTick),
          supportRadius: document.supportRadius,
          tagOutputModifiers: document.tagOutputModifiers.map((modifier) =>
            pruneEmpty({
              tag: modifier.tag,
              output: toPartialResourceWallet(modifier.output),
              note: modifier.note.trim() || undefined
            })
          )
        })
  });

  const manifest = createManifest(
    "schema",
    isFortification ? "chaos-core-schema-fortification.native.v1" : "chaos-core-schema-core.native.v1",
    contentId,
    document.name,
    `Chaos Core native ${document.kind} schema export.`,
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-schema-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Schema Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Schema exports now mirror Chaos Core's native schema definitions field-for-field.
- Core entries include category, operational requirements, outputs, upkeep, income, support radius, unlock data, tags, and tag output modifiers.
- Fortifications include build cost, unlock data, preferred room tags, and placeholder state.
- \`${sourceFile}\` preserves the original Technica schema document.
`
      }
    ]
  };
}

export function buildChaosCoreCodexBundle(document: CodexDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.title, "codex_entry");
  const entryFile = `${contentId}.codex.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    title: document.title,
    entryType: document.entryType,
    content: document.content,
    unlockAfterFloor: document.unlockAfterFloor,
    requiredDialogueIds: document.requiredDialogueIds.map((dialogueId) => runtimeId(dialogueId)),
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId)),
    requiredGearIds: document.requiredGearIds.map((gearId) => runtimeId(gearId)),
    requiredItemIds: document.requiredItemIds.map((itemId) => runtimeId(itemId)),
    requiredSchemaIds: document.requiredSchemaIds.map((schemaId) => runtimeId(schemaId)),
    requiredFieldModIds: document.requiredFieldModIds.map((fieldModId) => runtimeId(fieldModId)),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  });

  const manifest = createManifest(
    "codex",
    "codex-entry.v1",
    contentId,
    document.title,
    "Chaos Core runtime codex entry export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.title, contentId)}-chaos-core-codex-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Codex Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported codex entries register beside the built-in Chaos Core archive database.
- Unlock requirements are preserved exactly so floor, dialogue, gear, item, schema, and field-mod gates can all be evaluated in-game.
- \`${sourceFile}\` preserves the original Technica codex authoring document.
`
      }
    ]
  };
}

export function buildChaosCoreMailBundle(document: MailDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.subject, "mail");
  const entryFile = `${contentId}.mail.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    category: document.category,
    from: document.sender,
    subject: document.subject,
    bodyPages: splitMailBodyPages(typeof document.content === "string" ? document.content : ""),
    unlockAfterFloor: document.unlockAfterFloor,
    requiredDialogueIds: toRuntimeIdList(document.requiredDialogueIds),
    requiredGearIds: toRuntimeIdList(document.requiredGearIds),
    requiredItemIds: toRuntimeIdList(document.requiredItemIds),
    requiredSchemaIds: toRuntimeIdList(document.requiredSchemaIds),
    requiredFieldModIds: toRuntimeIdList(document.requiredFieldModIds),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  });

  const manifest = createManifest(
    "mail",
    "mail-entry.v1",
    contentId,
    document.subject,
    "Chaos Core runtime mail export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    []
  );

  return {
    bundleName: `${slugify(document.subject, contentId)}-chaos-core-mail-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
      {
        name: "README.md",
        content: `# Chaos Core Mail Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported mail entries register into Chaos Core's mailbox delivery system.
- Message pages are split on blank lines from the Technica editor content.
- Unlock requirements are preserved so floor, dialogue, gear, item, schema, and field-mod gates can all drive delivery.
- \`${sourceFile}\` preserves the original Technica mail authoring document.
`
      }
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
  const { faction: _ignoredFaction, ...metadata } = document.metadata;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    faction: document.faction ? runtimeId(document.faction) : undefined,
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
    metadata: coerceRecord(metadata)
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

function buildFieldEnemyDependencies(document: FieldEnemyDocument): ExportDependency[] {
  return document.spawn.mapIds
    .filter((mapId) => mapId.trim())
    .map((mapId, index) => ({
      contentType: "map" as const,
      id: runtimeId(mapId),
      relation: `spawn-map-${index + 1}`
    }));
}

export function buildChaosCoreFieldEnemyBundle(document: FieldEnemyDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "field_enemy");
  const entryFile = `${contentId}.field_enemy.json`;
  const sourceFile = `${contentId}.source.json`;
  const spriteAsset = document.spriteAsset ? createImageAssetExport(contentId, "sprite", document.spriteAsset) : null;
  const preservedSpritePath = !spriteAsset && document.metadata.spritePath?.trim() ? document.metadata.spritePath.trim() : undefined;
  const { faction: _ignoredFaction, spritePath: _ignoredSpritePath, ...metadata } = document.metadata;

  const runtimeDocument = pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    faction: document.faction ? runtimeId(document.faction) : undefined,
    kind: document.kind,
    spriteKey: document.spriteKey || undefined,
    spritePath: spriteAsset?.runtimePath ?? preservedSpritePath,
    presentation: document.presentation
      ? pruneEmpty({
          mode: document.presentation.mode,
          modelKey: document.presentation.modelKey || undefined,
          modelAssetPath: document.presentation.modelAssetPath || undefined,
          materialKey: document.presentation.materialKey || undefined,
          scale: document.presentation.scale,
          heightOffset: document.presentation.heightOffset,
          facingMode: document.presentation.facingMode,
          previewPose: document.presentation.previewPose || undefined,
          metadata: coerceRecord(document.presentation.metadata)
        })
      : undefined,
    stats: {
      maxHp: document.stats.maxHp,
      speed: document.stats.speed,
      aggroRange: document.stats.aggroRange,
      width: document.stats.width,
      height: document.stats.height
    },
    spawn: {
      mapIds: document.spawn.mapIds.map((mapId) => runtimeId(mapId)),
      floorOrdinals: document.spawn.floorOrdinals,
      count: document.spawn.spawnCount,
      spawnCount: document.spawn.spawnCount,
      regionIds: document.spawn.regionIds?.map((regionId) => runtimeId(regionId)),
      mapTags: document.spawn.mapTags,
      spawnAnchorTags: document.spawn.spawnAnchorTags,
      allowGeneratedAprons: document.spawn.allowGeneratedAprons,
      avoidSafeZones: document.spawn.avoidSafeZones,
      minDistanceFromPlayerSpawn: document.spawn.minDistanceFromPlayerSpawn
    },
    drops: {
      wad: document.drops.wad,
      resources: document.drops.resources,
      items: document.drops.items.map((drop) =>
        pruneEmpty({
          id: runtimeId(drop.id),
          quantity: drop.quantity,
          chance: drop.chance
        })
      )
    },
    metadata: coerceRecord(metadata)
  });

  const manifest = createManifest(
    "field_enemy",
    "field-enemy.v1",
    contentId,
    document.name,
    "Chaos Core runtime field enemy export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, ...(spriteAsset ? [spriteAsset.runtimePath] : []), "README.md"],
    buildFieldEnemyDependencies(document)
  );

  const readme = `# Chaos Core Field Enemy Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported field enemies can target explicit field maps or any imported field map visited on the listed floor numbers.
- Spawn count is evaluated per map load.
- Sprite assets resolve through \`spritePath\` when present.
- \`${sourceFile}\` preserves the original Technica authoring document.
`;

  return {
    bundleName: `${slugify(document.name, contentId)}-chaos-core-field-enemy-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(document) },
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
  const preservedArtPath = !artAsset && document.metadata.artPath?.trim() ? document.metadata.artPath.trim() : undefined;
  const { artPath: _ignoredArtPath, ...cardMetadata } = document.metadata;
  const legacyEffects = createLegacyCardEffectsFromFlow(document.effectFlow);
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
    effectFlow: document.effectFlow,
    effects: legacyEffects,
    sourceClassId: document.sourceClassId ? runtimeId(document.sourceClassId) : undefined,
    sourceEquipmentId: document.sourceEquipmentId ? runtimeId(document.sourceEquipmentId) : undefined,
    artPath: artAsset?.runtimePath ?? preservedArtPath,
    metadata: coerceRecord(cardMetadata)
  });

  const manifest = createManifest(
    "card",
    "battle-card.v2",
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
- \`effectFlow\` is now the primary scripted runtime source of truth; \`effects\` is exported as a compatibility projection.
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
  // Units are allowed to point at built-in Chaos Core classes and gear, not only
  // the drafts currently open in Technica. Keep dependency metadata, but do not
  // reject external runtime references during export.

  const contentId = runtimeId(document.id || document.name, "unit");
  const entryFile = `${contentId}.unit.json`;
  const sourceFile = `${contentId}.source.json`;
  const { faction: _ignoredFaction, ...metadata } = document.metadata;
  const runtimeDocument = {
    ...pruneEmpty({
    id: contentId,
    name: document.name,
    description: document.description,
    faction: document.faction ? runtimeId(document.faction) : undefined,
    currentClassId: runtimeId(document.currentClassId),
    spawnRole: document.spawnRole,
    enemySpawnFloorOrdinals: document.spawnRole === "enemy" ? document.enemySpawnFloorOrdinals : [],
    requiredQuestIds: document.requiredQuestIds.map((questId) => runtimeId(questId)),
    stats: document.stats,
    traits: document.traits,
    pwr: document.pwr,
    recruitCost: document.recruitCost,
    startingInRoster: document.spawnRole === "enemy" ? false : document.startingInRoster,
    deployInParty: document.spawnRole === "enemy" ? false : document.deployInParty,
    metadata: coerceRecord(metadata)
    }),
    // Keep the loadout object present even when every slot is empty so the
    // Chaos Core importer can still recognize the unit template shape.
    loadout: {
      primaryWeapon: document.loadout.primaryWeapon ? runtimeId(document.loadout.primaryWeapon) : undefined,
      secondaryWeapon: document.loadout.secondaryWeapon ? runtimeId(document.loadout.secondaryWeapon) : undefined,
      helmet: document.loadout.helmet ? runtimeId(document.loadout.helmet) : undefined,
      chestpiece: document.loadout.chestpiece ? runtimeId(document.loadout.chestpiece) : undefined,
      accessory1: document.loadout.accessory1 ? runtimeId(document.loadout.accessory1) : undefined,
      accessory2: document.loadout.accessory2 ? runtimeId(document.loadout.accessory2) : undefined
    }
  };

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
- Imported units can be published either as player roster templates or tactical enemy templates.
- Enemy units spawn on the selected floor ordinals across Chaos Core tactical battles.
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
  const normalizedDocument = normalizeOperationDocument(document);
  const dependencies: ExportDependency[] = [];

  normalizedDocument.floors.forEach((floor) => {
    floor.rooms.forEach((room) => {
      room.shopInventory.forEach((gearId) => {
        dependencies.push({
          contentType: "gear",
          id: runtimeId(gearId),
          relation: `shop-inventory:${runtimeId(room.id)}`
        });
      });

      if (room.fieldMapId) {
        dependencies.push({
          contentType: "map",
          id: runtimeId(room.fieldMapId),
          relation: `field-map-route:${runtimeId(room.id)}`
        });
      }
    });
  });

  return dependencies;
}

export function buildChaosCoreOperationBundle(
  document: OperationDocument,
  references = createWorkspaceReferenceIndex({ operation: document })
): ExportBundle {
  const normalizedDocument = normalizeOperationDocument(document);

  buildOperationDependencies(normalizedDocument).forEach((dependency) => {
    if (dependency.contentType === "gear") {
      assertKnownReference(dependency.id, references.gearIds, "Operation export", "gear id");
    }
  });

  const contentId = runtimeId(normalizedDocument.id || normalizedDocument.codename, "operation");
  const entryFile = `${contentId}.operation.json`;
  const sourceFile = `${contentId}.source.json`;
  const runtimeDocument = pruneEmpty({
    id: contentId,
    codename: normalizedDocument.codename,
    description: normalizedDocument.description,
    objective: normalizedDocument.objective,
    beginningState: normalizedDocument.beginningState,
    endState: normalizedDocument.endState,
    zoneName: normalizedDocument.zoneName,
    sprawlDirection: normalizedDocument.sprawlDirection,
    recommendedPower: normalizedDocument.recommendedPower,
    floors: normalizedDocument.floors.map((floor) => ({
      id: runtimeId(floor.id),
      name: floor.name,
      floorOrdinal: floor.floorOrdinal,
      atlasFloorId: floor.atlasFloorId || undefined,
      startingRoomId: runtimeId(floor.startingRoomId),
      sectorLabel: floor.sectorLabel,
      passiveEffectText: floor.passiveEffectText,
      threatLevel: floor.threatLevel,
      layoutStyle: floor.layoutStyle,
      originLabel: floor.originLabel,
      rooms: floor.rooms.map((room) =>
        pruneEmpty({
          id: runtimeId(room.id),
          label: room.label,
          type: room.type,
          position: { x: room.x, y: room.y },
          localPosition: { x: room.x, y: room.y },
          connections: room.connections.map((connectionId) => runtimeId(connectionId)),
          adjacency: room.connections.map((connectionId) => runtimeId(connectionId)),
          role: room.role,
          sectorTag: room.sectorTag,
          depthFromUplink: room.depthFromUplink,
          clearMode: room.clearMode,
          roomClass: room.roomClass,
          tags: room.tags,
          battleMapId: room.battleMapId ? runtimeId(room.battleMapId) : undefined,
          battleTemplate: room.battleTemplate,
          eventTemplate: room.eventTemplate,
          tacticalEncounter: room.tacticalEncounter,
          fieldMapId: room.fieldMapId ? runtimeId(room.fieldMapId) : undefined,
          fieldMapEntryPointId: room.fieldMapEntryPointId ? runtimeId(room.fieldMapEntryPointId, "spawn") : undefined,
          fieldMapRouteSource: room.fieldMapId ? room.fieldMapRouteSource : undefined,
          fieldMapDoorId: room.fieldMapDoorId ? runtimeId(room.fieldMapDoorId) : undefined,
          fieldMapPortalId: room.fieldMapPortalId ? runtimeId(room.fieldMapPortalId) : undefined,
          fieldMapLabel: room.fieldMapLabel,
          shopInventory: room.shopInventory.map((gearId) => runtimeId(gearId)),
          coreSlotCapacity: room.coreSlotCapacity,
          fortificationCapacity: room.fortificationCapacity,
          requiredKeyType: room.requiredKeyType || undefined,
          grantsKeyType: room.grantsKeyType || undefined,
          isPowerSource: room.isPowerSource,
          metadata: pruneEmpty({
            ...coerceRecord(room.metadata),
            fieldMapId: room.fieldMapId ? runtimeId(room.fieldMapId) : undefined,
            fieldMapEntryPointId: room.fieldMapEntryPointId ? runtimeId(room.fieldMapEntryPointId, "spawn") : undefined,
            fieldMapRouteSource: room.fieldMapId ? room.fieldMapRouteSource : undefined,
            fieldMapDoorId: room.fieldMapDoorId ? runtimeId(room.fieldMapDoorId) : undefined,
            fieldMapPortalId: room.fieldMapPortalId ? runtimeId(room.fieldMapPortalId) : undefined,
            fieldMapLabel: room.fieldMapLabel,
            technicaFieldRouteRoomId: room.fieldMapId ? runtimeId(room.id) : undefined
          })
        })
      )
    })),
    metadata: coerceRecord(normalizedDocument.metadata)
  });

  const manifest = createManifest(
    "operation",
    "operation.v1",
    contentId,
    normalizedDocument.codename,
    "Chaos Core runtime operation export.",
    entryFile,
    ["manifest.json", entryFile, sourceFile, "README.md"],
    buildOperationDependencies(normalizedDocument)
  );

  const readme = `# Chaos Core Operation Export

Runtime entry: \`${entryFile}\`
Content id: \`${contentId}\`

Importer notes:
- Imported operations still appear in Chaos Core's operation select screen as direct-run missions.
- Theater briefing fields, floor sector metadata, and room-role authoring are exported alongside the compatible floor graph.
- Room coordinates, connections, optional shop inventory, and explicit Technica field-map entrances are exported explicitly.
- \`${sourceFile}\` preserves the authoring document.
`;

  return {
    bundleName: `${slugify(normalizedDocument.codename, contentId)}-chaos-core-operation-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: entryFile, content: prettyJson(runtimeDocument) },
      { name: sourceFile, content: prettyJson(normalizedDocument) },
      { name: "README.md", content: readme }
    ]
  };
}

function buildClassDependencies(document: ClassDocument): ExportDependency[] {
  return document.unlockConditions.flatMap<ExportDependency>((condition: ClassUnlockConditionDocument) => {
    if (condition.type === "class_rank" && condition.requiredClassId) {
      return [
        {
          contentType: "class" as const,
          id: runtimeId(condition.requiredClassId),
          relation: "unlock-condition"
        }
      ];
    }

    if (condition.type === "quest_completed" && condition.requiredQuestId) {
      return [
        {
          contentType: "quest" as const,
          id: runtimeId(condition.requiredQuestId),
          relation: "unlock-condition"
        }
      ];
    }

    return [];
  });
}

export function buildChaosCoreClassBundle(
  document: ClassDocument,
  references = createWorkspaceReferenceIndex({ class: document })
): ExportBundle {
  buildClassDependencies(document).forEach((dependency) => {
    if (dependency.contentType === "class") {
      assertKnownReference(dependency.id, references.classIds, "Class export", "class id");
    }
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
        requiredQuestId: condition.requiredQuestId ? runtimeId(condition.requiredQuestId) : undefined,
        requiredRank: condition.requiredRank,
        description: condition.description
      })
    ),
    innateAbility: document.innateAbility,
    trainingGrid: document.trainingGrid.map((node) =>
      pruneEmpty({
        id: node.id,
        name: node.name,
        description: node.description,
        cost: node.cost,
        row: node.row,
        col: node.col,
        requires: node.requires,
        benefit: node.benefit
      })
    ),
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
- Training grid nodes flow directly into Chaos Core's class mastery board when provided.
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
