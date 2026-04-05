import type { ClassDocument, ClassTrainingGridNodeDocument } from "../types/class";

function createGridId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createTrainingGridNode(
  partial?: Partial<ClassTrainingGridNodeDocument>
): ClassTrainingGridNodeDocument {
  return {
    id: partial?.id?.trim() || createGridId("grid"),
    name: partial?.name ?? "New Node",
    description: partial?.description ?? "",
    cost: partial?.cost ?? 20,
    row: partial?.row ?? 1,
    col: partial?.col ?? 1,
    requires: partial?.requires ?? [],
    benefit: partial?.benefit,
  };
}

function humanizeWeaponType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createDefaultTrainingGrid(document: Pick<ClassDocument, "name" | "weaponTypes" | "innateAbility" | "tier">) {
  const className = document.name.trim() || "Class";
  const weaponLabel = document.weaponTypes.length > 0
    ? document.weaponTypes.map(humanizeWeaponType).join(" / ")
    : "Combat";
  const tierCost = Math.max(0, document.tier) * 10;
  const innateTitle = document.innateAbility.split(":")[0]?.trim() || `${className} Signature`;
  const innateBody = document.innateAbility.split(":").slice(1).join(":").trim() || "Deepen the class identity.";

  return [
    createTrainingGridNode({
      id: "fundamentals",
      name: `${className} Fundamentals`,
      description: `Drill the base motions and fundamentals that define the ${className.toLowerCase()} field role.`,
      cost: 20 + tierCost,
      row: 1,
      col: 1,
      benefit: "Solidifies core class handling",
    }),
    createTrainingGridNode({
      id: "armament",
      name: `${className} Armament`,
      description: `Refine ${weaponLabel.toLowerCase()} execution and turn those tools into reliable extensions of the role.`,
      cost: 32 + tierCost,
      row: 1,
      col: 2,
      requires: ["fundamentals"],
      benefit: "Improves weapon discipline",
    }),
    createTrainingGridNode({
      id: "tempo",
      name: `${className} Tempo`,
      description: `Shape the action rhythm, movement timing, and battlefield pacing this class is meant to own.`,
      cost: 42 + tierCost,
      row: 1,
      col: 3,
      requires: ["fundamentals"],
      benefit: "Improves combat tempo",
    }),
    createTrainingGridNode({
      id: "doctrine",
      name: `${className} Doctrine`,
      description: `Turn individual drills into a recognizable doctrine squadmates can immediately play around.`,
      cost: 58 + tierCost,
      row: 2,
      col: 1,
      requires: ["armament", "tempo"],
      benefit: "Raises class mastery",
    }),
    createTrainingGridNode({
      id: "signature",
      name: innateTitle,
      description: innateBody,
      cost: 68 + tierCost,
      row: 2,
      col: 2,
      requires: ["armament", "tempo"],
      benefit: "Deepens signature identity",
    }),
    createTrainingGridNode({
      id: "promotion",
      name: `${className} Promotion Lattice`,
      description: `Lock in advanced ${className.toLowerCase()} training and set up the next branching promotions cleanly.`,
      cost: 88 + tierCost,
      row: 2,
      col: 3,
      requires: ["doctrine", "signature"],
      benefit: "Pushes promotion readiness",
    }),
  ];
}

export function normalizeTrainingGrid(
  value: unknown,
  fallback: ClassTrainingGridNodeDocument[]
): ClassTrainingGridNodeDocument[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.map((entry, index) => {
    const record = entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {};

    return createTrainingGridNode({
      id: normalizeText(record.id, `grid_${index + 1}`),
      name: normalizeText(record.name, `Node ${index + 1}`),
      description: normalizeText(record.description, ""),
      cost: normalizeNumber(record.cost, 20),
      row: normalizeNumber(record.row, 1),
      col: normalizeNumber(record.col, index + 1),
      requires: Array.isArray(record.requires)
        ? record.requires.filter((requirement): requirement is string => typeof requirement === "string" && requirement.trim().length > 0)
        : [],
      benefit: typeof record.benefit === "string" && record.benefit.trim() ? record.benefit : undefined,
    });
  });
}
