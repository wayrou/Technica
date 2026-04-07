import type { KeyValueRecord } from "./common";
import type { SupportedWeaponType } from "./gear";

export type ClassUnlockConditionType =
  | "always_unlocked"
  | "class_rank"
  | "quest_completed"
  | "milestone"
  | "special";

export const classUnlockConditionTypes: ClassUnlockConditionType[] = [
  "always_unlocked",
  "class_rank",
  "quest_completed",
  "milestone",
  "special"
];

export interface ClassUnlockConditionDocument {
  type: ClassUnlockConditionType;
  requiredClassId?: string;
  requiredQuestId?: string;
  requiredRank?: number;
  description?: string;
}

export interface ClassTrainingGridNodeDocument {
  id: string;
  name: string;
  description: string;
  cost: number;
  row: number;
  col: number;
  requires?: string[];
  benefit?: string;
}

export interface ClassDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  tier: 0 | 1 | 2 | 3;
  baseStats: {
    maxHp: number;
    atk: number;
    def: number;
    agi: number;
    acc: number;
  };
  weaponTypes: SupportedWeaponType[];
  unlockConditions: ClassUnlockConditionDocument[];
  innateAbility: string;
  trainingGrid: ClassTrainingGridNodeDocument[];
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
