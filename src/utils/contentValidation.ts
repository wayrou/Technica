import type { CardDocument } from "../types/card";
import type { ClassDocument } from "../types/class";
import type { CraftingDocument } from "../types/crafting";
import type { DishDocument } from "../types/dish";
import type { ImageAsset, ValidationIssue } from "../types/common";
import type { FieldModDocument } from "../types/fieldmod";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import type { SchemaDocument } from "../types/schema";
import type { UnitDocument } from "../types/unit";
import { compileCardEffectBlocks } from "./cardComposer";

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

function warnOnDuplicates(values: string[], field: string, label: string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    const normalized = value.trim();
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

export function validateGearDocument(document: GearDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Gear id", issues);
  requireText(document.name, "name", "Gear name", issues);
  if (document.slot === "weapon" && !document.weaponType) {
    issues.push({
      severity: "error",
      field: "weaponType",
      message: "Weapon gear needs a weapon type."
    });
  }

  requirePositive(document.inventory.massKg, "inventory.massKg", "Mass", issues);
  requirePositive(document.inventory.bulkBu, "inventory.bulkBu", "Bulk", issues);
  requirePositive(document.inventory.powerW, "inventory.powerW", "Power draw", issues);
  requirePositive(document.moduleSlots, "moduleSlots", "Module slots", issues);
  requirePositive(document.wear, "wear", "Wear", issues);
  warnOnDuplicates(document.cardsGranted, "cardsGranted", "Granted cards", issues);
  warnOnDuplicates(document.attachedModules, "attachedModules", "Attached modules", issues);
  validateImageAsset(document.iconAsset, "iconAsset", "Gear icon", issues);

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

export function validateCraftingDocument(document: CraftingDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Recipe id", issues);
  requireText(document.name, "name", "Recipe name", issues);
  requireText(document.description, "description", "Recipe description", issues);
  requirePositive(document.cost.metalScrap, "cost.metalScrap", "Metal scrap cost", issues);
  requirePositive(document.cost.wood, "cost.wood", "Wood cost", issues);
  requirePositive(document.cost.chaosShards, "cost.chaosShards", "Chaos shard cost", issues);
  requirePositive(document.cost.steamComponents, "cost.steamComponents", "Steam component cost", issues);

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

  return issues;
}

export function validateFieldModDocument(document: FieldModDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Field mod id", issues);
  requireText(document.name, "name", "Field mod name", issues);
  requireText(document.effects, "effects", "Field mod effects", issues);
  requirePositive(document.cost, "cost", "Field mod cost", issues, false);
  requirePositive(
    document.unlockAfterOperationFloor,
    "unlockAfterOperationFloor",
    "Field mod unlock floor",
    issues
  );

  return issues;
}

export function validateSchemaDocument(document: SchemaDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isFortification = document.kind === "fortification";

  requireText(document.id, "id", "Schema id", issues);
  requireText(document.name, "name", "Schema name", issues);
  requireText(document.description, "description", "Schema description", issues);
  requirePositive(document.buildCost.metalScrap, "buildCost.metalScrap", "Build metal scrap cost", issues);
  requirePositive(document.buildCost.wood, "buildCost.wood", "Build wood cost", issues);
  requirePositive(document.buildCost.chaosShards, "buildCost.chaosShards", "Build chaos shard cost", issues);
  requirePositive(document.buildCost.steamComponents, "buildCost.steamComponents", "Build steam component cost", issues);
  requirePositive(document.unlockCost.metalScrap, "unlockCost.metalScrap", "Unlock metal scrap cost", issues);
  requirePositive(document.unlockCost.wood, "unlockCost.wood", "Unlock wood cost", issues);
  requirePositive(document.unlockCost.chaosShards, "unlockCost.chaosShards", "Unlock chaos shard cost", issues);
  requirePositive(document.unlockCost.steamComponents, "unlockCost.steamComponents", "Unlock steam component cost", issues);
  requirePositive(document.unlockWadCost, "unlockWadCost", "Unlock WAD cost", issues);
  warnOnDuplicates(document.preferredRoomTags, "preferredRoomTags", "Preferred room tags", issues);

  if (document.unlockSource === "schema") {
    const hasAnyUnlockCost = [
      document.unlockCost.metalScrap,
      document.unlockCost.wood,
      document.unlockCost.chaosShards,
      document.unlockCost.steamComponents,
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

    requirePositive(
      modifier.output.metalScrap,
      `tagOutputModifiers.${index}.output.metalScrap`,
      `Tag output modifier ${index + 1} metal scrap`,
      issues
    );
    requirePositive(
      modifier.output.wood,
      `tagOutputModifiers.${index}.output.wood`,
      `Tag output modifier ${index + 1} wood`,
      issues
    );
    requirePositive(
      modifier.output.chaosShards,
      `tagOutputModifiers.${index}.output.chaosShards`,
      `Tag output modifier ${index + 1} chaos shards`,
      issues
    );
    requirePositive(
      modifier.output.steamComponents,
      `tagOutputModifiers.${index}.output.steamComponents`,
      `Tag output modifier ${index + 1} steam components`,
      issues
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
    requirePositive(document.upkeep.metalScrap, "upkeep.metalScrap", "Upkeep metal scrap", issues);
    requirePositive(document.upkeep.wood, "upkeep.wood", "Upkeep wood", issues);
    requirePositive(document.upkeep.chaosShards, "upkeep.chaosShards", "Upkeep chaos shards", issues);
    requirePositive(document.upkeep.steamComponents, "upkeep.steamComponents", "Upkeep steam components", issues);
    requirePositive(document.wadUpkeepPerTick, "wadUpkeepPerTick", "WAD upkeep per tick", issues);
    requirePositive(document.incomePerTick.metalScrap, "incomePerTick.metalScrap", "Income metal scrap", issues);
    requirePositive(document.incomePerTick.wood, "incomePerTick.wood", "Income wood", issues);
    requirePositive(
      document.incomePerTick.chaosShards,
      "incomePerTick.chaosShards",
      "Income chaos shards",
      issues
    );
    requirePositive(
      document.incomePerTick.steamComponents,
      "incomePerTick.steamComponents",
      "Income steam components",
      issues
    );
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
  const compiledEffects = document.effectComposerMode === "blocks" ? compileCardEffectBlocks(document.effectBlocks) : document.effects;

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

  if (document.effectComposerMode === "blocks") {
    if (document.effectBlocks.length === 0) {
      issues.push({
        severity: "warning",
        field: "effectBlocks",
        message: "Add at least one effect block or switch the composer to manual mode."
      });
    }

    warnOnDuplicates(document.effectBlocks.map((block) => block.id), "effectBlocks", "Effect block ids", issues);
  }

  validateImageAsset(document.artAsset, "artAsset", "Card art", issues);

  return issues;
}

export function validateUnitDocument(document: UnitDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isEnemyUnit = document.spawnRole === "enemy";

  requireText(document.id, "id", "Unit id", issues);
  requireText(document.name, "name", "Unit name", issues);
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

  return issues;
}

export function validateOperationDocument(document: OperationDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  requireText(document.id, "id", "Operation id", issues);
  requireText(document.codename, "codename", "Codename", issues);
  requireText(document.description, "description", "Description", issues);
  requirePositive(document.recommendedPower, "recommendedPower", "Recommended power", issues, false);

  if (document.floors.length === 0) {
    issues.push({
      severity: "error",
      field: "floors",
      message: "Operations need at least one floor."
    });
  }

  const floorIds = document.floors.map((floor) => floor.id.trim()).filter(Boolean);
  warnOnDuplicates(floorIds, "floors", "Floor ids", issues);

  document.floors.forEach((floor, floorIndex) => {
    requireText(floor.id, `floors.${floorIndex}.id`, "Floor id", issues);
    requireText(floor.name, `floors.${floorIndex}.name`, "Floor name", issues);
    requireText(floor.startingRoomId, `floors.${floorIndex}.startingRoomId`, "Starting room id", issues);

    const roomIds = floor.rooms.map((room) => room.id.trim()).filter(Boolean);
    warnOnDuplicates(roomIds, `floors.${floorIndex}.rooms`, `Room ids on ${floor.name || floor.id}`, issues);

    if (floor.startingRoomId && !roomIds.includes(floor.startingRoomId)) {
      issues.push({
        severity: "error",
        field: `floors.${floorIndex}.startingRoomId`,
        message: `Starting room '${floor.startingRoomId}' does not exist on floor '${floor.name || floor.id}'.`
      });
    }

    floor.rooms.forEach((room, roomIndex) => {
      requireText(room.id, `floors.${floorIndex}.rooms.${roomIndex}.id`, "Room id", issues);
      requireText(room.label, `floors.${floorIndex}.rooms.${roomIndex}.label`, "Room label", issues);

      room.connections.forEach((connectionId) => {
        if (!roomIds.includes(connectionId)) {
          issues.push({
            severity: "warning",
            field: `floors.${floorIndex}.rooms.${roomIndex}.connections`,
            message: `Room '${room.id}' connects to missing room '${connectionId}'.`
          });
        }
      });
    });
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
