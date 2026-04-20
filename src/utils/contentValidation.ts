import type { CardDocument } from "../types/card";
import type { ChassisDocument } from "../types/chassis";
import type { ChatterDocument } from "../types/chatter";
import type { ClassDocument } from "../types/class";
import type { CodexDocument } from "../types/codex";
import type { CraftingDocument } from "../types/crafting";
import type { DecorationDocument } from "../types/decoration";
import type { DishDocument } from "../types/dish";
import type { DoctrineDocument } from "../types/doctrine";
import type { ImageAsset, ValidationIssue } from "../types/common";
import type { FactionDocument } from "../types/faction";
import type { FieldEnemyDocument } from "../types/fieldEnemy";
import type { FieldModDocument } from "../types/fieldmod";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { KeyItemDocument } from "../types/keyItem";
import type { MailDocument } from "../types/mail";
import type { MapDocument, MapEntryRule } from "../types/map";
import type { MerchantListingDocument } from "../types/merchant";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import { resourceKeys, resourceLabels, type ResourceWalletDocument } from "../types/resources";
import type { SchemaDocument } from "../types/schema";
import type { UnitDocument } from "../types/unit";
import { mailCategories } from "../types/mail";
import { createLegacyCardEffectsFromFlow } from "./cardComposer";
import { validateEffectFlowDocument } from "./effectFlow";
import { normalizeGearDocument } from "./gearDocuments";
import { toGearBalanceIssues, validateGearBalance } from "./gearBalanceValidation";

function requireText(value: string, field: string, label: string, issues: ValidationIssue[]) {
  if (!value.trim()) {
    issues.push({
      severity: "error",
      field,
      message: `${label} is required.`
    });
  }
}

function requirePositive(value: number, field: string, label: string, issues: ValidationIssue[], allowZero = true) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    issues.push({
      severity: "error",
      field,
      message: `${label} must be ${allowZero ? "0 or greater" : "greater than 0"}.`
    });
  }
}

function requireFiniteNumber(value: number, field: string, label: string, issues: ValidationIssue[]) {
  if (!Number.isFinite(value)) {
    issues.push({
      severity: "error",
      field,
      message: `${label} must be a valid number.`
    });
  }
}

function warnOnDuplicates(values: readonly unknown[] | undefined, field: string, label: string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  (values ?? []).forEach((value) => {
    const normalized = (typeof value === "string" ? value : String(value ?? "")).trim();
    if (!normalized) {
      return;
    }
    if (seen.has(normalized)) {
      duplicates.add(normalized);
      return;
    }
    seen.add(normalized);
  });

  duplicates.forEach((duplicate) => {
    issues.push({
      severity: "warning",
      field,
      message: `${label} contains a duplicate entry: '${duplicate}'.`
    });
  });
}

function validateImageAsset(asset: ImageAsset | undefined, field: string, label: string, issues: ValidationIssue[]) {
  if (!asset) {
    return;
  }

  if (!asset.fileName.trim()) {
    issues.push({
      severity: "error",
      field,
      message: `${label} needs a filename.`
    });
  }

  if (!asset.mimeType.startsWith("image/")) {
    issues.push({
      severity: "error",
      field,
      message: `${label} must be an image file.`
    });
  }

  if (!asset.dataUrl.startsWith("data:image/")) {
    issues.push({
      severity: "error",
      field,
      message: `${label} data is invalid. Reattach the file and try again.`
    });
  }
}

function validateResourceWallet(
  wallet: Partial<ResourceWalletDocument>,
  fieldPrefix: string,
  labelPrefix: string,
  issues: ValidationIssue[],
) {
  resourceKeys.forEach((resourceKey) => {
    requirePositive(
      Number(wallet[resourceKey] ?? 0),
      `${fieldPrefix}.${resourceKey}`,
      `${labelPrefix} ${resourceLabels[resourceKey].toLowerCase()}`,
      issues,
    );
  });
}

function validateMerchantListing(
  merchant: MerchantListingDocument | undefined,
  fieldPrefix: string,
  labelPrefix: string,
  issues: ValidationIssue[],
) {
  if (!merchant?.soldAtMerchant) {
    return;
  }

  requirePositive(merchant.merchantFloor, `${fieldPrefix}.merchantFloor`, `${labelPrefix} merchant floor`, issues, false);
  if (!Number.isInteger(merchant.merchantFloor)) {
    issues.push({
      severity: "error",
      field: `${fieldPrefix}.merchantFloor`,
      message: `${labelPrefix} merchant floor must be a whole number.`
    });
  }
}

export function validateGearDocument(document: GearDocument): ValidationIssue[] {
  const normalizedDocument = normalizeGearDocument(document);
  const issues: ValidationIssue[] = [];

  requireText(normalizedDocument.id, "id", "Gear id", issues);
  requireText(normalizedDocument.name, "name", "Gear name", issues);
  if (normalizedDocument.slot === "weapon" && !normalizedDocument.weaponType) {
    issues.push({
      severity: "error",
      field: "weaponType",
      message: "Weapon gear needs a weapon type."
    });
  }

  requirePositive(normalizedDocument.inventory.massKg, "inventory.massKg", "Mass", issues);
  requirePositive(normalizedDocument.inventory.bulkBu, "inventory.bulkBu", "Bulk", issues);
  requirePositive(normalizedDocument.inventory.powerW, "inventory.powerW", "Power draw", issues);
  requirePositive(normalizedDocument.moduleSlots, "moduleSlots", "Module slots", issues);
  requirePositive(normalizedDocument.wear, "wear", "Wear", issues);
  if (normalizedDocument.acquisition.shop.enabled) {
    requirePositive(
      normalizedDocument.acquisition.shop.unlockFloor,
      "acquisition.shop.unlockFloor",
      "Shop unlock floor",
      issues
    );
  }
  validateMerchantListing(normalizedDocument.merchant, "merchant", "Gear", issues);
  if (normalizedDocument.acquisition.enemyDrop.enabled && normalizedDocument.acquisition.enemyDrop.enemyUnitIds.length === 0) {
    issues.push({
      severity: "warning",
      field: "acquisition.enemyDrop.enemyUnitIds",
      message: "Enemy drop sources work best when you list at least one enemy unit id."
    });
  }
  if (
    normalizedDocument.acquisition.victoryReward.enabled &&
    normalizedDocument.acquisition.victoryReward.floorOrdinals.length === 0 &&
    normalizedDocument.acquisition.victoryReward.regionIds.length === 0
  ) {
    issues.push({
      severity: "warning",
      field: "acquisition.victoryReward",
      message: "Victory reward sources work best when you list at least one floor number or region id."
    });
  }
  const seenVictoryFloors = new Set<number>();
  const duplicateVictoryFloors = new Set<number>();
  normalizedDocument.acquisition.victoryReward.floorOrdinals.forEach((ordinal) => {
    if (!Number.isInteger(ordinal) || ordinal <= 0) {
      issues.push({
        severity: "error",
        field: "acquisition.victoryReward.floorOrdinals",
        message: "Victory reward floor numbers must be whole numbers greater than 0."
      });
      return;
    }

    if (seenVictoryFloors.has(ordinal)) {
      duplicateVictoryFloors.add(ordinal);
      return;
    }

    seenVictoryFloors.add(ordinal);
  });
  duplicateVictoryFloors.forEach((ordinal) => {
    issues.push({
      severity: "warning",
      field: "acquisition.victoryReward.floorOrdinals",
      message: `Victory reward floors contains a duplicate entry: '${ordinal}'.`
    });
  });
  warnOnDuplicates(normalizedDocument.cardsGranted, "cardsGranted", "Granted cards", issues);
  warnOnDuplicates(normalizedDocument.attachedModules, "attachedModules", "Attached modules", issues);
  warnOnDuplicates(
    normalizedDocument.acquisition.enemyDrop.enemyUnitIds,
    "acquisition.enemyDrop.enemyUnitIds",
    "Enemy unit ids",
    issues
  );
  warnOnDuplicates(
    normalizedDocument.acquisition.victoryReward.regionIds,
    "acquisition.victoryReward.regionIds",
    "Victory reward region ids",
    issues
  );
  validateImageAsset(normalizedDocument.iconAsset, "iconAsset", "Gear icon", issues);
  const balanceReport = validateGearBalance(normalizedDocument);
  issues.push(
    ...toGearBalanceIssues({
      ...balanceReport,
      findings: balanceReport.findings.filter((finding) => finding.code !== "missing_weapon_type"),
    })
  );

  return issues;
}

export function validateItemDocument(document: ItemDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isWeaponChassis = document.archetype === "weapon_chassis";

  requireText(document.id, "id", "Item id", issues);
  requireText(document.name, "name", "Item name", issues);
  requirePositive(document.quantity, "quantity", "Quantity", issues, false);
  requirePositive(document.massKg, "massKg", "Mass", issues);
  requirePositive(document.bulkBu, "bulkBu", "Bulk", issues);
  requirePositive(document.powerW, "powerW", "Power draw", issues);
  validateImageAsset(document.iconAsset, "iconAsset", "Item icon", issues);
  validateMerchantListing(document.merchant, "merchant", "Item", issues);

  if (isWeaponChassis) {
    if (document.kind !== "equipment") {
      issues.push({
        severity: "error",
        field: "kind",
        message: "Weapon chassis exports must use the equipment kind."
      });
    }

    requirePositive(document.weaponChassis.stability, "weaponChassis.stability", "Stability", issues);
    requirePositive(document.weaponChassis.cardSlots, "weaponChassis.cardSlots", "Card slots", issues, false);
  }

  if (!isWeaponChassis) {
    if (document.acquisition.havenShop.enabled) {
      requirePositive(document.acquisition.havenShop.unlockFloor, "acquisition.havenShop.unlockFloor", "HAVEN unlock floor", issues);
    }

    if (document.acquisition.fieldMapResource.enabled) {
      requireText(document.acquisition.fieldMapResource.mapId, "acquisition.fieldMapResource.mapId", "Field map id", issues);
      requireText(
        document.acquisition.fieldMapResource.resourceNodeId,
        "acquisition.fieldMapResource.resourceNodeId",
        "Field resource node id",
        issues
      );
    }

    if (document.acquisition.enemyDrop.enabled && document.acquisition.enemyDrop.enemyUnitIds.length === 0) {
      issues.push({
        severity: "warning",
        field: "acquisition.enemyDrop.enemyUnitIds",
        message: "Enemy drop sources work best when you list at least one enemy unit id."
      });
    }
  }

  return issues;
}

export function validateKeyItemDocument(document: KeyItemDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Key item id", issues);
  requireText(document.name, "name", "Key item name", issues);
  requireText(document.description, "description", "Key item description", issues);
  validateImageAsset(document.iconAsset, "iconAsset", "Key item icon", issues);

  return issues;
}

export function validateFactionDocument(document: FactionDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.name, "name", "Faction name", issues);
  requireText(document.description, "description", "Faction description", issues);

  return issues;
}

export function validateChassisDocument(document: ChassisDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Chassis id", issues);
  requireText(document.name, "name", "Chassis name", issues);
  requireText(document.slotType, "slotType", "Slot type", issues);
  requireText(document.description, "description", "Chassis description", issues);
  requirePositive(document.stability, "stability", "Stability", issues);
  requirePositive(document.kg, "kg", "KG", issues);
  requirePositive(document.bu, "bu", "BU", issues);
  requirePositive(document.w, "w", "W", issues);
  requirePositive(document.cardSlots, "cardSlots", "Card slots", issues, false);
  requirePositive(document.unlockAfterFloor, "unlockAfterFloor", "Unlock after floor", issues);
  if (document.availableInHavenShop) {
    requirePositive(
      document.havenShopUnlockAfterFloor,
      "havenShopUnlockAfterFloor",
      "HAVEN shop unlock floor",
      issues
    );
  }
  validateMerchantListing(document.merchant, "merchant", "Chassis", issues);
  validateResourceWallet(document.buildCost, "buildCost", "Build cost", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);
  warnOnDuplicates(document.allowedCardTags, "allowedCardTags", "Allowed card tags", issues);
  warnOnDuplicates(document.allowedCardFamilies, "allowedCardFamilies", "Allowed card families", issues);

  return issues;
}

export function validateDoctrineDocument(document: DoctrineDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Doctrine id", issues);
  requireText(document.name, "name", "Doctrine name", issues);
  requireText(document.shortDescription, "shortDescription", "Doctrine short description", issues);
  requireText(document.description, "description", "Doctrine description", issues);
  requirePositive(document.unlockAfterFloor, "unlockAfterFloor", "Unlock after floor", issues);
  validateMerchantListing(document.merchant, "merchant", "Doctrine", issues);
  validateResourceWallet(document.buildCostModifier, "buildCostModifier", "Build cost modifier", issues);
  warnOnDuplicates(document.intentTags, "intentTags", "Intent tags", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);

  return issues;
}

export function validateChatterDocument(document: ChatterDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Chatter id", issues);
  requireText(document.location, "location", "Chatter location", issues);
  requireText(document.content, "content", "Chatter content", issues);
  requireText(document.aerissResponse, "aerissResponse", "Aeriss response", issues);

  return issues;
}

function getMetadataStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function hasCaseInsensitiveOverlap(left: readonly string[] | undefined, right: readonly string[]) {
  const rightValues = new Set(right.map((entry) => entry.toLowerCase()));
  return (left ?? []).some((entry) => rightValues.has(entry.toLowerCase()));
}

function getMapValidationTags(map: MapDocument): string[] {
  return Array.from(
    new Set([
      ...(map.mapTags ?? []),
      ...getMetadataStringList(map.metadata.tags),
      ...getMetadataStringList(map.metadata.mapTags)
    ].map((entry) => entry.trim()).filter(Boolean))
  );
}

function getMapValidationRegionIds(map: MapDocument): string[] {
  return Array.from(
    new Set([
      ...(map.regionTags ?? []),
      ...getMetadataStringList(map.metadata.regionIds),
      ...getMetadataStringList(map.metadata.regions),
      map.metadata.regionId ?? ""
    ].map((entry) => entry.trim()).filter(Boolean))
  );
}

function getMapValidationFloorOrdinal(map: MapDocument): number | null {
  const rawValue = map.metadata.floorOrdinal ?? map.metadata.floor;
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function isGeneratedApronMapDraft(map: MapDocument): boolean {
  return Boolean(
    map.metadata.generatedApron ||
    map.metadata.isGeneratedApron ||
    map.metadata.mapKind === "generated_apron" ||
    map.metadata.type === "apron" ||
    getMapValidationTags(map).some((tag) => tag.toLowerCase() === "apron" || tag.toLowerCase() === "generated_apron")
  );
}

function fieldEnemyTargetsMapDraft(document: FieldEnemyDocument, map: MapDocument): boolean {
  if (document.spawn.mapIds.includes(map.id)) {
    return true;
  }

  if (hasCaseInsensitiveOverlap(document.spawn.mapTags, getMapValidationTags(map))) {
    return true;
  }

  if (hasCaseInsensitiveOverlap(document.spawn.regionIds, getMapValidationRegionIds(map))) {
    return true;
  }

  const floorOrdinal = getMapValidationFloorOrdinal(map);
  if (floorOrdinal !== null && document.spawn.floorOrdinals.includes(floorOrdinal)) {
    return true;
  }

  return Boolean(document.spawn.allowGeneratedAprons && isGeneratedApronMapDraft(map));
}

function getEnemySpawnAnchors(map: MapDocument) {
  return (map.spawnAnchors ?? []).filter((anchor) => anchor.kind === "enemy" || anchor.kind === "generic");
}

function getMatchingEnemySpawnAnchors(map: MapDocument, anchorTags: readonly string[]) {
  const anchors = getEnemySpawnAnchors(map);
  if (anchorTags.length === 0) {
    return anchors;
  }

  return anchors.filter((anchor) => hasCaseInsensitiveOverlap(anchor.tags, anchorTags));
}

export function validateFieldEnemyMapLinks(
  document: FieldEnemyDocument,
  maps: readonly MapDocument[],
): ValidationIssue[] {
  if (maps.length === 0) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const anchorTags = document.spawn.spawnAnchorTags ?? [];
  const targetedMaps = maps.filter((map) => fieldEnemyTargetsMapDraft(document, map));

  targetedMaps.forEach((map) => {
    const enemyAnchors = getEnemySpawnAnchors(map);
    const matchingAnchors = getMatchingEnemySpawnAnchors(map, anchorTags);

    if (anchorTags.length > 0 && matchingAnchors.length === 0) {
      issues.push({
        severity: "warning",
        field: "spawn.spawnAnchorTags",
        message: `Targeted map '${map.id}' has no enemy or generic spawn anchors matching: ${anchorTags.join(", ")}. Chaos Core will fall back to random walkable tiles.`
      });
    }

    if (enemyAnchors.length === 0 && (map.renderMode === "simple_3d" || map.renderMode === "bespoke_3d")) {
      issues.push({
        severity: "warning",
        field: "spawn.spawnAnchorTags",
        message: `Targeted 3D map '${map.id}' has no enemy/generic spawn anchors. Add enemy anchors in the Map Editor for predictable 3D placement.`
      });
    }

    if (matchingAnchors.length > 0 && document.spawn.spawnCount > matchingAnchors.length) {
      issues.push({
        severity: "warning",
        field: "spawn.spawnCount",
        message: `Spawn count is ${document.spawn.spawnCount}, but targeted map '${map.id}' only has ${matchingAnchors.length} matching enemy/generic anchor(s). Chaos Core can only place one spawned enemy per matching anchor.`
      });
    }

    if ((document.spawn.minDistanceFromPlayerSpawn ?? 0) > 0 && !(map.spawnAnchors ?? []).some((anchor) => anchor.kind === "player")) {
      issues.push({
        severity: "warning",
        field: "spawn.minDistanceFromPlayerSpawn",
        message: `Targeted map '${map.id}' has no player spawn anchor, so minimum distance from player spawn cannot be enforced there.`
      });
    }
  });

  return issues;
}

export function validateFieldEnemyDocument(document: FieldEnemyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Field enemy id", issues);
  requireText(document.name, "name", "Field enemy name", issues);
  requireText(document.faction, "faction", "Field enemy faction", issues);
  requireText(document.kind, "kind", "Enemy kind", issues);
  requirePositive(document.stats.maxHp, "stats.maxHp", "Max HP", issues, false);
  requirePositive(document.stats.speed, "stats.speed", "Move speed", issues, false);
  requirePositive(document.stats.aggroRange, "stats.aggroRange", "Aggro range", issues, false);
  requirePositive(document.stats.width, "stats.width", "Width", issues, false);
  requirePositive(document.stats.height, "stats.height", "Height", issues, false);
  requirePositive(document.spawn.spawnCount, "spawn.spawnCount", "Spawns per map", issues, false);
  requirePositive(document.drops.wad, "drops.wad", "WAD drop", issues);
  validateResourceWallet(document.drops.resources, "drops.resources", "Drop", issues);

  const hasSpawnTarget =
    document.spawn.mapIds.length > 0 ||
    document.spawn.floorOrdinals.length > 0 ||
    Boolean(document.spawn.regionIds?.length) ||
    Boolean(document.spawn.mapTags?.length) ||
    Boolean(document.spawn.allowGeneratedAprons);

  if (!hasSpawnTarget) {
    issues.push({
      severity: "error",
      field: "spawn",
      message: "Field enemies need at least one spawn target: map ids, floor numbers, region ids, map tags, or generated aprons.",
    });
  }

  warnOnDuplicates(document.spawn.mapIds, "spawn.mapIds", "Map ids", issues);
  warnOnDuplicates(document.spawn.regionIds ?? [], "spawn.regionIds", "Region ids", issues);
  warnOnDuplicates(document.spawn.mapTags ?? [], "spawn.mapTags", "Map tags", issues);
  warnOnDuplicates(document.spawn.spawnAnchorTags ?? [], "spawn.spawnAnchorTags", "Spawn anchor tags", issues);

  if (document.presentation?.mode === "model_3d") {
    const hasModelSource = Boolean(document.presentation.modelKey.trim() || document.presentation.modelAssetPath.trim());
    if (!hasModelSource) {
      issues.push({
        severity: "warning",
        field: "presentation.modelKey",
        message: "3D model presentation should include a model key or model asset path so Chaos Core can render the intended enemy.",
      });
    }
  } else {
    const hasSpriteSource = Boolean(document.spriteKey.trim() || document.spriteAsset?.dataUrl || document.metadata.spritePath?.trim());
    if (!hasSpriteSource) {
      issues.push({
        severity: "warning",
        field: "spriteKey",
        message: "Billboard sprite presentation should include a sprite key, uploaded sprite, or metadata spritePath.",
      });
    }
  }

  if (document.presentation) {
    requirePositive(document.presentation.scale, "presentation.scale", "Presentation scale", issues, false);
  }

  const seenFloorOrdinals = new Set<number>();
  const duplicateFloorOrdinals = new Set<number>();
  document.spawn.floorOrdinals.forEach((ordinal) => {
    if (!Number.isFinite(ordinal) || ordinal < 0) {
      issues.push({
        severity: "error",
        field: "spawn.floorOrdinals",
        message: "Floor numbers must be 0 or greater.",
      });
      return;
    }

    if (seenFloorOrdinals.has(ordinal)) {
      duplicateFloorOrdinals.add(ordinal);
      return;
    }

    seenFloorOrdinals.add(ordinal);
  });

  duplicateFloorOrdinals.forEach((ordinal) => {
    issues.push({
      severity: "warning",
      field: "spawn.floorOrdinals",
      message: `Floor numbers contains a duplicate entry: '${ordinal}'.`,
    });
  });

  document.drops.items.forEach((drop, index) => {
    requireText(drop.id, `drops.items.${index}.id`, "Drop item id", issues);
    requirePositive(drop.quantity, `drops.items.${index}.quantity`, "Drop quantity", issues, false);

    if (!Number.isFinite(drop.chance) || drop.chance < 0 || drop.chance > 1) {
      issues.push({
        severity: "error",
        field: `drops.items.${index}.chance`,
        message: "Drop chance must be between 0 and 1.",
      });
    }
  });

  warnOnDuplicates(document.drops.items.map((drop) => drop.id), "drops.items", "Drop item ids", issues);
  validateImageAsset(document.spriteAsset, "spriteAsset", "Enemy sprite", issues);

  return issues;
}

export function validateCraftingDocument(document: CraftingDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Recipe id", issues);
  requireText(document.name, "name", "Recipe name", issues);
  requireText(document.description, "description", "Recipe description", issues);
  validateResourceWallet(document.cost, "cost", "Cost", issues);

  if (document.grants.length === 0) {
    issues.push({
      severity: "error",
      field: "grants",
      message: "Recipes need at least one crafted result."
    });
  }

  document.grants.forEach((grant, index) => {
    requireText(grant.itemId, `grants.${index}.itemId`, "Granted item id", issues);
    requirePositive(grant.quantity, `grants.${index}.quantity`, "Granted quantity", issues, false);
  });

  if (document.category === "upgrade") {
    requireText(document.requiresItemId, "requiresItemId", "Required base item id", issues);
  }

  if (document.acquisitionMethod === "purchased") {
    requirePositive(document.purchaseCostWad, "purchaseCostWad", "Recipe purchase cost", issues);
  }

  if (document.acquisitionMethod === "unlock_floor") {
    requirePositive(document.unlockFloor, "unlockFloor", "Recipe unlock floor", issues, false);
  }
  validateMerchantListing(document.merchant, "merchant", "Recipe", issues);

  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);

  return issues;
}

export function validateDishDocument(document: DishDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Dish id", issues);
  requireText(document.name, "name", "Dish name", issues);
  requireText(document.effect, "effect", "Dish effect", issues);
  requireText(document.description, "description", "Dish description", issues);
  requirePositive(document.cost, "cost", "Dish cost", issues, false);
  requirePositive(
    document.unlockAfterOperationFloor,
    "unlockAfterOperationFloor",
    "Dish unlock floor",
    issues
  );
  validateMerchantListing(document.merchant, "merchant", "Dish", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);

  return issues;
}

export function validateCodexDocument(document: CodexDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Codex id", issues);
  requireText(document.title, "title", "Codex title", issues);
  requireText(document.content, "content", "Codex content", issues);
  requirePositive(document.unlockAfterFloor, "unlockAfterFloor", "Unlock floor", issues);
  warnOnDuplicates(document.requiredDialogueIds, "requiredDialogueIds", "Required dialogue ids", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);
  warnOnDuplicates(document.requiredGearIds, "requiredGearIds", "Required gear ids", issues);
  warnOnDuplicates(document.requiredItemIds, "requiredItemIds", "Required item ids", issues);
  warnOnDuplicates(document.requiredSchemaIds, "requiredSchemaIds", "Required schema ids", issues);
  warnOnDuplicates(document.requiredFieldModIds, "requiredFieldModIds", "Required field mod ids", issues);

  return issues;
}

export function validateMailDocument(document: MailDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Mail id", issues);
  requireText(document.sender, "sender", "Sender", issues);
  requireText(document.subject, "subject", "Subject", issues);
  requireText(document.content, "content", "Mail content", issues);
  requirePositive(document.unlockAfterFloor, "unlockAfterFloor", "Unlock floor", issues);
  if (!mailCategories.includes(document.category)) {
    issues.push({
      severity: "error",
      field: "category",
      message: "Mail category must be personal, official, or system."
    });
  }
  warnOnDuplicates(document.requiredDialogueIds, "requiredDialogueIds", "Required dialogue ids", issues);
  warnOnDuplicates(document.requiredGearIds, "requiredGearIds", "Required gear ids", issues);
  warnOnDuplicates(document.requiredItemIds, "requiredItemIds", "Required item ids", issues);
  warnOnDuplicates(document.requiredSchemaIds, "requiredSchemaIds", "Required schema ids", issues);
  warnOnDuplicates(document.requiredFieldModIds, "requiredFieldModIds", "Required field mod ids", issues);

  return issues;
}

export function validateDecorationDocument(document: DecorationDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Decoration id", issues);
  requireText(document.name, "name", "Decoration name", issues);
  requirePositive(document.tileSize, "tileSize", "Tile size", issues, false);
  validateImageAsset(document.spriteAsset, "spriteAsset", "Decoration sprite", issues);
  validateMerchantListing(document.merchant, "merchant", "Decoration", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);

  return issues;
}

export function validateFieldModDocument(document: FieldModDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Field mod id", issues);
  requireText(document.name, "name", "Field mod name", issues);
  requirePositive(document.chance, "chance", "Proc chance", issues);
  requirePositive(document.maxStacks, "maxStacks", "Max stacks", issues, false);
  requirePositive(document.cost, "cost", "Field mod cost", issues, false);
  requirePositive(
    document.unlockAfterOperationFloor,
    "unlockAfterOperationFloor",
    "Field mod unlock floor",
    issues
  );
  if (document.chance > 1) {
    issues.push({
      severity: "error",
      field: "chance",
      message: "Proc chance cannot be greater than 1.",
    });
  }
  validateMerchantListing(document.merchant, "merchant", "Field mod", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);
  issues.push(...validateEffectFlowDocument(document.effectFlow, "effectFlow"));

  return issues;
}

export function validateSchemaDocument(document: SchemaDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isFortification = document.kind === "fortification";

  requireText(document.id, "id", "Schema id", issues);
  requireText(document.name, "name", "Schema name", issues);
  requireText(document.description, "description", "Schema description", issues);
  validateResourceWallet(document.buildCost, "buildCost", "Build cost", issues);
  validateResourceWallet(document.unlockCost, "unlockCost", "Unlock cost", issues);
  requirePositive(document.unlockWadCost, "unlockWadCost", "Unlock WAD cost", issues);
  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);
  warnOnDuplicates(document.preferredRoomTags, "preferredRoomTags", "Preferred room tags", issues);

  if (document.unlockSource === "schema") {
    const hasAnyUnlockCost = [
      ...resourceKeys.map((resourceKey) => document.unlockCost[resourceKey]),
      document.unlockWadCost
    ].some((value) => value > 0);

    if (!hasAnyUnlockCost) {
      issues.push({
        severity: "warning",
        field: "unlockCost",
        message: "Schema-unlocked entries usually need an unlock cost or unlock WAD cost."
      });
    }
  }

  if (document.shortCode.trim() && document.shortCode.trim().length > 4) {
    issues.push({
      severity: "warning",
      field: "shortCode",
      message: "Short code should usually be 4 characters or fewer for in-game readability."
    });
  }

  document.tagOutputModifiers.forEach((modifier, index) => {
    if (!modifier.tag.trim()) {
      issues.push({
        severity: "error",
        field: `tagOutputModifiers.${index}.tag`,
        message: `Tag output modifier ${index + 1} needs a room tag.`
      });
    }

    validateResourceWallet(
      modifier.output,
      `tagOutputModifiers.${index}.output`,
      `Tag output modifier ${index + 1}`,
      issues,
    );
  });

  warnOnDuplicates(
    document.tagOutputModifiers.map((modifier) => modifier.id),
    "tagOutputModifiers",
    "Tag output modifier ids",
    issues
  );

  if (!isFortification) {
    requireText(document.category, "category", "Core category", issues);
    requirePositive(
      document.operationalRequirements.powerWatts,
      "operationalRequirements.powerWatts",
      "Power requirement",
      issues
    );
    requirePositive(
      document.operationalRequirements.commsBw,
      "operationalRequirements.commsBw",
      "Comms requirement",
      issues
    );
    requirePositive(
      document.operationalRequirements.supplyCrates,
      "operationalRequirements.supplyCrates",
      "Supply requirement",
      issues
    );
    requirePositive(document.powerOutputWatts, "powerOutputWatts", "Power output", issues);
    requirePositive(document.commsOutputBw, "commsOutputBw", "Comms output", issues);
    requirePositive(document.supplyOutputCrates, "supplyOutputCrates", "Supply output", issues);
    validateResourceWallet(document.upkeep, "upkeep", "Upkeep", issues);
    requirePositive(document.wadUpkeepPerTick, "wadUpkeepPerTick", "WAD upkeep per tick", issues);
    validateResourceWallet(document.incomePerTick, "incomePerTick", "Income", issues);
    requirePositive(document.supportRadius, "supportRadius", "Support radius", issues);
  } else {
    if (document.shortCode.trim()) {
      issues.push({
        severity: "warning",
        field: "shortCode",
        message: "Fortifications do not use short codes in Chaos Core."
      });
    }
    if (document.category.trim()) {
      issues.push({
        severity: "warning",
        field: "category",
        message: "Fortifications do not use core categories in Chaos Core."
      });
    }
    if (document.tagOutputModifiers.length > 0) {
      issues.push({
        severity: "warning",
        field: "tagOutputModifiers",
        message: "Fortifications do not use tag output modifiers in Chaos Core."
      });
    }
  }

  return issues;
}

export function validateCardDocument(document: CardDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const compiledEffects = createLegacyCardEffectsFromFlow(document.effectFlow);

  requireText(document.id, "id", "Card id", issues);
  requireText(document.name, "name", "Card name", issues);
  requireText(document.description, "description", "Card description", issues);
  requirePositive(document.strainCost, "strainCost", "Strain cost", issues);
  requirePositive(document.range, "range", "Range", issues);

  if (document.cardType === "class" && !document.sourceClassId?.trim()) {
    issues.push({
      severity: "warning",
      field: "sourceClassId",
      message: "Class cards should usually point at a source class id."
    });
  }

  if (document.cardType === "equipment" && !document.sourceEquipmentId?.trim()) {
    issues.push({
      severity: "warning",
      field: "sourceEquipmentId",
      message: "Equipment cards should usually point at a source gear id."
    });
  }

  if (compiledEffects.some((effect) => !effect.type.trim())) {
    issues.push({
      severity: "error",
      field: "effects",
      message: "Every effect entry needs a type."
    });
  }
  issues.push(...validateEffectFlowDocument(document.effectFlow, "effectFlow"));

  validateImageAsset(document.artAsset, "artAsset", "Card art", issues);

  return issues;
}

export function validateUnitDocument(document: UnitDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isEnemyUnit = document.spawnRole === "enemy";

  requireText(document.id, "id", "Unit id", issues);
  requireText(document.name, "name", "Unit name", issues);
  requireText(document.faction, "faction", "Unit faction", issues);
  requireText(document.currentClassId, "currentClassId", "Current class id", issues);
  requirePositive(document.stats.maxHp, "stats.maxHp", "Max HP", issues, false);
  requirePositive(document.stats.atk, "stats.atk", "ATK", issues);
  requirePositive(document.stats.def, "stats.def", "DEF", issues);
  requirePositive(document.stats.agi, "stats.agi", "AGI", issues);
  requirePositive(document.stats.acc, "stats.acc", "ACC", issues);
  requirePositive(document.pwr, "pwr", "PWR", issues);
  requirePositive(document.recruitCost, "recruitCost", "Recruit cost", issues);
  warnOnDuplicates(document.traits, "traits", "Traits", issues);

  if (isEnemyUnit && document.enemySpawnFloorOrdinals.length === 0) {
    issues.push({
      severity: "error",
      field: "enemySpawnFloorOrdinals",
      message: "Enemy units need at least one tactical battle floor selected."
    });
  }

  warnOnDuplicates(
    document.enemySpawnFloorOrdinals.map((ordinal) => String(ordinal)),
    "enemySpawnFloorOrdinals",
    "Enemy spawn floors",
    issues
  );

  if (document.enemySpawnFloorOrdinals.some((ordinal) => !Number.isInteger(ordinal) || ordinal <= 0)) {
    issues.push({
      severity: "error",
      field: "enemySpawnFloorOrdinals",
      message: "Enemy spawn floors must be whole numbers greater than 0."
    });
  }

  if (!isEnemyUnit && document.deployInParty && !document.startingInRoster) {
    issues.push({
      severity: "warning",
      field: "deployInParty",
      message: "A unit cannot deploy into the party unless it also starts in the roster."
    });
  }

  if (isEnemyUnit && (document.startingInRoster || document.deployInParty)) {
    issues.push({
      severity: "warning",
      field: "spawnRole",
      message: "Enemy units do not use roster or party staging flags in Chaos Core."
    });
  }

  warnOnDuplicates(document.requiredQuestIds, "requiredQuestIds", "Required quest ids", issues);

  return issues;
}

function normalizeRouteText(value: string | undefined) {
  return value?.trim() ?? "";
}

function mapRouteLooksLinkedToOperationRoom(
  entryRule: MapEntryRule,
  document: OperationDocument,
  floor: OperationDocument["floors"][number],
  room: OperationDocument["floors"][number]["rooms"][number],
) {
  if (entryRule.source !== room.fieldMapRouteSource) {
    return false;
  }

  const expectedEntryPointId = normalizeRouteText(room.fieldMapEntryPointId);
  if (expectedEntryPointId && entryRule.entryPointId !== expectedEntryPointId) {
    return false;
  }

  if (room.fieldMapRouteSource === "atlas_theater") {
    return (
      entryRule.theaterScreenId === room.id ||
      entryRule.regionId === room.id ||
      entryRule.operationId === document.id ||
      entryRule.operationId === document.codename
    );
  }

  if (room.fieldMapRouteSource === "floor_region") {
    return (
      entryRule.floorOrdinal === floor.floorOrdinal ||
      entryRule.regionId === room.id ||
      entryRule.regionId === floor.id ||
      entryRule.regionId === floor.atlasFloorId ||
      entryRule.regionId === floor.sectorLabel
    );
  }

  if (room.fieldMapRouteSource === "door") {
    return Boolean(normalizeRouteText(room.fieldMapDoorId)) && entryRule.doorId === room.fieldMapDoorId;
  }

  if (room.fieldMapRouteSource === "portal") {
    return Boolean(normalizeRouteText(room.fieldMapPortalId)) && entryRule.portalId === room.fieldMapPortalId;
  }

  return false;
}

export function validateOperationFieldMapLinks(
  document: OperationDocument,
  maps: readonly MapDocument[],
): ValidationIssue[] {
  if (maps.length === 0) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const mapById = new Map(maps.map((map) => [map.id, map]));

  document.floors.forEach((floor, floorIndex) => {
    floor.rooms.forEach((room, roomIndex) => {
      const fieldMapId = normalizeRouteText(room.fieldMapId);
      if (!fieldMapId) {
        return;
      }

      const fieldPrefix = `floors.${floorIndex}.rooms.${roomIndex}`;
      const linkedMap = mapById.get(fieldMapId);
      if (!linkedMap) {
        issues.push({
          severity: "warning",
          field: `${fieldPrefix}.fieldMapId`,
          message: `Room '${room.id}' links to field map '${fieldMapId}', but that map is not available in the current validation set. Load or publish the matching map alongside this operation so Chaos Core can resolve the route.`
        });
        return;
      }

      const expectedEntryPointId = normalizeRouteText(room.fieldMapEntryPointId);
      if (expectedEntryPointId && !(linkedMap.spawnAnchors ?? []).some((anchor) => anchor.id === expectedEntryPointId)) {
        issues.push({
          severity: "warning",
          field: `${fieldPrefix}.fieldMapEntryPointId`,
          message: `Room '${room.id}' expects spawn anchor '${expectedEntryPointId}', but map '${fieldMapId}' does not define that anchor.`
        });
      }

      const matchingRoute = (linkedMap.entryRules ?? []).find((entryRule) =>
        mapRouteLooksLinkedToOperationRoom(entryRule, document, floor, room)
      );
      if (!matchingRoute) {
        issues.push({
          severity: "warning",
          field: `${fieldPrefix}.fieldMapId`,
          message: `Room '${room.id}' links to map '${fieldMapId}', but that map has no matching ${room.fieldMapRouteSource.replace(/_/g, " ")} entry rule. Use the Map Editor route handshake builder to create the matching route before publishing.`
        });
      }
    });
  });

  return issues;
}

export function validateOperationDocument(document: OperationDocument): ValidationIssue[] {
  const normalizedDocument = document;
  const issues: ValidationIssue[] = [];

  requireText(normalizedDocument.id, "id", "Operation id", issues);
  requireText(normalizedDocument.codename, "codename", "Codename", issues);
  requireText(normalizedDocument.description, "description", "Description", issues);
  requireText(normalizedDocument.zoneName, "zoneName", "Zone name", issues);
  requireText(normalizedDocument.objective, "objective", "Objective", issues);
  requireText(normalizedDocument.beginningState, "beginningState", "Beginning state", issues);
  requireText(normalizedDocument.endState, "endState", "End state", issues);
  requirePositive(normalizedDocument.recommendedPower, "recommendedPower", "Recommended power", issues, false);

  if (normalizedDocument.floors.length === 0) {
    issues.push({
      severity: "error",
      field: "floors",
      message: "Operations need at least one floor."
    });
  }

  const floorIds = normalizedDocument.floors.map((floor) => floor.id.trim()).filter(Boolean);
  warnOnDuplicates(floorIds, "floors", "Floor ids", issues);
  warnOnDuplicates(
    normalizedDocument.floors.map((floor) => floor.atlasFloorId.trim()).filter(Boolean),
    "floors",
    "Atlas floor ids",
    issues
  );

  normalizedDocument.floors.forEach((floor, floorIndex) => {
    requireText(floor.id, `floors.${floorIndex}.id`, "Floor id", issues);
    requireText(floor.name, `floors.${floorIndex}.name`, "Floor name", issues);
    requireText(floor.startingRoomId, `floors.${floorIndex}.startingRoomId`, "Starting room id", issues);
    requireText(floor.sectorLabel, `floors.${floorIndex}.sectorLabel`, "Sector label", issues);
    requireText(floor.passiveEffectText, `floors.${floorIndex}.passiveEffectText`, "Passive effect text", issues);
    requireText(floor.threatLevel, `floors.${floorIndex}.threatLevel`, "Threat level", issues);
    requireText(floor.originLabel, `floors.${floorIndex}.originLabel`, "Origin label", issues);
    requirePositive(floor.floorOrdinal, `floors.${floorIndex}.floorOrdinal`, "Floor ordinal", issues, false);

    const roomIds = floor.rooms.map((room) => room.id.trim()).filter(Boolean);
    warnOnDuplicates(roomIds, `floors.${floorIndex}.rooms`, `Room ids on ${floor.name || floor.id}`, issues);

    if (floor.startingRoomId && !roomIds.includes(floor.startingRoomId)) {
      issues.push({
        severity: "error",
        field: `floors.${floorIndex}.startingRoomId`,
        message: `Starting room '${floor.startingRoomId}' does not exist on floor '${floor.name || floor.id}'.`
      });
    }

    if (floor.rooms.length === 0) {
      issues.push({
        severity: "error",
        field: `floors.${floorIndex}.rooms`,
        message: `Floor '${floor.name || floor.id}' needs at least one room.`
      });
    }

    const ingressRooms = floor.rooms.filter((room) => room.role === "ingress");
    if (ingressRooms.length === 0) {
      issues.push({
        severity: "error",
        field: `floors.${floorIndex}.rooms`,
        message: `Floor '${floor.name || floor.id}' needs at least one ingress room.`
      });
    }

    if (ingressRooms.length > 1) {
      issues.push({
        severity: "warning",
        field: `floors.${floorIndex}.rooms`,
        message: `Floor '${floor.name || floor.id}' has multiple ingress rooms. Chaos Core usually reads best with one clear insertion root.`
      });
    }

    const objectiveRooms = floor.rooms.filter((room) => room.role === "objective" || room.tags.includes("objective"));
    if (objectiveRooms.length === 0) {
      issues.push({
        severity: "error",
        field: `floors.${floorIndex}.rooms`,
        message: `Floor '${floor.name || floor.id}' needs at least one objective room.`
      });
    }

    if (!floor.rooms.some((room) => room.isPowerSource || room.role === "power")) {
      issues.push({
        severity: "warning",
        field: `floors.${floorIndex}.rooms`,
        message: `Floor '${floor.name || floor.id}' has no authored power source room.`
      });
    }

    const startingRoom = floor.rooms.find((room) => room.id === floor.startingRoomId);
    if (startingRoom && startingRoom.role !== "ingress") {
      issues.push({
        severity: "warning",
        field: `floors.${floorIndex}.startingRoomId`,
        message: `Starting room '${startingRoom.id}' is not marked as an ingress room.`
      });
    }

    floor.rooms.forEach((room, roomIndex) => {
      requireText(room.id, `floors.${floorIndex}.rooms.${roomIndex}.id`, "Room id", issues);
      requireText(room.label, `floors.${floorIndex}.rooms.${roomIndex}.label`, "Room label", issues);
      requireText(room.role, `floors.${floorIndex}.rooms.${roomIndex}.role`, "Room role", issues);
      requireText(room.clearMode, `floors.${floorIndex}.rooms.${roomIndex}.clearMode`, "Room clear mode", issues);
      requireText(room.roomClass, `floors.${floorIndex}.rooms.${roomIndex}.roomClass`, "Room class", issues);
      requireText(room.sectorTag, `floors.${floorIndex}.rooms.${roomIndex}.sectorTag`, "Sector tag", issues);
      requireFiniteNumber(room.x, `floors.${floorIndex}.rooms.${roomIndex}.x`, "Room X", issues);
      requireFiniteNumber(room.y, `floors.${floorIndex}.rooms.${roomIndex}.y`, "Room Y", issues);
      requirePositive(
        room.depthFromUplink,
        `floors.${floorIndex}.rooms.${roomIndex}.depthFromUplink`,
        "Depth from uplink",
        issues
      );
      requirePositive(
        room.coreSlotCapacity,
        `floors.${floorIndex}.rooms.${roomIndex}.coreSlotCapacity`,
        "Core slot capacity",
        issues
      );
      requirePositive(
        room.fortificationCapacity,
        `floors.${floorIndex}.rooms.${roomIndex}.fortificationCapacity`,
        "Fortification capacity",
        issues
      );
      warnOnDuplicates(room.tags, `floors.${floorIndex}.rooms.${roomIndex}.tags`, `Tags on room '${room.id}'`, issues);
      warnOnDuplicates(
        room.shopInventory,
        `floors.${floorIndex}.rooms.${roomIndex}.shopInventory`,
        `Shop inventory on room '${room.id}'`,
        issues
      );

      if (room.fieldMapId?.trim()) {
        if (room.clearMode !== "field") {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.clearMode`,
            message: `Room '${room.id}' has a Technica field-map route but clear mode is '${room.clearMode}'. Use field clear mode if this room should enter a field map.`
          });
        }

        if (room.fieldMapRouteSource === "door" && !room.fieldMapDoorId?.trim()) {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.fieldMapDoorId`,
            message: `Room '${room.id}' uses a door field-map route but has no door id.`
          });
        }

        if (room.fieldMapRouteSource === "portal" && !room.fieldMapPortalId?.trim()) {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.fieldMapPortalId`,
            message: `Room '${room.id}' uses a portal field-map route but has no portal id.`
          });
        }
      }

      room.connections.forEach((connectionId) => {
        if (!roomIds.includes(connectionId)) {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.connections`,
            message: `Room '${room.id}' connects to missing room '${connectionId}'.`
          });
          return;
        }

        const connectedRoom = floor.rooms.find((candidate) => candidate.id === connectionId);
        if (connectedRoom && !connectedRoom.connections.includes(room.id)) {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.connections`,
            message: `Connection '${room.id}' -> '${connectionId}' is one-way. Theater adjacency usually works best when the reverse link is also present.`
          });
        }
      });
    });

    if (startingRoom && objectiveRooms.length > 0) {
      const visited = new Set<string>([startingRoom.id]);
      const queue = [startingRoom.id];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentRoom = floor.rooms.find((room) => room.id === currentId);
        for (const connectionId of currentRoom?.connections ?? []) {
          if (!visited.has(connectionId) && roomIds.includes(connectionId)) {
            visited.add(connectionId);
            queue.push(connectionId);
          }
        }
      }

      const unreachableObjective = objectiveRooms.every((room) => !visited.has(room.id));
      if (unreachableObjective) {
        issues.push({
          severity: "error",
          field: `floors.${floorIndex}.rooms`,
          message: `No authored path connects starting room '${startingRoom.id}' to any objective room on '${floor.name || floor.id}'.`
        });
      }

      if (visited.size !== roomIds.length) {
        issues.push({
          severity: "warning",
          field: `floors.${floorIndex}.rooms`,
          message: `${roomIds.length - visited.size} room(s) on '${floor.name || floor.id}' are disconnected from the starting route.`
        });
      }
    }
  });

  return issues;
}

export function validateClassDocument(document: ClassDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Class id", issues);
  requireText(document.name, "name", "Class name", issues);
  requireText(document.description, "description", "Class description", issues);
  requirePositive(document.baseStats.maxHp, "baseStats.maxHp", "Max HP", issues, false);
  requirePositive(document.baseStats.atk, "baseStats.atk", "ATK", issues);
  requirePositive(document.baseStats.def, "baseStats.def", "DEF", issues);
  requirePositive(document.baseStats.agi, "baseStats.agi", "AGI", issues);
  requirePositive(document.baseStats.acc, "baseStats.acc", "ACC", issues);

  if (document.weaponTypes.length === 0) {
    issues.push({
      severity: "error",
      field: "weaponTypes",
      message: "Classes need at least one weapon type."
    });
  }

  warnOnDuplicates(document.weaponTypes, "weaponTypes", "Weapon types", issues);
  warnOnDuplicates(document.trainingGrid.map((node) => node.id), "trainingGrid", "Training grid node ids", issues);

  if (document.trainingGrid.length === 0) {
    issues.push({
      severity: "warning",
      field: "trainingGrid",
      message: "Classes work best with a training grid so Chaos Core can show progression nodes."
    });
  }

  document.unlockConditions.forEach((condition, index) => {
    if (condition.type === "class_rank") {
      if (!condition.requiredClassId?.trim()) {
        issues.push({
          severity: "error",
          field: `unlockConditions.${index}.requiredClassId`,
          message: "Class-rank unlocks need a required class id."
        });
      }

      if (!Number.isFinite(condition.requiredRank) || (condition.requiredRank ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `unlockConditions.${index}.requiredRank`,
          message: "Class-rank unlocks need a required rank greater than 0."
        });
      }
    }

    if (condition.type === "quest_completed" && !condition.requiredQuestId?.trim()) {
      issues.push({
        severity: "error",
        field: `unlockConditions.${index}.requiredQuestId`,
        message: "Quest-completed unlocks need a required quest id."
      });
    }
  });

  const gridNodeIds = new Set(document.trainingGrid.map((node) => node.id));
  document.trainingGrid.forEach((node, index) => {
    requireText(node.id, `trainingGrid.${index}.id`, "Training grid node id", issues);
    requireText(node.name, `trainingGrid.${index}.name`, "Training grid node name", issues);
    requireText(node.description, `trainingGrid.${index}.description`, "Training grid node description", issues);
    requirePositive(node.cost, `trainingGrid.${index}.cost`, "Training grid node cost", issues, false);
    requirePositive(node.row, `trainingGrid.${index}.row`, "Training grid row", issues, false);
    requirePositive(node.col, `trainingGrid.${index}.col`, "Training grid column", issues, false);

    (node.requires ?? []).forEach((requiredId) => {
      if (!gridNodeIds.has(requiredId)) {
        issues.push({
          severity: "warning",
          field: `trainingGrid.${index}.requires`,
          message: `Training node '${node.id}' references missing prerequisite '${requiredId}'.`
        });
      }
    });
  });

  return issues;
}

export function validateNpcDocument(document: NpcDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "NPC id", issues);
  requireText(document.name, "name", "NPC name", issues);
  requireText(document.faction, "faction", "NPC faction", issues);
  requireText(document.mapId, "mapId", "Map id", issues);
  requirePositive(document.tileX, "tileX", "Tile X", issues);
  requirePositive(document.tileY, "tileY", "Tile Y", issues);

  if (document.routeMode === "fixed" && document.routePoints.length === 0) {
    issues.push({
      severity: "warning",
      field: "routePoints",
      message: "Fixed route mode works best with at least one patrol point."
    });
  }

  document.routePoints.forEach((point, index) => {
    requireText(point.id, `routePoints.${index}.id`, "Route point id", issues);
    requirePositive(point.x, `routePoints.${index}.x`, "Route point X", issues);
    requirePositive(point.y, `routePoints.${index}.y`, "Route point Y", issues);
  });

  warnOnDuplicates(document.routePoints.map((point) => point.id), "routePoints", "Route points", issues);
  validateImageAsset(document.portraitAsset, "portraitAsset", "NPC portrait", issues);
  validateImageAsset(document.spriteAsset, "spriteAsset", "NPC sprite", issues);

  return issues;
}
