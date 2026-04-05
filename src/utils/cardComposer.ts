import type {
  CardDocument,
  CardEffectBlockAction,
  CardEffectBlockDocument,
  CardEffectComposerMode,
  CardEffectDocument,
} from "../types/card";

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
  if (
    value === "damage" ||
    value === "heal" ||
    value === "def_up" ||
    value === "atk_up" ||
    value === "agi_up" ||
    value === "acc_up" ||
    value === "push" ||
    value === "move" ||
    value === "stun" ||
    value === "burn" ||
    value === "set_flag" ||
    value === "end_turn"
  ) {
    return value;
  }

  return "damage";
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

  const action = readCardEffectBlockAction(record.action ?? record.type);
  return createCardEffectBlock({
    id: readString(record.id, `effect_${index + 1}`),
    action,
    amount: readNumber(record.amount),
    duration: readNumber(record.duration),
    stat: readOptionalString(record.stat),
    tiles: readNumber(record.tiles),
    note: readOptionalString(record.note),
    condition: readOptionalString(record.condition),
  });
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
  const effects = effectComposerMode === "manual" ? rawEffects : compileCardEffectBlocks(effectBlocks);
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

function humanizeAction(action: CardEffectBlockAction) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function describeCardEffectBlock(block: CardEffectBlockDocument) {
  const amount = block.amount !== undefined ? ` ${block.amount}` : "";
  const stat = block.stat ? ` ${block.stat.toUpperCase()}` : "";
  const tiles = block.tiles !== undefined ? ` ${block.tiles} tile${block.tiles === 1 ? "" : "s"}` : "";
  const duration = block.duration !== undefined ? ` ${block.duration}t` : "";
  const condition = block.condition?.trim() ? ` if ${block.condition.trim()}` : "";
  const note = block.note?.trim() ? ` // ${block.note.trim()}` : "";

  return `${humanizeAction(block.action)}${amount}${stat}${tiles}${duration}${condition}${note}`.trim();
}

export function createCardEffectScript(blocks: CardEffectBlockDocument[]) {
  if (blocks.length === 0) {
    return ["PLAY -> NO EFFECT BLOCKS"];
  }

  return blocks.map((block, index) => `${index === 0 ? "PLAY" : "THEN"} -> ${describeCardEffectBlock(block)}`);
}
