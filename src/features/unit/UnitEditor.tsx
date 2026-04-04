import { useCallback, useEffect, useMemo, useState } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { Panel } from "../../components/Panel";
import { createBlankUnit, createSampleUnit } from "../../data/sampleUnit";
import { usePersistentState } from "../../hooks/usePersistentState";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import type { ExportTarget } from "../../types/common";
import type { UnitDocument } from "../../types/unit";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildUnitBundleForTarget } from "../../utils/exporters";
import { validateUnitDocument } from "../../utils/contentValidation";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import {
  CHAOS_CORE_DATABASE_UPDATE_EVENT,
  CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY,
  isTauriRuntime,
  listChaosCoreDatabase,
  loadChaosCoreDatabaseEntry,
  parseChaosCoreDatabaseUpdate,
  type LoadedChaosCoreDatabaseEntry
} from "../../utils/chaosCoreDatabase";

type UnitLoadoutField = keyof UnitDocument["loadout"];
type UnitGearSlot = "weapon" | "helmet" | "chestpiece" | "accessory";

type UnitReferenceOption = {
  id: string;
  name: string;
  origin: "game" | "technica";
};

type UnitGearOption = UnitReferenceOption & {
  slot: UnitGearSlot;
};

type UnknownRecord = Record<string, unknown>;

const LOADOUT_SLOT_BY_FIELD: Record<UnitLoadoutField, UnitGearSlot> = {
  primaryWeapon: "weapon",
  secondaryWeapon: "weapon",
  helmet: "helmet",
  chestpiece: "chestpiece",
  accessory1: "accessory",
  accessory2: "accessory"
};

const LOADOUT_LABEL_BY_FIELD: Record<UnitLoadoutField, string> = {
  primaryWeapon: "Primary weapon",
  secondaryWeapon: "Secondary weapon",
  helmet: "Helmet",
  chestpiece: "Chestpiece",
  accessory1: "Accessory 1",
  accessory2: "Accessory 2"
};

function touchUnit(document: UnitDocument): UnitDocument {
  return {
    ...document,
    updatedAt: isoNow()
  };
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

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeUnitDocument(value: unknown): UnitDocument {
  const fallback = createBlankUnit();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const stats = toRecord(record.stats);
  const loadout = toRecord(record.loadout);
  const metadata = toRecord(record.metadata);

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    currentClassId: readString(record.currentClassId, fallback.currentClassId),
    stats: {
      maxHp: readNumber(stats?.maxHp, fallback.stats.maxHp),
      atk: readNumber(stats?.atk, fallback.stats.atk),
      def: readNumber(stats?.def, fallback.stats.def),
      agi: readNumber(stats?.agi, fallback.stats.agi),
      acc: readNumber(stats?.acc, fallback.stats.acc)
    },
    loadout: {
      primaryWeapon: readString(loadout?.primaryWeapon, fallback.loadout.primaryWeapon),
      secondaryWeapon: readString(loadout?.secondaryWeapon, fallback.loadout.secondaryWeapon),
      helmet: readString(loadout?.helmet, fallback.loadout.helmet),
      chestpiece: readString(loadout?.chestpiece, fallback.loadout.chestpiece),
      accessory1: readString(loadout?.accessory1, fallback.loadout.accessory1),
      accessory2: readString(loadout?.accessory2, fallback.loadout.accessory2)
    },
    traits: Array.isArray(record.traits) ? record.traits.filter((entry): entry is string => typeof entry === "string") : fallback.traits,
    pwr: readNumber(record.pwr, fallback.pwr),
    recruitCost: readNumber(record.recruitCost, fallback.recruitCost),
    startingInRoster: readBoolean(record.startingInRoster, fallback.startingInRoster),
    deployInParty: readBoolean(record.deployInParty, fallback.deployInParty),
    metadata: metadata
      ? Object.fromEntries(Object.entries(metadata).map(([key, entry]) => [key, String(entry)]))
      : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt)
  };
}

function isUnitDocument(value: unknown): value is UnitDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "currentClassId" in value &&
      "stats" in value &&
      "loadout" in value
  );
}

function isGearPayload(value: unknown): value is { id: string; name?: string; slot: UnitGearSlot } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "slot" in value &&
      (value as { slot?: string }).slot &&
      ["weapon", "helmet", "chestpiece", "accessory"].includes((value as { slot: string }).slot)
  );
}

function formatReferenceSummary(option: UnitReferenceOption | null) {
  if (!option) {
    return null;
  }

  return `${option.name} (${option.id}) - ${option.origin === "game" ? "Game" : "Technica"}`;
}

function getPreferredDatabasePayload(loaded: LoadedChaosCoreDatabaseEntry) {
  return loaded.runtimeContent || loaded.editorContent || loaded.sourceContent || null;
}

export function UnitEditor() {
  const [storedRepoPath] = usePersistentState("technica.chaosCoreRepoPath", "");
  const repoPath = typeof storedRepoPath === "string" ? storedRepoPath : "";
  const desktopEnabled = isTauriRuntime();
  const [classOptions, setClassOptions] = useState<UnitReferenceOption[]>([]);
  const [gearOptions, setGearOptions] = useState<UnitGearOption[]>([]);

  const refreshReferenceOptions = useCallback(async (
    shouldCommit: () => boolean = () => true,
    includeGear = false
  ) => {
    if (!desktopEnabled || !repoPath.trim()) {
      if (shouldCommit()) {
        setClassOptions([]);
        if (includeGear) {
          setGearOptions([]);
        }
      }
      return;
    }

    try {
      const classEntries = await listChaosCoreDatabase(repoPath.trim(), "class");

      const nextClassOptions = classEntries
        .map<UnitReferenceOption>((entry) => ({
          id: entry.contentId,
          name: entry.title.trim() || entry.contentId,
          origin: entry.origin
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

      let nextGearOptions: UnitGearOption[] | null = null;
      if (includeGear) {
        const gearEntries = await listChaosCoreDatabase(repoPath.trim(), "gear");
        nextGearOptions = (
          await Promise.all(
            gearEntries.map(async (entry) => {
              try {
                const loaded = await loadChaosCoreDatabaseEntry(repoPath.trim(), "gear", entry.entryKey);
                const payload = getPreferredDatabasePayload(loaded);
                if (!payload) {
                  return null;
                }

                const parsed = JSON.parse(payload);
                if (!isGearPayload(parsed)) {
                  return null;
                }

                return {
                  id: entry.contentId,
                  name: parsed.name?.trim() || entry.title.trim() || entry.contentId,
                  origin: entry.origin,
                  slot: parsed.slot
                } satisfies UnitGearOption;
              } catch {
                return null;
              }
            })
          )
        )
          .filter((option): option is UnitGearOption => option !== null)
          .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
      }

      if (shouldCommit()) {
        setClassOptions(nextClassOptions);
        if (nextGearOptions) {
          setGearOptions(nextGearOptions);
        }
      }
    } catch {
      if (shouldCommit()) {
        setClassOptions([]);
        if (includeGear) {
          setGearOptions([]);
        }
      }
    }
  }, [desktopEnabled, repoPath]);

  useEffect(() => {
    let isCancelled = false;

    async function refreshSafely() {
      await refreshReferenceOptions(() => !isCancelled);
    }

    function handleChaosCoreUpdate(event: Event) {
      const update = event as CustomEvent<{ contentType?: string }>;
      if (update.detail?.contentType === "gear" || update.detail?.contentType === "class") {
        void refreshReferenceOptions(() => !isCancelled, false);
      }
    }

    function handleStorageUpdate(event: StorageEvent) {
      if (event.key !== CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY) {
        return;
      }

      const update = parseChaosCoreDatabaseUpdate(event.newValue);
      if (update?.contentType === "gear" || update?.contentType === "class") {
        void refreshReferenceOptions(() => !isCancelled, false);
      }
    }

    function handleFocus() {
      void refreshReferenceOptions(() => !isCancelled, false);
    }

    void refreshReferenceOptions(() => !isCancelled, false);

    if (typeof window !== "undefined") {
      window.addEventListener(CHAOS_CORE_DATABASE_UPDATE_EVENT, handleChaosCoreUpdate);
      window.addEventListener("storage", handleStorageUpdate);
      window.addEventListener("focus", handleFocus);
    }

    return () => {
      isCancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(CHAOS_CORE_DATABASE_UPDATE_EVENT, handleChaosCoreUpdate);
        window.removeEventListener("storage", handleStorageUpdate);
        window.removeEventListener("focus", handleFocus);
      }
    };
  }, [refreshReferenceOptions]);

  const gearOptionsBySlot = useMemo<Record<UnitGearSlot, UnitGearOption[]>>(
    () => ({
      weapon: gearOptions.filter((option) => option.slot === "weapon"),
      helmet: gearOptions.filter((option) => option.slot === "helmet"),
      chestpiece: gearOptions.filter((option) => option.slot === "chestpiece"),
      accessory: gearOptions.filter((option) => option.slot === "accessory")
    }),
    [gearOptions]
  );

  function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: UnitDocument) => void) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      const normalizedParsed = normalizeUnitDocument(parsed);
      if (!isUnitDocument(parsed)) {
        notify("That Chaos Core database entry does not match the Technica unit format.");
        return;
      }
      setDocument(touchUnit(normalizedParsed));
    } catch {
      notify("Could not load the selected unit from the Chaos Core database.");
    }
  }

  return (
    <StructuredDocumentStudio
      storageKey="technica.unit.document"
      exportTargetKey="technica.unit.exportTarget"
      draftType="unit"
      initialDocument={createSampleUnit()}
      createBlank={createBlankUnit}
      createSample={createSampleUnit}
      validate={(document) => validateUnitDocument(normalizeUnitDocument(document))}
      buildBundleForTarget={(document, target) => buildUnitBundleForTarget(normalizeUnitDocument(document), target)}
      getTitle={(document) => normalizeUnitDocument(document).name}
      isImportPayload={isUnitDocument}
      touchDocument={(document) => touchUnit(normalizeUnitDocument(document))}
      replacePrompt="Replace the current unit draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica unit draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => (
        <>
          {(() => {
            const unit = normalizeUnitDocument(document);
            const patchUnit = (updater: (current: UnitDocument) => UnitDocument) =>
              patchDocument((current) => updater(normalizeUnitDocument(current)));
            const selectedClass = classOptions.find((option) => option.id === unit.currentClassId) ?? null;
            const loadoutSelection = Object.fromEntries(
              (Object.keys(unit.loadout) as UnitLoadoutField[]).map((field) => {
                const slot = LOADOUT_SLOT_BY_FIELD[field];
                return [field, gearOptionsBySlot[slot].find((option) => option.id === unit.loadout[field]) ?? null];
              })
            ) as Record<UnitLoadoutField, UnitGearOption | null>;

            return (
          <Panel
            title="Unit Setup"
            subtitle="Create roster-ready unit templates with explicit class, stats, loadout, and staging flags."
            actions={
              <div className="toolbar">
                <button type="button" className="ghost-button" onClick={() => void refreshReferenceOptions()}>
                  Refresh class suggestions
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void refreshReferenceOptions(() => true, true)}
                >
                  Load gear suggestions
                </button>
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
                <span>Unit id</span>
                <input value={unit.id} onChange={(event) => patchUnit((current) => ({ ...current, id: event.target.value }))} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={unit.name} onChange={(event) => patchUnit((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Class id</span>
                <select
                  value={unit.currentClassId}
                  onChange={(event) => patchUnit((current) => ({ ...current, currentClassId: event.target.value }))}
                >
                  {!unit.currentClassId.trim() ? <option value="">Select class...</option> : null}
                  {unit.currentClassId.trim() && !selectedClass ? (
                    <option value={unit.currentClassId}>Custom ({unit.currentClassId})</option>
                  ) : null}
                  {classOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
                </select>
                <small className="muted">
                  {selectedClass
                    ? formatReferenceSummary(selectedClass)
                    : classOptions.length > 0
                      ? `${classOptions.length} class suggestion(s) from Chaos Core.`
                      : desktopEnabled && repoPath.trim()
                        ? "No class suggestions found in the current Chaos Core repo."
                        : "Set the Chaos Core repo path to pull class suggestions."}
                </small>
              </label>
              <label className="field">
                <span>PWR</span>
                <input
                  type="number"
                  value={unit.pwr}
                  onChange={(event) => patchUnit((current) => ({ ...current, pwr: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={unit.description}
                  onChange={(event) => patchUnit((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>

            <div className="subsection">
              <h4>Stat Profile</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Max HP</span>
                  <input
                    type="number"
                    value={unit.stats.maxHp}
                    onChange={(event) =>
                      patchUnit((current) => ({
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
                  <span>ATK</span>
                  <input
                    type="number"
                    value={unit.stats.atk}
                    onChange={(event) =>
                      patchUnit((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          atk: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>DEF</span>
                  <input
                    type="number"
                    value={unit.stats.def}
                    onChange={(event) =>
                      patchUnit((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          def: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>AGI</span>
                  <input
                    type="number"
                    value={unit.stats.agi}
                    onChange={(event) =>
                      patchUnit((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          agi: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>ACC</span>
                  <input
                    type="number"
                    value={unit.stats.acc}
                    onChange={(event) =>
                      patchUnit((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          acc: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Recruit cost</span>
                  <input
                    type="number"
                    value={unit.recruitCost}
                    onChange={(event) =>
                      patchUnit((current) => ({ ...current, recruitCost: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Traits</span>
                  <input
                    value={serializeCommaList(unit.traits)}
                    onChange={(event) =>
                      patchUnit((current) => ({
                        ...current,
                        traits: parseCommaList(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="subsection">
              <h4>Loadout & Staging</h4>
              <div className="form-grid">
                {(Object.keys(unit.loadout) as UnitLoadoutField[]).map((field) => {
                  const slot = LOADOUT_SLOT_BY_FIELD[field];
                  const options = gearOptionsBySlot[slot];
                  const selectedGear = loadoutSelection[field];

                  return (
                    <label key={field} className="field">
                      <span>{LOADOUT_LABEL_BY_FIELD[field]}</span>
                      <select
                        value={unit.loadout[field]}
                        onChange={(event) =>
                          patchUnit((current) => ({
                            ...current,
                            loadout: {
                              ...current.loadout,
                              [field]: event.target.value
                            }
                          }))
                        }
                      >
                        <option value="">None</option>
                        {unit.loadout[field].trim() && !selectedGear ? (
                          <option value={unit.loadout[field]}>Custom ({unit.loadout[field]})</option>
                        ) : null}
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ({option.id})
                          </option>
                        ))}
                      </select>
                      <small className="muted">
                        {selectedGear
                          ? formatReferenceSummary(selectedGear)
                          : options.length > 0
                            ? `${options.length} ${slot} option(s) from Chaos Core.`
                            : desktopEnabled && repoPath.trim()
                              ? `No ${slot} suggestions found in the current Chaos Core repo.`
                              : "Set the Chaos Core repo path to pull loadout suggestions."}
                      </small>
                    </label>
                  );
                })}
                <label className="field field-inline">
                  <span>Starting in roster</span>
                  <input
                    type="checkbox"
                    checked={unit.startingInRoster}
                    onChange={(event) =>
                      patchUnit((current) => ({ ...current, startingInRoster: event.target.checked }))
                    }
                  />
                </label>
                <label className="field field-inline">
                  <span>Deploy in party</span>
                  <input
                    type="checkbox"
                    checked={unit.deployInParty}
                    onChange={(event) =>
                      patchUnit((current) => ({ ...current, deployInParty: event.target.checked }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>Metadata</span>
                  <textarea
                    rows={4}
                    value={serializeKeyValueLines(unit.metadata)}
                    onChange={(event) =>
                      patchUnit((current) => ({
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
                <span className="pill">{unit.currentClassId}</span>
                <span className="pill">{unit.traits.length} trait(s)</span>
                <span className="pill accent">Chaos Core export</span>
              </div>
              <div className="toolbar">
                {isMobile ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void sendToDesktop()}
                    disabled={!canSendToDesktop || isSendingToDesktop}
                  >
                    {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                  </button>
                ) : (
                  <>
                    <button type="button" className="ghost-button" onClick={importDraft}>
                      Import draft
                    </button>
                    <button type="button" className="ghost-button" onClick={saveDraft}>
                      Save draft file
                    </button>
                    <button type="button" className="primary-button" onClick={() => void exportBundle()}>
                      Export bundle
                    </button>
                  </>
                )}
                </div>
              </div>
            </Panel>
            );
          })()}

            <ChaosCoreDatabasePanel
              contentType="unit"
              currentDocument={normalizeUnitDocument(document)}
              buildBundle={(current) => buildUnitBundleForTarget(normalizeUnitDocument(current), "chaos-core")}
              onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
              subtitle="Publish unit definitions into the Chaos Core repo and reopen those records here for balancing work."
            />
        </>
      )}
    />
  );
}
