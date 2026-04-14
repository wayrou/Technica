import type { ValidationIssue } from "../types/common";
import type { GearDocument, GearInventoryProfile, GearSlotType, GearStats, SupportedWeaponType } from "../types/gear";

type GearStatKey = keyof GearStats;
type BalanceSeverity = ValidationIssue["severity"];

export type GearBalanceStatus = "pass" | "caution" | "fail";
export type GearBalanceScoreGrade = "A" | "B" | "C" | "D" | "F";

export interface GearFootprintSuggestion {
  inventory: Pick<GearInventoryProfile, "massKg" | "bulkBu" | "powerW">;
  summary: string;
  reasons: string[];
}

export interface GearBalanceFinding {
  severity: BalanceSeverity;
  code: string;
  field: string;
  message: string;
}

export interface GearBalanceReport {
  slot: GearSlotType;
  status: GearBalanceStatus;
  summary: string;
  metrics: {
    score: number;
    scoreGrade: GearBalanceScoreGrade;
    targetScoreMin: number;
    targetScoreMax: number;
    effectiveCardCount: number;
    targetCardCountMin: number;
    targetCardCountMax: number;
  };
  findings: GearBalanceFinding[];
}

interface ReferenceBand {
  score: {
    min: number;
    max: number;
  };
  cards: {
    min: number;
    max: number;
  };
  stats: Record<GearStatKey, { min: number; max: number }>;
}

const STAT_KEYS: GearStatKey[] = ["atk", "def", "agi", "acc", "hp"];

const STAT_WEIGHTS: Record<GearStatKey, number> = {
  atk: 1.35,
  def: 1.15,
  agi: 1.05,
  acc: 1,
  hp: 0.9,
};

const CARD_SCORE_WEIGHT = 0.85;

const SCORE_BAND_PADDING: Record<GearSlotType, number> = {
  weapon: 0.9,
  helmet: 0.75,
  chestpiece: 0.75,
  accessory: 0.7,
};

const CARD_BAND_PADDING = 1;

const STAT_BAND_PADDING: Record<GearStatKey, number> = {
  atk: 2,
  def: 2,
  agi: 2,
  acc: 2,
  hp: 2,
};

// These bands mirror Chaos Core's current authored starter catalog so Technica
// can warn against obvious outliers before export.
const REFERENCE_BANDS: Record<GearSlotType, ReferenceBand> = {
  weapon: {
    score: { min: 5.2, max: 10.7 },
    cards: { min: 3, max: 3 },
    stats: {
      atk: { min: 1, max: 7 },
      def: { min: -2, max: 2 },
      agi: { min: -3, max: 3 },
      acc: { min: -1, max: 3 },
      hp: { min: -2, max: 1 },
    },
  },
  helmet: {
    score: { min: 4.6, max: 6 },
    cards: { min: 3, max: 3 },
    stats: {
      atk: { min: 0, max: 2 },
      def: { min: 0, max: 2 },
      agi: { min: -1, max: 2 },
      acc: { min: -1, max: 3 },
      hp: { min: 0, max: 1 },
    },
  },
  chestpiece: {
    score: { min: 4.6, max: 6.7 },
    cards: { min: 3, max: 3 },
    stats: {
      atk: { min: 0, max: 2 },
      def: { min: 0, max: 3 },
      agi: { min: -1, max: 2 },
      acc: { min: -1, max: 2 },
      hp: { min: 0, max: 2 },
    },
  },
  accessory: {
    score: { min: 3.7, max: 5.9 },
    cards: { min: 3, max: 3 },
    stats: {
      atk: { min: 0, max: 2 },
      def: { min: 0, max: 1 },
      agi: { min: -1, max: 2 },
      acc: { min: 0, max: 2 },
      hp: { min: 0, max: 2 },
    },
  },
};

const SLOT_FOOTPRINT_BASELINES: Record<GearSlotType, Pick<GearInventoryProfile, "massKg" | "bulkBu" | "powerW">> = {
  weapon: { massKg: 3, bulkBu: 2, powerW: 0 },
  helmet: { massKg: 1, bulkBu: 1, powerW: 0 },
  chestpiece: { massKg: 4, bulkBu: 3, powerW: 0 },
  accessory: { massKg: 1, bulkBu: 1, powerW: 0 },
};

const WEAPON_TYPE_FOOTPRINT_ADJUSTMENTS: Record<SupportedWeaponType, Pick<GearInventoryProfile, "massKg" | "bulkBu" | "powerW">> = {
  sword: { massKg: 0, bulkBu: 0, powerW: 0 },
  greatsword: { massKg: 2, bulkBu: 2, powerW: 0 },
  shortsword: { massKg: -1, bulkBu: -1, powerW: 0 },
  shield: { massKg: 2, bulkBu: 3, powerW: 0 },
  bow: { massKg: 0, bulkBu: 1, powerW: 0 },
  greatbow: { massKg: 1, bulkBu: 2, powerW: 0 },
  gun: { massKg: 1, bulkBu: 1, powerW: 0 },
  staff: { massKg: 0, bulkBu: 1, powerW: 0 },
  greatstaff: { massKg: 1, bulkBu: 2, powerW: 0 },
  dagger: { massKg: -1, bulkBu: -1, powerW: 0 },
  knife: { massKg: -2, bulkBu: -1, powerW: 0 },
  fist: { massKg: -2, bulkBu: -1, powerW: 0 },
  rod: { massKg: -1, bulkBu: 0, powerW: 0 },
  katana: { massKg: 0, bulkBu: 0, powerW: 0 },
  shuriken: { massKg: -2, bulkBu: -1, powerW: 0 },
  spear: { massKg: 1, bulkBu: 1, powerW: 0 },
  instrument: { massKg: 0, bulkBu: 1, powerW: 0 },
};

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPositiveInteger(value: number): number {
  return Math.max(0, Math.round(value));
}

function roundPowerBand(value: number): number {
  if (value <= 0) {
    return 0;
  }

  return Math.max(5, Math.ceil(value / 5) * 5);
}

export function getEffectiveCardCount(document: GearDocument): number {
  return document.cardsGranted.length + Math.max(0, document.moduleSlots);
}

function formatSlotLabel(slot: GearSlotType): string {
  switch (slot) {
    case "weapon":
      return "weapon";
    case "helmet":
      return "helmet";
    case "chestpiece":
      return "chestpiece";
    case "accessory":
      return "accessory";
    default:
      return "gear";
  }
}

export function computeGearBalanceScore(document: GearDocument): number {
  const statScore = STAT_KEYS.reduce((total, statKey) => total + document.stats[statKey] * STAT_WEIGHTS[statKey], 0);
  return roundMetric(statScore + getEffectiveCardCount(document) * CARD_SCORE_WEIGHT);
}

export function suggestGearInventoryFootprint(document: GearDocument): GearFootprintSuggestion {
  const base = SLOT_FOOTPRINT_BASELINES[document.slot];
  const reference = REFERENCE_BANDS[document.slot];
  const effectiveCardCount = getEffectiveCardCount(document);
  const score = computeGearBalanceScore(document);
  const scoreMidpoint = (reference.score.min + reference.score.max) / 2;
  const positiveAtk = Math.max(0, document.stats.atk);
  const positiveDef = Math.max(0, document.stats.def);
  const positiveAgi = Math.max(0, document.stats.agi);
  const positiveAcc = Math.max(0, document.stats.acc);
  const positiveHp = Math.max(0, document.stats.hp);
  const defensiveDensity = positiveDef + positiveHp;
  const offensivePressure = positiveAtk + positiveAcc;
  const reasons: string[] = [`Starts from the standard ${document.slot} baseline.`];

  let massKg = base.massKg;
  let bulkBu = base.bulkBu;
  let powerW = base.powerW;

  if (document.slot === "weapon" && document.weaponType) {
    const adjustment = WEAPON_TYPE_FOOTPRINT_ADJUSTMENTS[document.weaponType];
    massKg += adjustment.massKg;
    bulkBu += adjustment.bulkBu;
    powerW += adjustment.powerW;
    if (adjustment.massKg !== 0 || adjustment.bulkBu !== 0 || adjustment.powerW !== 0) {
      reasons.push(`${document.weaponType} profile shifts the carry profile.`);
    }
  }

  if (defensiveDensity >= 3) {
    massKg += 1;
    bulkBu += 1;
    reasons.push("Higher DEF/HP package adds heavier defensive kit.");
  }

  if (defensiveDensity >= 6) {
    massKg += 1;
    bulkBu += 1;
    reasons.push("Very tanky stat profile pushes both mass and bulk upward again.");
  }

  if (offensivePressure >= 6) {
    massKg += 1;
    reasons.push("Stronger offensive package nudges the item toward denser construction.");
  }

  if (effectiveCardCount >= 4) {
    bulkBu += effectiveCardCount - 3;
    reasons.push("Larger card package increases bulk.");
  }

  if (document.moduleSlots >= 2) {
    massKg += 1;
    reasons.push("Extra module capacity adds support hardware weight.");
  }

  if (score > scoreMidpoint + 1) {
    bulkBu += 1;
    reasons.push("Above-midpoint power score gets a little more field awkwardness.");
  }

  if (score > reference.score.max + 1) {
    massKg += 1;
    bulkBu += 1;
    reasons.push("High-end slot power gets an extra logistics tax.");
  }

  if (positiveAgi >= 2) {
    massKg -= 1;
    bulkBu -= 1;
    reasons.push("AGI-forward profile trims some weight and bulk.");
  }

  if (positiveAgi >= 4) {
    massKg -= 1;
    reasons.push("Very agile tuning trims mass again.");
  }

  if (document.isMechanical) {
    powerW += document.slot === "weapon" ? 5 : 3;
    reasons.push("Mechanical gear gets an active power draw.");

    if (effectiveCardCount >= 4) {
      powerW += 5;
      reasons.push("Complex mechanical package needs more steady wattage.");
    }

    if (document.moduleSlots > 0) {
      powerW += 5 * document.moduleSlots;
      reasons.push("Module slots raise sustained power needs.");
    }

    if (score > scoreMidpoint) {
      powerW += 5;
      reasons.push("Above-midpoint mechanical performance raises power draw.");
    }
  }

  const inventory = {
    massKg: roundPositiveInteger(massKg),
    bulkBu: roundPositiveInteger(bulkBu),
    powerW: roundPowerBand(powerW),
  };

  return {
    inventory,
    summary: `Suggested footprint: ${inventory.massKg} kg / ${inventory.bulkBu} bu / ${inventory.powerW} w based on slot baseline, combat profile, card package, and mechanical load.`,
    reasons,
  };
}

export function computeGearBalanceScoreGrade(
  score: number,
  targetScoreMin: number,
  targetScoreMax: number,
): GearBalanceScoreGrade {
  if (score >= targetScoreMin && score <= targetScoreMax) {
    return "A";
  }

  const bandWidth = Math.max(0.1, targetScoreMax - targetScoreMin);
  const distanceFromBand =
    score < targetScoreMin ? targetScoreMin - score : score - targetScoreMax;
  const normalizedDistance = distanceFromBand / bandWidth;

  if (normalizedDistance <= 0.15) {
    return "B";
  }
  if (normalizedDistance <= 0.35) {
    return "C";
  }
  if (normalizedDistance <= 0.6) {
    return "D";
  }
  return "F";
}

export function validateGearBalance(document: GearDocument): GearBalanceReport {
  const reference = REFERENCE_BANDS[document.slot];
  const slotLabel = formatSlotLabel(document.slot);
  const findings: GearBalanceFinding[] = [];
  const effectiveCardCount = getEffectiveCardCount(document);
  const targetCardCountMin = Math.max(0, reference.cards.min - CARD_BAND_PADDING);
  const targetCardCountMax = reference.cards.max + CARD_BAND_PADDING;
  const score = computeGearBalanceScore(document);
  const targetScoreMin = roundMetric(reference.score.min - SCORE_BAND_PADDING[document.slot]);
  const targetScoreMax = roundMetric(reference.score.max + SCORE_BAND_PADDING[document.slot]);
  const scoreGrade = computeGearBalanceScoreGrade(score, targetScoreMin, targetScoreMax);

  if (document.slot === "weapon" && !document.weaponType) {
    findings.push({
      severity: "error",
      code: "missing_weapon_type",
      field: "weaponType",
      message: "Weapon entries should declare a weapon type before they are considered balance-safe.",
    });
  }

  if (effectiveCardCount < targetCardCountMin) {
    findings.push({
      severity: targetCardCountMin - effectiveCardCount >= 2 ? "error" : "warning",
      code: "card_package_low",
      field: "cardsGranted",
      message: `Card package ${effectiveCardCount} is below the current ${slotLabel} band (${targetCardCountMin}-${targetCardCountMax}).`,
    });
  } else if (effectiveCardCount > targetCardCountMax) {
    findings.push({
      severity: effectiveCardCount - targetCardCountMax >= 2 ? "error" : "warning",
      code: "card_package_high",
      field: "cardsGranted",
      message: `Card package ${effectiveCardCount} is above the current ${slotLabel} band (${targetCardCountMin}-${targetCardCountMax}).`,
    });
  }

  for (const statKey of STAT_KEYS) {
    const value = document.stats[statKey];
    const targetMin = reference.stats[statKey].min - STAT_BAND_PADDING[statKey];
    const targetMax = reference.stats[statKey].max + STAT_BAND_PADDING[statKey];

    if (value < targetMin) {
      findings.push({
        severity: targetMin - value >= 3 ? "error" : "warning",
        code: `${statKey}_low`,
        field: `stats.${statKey}`,
        message: `${statKey.toUpperCase()} ${value} is below the current ${slotLabel} range (${targetMin} to ${targetMax}).`,
      });
    } else if (value > targetMax) {
      findings.push({
        severity: value - targetMax >= 3 ? "error" : "warning",
        code: `${statKey}_high`,
        field: `stats.${statKey}`,
        message: `${statKey.toUpperCase()} ${value} is above the current ${slotLabel} range (${targetMin} to ${targetMax}).`,
      });
    }
  }

  if (score < targetScoreMin) {
    findings.push({
      severity: targetScoreMin - score >= 2 ? "error" : "warning",
      code: "score_low",
      field: "balance.score",
      message: `Power score ${score} is below the current ${slotLabel} target band (${targetScoreMin}-${targetScoreMax}).`,
    });
  } else if (score > targetScoreMax) {
    findings.push({
      severity: score - targetScoreMax >= 2 ? "error" : "warning",
      code: "score_high",
      field: "balance.score",
      message: `Power score ${score} is above the current ${slotLabel} target band (${targetScoreMin}-${targetScoreMax}).`,
    });
  }

  const status: GearBalanceStatus = findings.some((finding) => finding.severity === "error")
    ? "fail"
    : findings.length > 0
      ? "caution"
      : "pass";

  const summary = status === "pass"
    ? `Within the current Chaos Core starter ${slotLabel} band.`
    : status === "caution"
      ? `Close, but this ${slotLabel} is drifting outside the current starter balance band.`
      : `This ${slotLabel} sits well outside the current starter balance band.`;

  return {
    slot: document.slot,
    status,
    summary,
    metrics: {
      score,
      scoreGrade,
      targetScoreMin,
      targetScoreMax,
      effectiveCardCount,
      targetCardCountMin,
      targetCardCountMax,
    },
    findings,
  };
}

export function toGearBalanceIssues(report: GearBalanceReport): ValidationIssue[] {
  return report.findings.map((finding) => ({
    severity: finding.severity,
    field: finding.field,
    message: `Balance check: ${finding.message}`,
  }));
}
