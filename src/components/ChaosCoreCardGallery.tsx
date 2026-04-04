import { useEffect, useRef, useState } from "react";
import type { ChaosCoreDatabaseEntry, LoadedChaosCoreDatabaseEntry } from "../utils/chaosCoreDatabase";
import { loadChaosCoreDatabaseEntry } from "../utils/chaosCoreDatabase";

type RuntimeCardEffect = {
  type?: unknown;
  amount?: unknown;
  duration?: unknown;
  stat?: unknown;
  tiles?: unknown;
};

type RuntimeCardRecord = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  rarity?: string;
  category?: string;
  strainCost?: number;
  targetType?: string;
  range?: number;
  damage?: number;
  effects?: RuntimeCardEffect[];
  sourceClassId?: string;
  sourceEquipmentId?: string;
  artPath?: string;
};

type CardGalleryPreview = {
  entryKey: string;
  title: string;
  contentId: string;
  runtimeFile: string;
  origin: "game" | "technica";
  categoryLabel: string;
  categoryBadge: string;
  artGlyph: string;
  rarityLabel: string;
  strainCostLabel: string;
  description: string;
  effectLines: string[];
  targetLabel: string;
  rangeLabel: string;
  sourceLabel: string;
  artSrc?: string;
};

interface ChaosCoreCardGalleryProps {
  repoPath: string;
  entries: ChaosCoreDatabaseEntry[];
  selectedEntryKey: string;
  onSelectEntryKey: (entryKey: string) => void;
}

const CARD_PREVIEW_BATCH_SIZE = 8;
const CARD_PREVIEW_INITIAL_BATCHES = 2;
let cachedConvertFileSrc: ((filePath: string) => string) | null = null;

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isAbsoluteFilesystemPath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function joinWindowsPath(...segments: string[]) {
  return segments
    .filter(Boolean)
    .map((segment, index) => {
      const normalized = segment.replace(/[\\/]+/g, "\\");
      if (index === 0) {
        return normalized.replace(/[\\]+$/g, "");
      }
      return normalized.replace(/^[\\]+/g, "").replace(/[\\]+$/g, "");
    })
    .filter(Boolean)
    .join("\\");
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function formatTurns(duration?: number) {
  if (!duration || duration <= 0) {
    return "";
  }

  return duration === 1 ? " for 1 turn" : ` for ${duration} turns`;
}

function formatCardEffect(effect: RuntimeCardEffect) {
  const effectType = toStringValue(effect.type)?.trim().toLowerCase();
  const amount = toNumber(effect.amount);
  const duration = toNumber(effect.duration);
  const tiles = toNumber(effect.tiles);
  const stat = toStringValue(effect.stat);

  if (!effectType) {
    return "Custom effect.";
  }

  switch (effectType) {
    case "damage":
    case "deal_damage":
      return amount ? `Deal ${amount} damage.` : "Deal damage.";
    case "heal":
      return amount ? `Restore ${amount} HP.` : "Restore HP.";
    case "def_up":
      return `Gain +${amount ?? 0} DEF${formatTurns(duration)}.`;
    case "atk_up":
      return `Gain +${amount ?? 0} ATK${formatTurns(duration)}.`;
    case "acc_up":
      return `Gain +${amount ?? 0} ACC${formatTurns(duration)}.`;
    case "agi_up":
      return `Gain +${amount ?? 0} AGI${formatTurns(duration)}.`;
    case "def_down":
      return `Inflict -${amount ?? 0} DEF${formatTurns(duration)}.`;
    case "atk_down":
      return `Inflict -${amount ?? 0} ATK${formatTurns(duration)}.`;
    case "acc_down":
      return `Inflict -${amount ?? 0} ACC${formatTurns(duration)}.`;
    case "push":
      return `Push ${tiles ?? amount ?? 1} tile${(tiles ?? amount ?? 1) === 1 ? "" : "s"}.`;
    case "move":
      return `Move ${tiles ?? amount ?? 1} tile${(tiles ?? amount ?? 1) === 1 ? "" : "s"}.`;
    case "stun":
      return `Stun${formatTurns(duration || 1)}.`;
    case "burn":
      return amount
        ? `Inflict Burn for ${amount} damage${formatTurns(duration)}.`
        : `Inflict Burn${formatTurns(duration)}.`;
    case "set_flag":
      return "Set a scenario flag.";
    case "end_turn":
      return "End the target's turn.";
    default: {
      const details = [
        amount !== undefined ? `${amount}` : "",
        stat ? humanizeToken(stat) : "",
        tiles !== undefined ? `${tiles} tile${tiles === 1 ? "" : "s"}` : "",
        duration !== undefined ? `${duration} turn${duration === 1 ? "" : "s"}` : ""
      ]
        .filter(Boolean)
        .join(" ");
      return details ? `${humanizeToken(effectType)} ${details}.` : `${humanizeToken(effectType)}.`;
    }
  }
}

function getCardGlyph(category: string | undefined) {
  switch ((category ?? "").toLowerCase()) {
    case "attack":
      return "ATK";
    case "defense":
      return "DEF";
    case "utility":
      return "UTL";
    case "mobility":
      return "MOV";
    case "buff":
      return "BUF";
    case "debuff":
      return "DEB";
    case "steam":
      return "STM";
    case "chaos":
      return "CHS";
    default:
      return "CRD";
  }
}

function buildCardCopy(description: string, effectLines: string[]) {
  const trimmedDescription = description.trim();
  const normalizedDescription = trimmedDescription.toLowerCase();
  const dedupedEffects = effectLines.filter((line) => line.trim().toLowerCase() !== normalizedDescription);

  if (trimmedDescription && dedupedEffects.length > 0) {
    return [trimmedDescription, ...dedupedEffects];
  }

  if (trimmedDescription) {
    return [trimmedDescription];
  }

  return dedupedEffects;
}

async function resolveCardArtSrc(repoPath: string, artPath: string | undefined) {
  const trimmed = artPath?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^(data:|https?:|blob:|asset:|file:)/i.test(trimmed)) {
    return trimmed;
  }

  const localPath = isAbsoluteFilesystemPath(trimmed)
    ? trimmed
    : joinWindowsPath(
        repoPath,
        trimmed.startsWith("public/") || trimmed.startsWith("public\\") ? "" : "public",
        trimmed.replace(/^\/+/, "")
      );

  if (!cachedConvertFileSrc) {
    const tauriCore = await import("@tauri-apps/api/core");
    cachedConvertFileSrc = tauriCore.convertFileSrc;
  }

  return cachedConvertFileSrc(localPath);
}

function normalizeRuntimeCardRecord(value: unknown): RuntimeCardRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  const strainCost = toNumber(record.strainCost);
  const type = toStringValue(record.type) ?? toStringValue(record.cardType);

  if (!id || !name || strainCost === undefined || !type) {
    return null;
  }

  return {
    id,
    name,
    description: toStringValue(record.description),
    type,
    rarity: toStringValue(record.rarity),
    category: toStringValue(record.category),
    strainCost,
    targetType: toStringValue(record.targetType),
    range: toNumber(record.range),
    damage: toNumber(record.damage),
    effects: Array.isArray(record.effects) ? (record.effects as RuntimeCardEffect[]) : [],
    sourceClassId: toStringValue(record.sourceClassId),
    sourceEquipmentId: toStringValue(record.sourceEquipmentId),
    artPath: toStringValue(record.artPath)
  };
}

function extractRuntimeCardRecord(entry: LoadedChaosCoreDatabaseEntry) {
  for (const candidate of [entry.runtimeContent, entry.editorContent, entry.sourceContent]) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = normalizeRuntimeCardRecord(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // Ignore non-JSON or non-card payloads here.
    }
  }

  return null;
}

function buildFallbackPreview(entry: ChaosCoreDatabaseEntry): CardGalleryPreview {
  return {
    entryKey: entry.entryKey,
    title: entry.title,
    contentId: entry.contentId,
    runtimeFile: entry.runtimeFile,
    origin: entry.origin,
    categoryLabel: "Card",
    categoryBadge: "CRD",
    artGlyph: "CRD",
    rarityLabel: entry.origin === "game" ? "Game" : "Technica",
    strainCostLabel: "?",
    description: "Load the runtime card record to preview the in-game face.",
    effectLines: [],
    targetLabel: "Unknown",
    rangeLabel: "Range ?",
    sourceLabel: entry.origin === "game" ? "Built into Chaos Core" : "Published from Technica"
  };
}

async function buildRuntimePreview(
  repoPath: string,
  entry: ChaosCoreDatabaseEntry,
  record: RuntimeCardRecord
): Promise<CardGalleryPreview> {
  const effectLines = (record.effects ?? [])
    .map((effect) => formatCardEffect(effect))
    .filter(Boolean);
  const categoryBadge = getCardGlyph(record.category ?? record.type);

  if (record.damage !== undefined && !effectLines.some((line) => line.toLowerCase().includes("damage"))) {
    effectLines.unshift(`Deal ${record.damage} damage.`);
  }

  const sourceLabel = record.sourceClassId
    ? `Class: ${humanizeToken(record.sourceClassId)}`
    : record.sourceEquipmentId
      ? `Gear: ${humanizeToken(record.sourceEquipmentId)}`
      : entry.origin === "game"
        ? "Built into Chaos Core"
        : "Published from Technica";

  return {
    entryKey: entry.entryKey,
    title: record.name,
    contentId: record.id,
    runtimeFile: entry.runtimeFile,
    origin: entry.origin,
    categoryLabel: humanizeToken(record.category ?? record.type ?? "card"),
    categoryBadge,
    artGlyph: categoryBadge,
    rarityLabel: humanizeToken(record.rarity ?? "common"),
    strainCostLabel: `${record.strainCost ?? 0}`,
    description: record.description?.trim() ?? "",
    effectLines,
    targetLabel: humanizeToken(record.targetType ?? "self"),
    rangeLabel: `Range ${record.range ?? 0}`,
    sourceLabel,
    artSrc: await resolveCardArtSrc(repoPath, record.artPath)
  };
}

function CardArt({ artSrc, title, glyph }: { artSrc?: string; title: string; glyph: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [artSrc]);

  if (artSrc && !imageFailed) {
    return (
      <img
        className="database-card-art-image"
        src={artSrc}
        alt={title}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className="database-card-face-art-glyph">{glyph}</span>;
}

export function ChaosCoreCardGallery({
  repoPath,
  entries,
  selectedEntryKey,
  onSelectEntryKey
}: ChaosCoreCardGalleryProps) {
  const previewCacheRef = useRef(new Map<string, CardGalleryPreview>());
  const [previews, setPreviews] = useState<CardGalleryPreview[]>([]);
  const [isLoadingPreviewData, setIsLoadingPreviewData] = useState(false);
  const [resolvedPreviewCount, setResolvedPreviewCount] = useState(0);

  useEffect(() => {
    previewCacheRef.current.clear();
  }, [repoPath]);

  useEffect(() => {
    setPreviews(entries.map((entry) => previewCacheRef.current.get(entry.entryKey) ?? buildFallbackPreview(entry)));
    setResolvedPreviewCount(entries.filter((entry) => previewCacheRef.current.has(entry.entryKey)).length);

    if (!repoPath.trim() || entries.length === 0) {
      setIsLoadingPreviewData(false);
      setResolvedPreviewCount(0);
      return;
    }

    let cancelled = false;

    async function loadPreview(entry: ChaosCoreDatabaseEntry) {
      const cached = previewCacheRef.current.get(entry.entryKey);
      if (cached) {
        return cached;
      }

      try {
        const loaded = await loadChaosCoreDatabaseEntry(repoPath.trim(), "card", entry.entryKey);
        const record = extractRuntimeCardRecord(loaded);
        const preview = record ? await buildRuntimePreview(repoPath.trim(), entry, record) : buildFallbackPreview(entry);
        previewCacheRef.current.set(entry.entryKey, preview);
        return preview;
      } catch {
        const preview = buildFallbackPreview(entry);
        previewCacheRef.current.set(entry.entryKey, preview);
        return preview;
      }
    }

    async function yieldToUi() {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }

    async function loadPreviews() {
      setIsLoadingPreviewData(true);
      try {
        const queue = entries.filter((entry) => !previewCacheRef.current.has(entry.entryKey));
        const eagerLoadCount = Math.min(queue.length, CARD_PREVIEW_BATCH_SIZE * CARD_PREVIEW_INITIAL_BATCHES);

        if (eagerLoadCount > 0) {
          const initialEntries = queue.slice(0, eagerLoadCount);
          await Promise.all(initialEntries.map((entry) => loadPreview(entry)));

          if (!cancelled) {
            setResolvedPreviewCount(entries.filter((entry) => previewCacheRef.current.has(entry.entryKey)).length);
            setPreviews(entries.map((entry) => previewCacheRef.current.get(entry.entryKey) ?? buildFallbackPreview(entry)));
          }
        }

        for (let index = eagerLoadCount; index < queue.length; index += CARD_PREVIEW_BATCH_SIZE) {
          if (cancelled) {
            return;
          }

          const batch = queue.slice(index, index + CARD_PREVIEW_BATCH_SIZE);
          await Promise.all(batch.map((entry) => loadPreview(entry)));

          if (cancelled) {
            return;
          }

          setResolvedPreviewCount(entries.filter((entry) => previewCacheRef.current.has(entry.entryKey)).length);
          setPreviews(entries.map((entry) => previewCacheRef.current.get(entry.entryKey) ?? buildFallbackPreview(entry)));
          await yieldToUi();
        }
      } finally {
        if (!cancelled) {
          setResolvedPreviewCount(entries.filter((entry) => previewCacheRef.current.has(entry.entryKey)).length);
          setIsLoadingPreviewData(false);
        }
      }
    }

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [entries, repoPath]);

  return (
    <div className="database-card-gallery-shell">
      {entries.length === 0 ? (
        <div className="empty-state compact">No Chaos Core card entries found for this tab yet.</div>
      ) : null}

      {entries.length > 0 ? (
        <div className="chip-row">
          <span className="pill">{previews.length} cards</span>
          {isLoadingPreviewData ? <span className="pill">Loading card faces {resolvedPreviewCount}/{entries.length}</span> : null}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="database-card-gallery">
          {previews.map((preview) => {
            const selected = preview.entryKey === selectedEntryKey;
            const rarityClass = preview.rarityLabel.toLowerCase().replace(/\s+/g, "-");
            const copyLines = buildCardCopy(preview.description, preview.effectLines);

            return (
              <button
                key={preview.entryKey}
                type="button"
                className={`database-card-tile rarity-${rarityClass}${selected ? " active" : ""}`}
                onClick={() => onSelectEntryKey(preview.entryKey)}
              >
                <div className={`database-card-face${selected ? " selected" : ""}`}>
                  <div className="database-card-face-cost">{preview.strainCostLabel}</div>
                  <div className="database-card-face-type">{preview.categoryBadge}</div>
                  <div className="database-card-face-art">
                    <CardArt artSrc={preview.artSrc} title={preview.title} glyph={preview.artGlyph} />
                  </div>
                  <div className="database-card-face-rulebox">
                    <div className="database-card-face-title">{preview.title}</div>
                    <div className="database-card-face-copy">
                      {copyLines.length > 0 ? (
                        copyLines.map((line, index) => (
                          <p key={`${preview.entryKey}:${index}`} className="database-card-face-copy-line">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="database-card-face-copy-line muted">No structured effect lines found.</p>
                      )}
                    </div>
                    <div className="database-card-face-detail-row">
                      <span>{preview.rangeLabel}</span>
                      <span>{preview.rarityLabel}</span>
                    </div>
                    <div className="database-card-face-target">{preview.targetLabel}</div>
                  </div>
                </div>
                <div className="database-card-meta">
                  <strong>{preview.contentId}</strong>
                  <span>{preview.sourceLabel}</span>
                  <small>{preview.origin === "game" ? "Game" : "Technica"} | {preview.runtimeFile}</small>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
