import type { CardDocument } from "../types/card";
import { createCardEffectFlowFromLegacyEffects, cardEffectBlocksFromEffects } from "../utils/cardComposer";
import { isoNow } from "../utils/date";

export function createBlankCard(): CardDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_card",
    name: "Untitled Card",
    description: "",
    cardType: "equipment",
    rarity: "common",
    category: "utility",
    strainCost: 1,
    targetType: "self",
    range: 0,
    damage: undefined,
    effectFlow: createCardEffectFlowFromLegacyEffects([], "self"),
    effectComposerMode: "blocks",
    effectBlocks: [],
    effects: [],
    sourceClassId: undefined,
    sourceEquipmentId: undefined,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleCard(): CardDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "card_anchor_pulse",
    name: "Anchor Pulse",
    description: "Gain +2 DEF and push a nearby enemy 1 tile.",
    cardType: "equipment",
    rarity: "uncommon",
    category: "defense",
    strainCost: 1,
    targetType: "self",
    range: 1,
    damage: undefined,
    effectFlow: createCardEffectFlowFromLegacyEffects(
      [
        {
          type: "def_up",
          amount: 2,
          duration: 1
        },
        {
          type: "push",
          amount: 1
        }
      ],
      "self"
    ),
    effectComposerMode: "blocks",
    effectBlocks: cardEffectBlocksFromEffects([
      {
        type: "def_up",
        amount: 2,
        duration: 1
      },
      {
        type: "push",
        amount: 1
      }
    ]),
    effects: [
      {
        type: "def_up",
        amount: 2,
        duration: 1
      },
      {
        type: "push",
        amount: 1
      }
    ],
    sourceClassId: undefined,
    sourceEquipmentId: "gear_bastion_blade",
    metadata: {
      note: "Pairs well with guard-heavy sword builds."
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
