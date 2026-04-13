import { useEffect, useMemo, useRef, useState } from "react";
import type { ChaosCoreDatabaseEntry } from "../utils/chaosCoreDatabase";

type CardGalleryPreview = {
  entryKey: string;
  title: string;
  contentId: string;
  runtimeFile: string;
  origin: "game" | "technica";
  categoryBadge: string;
  artGlyph: string;
  rarityLabel: string;
  strainCostLabel: string;
  description: string;
  effectLines: string[];
  targetLabel: string;
  rangeLabel: string;
  sourceLabel: string;
  artPath?: string;
};

interface ChaosCoreCardGalleryProps {
  repoPath: string;
  entries: ChaosCoreDatabaseEntry[];
  selectedEntryKey: string;
  onSelectEntryKey: (entryKey: string) => void;
  onActivateEntryKey?: (entryKey: string) => void;
}

const CARD_TILE_MIN_WIDTH = 220;
const CARD_TILE_ROW_HEIGHT = 430;
const CARD_TILE_GAP = 16;
const CARD_TILE_OVERSCAN_ROWS = 2;
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

function toSummaryPreview(entry: ChaosCoreDatabaseEntry): CardGalleryPreview {
  const summary = entry.summaryData ?? {};
  const category = typeof summary.category === "string" ? summary.category : "card";
  const effectLines = Array.isArray(summary.effectLines)
    ? summary.effectLines.filter(
        (line): line is string => typeof line === "string" && line.trim().length > 0
      )
    : [];
  const sourceLabel = typeof summary.sourceClassId === "string"
    ? `Class: ${humanizeToken(summary.sourceClassId)}`
    : typeof summary.sourceEquipmentId === "string"
      ? `Gear: ${humanizeToken(summary.sourceEquipmentId)}`
      : entry.origin === "game"
        ? "Built into Chaos Core"
        : "Published from Technica";

  return {
    entryKey: entry.entryKey,
    title: entry.title,
    contentId: entry.contentId,
    runtimeFile: entry.runtimeFile,
    origin: entry.origin,
    categoryBadge: getCardGlyph(category),
    artGlyph: getCardGlyph(category),
    rarityLabel: typeof summary.rarity === "string" ? humanizeToken(summary.rarity) : entry.origin === "game" ? "Game" : "Technica",
    strainCostLabel:
      typeof summary.strainCost === "number" ? `${summary.strainCost}` : "?",
    description: typeof summary.description === "string" ? summary.description : "",
    effectLines,
    targetLabel: typeof summary.targetType === "string" ? humanizeToken(summary.targetType) : "Unknown",
    rangeLabel:
      typeof summary.range === "number" ? `Range ${summary.range}` : "Range ?",
    sourceLabel,
    artPath: typeof summary.artPath === "string" ? summary.artPath : undefined
  };
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
  onSelectEntryKey,
  onActivateEntryKey
}: ChaosCoreCardGalleryProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const artSrcCacheRef = useRef(new Map<string, string | undefined>());
  const [artSrcVersion, setArtSrcVersion] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);

  const previews = useMemo(() => entries.map((entry) => toSummaryPreview(entry)), [entries]);
  const columnCount = Math.max(
    1,
    Math.floor((Math.max(viewportWidth, CARD_TILE_MIN_WIDTH) + CARD_TILE_GAP) / (CARD_TILE_MIN_WIDTH + CARD_TILE_GAP))
  );
  const totalRows = Math.ceil(previews.length / columnCount);
  const startRow = Math.max(0, Math.floor(scrollTop / CARD_TILE_ROW_HEIGHT) - CARD_TILE_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / CARD_TILE_ROW_HEIGHT) + CARD_TILE_OVERSCAN_ROWS
  );
  const startIndex = startRow * columnCount;
  const endIndex = Math.min(previews.length, endRow * columnCount);
  const visiblePreviews = previews.slice(startIndex, endIndex);

  useEffect(() => {
    if (!viewportRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const viewport = viewportRef.current;
    const observer = new ResizeObserver((entriesToMeasure) => {
      const nextEntry = entriesToMeasure[0];
      if (!nextEntry) {
        return;
      }

      setViewportWidth(nextEntry.contentRect.width);
      setViewportHeight(nextEntry.contentRect.height);
    });

    observer.observe(viewport);
    setViewportWidth(viewport.clientWidth);
    setViewportHeight(viewport.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    artSrcCacheRef.current.clear();
    setArtSrcVersion((current) => current + 1);
  }, [repoPath]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateVisibleArt() {
      if (!repoPath.trim()) {
        return;
      }

      const pendingPreviews = visiblePreviews.filter(
        (preview) => preview.artPath && !artSrcCacheRef.current.has(preview.entryKey)
      );

      if (pendingPreviews.length === 0) {
        return;
      }

      const resolvedEntries = await Promise.all(
        pendingPreviews.map(async (preview) => ({
          entryKey: preview.entryKey,
          artSrc: await resolveCardArtSrc(repoPath.trim(), preview.artPath)
        }))
      );

      if (cancelled) {
        return;
      }

      resolvedEntries.forEach(({ entryKey, artSrc }) => {
        artSrcCacheRef.current.set(entryKey, artSrc);
      });
      setArtSrcVersion((current) => current + 1);
    }

    void hydrateVisibleArt();

    return () => {
      cancelled = true;
    };
  }, [repoPath, visiblePreviews]);

  const topSpacerHeight = startRow * CARD_TILE_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endRow) * CARD_TILE_ROW_HEIGHT);

  return (
    <div className="database-card-gallery-shell">
      {entries.length === 0 ? (
        <div className="empty-state compact">No Chaos Core card entries found for this tab yet.</div>
      ) : null}

      {entries.length > 0 ? (
        <div className="chip-row">
          <span className="pill">{entries.length} cards</span>
          <span className="pill">Summary-driven</span>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div
          ref={viewportRef}
          className="database-card-gallery-viewport"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {topSpacerHeight > 0 ? <div style={{ height: `${topSpacerHeight}px` }} /> : null}
          <div
            className="database-card-gallery"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {visiblePreviews.map((preview) => {
              const selected = preview.entryKey === selectedEntryKey;
              const rarityClass = preview.rarityLabel.toLowerCase().replace(/\s+/g, "-");
              const copyLines = buildCardCopy(preview.description, preview.effectLines);
              const artSrc = artSrcCacheRef.current.get(preview.entryKey);

              return (
                <button
                  key={preview.entryKey}
                  type="button"
                  className={`database-card-tile rarity-${rarityClass}${selected ? " active" : ""}`}
                  onClick={() => onSelectEntryKey(preview.entryKey)}
                  onDoubleClick={() => onActivateEntryKey?.(preview.entryKey)}
                >
                  <div className={`database-card-face${selected ? " selected" : ""}`}>
                    <div className="database-card-face-cost">{preview.strainCostLabel}</div>
                    <div className="database-card-face-type">{preview.categoryBadge}</div>
                    <div className="database-card-face-art">
                      <CardArt artSrc={artSrc} title={preview.title} glyph={preview.artGlyph} />
                    </div>
                    <div className="database-card-face-rulebox">
                      <div className="database-card-face-title">{preview.title}</div>
                      <div className="database-card-face-copy">
                        {copyLines.length > 0 ? (
                          copyLines.map((line, index) => (
                            <p key={`${preview.entryKey}:${index}:${artSrcVersion}`} className="database-card-face-copy-line">
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
                    <small>
                      {preview.origin === "game" ? "Game" : "Technica"} | {preview.runtimeFile}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
          {bottomSpacerHeight > 0 ? <div style={{ height: `${bottomSpacerHeight}px` }} /> : null}
        </div>
      ) : null}
    </div>
  );
}
