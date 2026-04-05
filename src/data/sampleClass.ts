import type { ClassDocument } from "../types/class";
import { createDefaultTrainingGrid } from "../utils/classTrainingGrid";
import { isoNow } from "../utils/date";

export function createBlankClass(): ClassDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_class",
    name: "Untitled Class",
    description: "",
    tier: 1,
    baseStats: {
      maxHp: 10,
      atk: 8,
      def: 5,
      agi: 5,
      acc: 7
    },
    weaponTypes: ["sword"],
    unlockConditions: [
      {
        type: "always_unlocked"
      }
    ],
    innateAbility: "",
    trainingGrid: createDefaultTrainingGrid({
      name: "Untitled Class",
      weaponTypes: ["sword"],
      innateAbility: "",
      tier: 1
    }),
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleClass(): ClassDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "relay_marshal",
    name: "Relay Marshal",
    description: "A tactical signal officer who redirects squad momentum through coordinated bursts.",
    tier: 2,
    baseStats: {
      maxHp: 102,
      atk: 8,
      def: 6,
      agi: 8,
      acc: 9
    },
    weaponTypes: ["gun", "shortsword"],
    unlockConditions: [
      {
        type: "class_rank",
        requiredClassId: "ranger",
        requiredRank: 3
      },
      {
        type: "milestone",
        description: "Secure 3 comms arrays during operations"
      }
    ],
    innateAbility: "Relay Burst: Adjacent allies gain +1 movement after this unit acts.",
    trainingGrid: createDefaultTrainingGrid({
      name: "Relay Marshal",
      weaponTypes: ["gun", "shortsword"],
      innateAbility: "Relay Burst: Adjacent allies gain +1 movement after this unit acts.",
      tier: 2
    }),
    metadata: {
      branch: "signal"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
