import type { MapDocument } from "../types/map";

export const TECHNICA_MAP_DOCUMENT_STORAGE_KEY = "technica.map.document";

export function isStoredMapDocument(value: unknown): value is MapDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapDocument>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    Array.isArray(candidate.tiles) &&
    Array.isArray(candidate.objects) &&
    Array.isArray(candidate.zones)
  );
}

export function readCurrentMapDraft(): MapDocument | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(TECHNICA_MAP_DOCUMENT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as unknown;
    return isStoredMapDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readCurrentMapDrafts(): MapDocument[] {
  const map = readCurrentMapDraft();
  return map ? [map] : [];
}
