import type { KeyValueRecord } from "./common";
import type { SupportedWeaponType } from "./gear";

export type ClassUnlockConditionType = "always_unlocked" | "class_rank" | "milestone" | "special";

export const classUnlockConditionTypes: ClassUnlockConditionType[] = [
  "always_unlocked",
  "class_rank",
  "milestone",
  "special"
];

export interface ClassUnlockConditionDocument {
  type: ClassUnlockConditionType;
  requiredClassId?: string;
  requiredRank?: number;
  description?: string;
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
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
