import type { FieldModDocument } from "../types/fieldmod";
import { isoNow } from "../utils/date";
import { createActionNode, createBlankEffectFlow } from "../utils/effectFlow";

export function createBlankFieldMod(): FieldModDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mod_new",
    name: "Untitled Field Mod",
    effects: "",
    trigger: "hit",
    chance: 0.15,
    stackMode: "linear",
    maxStacks: 3,
    effectFlow: createBlankEffectFlow(),
    scope: "unit",
    cost: 10,
    rarity: "common",
    unlockAfterOperationFloor: 0,
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleFieldMod(): FieldModDocument {
  const timestamp = isoNow();
  const damageNode = createActionNode("deal_damage", {
    id: "fieldmod_damage_1",
    selector: "random_enemy",
    amount: 1,
    label: "Ping Random Enemy",
  });

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mod_contact_overload",
    name: "Contact Overload",
    effects: "On hit: 15% chance to deal +1 damage to a random enemy.",
    trigger: "hit",
    chance: 0.15,
    stackMode: "linear",
    maxStacks: 5,
    effectFlow: {
      version: 1,
      entryNodeId: damageNode.id,
      nodes: [damageNode],
      edges: [],
    },
    scope: "unit",
    cost: 10,
    rarity: "common",
    unlockAfterOperationFloor: 4,
    requiredQuestIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
