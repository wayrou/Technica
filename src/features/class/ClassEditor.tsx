import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ClassTrainingGridBoard } from "../../components/ClassTrainingGridBoard";
import { Panel } from "../../components/Panel";
import { createBlankClass, createSampleClass } from "../../data/sampleClass";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { classUnlockConditionTypes, type ClassDocument, type ClassTrainingGridNodeDocument, type ClassUnlockConditionDocument } from "../../types/class";
import { supportedWeaponTypes } from "../../types/gear";
import { createDefaultTrainingGrid, createTrainingGridNode, normalizeTrainingGrid } from "../../utils/classTrainingGrid";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildClassBundleForTarget } from "../../utils/exporters";
import { validateClassDocument } from "../../utils/contentValidation";
import { openTechnicaPopout } from "../../utils/popout";
import { parseCommaList, parseKeyValueLines, serializeCommaList, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

type UnknownRecord = Record<string, unknown>;

function touchClass(document: ClassDocument): ClassDocument {
  return { ...document, updatedAt: isoNow() };
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

function normalizeClassDocument(value: unknown): ClassDocument {
  const fallback = createBlankClass();
  const record = toRecord(value);
  if (!record) {
    return fallback;
  }

  const baseStats = toRecord(record.baseStats);
  const metadata = toRecord(record.metadata);
  const partial = {
    name: readString(record.name, fallback.name),
    weaponTypes: Array.isArray(record.weaponTypes)
      ? record.weaponTypes.filter((entry): entry is ClassDocument["weaponTypes"][number] => typeof entry === "string")
      : fallback.weaponTypes,
    innateAbility: readString(record.innateAbility, fallback.innateAbility),
    tier: readNumber(record.tier, fallback.tier) as ClassDocument["tier"],
  };

  return {
    ...fallback,
    schemaVersion: readString(record.schemaVersion, fallback.schemaVersion),
    sourceApp: "Technica",
    id: readString(record.id, fallback.id),
    name: partial.name,
    description: readString(record.description, fallback.description),
    tier: partial.tier,
    baseStats: {
      maxHp: readNumber(baseStats?.maxHp, fallback.baseStats.maxHp),
      atk: readNumber(baseStats?.atk, fallback.baseStats.atk),
      def: readNumber(baseStats?.def, fallback.baseStats.def),
      agi: readNumber(baseStats?.agi, fallback.baseStats.agi),
      acc: readNumber(baseStats?.acc, fallback.baseStats.acc),
    },
    weaponTypes: partial.weaponTypes,
    unlockConditions: Array.isArray(record.unlockConditions)
      ? record.unlockConditions
          .map((entry) => toRecord(entry))
          .filter((entry): entry is UnknownRecord => entry !== null)
          .map((entry) => ({
            type: (readString(entry.type, "milestone") as ClassUnlockConditionDocument["type"]),
            requiredClassId: typeof entry.requiredClassId === "string" && entry.requiredClassId.trim() ? entry.requiredClassId : undefined,
            requiredRank: typeof entry.requiredRank === "number" ? entry.requiredRank : undefined,
            description: typeof entry.description === "string" && entry.description.trim() ? entry.description : undefined,
          }))
      : fallback.unlockConditions,
    innateAbility: partial.innateAbility,
    trainingGrid: normalizeTrainingGrid(record.trainingGrid, createDefaultTrainingGrid(partial)),
    metadata: metadata ? Object.fromEntries(Object.entries(metadata).map(([key, entry]) => [key, String(entry)])) : fallback.metadata,
    createdAt: readString(record.createdAt, fallback.createdAt),
    updatedAt: readString(record.updatedAt, fallback.updatedAt),
  };
}

function isClassDocument(value: unknown): value is ClassDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "tier" in value && "weaponTypes" in value && "unlockConditions" in value);
}

function createUnlockCondition(): ClassUnlockConditionDocument {
  return { type: "milestone", description: "Describe the unlock gate" };
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: ClassDocument) => void) {
  try {
    const parsed = normalizeClassDocument(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isClassDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica class format.");
      return;
    }
    setDocument(touchClass(parsed));
  } catch {
    notify("Could not load the selected class from the Chaos Core database.");
  }
}

function patchGridNode(
  nodeId: string,
  updater: (node: ClassTrainingGridNodeDocument) => ClassTrainingGridNodeDocument,
  patchClass: (updater: (current: ClassDocument) => ClassDocument) => void,
) {
  patchClass((current) => ({
    ...current,
    trainingGrid: current.trainingGrid.map((node) => (node.id === nodeId ? updater(node) : node)),
  }));
}

export function ClassEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.class.document"
      exportTargetKey="technica.class.exportTarget"
      draftType="class"
      initialDocument={createSampleClass()}
      createBlank={createBlankClass}
      createSample={createSampleClass}
      validate={(document) => validateClassDocument(normalizeClassDocument(document))}
      buildBundleForTarget={(document, target) => buildClassBundleForTarget(normalizeClassDocument(document), target)}
      getTitle={(document) => normalizeClassDocument(document).name}
      isImportPayload={isClassDocument}
      touchDocument={(document) => touchClass(normalizeClassDocument(document))}
      replacePrompt="Replace the current class draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica class draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => {
        const classDocument = normalizeClassDocument(document);
        const patchClass = (updater: (current: ClassDocument) => ClassDocument) => patchDocument((current) => touchClass(normalizeClassDocument(updater(normalizeClassDocument(current)))));

        return (
          <div className="tool-suite-grid">
            <div className="tool-suite-column">
              <Panel
                title="Class Setup"
                subtitle="Author new class definitions that drop directly into Chaos Core class management."
                actions={<div className="toolbar"><button type="button" className="ghost-button" onClick={loadSample}>Load sample</button><button type="button" className="ghost-button" onClick={clearDocument}>Clear</button></div>}
              >
                <div className="form-grid">
                  <label className="field"><span>Class id</span><input value={classDocument.id} onChange={(event) => patchClass((current) => ({ ...current, id: event.target.value }))} /></label>
                  <label className="field"><span>Name</span><input value={classDocument.name} onChange={(event) => patchClass((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label className="field full"><span>Description</span><textarea rows={4} value={classDocument.description} onChange={(event) => patchClass((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label className="field"><span>Tier</span><select value={classDocument.tier} onChange={(event) => patchClass((current) => ({ ...current, tier: Number(event.target.value) as ClassDocument["tier"] }))}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
                  <label className="field"><span>Weapon types</span><input list="technica-weapon-types" value={serializeCommaList(classDocument.weaponTypes)} onChange={(event) => patchClass((current) => ({ ...current, weaponTypes: parseCommaList(event.target.value) as ClassDocument["weaponTypes"] }))} /></label>
                  <label className="field full"><span>Innate ability</span><input value={classDocument.innateAbility} onChange={(event) => patchClass((current) => ({ ...current, innateAbility: event.target.value }))} /></label>
                </div>

                <div className="subsection">
                  <h4>Base Stats</h4>
                  <div className="form-grid">
                    <label className="field"><span>Max HP</span><input type="number" value={classDocument.baseStats.maxHp} onChange={(event) => patchClass((current) => ({ ...current, baseStats: { ...current.baseStats, maxHp: Number(event.target.value || 0) } }))} /></label>
                    <label className="field"><span>ATK</span><input type="number" value={classDocument.baseStats.atk} onChange={(event) => patchClass((current) => ({ ...current, baseStats: { ...current.baseStats, atk: Number(event.target.value || 0) } }))} /></label>
                    <label className="field"><span>DEF</span><input type="number" value={classDocument.baseStats.def} onChange={(event) => patchClass((current) => ({ ...current, baseStats: { ...current.baseStats, def: Number(event.target.value || 0) } }))} /></label>
                    <label className="field"><span>AGI</span><input type="number" value={classDocument.baseStats.agi} onChange={(event) => patchClass((current) => ({ ...current, baseStats: { ...current.baseStats, agi: Number(event.target.value || 0) } }))} /></label>
                    <label className="field"><span>ACC</span><input type="number" value={classDocument.baseStats.acc} onChange={(event) => patchClass((current) => ({ ...current, baseStats: { ...current.baseStats, acc: Number(event.target.value || 0) } }))} /></label>
                    <label className="field full"><span>Metadata</span><textarea rows={4} value={serializeKeyValueLines(classDocument.metadata)} onChange={(event) => patchClass((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))} /></label>
                  </div>
                </div>

                <div className="toolbar split">
                  <div className="chip-row"><span className="pill">Tier {classDocument.tier}</span><span className="pill">{classDocument.trainingGrid.length} grid node(s)</span><span className="pill accent">Chaos Core export</span></div>
                  <div className="toolbar">
                    {isMobile ? <button type="button" className="primary-button" onClick={() => void sendToDesktop()} disabled={!canSendToDesktop || isSendingToDesktop}>{isSendingToDesktop ? "Sending..." : "Send to Desktop"}</button> : <><button type="button" className="ghost-button" onClick={importDraft}>Import draft</button><button type="button" className="ghost-button" onClick={saveDraft}>Save draft file</button><button type="button" className="primary-button" onClick={() => void exportBundle()}>Export bundle</button></>}
                  </div>
                </div>
              </Panel>

              <Panel
                title="Training Grid"
                subtitle="Author the exact class-training nodes Chaos Core should show in the class management grid."
                actions={<div className="toolbar"><button type="button" className="ghost-button" onClick={() => patchClass((current) => ({ ...current, trainingGrid: [...current.trainingGrid, createTrainingGridNode({ row: 1, col: current.trainingGrid.length + 1 })] }))}>Add node</button><button type="button" className="ghost-button" onClick={() => patchClass((current) => ({ ...current, trainingGrid: createDefaultTrainingGrid(current) }))}>Reset default grid</button></div>}
              >
                <div className="stack-list">
                  {classDocument.trainingGrid.map((node) => (
                    <article key={node.id} className="item-card">
                      <div className="item-card-header">
                        <h3>{node.name || node.id}</h3>
                        <button type="button" className="ghost-button danger" onClick={() => patchClass((current) => ({ ...current, trainingGrid: current.trainingGrid.filter((entry) => entry.id !== node.id) }))}>Remove</button>
                      </div>
                      <div className="form-grid">
                        <label className="field"><span>Node id</span><input value={node.id} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, id: event.target.value }), patchClass)} /></label>
                        <label className="field"><span>Name</span><input value={node.name} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, name: event.target.value }), patchClass)} /></label>
                        <label className="field"><span>Cost</span><input type="number" value={node.cost} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, cost: Number(event.target.value || 0) }), patchClass)} /></label>
                        <label className="field"><span>Row</span><input type="number" value={node.row} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, row: Number(event.target.value || 1) }), patchClass)} /></label>
                        <label className="field"><span>Column</span><input type="number" value={node.col} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, col: Number(event.target.value || 1) }), patchClass)} /></label>
                        <label className="field"><span>Requires</span><input value={serializeCommaList(node.requires ?? [])} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, requires: parseCommaList(event.target.value) }), patchClass)} /></label>
                        <label className="field full"><span>Description</span><textarea rows={3} value={node.description} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, description: event.target.value }), patchClass)} /></label>
                        <label className="field full"><span>Benefit</span><input value={node.benefit ?? ""} onChange={(event) => patchGridNode(node.id, (current) => ({ ...current, benefit: event.target.value || undefined }), patchClass)} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Unlock Conditions"
                subtitle="Keep rank gates and milestone descriptors explicit so Chaos Core can surface them in the class directory."
                actions={<button type="button" className="ghost-button" onClick={() => patchClass((current) => ({ ...current, unlockConditions: [...current.unlockConditions, createUnlockCondition()] }))}>Add condition</button>}
              >
                <div className="stack-list">
                  {classDocument.unlockConditions.map((condition, index) => (
                    <article key={`${condition.type}-${index}`} className="item-card">
                      <div className="item-card-header">
                        <h3>{condition.type}</h3>
                        <button type="button" className="ghost-button danger" onClick={() => patchClass((current) => ({ ...current, unlockConditions: current.unlockConditions.filter((_, conditionIndex) => conditionIndex !== index) }))}>Remove</button>
                      </div>
                      <div className="form-grid">
                        <label className="field"><span>Type</span><select value={condition.type} onChange={(event) => patchClass((current) => ({ ...current, unlockConditions: current.unlockConditions.map((entry, conditionIndex) => conditionIndex === index ? { ...entry, type: event.target.value as ClassUnlockConditionDocument["type"] } : entry) }))}>{classUnlockConditionTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                        <label className="field"><span>Required class id</span><input value={condition.requiredClassId ?? ""} onChange={(event) => patchClass((current) => ({ ...current, unlockConditions: current.unlockConditions.map((entry, conditionIndex) => conditionIndex === index ? { ...entry, requiredClassId: event.target.value || undefined } : entry) }))} /></label>
                        <label className="field"><span>Required rank</span><input type="number" value={condition.requiredRank ?? ""} onChange={(event) => patchClass((current) => ({ ...current, unlockConditions: current.unlockConditions.map((entry, conditionIndex) => conditionIndex === index ? { ...entry, requiredRank: event.target.value === "" ? undefined : Number(event.target.value) } : entry) }))} /></label>
                        <label className="field full"><span>Description</span><textarea rows={3} value={condition.description ?? ""} onChange={(event) => patchClass((current) => ({ ...current, unlockConditions: current.unlockConditions.map((entry, conditionIndex) => conditionIndex === index ? { ...entry, description: event.target.value || undefined } : entry) }))} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="tool-suite-column tool-suite-column-narrow">
              <Panel title="Training Grid Preview" subtitle="Live board preview for the current class draft." actions={<button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("class-preview", "Class Preview")}>Pop out</button>}>
                <ClassTrainingGridBoard nodes={classDocument.trainingGrid} title={classDocument.name || "Untitled Class"} />
              </Panel>
              <Panel title="Preview Notes" subtitle="What will flow into Chaos Core when this class is published.">
                <div className="chip-row">
                  {classDocument.weaponTypes.map((weaponType) => <span key={weaponType} className="pill">{weaponType}</span>)}
                </div>
                <pre className="json-preview">{JSON.stringify(classDocument.trainingGrid, null, 2)}</pre>
              </Panel>
            </div>

            <div className="tool-suite-column">
              <ChaosCoreDatabasePanel
                contentType="class"
                currentDocument={classDocument}
                buildBundle={(current) => buildClassBundleForTarget(normalizeClassDocument(current), "chaos-core")}
                onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
                subtitle="Publish class definitions into the Chaos Core repo and reopen those database records here for revision."
              />
            </div>

            <datalist id="technica-weapon-types">
              {supportedWeaponTypes.map((weaponType) => (
                <option key={weaponType} value={weaponType} />
              ))}
            </datalist>
          </div>
        );
      }}
    />
  );
}
