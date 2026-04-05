import type {
  CardDocument,
  CardDocumentTargetType,
  CardEffectBlockAction,
  CardEffectBlockDocument,
  CardEffectComposerMode,
  CardEffectDocument,
} from "../types/card";
import type { EffectActionNode, EffectFlowDocument, EffectSelectorKind } from "../types/effectFlow";
import {
  createActionNode,
  createBlankEffectFlow,
  createEffectFlowScript,
  humanizeToken,
  normalizeEffectFlowDocument,
} from "./effectFlow";

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCardEffectComposerMode(value: unknown): CardEffectComposerMode {
  return value === "manual" ? "manual" : "blocks";
}

function readCardEffectBlockAction(value: unknown): CardEffectBlockAction {
  switch (value) {
    case "heal":
    case "def_up":
    case "atk_up":
    case "agi_up":
    case "acc_up":
    case "def_down":
    case "atk_down":
    case "agi_down":
    case "acc_down":
    case "push":
    case "move":
    case "stun":
    case "burn":
    case "set_flag":
    case "end_turn":
      return value;
    default:
      return "damage";
  }
}

function createComposerId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createCardEffectBlock(partial?: Partial<CardEffectBlockDocument>): CardEffectBlockDocument {
  return {
    id: partial?.id?.trim() || createComposerId("effect"),
    action: partial?.action ?? "damage",
    amount: partial?.amount,
    duration: partial?.duration,
    stat: partial?.stat,
    tiles: partial?.tiles,
    note: partial?.note,
    condition: partial?.condition,
  };
}

function normalizeRuntimeEffect(value: unknown): CardEffectDocument | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const type = readString(record.type).trim();
  if (!type) {
    return null;
  }

  return {
    type,
    amount: readNumber(record.amount),
    duration: readNumber(record.duration),
    stat: readOptionalString(record.stat),
    tiles: readNumber(record.tiles),
  };
}

function normalizeEffectBlock(value: unknown, index: number): CardEffectBlockDocument | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  return createCardEffectBlock({
    id: readString(record.id, `effect_${index + 1}`),
    action: readCardEffectBlockAction(record.action ?? record.type),
    amount: readNumber(record.amount),
    duration: readNumber(record.duration),
    stat: readOptionalString(record.stat),
    tiles: readNumber(record.tiles),
    note: readOptionalString(record.note),
    condition: readOptionalString(record.condition),
  });
}

function selectorForCardTarget(targetType: CardDocumentTargetType): EffectSelectorKind {
  switch (targetType) {
    case "enemy":
    case "ally":
      return "chosen_target";
    case "tile":
      return "chosen_tile";
    default:
      return "self";
  }
}

function statusFromLegacyType(type: string) {
  switch (type) {
    case "stun":
      return "stunned";
    case "burn":
      return "burning";
    default:
      return undefined;
  }
}

function legacyActionToNode(effect: CardEffectDocument, targetType: CardDocumentTargetType, index: number): EffectActionNode {
  const selector = selectorForCardTarget(targetType);
  switch (effect.type) {
    case "damage":
      return createActionNode("deal_damage", { id: `legacy_action_${index + 1}`, amount: effect.amount ?? 0, selector });
    case "heal":
      return createActionNode("heal", { id: `legacy_action_${index + 1}`, amount: effect.amount ?? 0, selector });
    case "def_up":
    case "atk_up":
    case "agi_up":
    case "acc_up":
      return createActionNode("modify_stat", {
        id: `legacy_action_${index + 1}`,
        amount: effect.amount ?? 0,
        duration: effect.duration,
        stat: (effect.type.replace("_up", "") as EffectActionNode["stat"]) ?? "def",
        modifierMode: "buff",
        selector,
      });
    case "def_down":
    case "atk_down":
    case "agi_down":
    case "acc_down":
      return createActionNode("modify_stat", {
        id: `legacy_action_${index + 1}`,
        amount: effect.amount ?? 0,
        duration: effect.duration,
        stat: (effect.type.replace("_down", "") as EffectActionNode["stat"]) ?? "def",
        modifierMode: "debuff",
        selector,
      });
    case "push":
      return createActionNode("knockback", {
        id: `legacy_action_${index + 1}`,
        tiles: effect.tiles ?? effect.amount,
        selector,
      });
    case "move":
      return createActionNode("move_target", {
        id: `legacy_action_${index + 1}`,
        tiles: effect.tiles ?? effect.amount,
        selector,
      });
    case "stun":
    case "burn":
      return createActionNode("apply_status", {
        id: `legacy_action_${index + 1}`,
        duration: effect.duration ?? 1,
        status: statusFromLegacyType(effect.type),
        selector,
      });
    case "set_flag":
      return createActionNode("set_flag", {
        id: `legacy_action_${index + 1}`,
        flagKey: effect.stat ?? "scenario_flag",
        flagValue: String(effect.amount ?? 1),
      });
    case "end_turn":
      return createActionNode("end_turn", {
        id: `legacy_action_${index + 1}`,
        selector,
      });
    default:
      return createActionNode("deal_damage", { id: `legacy_action_${index + 1}`, amount: effect.amount ?? 0, selector });
  }
}

export function createCardEffectFlowFromLegacyEffects(
  effects: CardEffectDocument[],
  targetType: CardDocumentTargetType
): EffectFlowDocument {
  if (effects.length === 0) {
    return createBlankEffectFlow();
  }

  const nodes = effects.map((effect, index) => legacyActionToNode(effect, targetType, index));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `legacy_edge_${index + 1}`,
    fromNodeId: node.id,
    toNodeId: nodes[index + 1].id,
    kind: "next" as const,
  }));

  return {
    version: 1,
    entryNodeId: nodes[0]?.id ?? null,
    nodes,
    edges,
  };
}

export function compileCardEffectBlocks(blocks: CardEffectBlockDocument[]): CardEffectDocument[] {
  return blocks.map((block) => ({
    type: block.action,
    amount: block.amount,
    duration: block.duration,
    stat: block.stat,
    tiles: block.tiles,
  }));
}

export function cardEffectBlocksFromEffects(effects: CardEffectDocument[]): CardEffectBlockDocument[] {
  return effects.map((effect, index) =>
    createCardEffectBlock({
      id: `effect_${index + 1}`,
      action: readCardEffectBlockAction(effect.type),
      amount: effect.amount,
      duration: effect.duration,
      stat: effect.stat,
      tiles: effect.tiles,
    })
  );
}

function legacyEffectsFromActionNode(node: EffectActionNode): CardEffectDocument[] {
  switch (node.action) {
    case "deal_damage":
      return [{ type: "damage", amount: node.amount }];
    case "heal":
      return [{ type: "heal", amount: node.amount }];
    case "grant_shield":
      return [{ type: "def_up", amount: node.amount, duration: node.duration }];
    case "draw_cards":
      return [{ type: "draw", amount: node.amount }];
    case "modify_stat":
      return node.stat
        ? [
            {
              type: `${node.stat}_${node.modifierMode === "debuff" ? "down" : "up"}`,
              amount: node.amount,
              duration: node.duration,
              stat: node.stat,
            },
          ]
        : [];
    case "apply_status":
      if (node.status === "stunned") {
        return [{ type: "stun", duration: node.duration }];
      }
      if (node.status === "burning") {
        return [{ type: "burn", duration: node.duration, amount: node.amount }];
      }
      return [{ type: humanizeToken(node.status ?? "status").toLowerCase(), duration: node.duration, amount: node.amount }];
    case "move_target":
      return [{ type: "move", tiles: node.tiles ?? node.amount }];
    case "knockback":
      return [{ type: "push", tiles: node.tiles ?? node.amount }];
    case "end_turn":
      return [{ type: "end_turn" }];
    case "set_flag":
      return [{ type: "set_flag", stat: node.flagKey, amount: node.flagValue ? Number(node.flagValue) || 1 : 1 }];
    default:
      return [];
  }
}

export function createLegacyCardEffectsFromFlow(flow: EffectFlowDocument): CardEffectDocument[] {
  return flow.nodes.flatMap((node) => (node.family === "action" ? legacyEffectsFromActionNode(node) : []));
}

export function normalizeCardDocument(value: unknown, fallback: CardDocument): CardDocument {
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const rawEffects = Array.isArray(record.effects)
    ? record.effects.map((effect) => normalizeRuntimeEffect(effect)).filter((effect): effect is CardEffectDocument => effect !== null)
    : [];
  const rawBlocks = Array.isArray(record.effectBlocks)
    ? record.effectBlocks
        .map((effect, index) => normalizeEffectBlock(effect, index))
        .filter((effect): effect is CardEffectBlockDocument => effect !== null)
    : [];
  const effectComposerMode = readCardEffectComposerMode(record.effectComposerMode);
  const effectBlocks = rawBlocks.length > 0 ? rawBlocks : cardEffectBlocksFromEffects(rawEffects);
  const legacyEffects = effectComposerMode === "manual" ? rawEffects : rawBlocks.length > 0 ? compileCardEffectBlocks(effectBlocks) : rawEffects;
  const effectFlow = (() => {
    const normalizedFlow = normalizeEffectFlowDocument(record.effectFlow);
    return normalizedFlow.nodes.length > 0 ? normalizedFlow : createCardEffectFlowFromLegacyEffects(legacyEffects, (record.targetType as CardDocumentTargetType) ?? fallback.targetType);
  })();
  const effects = legacyEffects.length > 0 ? legacyEffects : createLegacyCardEffectsFromFlow(effectFlow);
  const metadata = toRecord(record.metadata);

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    cardType: (record.cardType as CardDocument["cardType"]) ?? fallback.cardType,
    rarity: (record.rarity as CardDocument["rarity"]) ?? fallback.rarity,
    category: (record.category as CardDocument["category"]) ?? fallback.category,
    strainCost: readNumber(record.strainCost) ?? fallback.strainCost,
    targetType: (record.targetType as CardDocument["targetType"]) ?? fallback.targetType,
    range: readNumber(record.range) ?? fallback.range,
    damage: readNumber(record.damage),
    effectFlow,
    effectComposerMode,
    effectBlocks,
    effects,
    sourceClassId: readOptionalString(record.sourceClassId),
    sourceEquipmentId: readOptionalString(record.sourceEquipmentId),
    artAsset: record.artAsset as CardDocument["artAsset"],
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadata).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt),
  };
}

export function describeCardEffectBlock(block: CardEffectBlockDocument) {
  const amount = block.amount !== undefined ? ` ${block.amount}` : "";
  const stat = block.stat ? ` ${block.stat.toUpperCase()}` : "";
  const tiles = block.tiles !== undefined ? ` ${block.tiles} tile${block.tiles === 1 ? "" : "s"}` : "";
  const duration = block.duration !== undefined ? ` ${block.duration}t` : "";
  const condition = block.condition?.trim() ? ` if ${block.condition.trim()}` : "";
  const note = block.note?.trim() ? ` // ${block.note.trim()}` : "";

  return `${humanizeToken(block.action)}${amount}${stat}${tiles}${duration}${condition}${note}`.trim();
}

export function createCardEffectScript(effectFlow: EffectFlowDocument) {
  return createEffectFlowScript(effectFlow);
}
