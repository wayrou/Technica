import type { CardDocument } from "../types/card";
import type { ClassDocument } from "../types/class";
import type { ImageAsset, ValidationIssue } from "../types/common";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import type { UnitDocument } from "../types/unit";

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

  requireText(document.id, "id", "Item id", issues);
  requireText(document.name, "name", "Item name", issues);
  requirePositive(document.quantity, "quantity", "Quantity", issues, false);
  requirePositive(document.massKg, "massKg", "Mass", issues);
  requirePositive(document.bulkBu, "bulkBu", "Bulk", issues);
  requirePositive(document.powerW, "powerW", "Power draw", issues);
  validateImageAsset(document.iconAsset, "iconAsset", "Item icon", issues);

  return issues;
}

export function validateCardDocument(document: CardDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

  if (document.effects.some((effect) => !effect.type.trim())) {
    issues.push({
      severity: "error",
      field: "effects",
      message: "Every effect entry needs a type."
    });
  }

  validateImageAsset(document.artAsset, "artAsset", "Card art", issues);

  return issues;
}

export function validateUnitDocument(document: UnitDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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

  if (document.deployInParty && !document.startingInRoster) {
    issues.push({
      severity: "warning",
      field: "deployInParty",
      message: "A unit cannot deploy into the party unless it also starts in the roster."
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
