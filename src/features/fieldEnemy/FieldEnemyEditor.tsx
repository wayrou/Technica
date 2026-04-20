import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankFieldEnemy, createSampleFieldEnemy } from "../../data/sampleFieldEnemy";
import { useChaosCoreDatabase } from "../../hooks/useChaosCoreDatabase";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import { mergeFactionOptions } from "../../types/faction";
import type { FieldEnemyDocument, FieldEnemyItemDropDocument, FieldEnemyPresentationDocument } from "../../types/fieldEnemy";
import type { MapDocument } from "../../types/map";
import { resourceKeys, resourceLabels } from "../../types/resources";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { validateFieldEnemyDocument, validateFieldEnemyMapLinks } from "../../utils/contentValidation";
import { readCurrentMapDraft, TECHNICA_MAP_DOCUMENT_STORAGE_KEY } from "../../utils/currentDrafts";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildFieldEnemyBundleForTarget } from "../../utils/exporters";
import { parseKeyValueLines, parseMultilineList, serializeKeyValueLines, serializeMultilineList } from "../../utils/records";

type UnknownRecord = Record<string, unknown>;

function touchFieldEnemy(document: FieldEnemyDocument): FieldEnemyDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function isFieldEnemyDocument(value: unknown): value is FieldEnemyDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      "stats" in value &&
      "spawn" in value &&
      "drops" in value
  );
}

function parseFloorOrdinals(input: string) {
  return input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.floor(value));
}

function serializeFloorOrdinals(values: number[]) {
  return values.join(", ");
}

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeFieldEnemyDocument(value: unknown): FieldEnemyDocument {
  const fallback = createBlankFieldEnemy();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const stats = toRecord(record.stats);
  const spawn = toRecord(record.spawn);
  const presentation = toRecord(record.presentation);
  const presentationMetadata = toRecord(presentation?.metadata);
  const drops = toRecord(record.drops);
  const metadata = toRecord(record.metadata);
  const resources = toRecord(drops?.resources);
  const { faction: _legacyFaction, ...metadataWithoutFaction } = metadata ?? {};

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    faction: readString(record.faction, readString(metadata?.faction, fallback.faction)),
    kind: readString(record.kind, fallback.kind),
    spriteKey: readString(record.spriteKey, fallback.spriteKey),
    spriteAsset:
      record.spriteAsset && typeof record.spriteAsset === "object"
        ? (record.spriteAsset as FieldEnemyDocument["spriteAsset"])
        : fallback.spriteAsset,
    presentation: {
      mode:
        presentation?.mode === "model_3d" || presentation?.mode === "billboard_sprite"
          ? presentation.mode
          : fallback.presentation?.mode ?? "billboard_sprite",
      modelKey: readString(presentation?.modelKey, fallback.presentation?.modelKey ?? ""),
      modelAssetPath: readString(presentation?.modelAssetPath, fallback.presentation?.modelAssetPath ?? ""),
      materialKey: readString(presentation?.materialKey, fallback.presentation?.materialKey ?? ""),
      scale: readNumber(presentation?.scale, fallback.presentation?.scale ?? 1),
      heightOffset: readNumber(presentation?.heightOffset, fallback.presentation?.heightOffset ?? 0),
      facingMode:
        presentation?.facingMode === "movement" || presentation?.facingMode === "fixed" || presentation?.facingMode === "camera"
          ? presentation.facingMode
          : fallback.presentation?.facingMode ?? "camera",
      previewPose: readString(presentation?.previewPose, fallback.presentation?.previewPose ?? "idle"),
      metadata: presentationMetadata
        ? Object.fromEntries(Object.entries(presentationMetadata).map(([key, entry]) => [key, String(entry)]))
        : fallback.presentation?.metadata ?? {}
    },
    stats: {
      maxHp: readNumber(stats?.maxHp, fallback.stats.maxHp),
      speed: readNumber(stats?.speed, fallback.stats.speed),
      aggroRange: readNumber(stats?.aggroRange, fallback.stats.aggroRange),
      width: readNumber(stats?.width, fallback.stats.width),
      height: readNumber(stats?.height, fallback.stats.height)
    },
    spawn: {
      mapIds: Array.isArray(spawn?.mapIds) ? spawn.mapIds.map(String).map((entry) => entry.trim()).filter(Boolean) : fallback.spawn.mapIds,
      floorOrdinals: Array.isArray(spawn?.floorOrdinals)
        ? spawn.floorOrdinals.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0).map((entry) => Math.floor(entry))
        : fallback.spawn.floorOrdinals,
      spawnCount: readNumber(spawn?.spawnCount ?? spawn?.count, fallback.spawn.spawnCount),
      regionIds: Array.isArray(spawn?.regionIds) ? spawn.regionIds.map(String).map((entry) => entry.trim()).filter(Boolean) : fallback.spawn.regionIds,
      mapTags: Array.isArray(spawn?.mapTags) ? spawn.mapTags.map(String).map((entry) => entry.trim()).filter(Boolean) : fallback.spawn.mapTags,
      spawnAnchorTags: Array.isArray(spawn?.spawnAnchorTags)
        ? spawn.spawnAnchorTags.map(String).map((entry) => entry.trim()).filter(Boolean)
        : fallback.spawn.spawnAnchorTags,
      allowGeneratedAprons: typeof spawn?.allowGeneratedAprons === "boolean" ? spawn.allowGeneratedAprons : fallback.spawn.allowGeneratedAprons,
      avoidSafeZones: typeof spawn?.avoidSafeZones === "boolean" ? spawn.avoidSafeZones : fallback.spawn.avoidSafeZones,
      minDistanceFromPlayerSpawn: readNumber(spawn?.minDistanceFromPlayerSpawn, fallback.spawn.minDistanceFromPlayerSpawn ?? 2)
    },
    drops: {
      wad: readNumber(drops?.wad, fallback.drops.wad),
      resources: {
        ...fallback.drops.resources,
        ...Object.fromEntries(
          resourceKeys.map((resourceKey) => [resourceKey, readNumber(resources?.[resourceKey], fallback.drops.resources[resourceKey])])
        )
      },
      items: Array.isArray(drops?.items)
        ? drops.items.map((entry) => {
            const item = toRecord(entry);
            return {
              id: readString(item?.id, ""),
              quantity: readNumber(item?.quantity, 1),
              chance: readNumber(item?.chance, 1)
            };
          })
        : fallback.drops.items
    },
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadataWithoutFaction).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function createDropItem(): FieldEnemyItemDropDocument {
  return {
    id: "",
    quantity: 1,
    chance: 1
  };
}

function mergeUniqueStrings(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next].map((item) => item.trim()).filter(Boolean)));
}

function summarizeFieldEnemySpawnTargets(document: FieldEnemyDocument) {
  const targets: string[] = [];
  if (document.spawn.mapIds.length > 0) {
    targets.push(`${document.spawn.mapIds.length} map id target(s)`);
  }
  if (document.spawn.floorOrdinals.length > 0) {
    targets.push(`floor ${document.spawn.floorOrdinals.join(", ")}`);
  }
  if (document.spawn.regionIds?.length) {
    targets.push(`${document.spawn.regionIds.length} region target(s)`);
  }
  if (document.spawn.mapTags?.length) {
    targets.push(`map tags: ${document.spawn.mapTags.join(", ")}`);
  }
  if (document.spawn.allowGeneratedAprons) {
    targets.push("generated aprons");
  }

  return targets;
}

function summarizeFieldEnemyDrops(document: FieldEnemyDocument) {
  const drops: string[] = [];
  if (document.drops.wad > 0) {
    drops.push(`${document.drops.wad} WAD`);
  }
  resourceKeys.forEach((resourceKey) => {
    const amount = document.drops.resources[resourceKey] ?? 0;
    if (amount > 0) {
      drops.push(`${amount} ${resourceLabels[resourceKey]}`);
    }
  });
  document.drops.items.forEach((drop) => {
    if (drop.id.trim()) {
      drops.push(`${drop.quantity} ${drop.id} @ ${Math.round(drop.chance * 100)}%`);
    }
  });

  return drops;
}

function getFieldEnemyPresentationLabel(presentation: FieldEnemyPresentationDocument) {
  return presentation.mode === "model_3d" ? "3D model" : "Billboard sprite";
}

function parseDraftMetadataList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function getCurrentMapTags(map: MapDocument | null) {
  if (!map) {
    return [];
  }

  return Array.from(
    new Set([
      ...(map.mapTags ?? []),
      ...parseDraftMetadataList(map.metadata.tags),
      ...parseDraftMetadataList(map.metadata.mapTags)
    ].map((entry) => entry.trim()).filter(Boolean))
  );
}

function getCurrentMapRegionIds(map: MapDocument | null) {
  if (!map) {
    return [];
  }

  return Array.from(
    new Set([
      ...(map.regionTags ?? []),
      ...parseDraftMetadataList(map.metadata.regionIds),
      ...parseDraftMetadataList(map.metadata.regions),
      map.metadata.regionId ?? ""
    ].map((entry) => entry.trim()).filter(Boolean))
  );
}

function getCurrentMapEnemyAnchors(map: MapDocument | null) {
  return (map?.spawnAnchors ?? []).filter((anchor) => anchor.kind === "enemy" || anchor.kind === "generic");
}

function getCurrentMapEnemyAnchorTags(map: MapDocument | null) {
  return Array.from(
    new Set(getCurrentMapEnemyAnchors(map).flatMap((anchor) => anchor.tags).map((tag) => tag.trim()).filter(Boolean))
  );
}

function hasTextOverlap(left: readonly string[] | undefined, right: readonly string[]) {
  const rightSet = new Set(right.map((entry) => entry.toLowerCase()));
  return (left ?? []).some((entry) => rightSet.has(entry.toLowerCase()));
}

function fieldEnemyTargetsCurrentMap(document: FieldEnemyDocument, map: MapDocument | null) {
  if (!map) {
    return false;
  }

  return (
    document.spawn.mapIds.includes(map.id) ||
    hasTextOverlap(document.spawn.mapTags, getCurrentMapTags(map)) ||
    hasTextOverlap(document.spawn.regionIds, getCurrentMapRegionIds(map))
  );
}

function getCurrentMapMatchingEnemyAnchors(map: MapDocument | null, anchorTags: readonly string[]) {
  const anchors = getCurrentMapEnemyAnchors(map);
  if (anchorTags.length === 0) {
    return anchors;
  }

  return anchors.filter((anchor) => hasTextOverlap(anchor.tags, anchorTags));
}

export function FieldEnemyEditor() {
  const { desktopEnabled, repoPath, summaryStates, ensureSummaries } = useChaosCoreDatabase();
  const [mapContextRevision, setMapContextRevision] = useState(0);
  const currentMapDraft = useMemo(() => readCurrentMapDraft(), [mapContextRevision]);

  useEffect(() => {
    if (!desktopEnabled || !repoPath.trim()) {
      return;
    }

    void ensureSummaries("faction");
    void ensureSummaries("map");
  }, [desktopEnabled, ensureSummaries, repoPath]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.storageArea === window.localStorage && event.key === TECHNICA_MAP_DOCUMENT_STORAGE_KEY) {
        setMapContextRevision((current) => current + 1);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const factionOptions = useMemo(
    () =>
      mergeFactionOptions(
        summaryStates.faction.entries.map((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId,
          origin: entry.origin
        }))
      ),
    [summaryStates.faction.entries]
  );
  const mapOptions = useMemo(
    () =>
      summaryStates.map.entries.map((entry) => ({
        id: entry.contentId,
        title: entry.title.trim() || entry.contentId,
        origin: entry.origin
      })),
    [summaryStates.map.entries]
  );

  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: FieldEnemyDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      if (!isFieldEnemyDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica field enemy format.");
        return;
      }
      setDocument(touchFieldEnemy(normalizeFieldEnemyDocument(parsed)));
    } catch {
      notify("Could not load the selected field enemy from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.fieldEnemy.document"
      exportTargetKey="technica.fieldEnemy.exportTarget"
      draftType="field_enemy"
      initialDocument={createSampleFieldEnemy()}
      createBlank={createBlankFieldEnemy}
      createSample={createSampleFieldEnemy}
      validate={(document) => {
        const normalizedDocument = normalizeFieldEnemyDocument(document);
        return [
          ...validateFieldEnemyDocument(normalizedDocument),
          ...validateFieldEnemyMapLinks(normalizedDocument, currentMapDraft ? [currentMapDraft] : [])
        ];
      }}
      buildBundleForTarget={(document, target) => buildFieldEnemyBundleForTarget(normalizeFieldEnemyDocument(document), target)}
      getTitle={(document) => normalizeFieldEnemyDocument(document).name}
      isImportPayload={isFieldEnemyDocument}
      touchDocument={(document) => touchFieldEnemy(normalizeFieldEnemyDocument(document))}
      replacePrompt="Replace the current field enemy draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica field enemy draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, exportTarget, setExportTarget, loadSample, clearDocument, importDraft, saveDraft, exportBundle, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => (
        (() => {
          const fieldEnemy = normalizeFieldEnemyDocument(document);
          const defaultPresentation = createBlankFieldEnemy().presentation!;
          const selectedFaction = factionOptions.find((option) => option.id === fieldEnemy.faction) ?? null;
          const patchFieldEnemy = (updater: (current: FieldEnemyDocument) => FieldEnemyDocument) =>
            patchDocument((current) => updater(normalizeFieldEnemyDocument(current)));
          const patchPresentation = (updater: (current: FieldEnemyPresentationDocument) => FieldEnemyPresentationDocument) =>
            patchFieldEnemy((current) => ({
              ...current,
              presentation: updater(current.presentation ?? defaultPresentation)
            }));
          const presentation = fieldEnemy.presentation ?? defaultPresentation;
          const spriteMetadataPath = fieldEnemy.metadata.spritePath?.trim() ?? "";
          const hasSpriteSource = Boolean(fieldEnemy.spriteAsset?.dataUrl || fieldEnemy.spriteKey.trim() || spriteMetadataPath);
          const hasModelSource = Boolean(presentation.modelKey.trim() || presentation.modelAssetPath.trim());
          const presentationReady = presentation.mode === "model_3d" ? hasModelSource : hasSpriteSource;
          const spawnTargetSummary = summarizeFieldEnemySpawnTargets(fieldEnemy);
          const dropSummary = summarizeFieldEnemyDrops(fieldEnemy);
          const previewScale = Math.max(0.35, Math.min(2.25, Number.isFinite(presentation.scale) ? presentation.scale : 1));
          const previewWidth = Math.max(34, Math.min(132, fieldEnemy.stats.width * previewScale));
          const previewHeight = Math.max(34, Math.min(132, fieldEnemy.stats.height * previewScale));
          const previewLift = Math.max(-28, Math.min(64, presentation.heightOffset * 28));
          const previewVisualStyle: CSSProperties = {
            width: `${previewWidth}px`,
            height: `${previewHeight}px`,
            transform: `translate(-50%, calc(-50% - ${previewLift}px))`
          };
          const target3DEnemyAnchors = () =>
            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                mapTags: mergeUniqueStrings(current.spawn.mapTags ?? [], ["technica_3d"]),
                spawnAnchorTags: mergeUniqueStrings(current.spawn.spawnAnchorTags ?? [], ["enemy"])
              }
            }));
          const currentMapTags = getCurrentMapTags(currentMapDraft);
          const currentMapRegionIds = getCurrentMapRegionIds(currentMapDraft);
          const currentMapEnemyAnchors = getCurrentMapEnemyAnchors(currentMapDraft);
          const currentMapEnemyAnchorTags = getCurrentMapEnemyAnchorTags(currentMapDraft);
          const currentMapMatchingEnemyAnchors = getCurrentMapMatchingEnemyAnchors(currentMapDraft, fieldEnemy.spawn.spawnAnchorTags ?? []);
          const currentMapTargeted = fieldEnemyTargetsCurrentMap(fieldEnemy, currentMapDraft);
          const currentMapRenderMode = currentMapDraft?.renderMode ?? currentMapDraft?.settings3d?.renderMode ?? "classic_2d";
          const targetCurrentMapById = () => {
            if (!currentMapDraft) {
              return;
            }

            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                mapIds: mergeUniqueStrings(current.spawn.mapIds, [currentMapDraft.id])
              }
            }));
          };
          const addCurrentMapTags = () => {
            if (currentMapTags.length === 0) {
              return;
            }

            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                mapTags: mergeUniqueStrings(current.spawn.mapTags ?? [], currentMapTags)
              }
            }));
          };
          const addCurrentMapRegionIds = () => {
            if (currentMapRegionIds.length === 0) {
              return;
            }

            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                regionIds: mergeUniqueStrings(current.spawn.regionIds ?? [], currentMapRegionIds)
              }
            }));
          };
          const addCurrentEnemyAnchorTags = () => {
            if (currentMapEnemyAnchorTags.length === 0) {
              return;
            }

            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                spawnAnchorTags: mergeUniqueStrings(current.spawn.spawnAnchorTags ?? [], currentMapEnemyAnchorTags)
              }
            }));
          };
          const addDatabaseMapId = (mapId: string) => {
            if (!mapId.trim()) {
              return;
            }

            patchFieldEnemy((current) => ({
              ...current,
              spawn: {
                ...current.spawn,
                mapIds: mergeUniqueStrings(current.spawn.mapIds, [mapId])
              }
            }));
          };

          return (
        <>
          <Panel
            title="Field Enemy Setup"
            subtitle="Author lightweight field enemies with random map spawns, sprite art, drop tables, and floor-based spawn rules."
            actions={
              <div className="toolbar">
                <button type="button" className="ghost-button" onClick={loadSample}>
                  Load sample
                </button>
                <button type="button" className="ghost-button" onClick={clearDocument}>
                  Clear
                </button>
              </div>
            }
          >
            <div className="form-grid">
              <label className="field">
                <span>Enemy id</span>
                <input value={fieldEnemy.id} onChange={(event) => patchFieldEnemy((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={fieldEnemy.name} onChange={(event) => patchFieldEnemy((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Faction</span>
                <select
                  value={fieldEnemy.faction}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, faction: event.target.value }))}
                >
                  {!fieldEnemy.faction.trim() ? <option value="">Select faction...</option> : null}
                  {fieldEnemy.faction.trim() && !selectedFaction ? (
                    <option value={fieldEnemy.faction}>Custom ({fieldEnemy.faction})</option>
                  ) : null}
                  {factionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
                </select>
                <small className="muted">
                  {selectedFaction
                    ? `${selectedFaction.name} (${selectedFaction.id})${selectedFaction.origin === "preset" ? " - Preset" : selectedFaction.origin === "game" ? " - Game" : " - Technica"}`
                    : `${factionOptions.length} faction option(s), including Chaos Core presets.`}
                </small>
              </label>
              <label className="field">
                <span>Kind</span>
                <input value={fieldEnemy.kind} onChange={(event) => patchFieldEnemy((current) => ({ ...current, kind: event.target.value }))} />
              </label>
              <label className="field">
                <span>Sprite key</span>
                <input
                  value={fieldEnemy.spriteKey}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, spriteKey: event.target.value }))}
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={fieldEnemy.description}
                  onChange={(event) => patchFieldEnemy((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>

            <div className="subsection">
              <h4>Field Stats</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Max HP</span>
                  <input
                    type="number"
                    value={fieldEnemy.stats.maxHp}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          maxHp: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Speed</span>
                  <input
                    type="number"
                    value={fieldEnemy.stats.speed}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          speed: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Aggro range</span>
                  <input
                    type="number"
                    value={fieldEnemy.stats.aggroRange}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          aggroRange: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Width</span>
                  <input
                    type="number"
                    value={fieldEnemy.stats.width}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          width: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Height</span>
                  <input
                    type="number"
                    value={fieldEnemy.stats.height}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          height: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Spawn Rules</h4>
              <div className="field-enemy-map-target-card">
                <div className="field-enemy-map-target-card__header">
                  <div>
                    <span className="eyebrow">Current Map Context</span>
                    <strong>{currentMapDraft ? currentMapDraft.name : "No map draft loaded"}</strong>
                    <p>
                      {currentMapDraft
                        ? "Use the current Map Editor draft to avoid hand-typing ids, tags, and enemy anchor labels."
                        : "Open or save a map in the Map Editor, then reload this context to target its ids and anchor tags."}
                    </p>
                  </div>
                  <span className={currentMapTargeted ? "pill accent" : "pill"}>
                    {currentMapTargeted ? "Targeting current map" : "Not targeted"}
                  </span>
                </div>
                {currentMapDraft ? (
                  <>
                    <div className="field-enemy-map-target-grid">
                      <div>
                        <span>Map id</span>
                        <code>{currentMapDraft.id}</code>
                      </div>
                      <div>
                        <span>Mode</span>
                        <strong>{currentMapRenderMode.replace(/_/g, " ")}</strong>
                      </div>
                      <div>
                        <span>Enemy anchors</span>
                        <strong>{currentMapEnemyAnchors.length}</strong>
                      </div>
                      <div>
                        <span>Matching anchors</span>
                        <strong>{currentMapMatchingEnemyAnchors.length}</strong>
                      </div>
                    </div>
                    <div className="field-enemy-map-target-picks">
                      <div>
                        <span>Map tags</span>
                        <div className="chip-row">
                          {currentMapTags.length > 0 ? currentMapTags.map((tag) => <span key={tag} className="pill">{tag}</span>) : <span className="muted">No map tags</span>}
                        </div>
                      </div>
                      <div>
                        <span>Enemy anchor tags</span>
                        <div className="chip-row">
                          {currentMapEnemyAnchorTags.length > 0 ? currentMapEnemyAnchorTags.map((tag) => <span key={tag} className="pill">{tag}</span>) : <span className="muted">No enemy anchor tags</span>}
                        </div>
                      </div>
                    </div>
                    <div className="toolbar">
                      <button type="button" className="ghost-button" onClick={targetCurrentMapById}>
                        Target this map id
                      </button>
                      <button type="button" className="ghost-button" onClick={addCurrentMapTags} disabled={currentMapTags.length === 0}>
                        Add map tags
                      </button>
                      <button type="button" className="ghost-button" onClick={addCurrentMapRegionIds} disabled={currentMapRegionIds.length === 0}>
                        Add region ids
                      </button>
                      <button type="button" className="ghost-button" onClick={addCurrentEnemyAnchorTags} disabled={currentMapEnemyAnchorTags.length === 0}>
                        Use enemy anchor tags
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setMapContextRevision((current) => current + 1)}>
                        Reload map context
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="toolbar">
                    <button type="button" className="ghost-button" onClick={() => setMapContextRevision((current) => current + 1)}>
                      Reload map context
                    </button>
                  </div>
                )}
                {mapOptions.length > 0 ? (
                  <label className="inline-select">
                    <span>Add published map id</span>
                    <select value="" onChange={(event) => addDatabaseMapId(event.target.value)}>
                      <option value="">Select map...</option>
                      {mapOptions.map((option) => (
                        <option key={`${option.origin}:${option.id}`} value={option.id}>
                          {option.title} ({option.id})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Spawns per map</span>
                  <input
                    type="number"
                    value={fieldEnemy.spawn.spawnCount}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          spawnCount: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Floor numbers</span>
                  <input
                    value={serializeFloorOrdinals(fieldEnemy.spawn.floorOrdinals)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          floorOrdinals: parseFloorOrdinals(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Specific map ids</span>
                  <textarea
                    rows={4}
                    value={serializeMultilineList(fieldEnemy.spawn.mapIds)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          mapIds: parseMultilineList(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Floor region ids</span>
                  <textarea
                    rows={3}
                    value={serializeMultilineList(fieldEnemy.spawn.regionIds ?? [])}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          regionIds: parseMultilineList(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Map tags</span>
                  <textarea
                    rows={3}
                    value={serializeMultilineList(fieldEnemy.spawn.mapTags ?? [])}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          mapTags: parseMultilineList(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Spawn anchor tags</span>
                  <textarea
                    rows={3}
                    value={serializeMultilineList(fieldEnemy.spawn.spawnAnchorTags ?? [])}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          spawnAnchorTags: parseMultilineList(event.target.value)
                        }
                      }))
                    }
                  />
                  <small className="muted">If matching map anchors exist, Chaos Core will prefer them before random walkable tiles.</small>
                </label>
                <label className="field">
                  <span>Min distance from player spawn</span>
                  <input
                    type="number"
                    min={0}
                    value={fieldEnemy.spawn.minDistanceFromPlayerSpawn ?? 0}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          minDistanceFromPlayerSpawn: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(fieldEnemy.spawn.allowGeneratedAprons)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          allowGeneratedAprons: event.target.checked
                        }
                      }))
                    }
                  />
                  <span>Can spawn in generated apron maps</span>
                </label>
                <label className="inline-toggle">
                  <input
                    type="checkbox"
                    checked={fieldEnemy.spawn.avoidSafeZones !== false}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        spawn: {
                          ...current.spawn,
                          avoidSafeZones: event.target.checked
                        }
                      }))
                    }
                  />
                  <span>Avoid safe/player-start zones</span>
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Drops</h4>
              <div className="form-grid">
                <label className="field">
                  <span>WAD</span>
                  <input
                    type="number"
                    value={fieldEnemy.drops.wad}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        drops: {
                          ...current.drops,
                          wad: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                {resourceKeys.map((resourceKey) => (
                  <label key={resourceKey} className="field">
                    <span>{resourceLabels[resourceKey]}</span>
                    <input
                      type="number"
                      value={fieldEnemy.drops.resources[resourceKey]}
                      onChange={(event) =>
                        patchFieldEnemy((current) => ({
                          ...current,
                          drops: {
                            ...current.drops,
                            resources: {
                              ...current.drops.resources,
                              [resourceKey]: Number(event.target.value || 0)
                            }
                          }
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="dialogue-entry-list">
                {fieldEnemy.drops.items.length === 0 ? (
                  <div className="empty-state compact">Add optional item drops with quantity and 0-1 chance values.</div>
                ) : (
                  fieldEnemy.drops.items.map((drop, index) => (
                    <article key={`${drop.id || "item"}-${index}`} className="dialogue-entry-card">
                      <div className="dialogue-entry-header">
                        <span className="flow-badge jump">Drop {index + 1}</span>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() =>
                            patchFieldEnemy((current) => ({
                              ...current,
                              drops: {
                                ...current.drops,
                                items: current.drops.items.filter((_, itemIndex) => itemIndex !== index)
                              }
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Item id</span>
                          <input
                            value={drop.id}
                            onChange={(event) =>
                              patchFieldEnemy((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, id: event.target.value } : entry
                                  )
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Quantity</span>
                          <input
                            type="number"
                            value={drop.quantity}
                            onChange={(event) =>
                              patchFieldEnemy((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, quantity: Number(event.target.value || 0) } : entry
                                  )
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Chance</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step="0.05"
                            value={drop.chance}
                            onChange={(event) =>
                              patchFieldEnemy((current) => ({
                                ...current,
                                drops: {
                                  ...current.drops,
                                  items: current.drops.items.map((entry, itemIndex) =>
                                    itemIndex === index ? { ...entry, chance: Number(event.target.value || 0) } : entry
                                  )
                                }
                              }))
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="toolbar">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    patchFieldEnemy((current) => ({
                      ...current,
                      drops: {
                        ...current.drops,
                        items: [...current.drops.items, createDropItem()]
                      }
                    }))
                  }
                >
                  Add item drop
                </button>
              </div>
            </div>

            <div className="subsection">
              <h4>3D Presentation</h4>
              <div className="field-enemy-preview-card">
                <div className="field-enemy-preview-stage" data-mode={presentation.mode}>
                  <span className="field-enemy-preview-grid" />
                  <span className="field-enemy-preview-shadow" />
                  <div className={presentation.mode === "model_3d" ? "field-enemy-preview-visual model" : "field-enemy-preview-visual billboard"} style={previewVisualStyle}>
                    {presentation.mode === "model_3d" ? (
                      <>
                        <span className="field-enemy-preview-model-core" />
                        <span className="field-enemy-preview-model-label">
                          {(presentation.modelKey || presentation.modelAssetPath || fieldEnemy.name || "MODEL").slice(0, 18)}
                        </span>
                      </>
                    ) : fieldEnemy.spriteAsset?.dataUrl ? (
                      <img src={fieldEnemy.spriteAsset.dataUrl} alt={`${fieldEnemy.name || "Field enemy"} sprite preview`} />
                    ) : (
                      <span className="field-enemy-preview-sprite-fallback">
                        {(fieldEnemy.spriteKey || fieldEnemy.name || "enemy").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {presentation.heightOffset !== 0 ? (
                    <span className="field-enemy-preview-lift" style={{ height: `${Math.abs(previewLift)}px` }} />
                  ) : null}
                </div>
                <div className="field-enemy-preview-copy">
                  <div className="field-enemy-preview-header">
                    <div>
                      <span className="eyebrow">Chaos Core Presentation</span>
                      <strong>{getFieldEnemyPresentationLabel(presentation)}</strong>
                    </div>
                    <span className={presentationReady ? "pill accent" : "pill warning"}>
                      {presentationReady ? "Ready" : "Needs source"}
                    </span>
                  </div>
                  <div className="field-enemy-preview-metrics">
                    <span>Scale {previewScale.toFixed(2)}x</span>
                    <span>Height offset {presentation.heightOffset}</span>
                    <span>{presentation.facingMode} facing</span>
                    <span>{presentation.previewPose || "idle"} pose</span>
                  </div>
                  <div className="field-enemy-preview-summary">
                    <strong>Spawn targets</strong>
                    <span>{spawnTargetSummary.length > 0 ? spawnTargetSummary.join(" // ") : "No spawn target configured yet."}</span>
                  </div>
                  <div className="field-enemy-preview-summary">
                    <strong>Drops</strong>
                    <span>{dropSummary.length > 0 ? dropSummary.join(" // ") : "No drops configured."}</span>
                  </div>
                  <div className="toolbar">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        patchPresentation((current) => ({
                          ...current,
                          mode: "billboard_sprite",
                          facingMode: "camera",
                          scale: current.scale || 1,
                          previewPose: current.previewPose || "idle"
                        }))
                      }
                    >
                      Billboard preset
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        patchPresentation((current) => ({
                          ...current,
                          mode: "model_3d",
                          facingMode: "movement",
                          scale: current.scale || 1,
                          previewPose: current.previewPose || "idle"
                        }))
                      }
                    >
                      3D model preset
                    </button>
                    <button type="button" className="ghost-button" onClick={target3DEnemyAnchors}>
                      Target 3D enemy anchors
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Presentation mode</span>
                  <select
                    value={fieldEnemy.presentation?.mode ?? "billboard_sprite"}
                    onChange={(event) =>
                      patchPresentation((current) => ({
                        ...current,
                        mode: event.target.value === "model_3d" ? "model_3d" : "billboard_sprite"
                      }))
                    }
                  >
                    <option value="billboard_sprite">Billboard sprite</option>
                    <option value="model_3d">3D model</option>
                  </select>
                </label>
                <label className="field">
                  <span>Model key</span>
                  <input
                    value={fieldEnemy.presentation?.modelKey ?? ""}
                    onChange={(event) => patchPresentation((current) => ({ ...current, modelKey: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Model asset path</span>
                  <input
                    value={fieldEnemy.presentation?.modelAssetPath ?? ""}
                    onChange={(event) => patchPresentation((current) => ({ ...current, modelAssetPath: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Material key</span>
                  <input
                    value={fieldEnemy.presentation?.materialKey ?? ""}
                    onChange={(event) => patchPresentation((current) => ({ ...current, materialKey: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Scale</span>
                  <input
                    type="number"
                    step="0.05"
                    value={fieldEnemy.presentation?.scale ?? 1}
                    onChange={(event) => patchPresentation((current) => ({ ...current, scale: Number(event.target.value || 1) }))}
                  />
                </label>
                <label className="field">
                  <span>Height offset</span>
                  <input
                    type="number"
                    step="0.05"
                    value={fieldEnemy.presentation?.heightOffset ?? 0}
                    onChange={(event) => patchPresentation((current) => ({ ...current, heightOffset: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="field">
                  <span>Facing mode</span>
                  <select
                    value={fieldEnemy.presentation?.facingMode ?? "camera"}
                    onChange={(event) =>
                      patchPresentation((current) => ({
                        ...current,
                        facingMode:
                          event.target.value === "movement" || event.target.value === "fixed" ? event.target.value : "camera"
                      }))
                    }
                  >
                    <option value="camera">Face camera</option>
                    <option value="movement">Face movement</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
                <label className="field">
                  <span>Preview pose</span>
                  <input
                    value={fieldEnemy.presentation?.previewPose ?? "idle"}
                    onChange={(event) => patchPresentation((current) => ({ ...current, previewPose: event.target.value }))}
                  />
                </label>
                <label className="field full">
                  <span>Presentation metadata</span>
                  <textarea
                    rows={3}
                    value={serializeKeyValueLines(fieldEnemy.presentation?.metadata ?? {})}
                    onChange={(event) => patchPresentation((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))}
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Art & Metadata</h4>
              <ImageAssetField
                label="Sprite"
                emptyLabel="Drop enemy sprite art"
                hint="Used by the field renderer when a published sprite path is available."
                asset={fieldEnemy.spriteAsset}
                onChange={(spriteAsset) => patchFieldEnemy((current) => ({ ...current, spriteAsset }))}
              />
              <div className="form-grid">
                <label className="field full">
                  <span>Metadata</span>
                  <textarea
                    rows={4}
                    value={serializeKeyValueLines(fieldEnemy.metadata)}
                    onChange={(event) =>
                      patchFieldEnemy((current) => ({
                        ...current,
                        metadata: parseKeyValueLines(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="toolbar split">
              <div className="chip-row">
                <span className="pill">{fieldEnemy.kind || "light"}</span>
                {fieldEnemy.faction ? <span className="pill">{fieldEnemy.faction}</span> : null}
                <span className="pill">{fieldEnemy.spawn.spawnCount} spawn(s)</span>
                <span className="pill">{fieldEnemy.drops.items.length} item drop(s)</span>
              </div>
              <div className="toolbar">
                <label className="inline-select">
                  <span>Export target</span>
                  <select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as ExportTarget)}>
                    <option value="generic">Generic</option>
                    <option value="chaos-core">Chaos Core</option>
                  </select>
                </label>
                {canSendToDesktop ? (
                  <button type="button" className="ghost-button" onClick={() => void sendToDesktop()} disabled={isSendingToDesktop}>
                    {isSendingToDesktop ? "Sending..." : "Send to desktop"}
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={importDraft}>
                  Import draft
                </button>
                <button type="button" className="ghost-button" onClick={saveDraft}>
                  Save draft file
                </button>
                <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                  Export bundle
                </button>
              </div>
            </div>
          </Panel>

          <ChaosCoreDatabasePanel
            contentType="field_enemy"
            currentDocument={fieldEnemy}
            buildBundle={(current) => buildFieldEnemyBundleForTarget(normalizeFieldEnemyDocument(current), "chaos-core")}
            onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
            subtitle="Publish lightweight field enemy definitions into Chaos Core and reopen those records here for spawn and drop tuning."
          />
        </>
          );
        })()
      )}
    />
  );
}
