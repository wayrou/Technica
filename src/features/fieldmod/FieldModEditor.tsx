import { EffectFlowComposer } from "../../components/EffectFlowComposer";
import { Panel } from "../../components/Panel";
import { createBlankFieldMod, createSampleFieldMod } from "../../data/sampleFieldMod";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import {
  fieldModRarities,
  fieldModScopes,
  fieldModStackModes,
  fieldModTriggers,
  type FieldModDocument,
} from "../../types/fieldmod";
import { isoNow } from "../../utils/date";
import { buildFieldModBundleForTarget } from "../../utils/exporters";
import { normalizeEffectFlowDocument, summarizeEffectFlow } from "../../utils/effectFlow";
import { openTechnicaPopout } from "../../utils/popout";
import { validateFieldModDocument } from "../../utils/contentValidation";
import { parseCommaList, serializeCommaList } from "../../utils/records";

function normalizeFieldMod(document: Partial<FieldModDocument> | null | undefined): FieldModDocument {
  const fallback = createBlankFieldMod();
  const candidate = document ?? {};

  return {
    ...fallback,
    ...candidate,
    trigger: fieldModTriggers.includes(candidate.trigger as FieldModDocument["trigger"])
      ? (candidate.trigger as FieldModDocument["trigger"])
      : fallback.trigger,
    scope: fieldModScopes.includes(candidate.scope as FieldModDocument["scope"])
      ? (candidate.scope as FieldModDocument["scope"])
      : fallback.scope,
    rarity: fieldModRarities.includes(candidate.rarity as FieldModDocument["rarity"])
      ? (candidate.rarity as FieldModDocument["rarity"])
      : fallback.rarity,
    stackMode: fieldModStackModes.includes(candidate.stackMode as FieldModDocument["stackMode"])
      ? (candidate.stackMode as FieldModDocument["stackMode"])
      : fallback.stackMode,
    effects: typeof candidate.effects === "string" ? candidate.effects : fallback.effects,
    chance: Number.isFinite(candidate.chance) ? Number(candidate.chance) : fallback.chance,
    maxStacks: Number.isFinite(candidate.maxStacks) ? Number(candidate.maxStacks) : fallback.maxStacks,
    cost: Number.isFinite(candidate.cost) ? Number(candidate.cost) : fallback.cost,
    unlockAfterOperationFloor: Number.isFinite(candidate.unlockAfterOperationFloor)
      ? Number(candidate.unlockAfterOperationFloor)
      : fallback.unlockAfterOperationFloor,
    requiredQuestIds: Array.from(new Set((candidate.requiredQuestIds ?? []).map(String).map((entry) => entry.trim()).filter(Boolean))),
    effectFlow: normalizeEffectFlowDocument(candidate.effectFlow),
  };
}

function touchFieldMod(document: FieldModDocument): FieldModDocument {
  return {
    ...normalizeFieldMod(document),
    updatedAt: isoNow(),
  };
}

function isFieldModDocument(value: unknown): value is FieldModDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "scope" in value);
}

export function FieldModEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.fieldmod.document"
      exportTargetKey="technica.fieldmod.exportTarget"
      draftType="fieldmod"
      initialDocument={createSampleFieldMod()}
      createBlank={createBlankFieldMod}
      createSample={createSampleFieldMod}
      validate={(document) => validateFieldModDocument(normalizeFieldMod(document))}
      buildBundleForTarget={(document, target) => buildFieldModBundleForTarget(normalizeFieldMod(document), target)}
      getTitle={(document) => normalizeFieldMod(document).name}
      isImportPayload={isFieldModDocument}
      touchDocument={touchFieldMod}
      replacePrompt="Replace the current field mod draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica field mod draft or export."
      renderWorkspace={({
        document,
        patchDocument,
        loadSample,
        clearDocument,
        importDraft,
        saveDraft,
        exportBundle,
        isMobile,
        canSendToDesktop,
        isSendingToDesktop,
        sendToDesktop,
      }) => {
        const normalizedDocument = normalizeFieldMod(document);
        const summaryLines =
          normalizedDocument.effectFlow.nodes.length > 0
            ? summarizeEffectFlow(normalizedDocument.effectFlow)
            : normalizedDocument.effects.trim()
              ? [
                  normalizedDocument.effects.trim(),
                  "Legacy effect text was preserved. Rebuild it in the flow composer to make it executable.",
                ]
              : summarizeEffectFlow(normalizedDocument.effectFlow);

        return (
          <div className="tool-suite-grid tool-suite-grid-dual">
            <div className="tool-suite-column">
              <Panel
                title="Field Mod Setup"
                subtitle="Define the proc envelope around the shared effect-flow graph."
                actions={
                  <div className="toolbar">
                    <button type="button" className="ghost-button" onClick={loadSample}>Load sample</button>
                    <button type="button" className="ghost-button" onClick={clearDocument}>Clear</button>
                  </div>
                }
              >
                <div className="form-grid">
                  <label className="field"><span>Field mod id</span><input value={normalizedDocument.id} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), id: event.target.value }))} /></label>
                  <label className="field"><span>Name</span><input value={normalizedDocument.name} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), name: event.target.value }))} /></label>
                  <label className="field"><span>Trigger</span><select value={normalizedDocument.trigger} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), trigger: event.target.value as FieldModDocument["trigger"] }))}>{fieldModTriggers.map((trigger) => <option key={trigger} value={trigger}>{trigger}</option>)}</select></label>
                  <label className="field"><span>Scope</span><select value={normalizedDocument.scope} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), scope: event.target.value as FieldModDocument["scope"] }))}>{fieldModScopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}</select></label>
                  <label className="field"><span>Rarity</span><select value={normalizedDocument.rarity} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), rarity: event.target.value as FieldModDocument["rarity"] }))}>{fieldModRarities.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}</select></label>
                  <label className="field"><span>Stack mode</span><select value={normalizedDocument.stackMode} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), stackMode: event.target.value as FieldModDocument["stackMode"] }))}>{fieldModStackModes.map((stackMode) => <option key={stackMode} value={stackMode}>{stackMode}</option>)}</select></label>
                  <label className="field"><span>Proc chance (0-1)</span><input type="number" min={0} max={1} step={0.05} value={normalizedDocument.chance} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), chance: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Max stacks</span><input type="number" min={1} value={normalizedDocument.maxStacks} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), maxStacks: Number(event.target.value || 1) }))} /></label>
                  <label className="field"><span>Cost</span><input type="number" min={0} value={normalizedDocument.cost} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), cost: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Unlock after operation floor</span><input type="number" min={0} value={normalizedDocument.unlockAfterOperationFloor} onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), unlockAfterOperationFloor: Number(event.target.value || 0) }))} /></label>
                  <label className="field full"><span>Require completed quests</span><input value={serializeCommaList(normalizedDocument.requiredQuestIds)} placeholder="quest_restore_signal_grid, quest_clear_foundry_gate" onChange={(event) => patchDocument((current) => ({ ...normalizeFieldMod(current), requiredQuestIds: parseCommaList(event.target.value) }))} /></label>
                </div>

                <div className="toolbar split">
                  <div className="chip-row">
                    <span className="pill">{normalizedDocument.trigger}</span>
                    <span className="pill">{normalizedDocument.scope}</span>
                    <span className="pill">{normalizedDocument.rarity}</span>
                    <span className="pill">{Math.round(normalizedDocument.chance * 100)}% proc</span>
                    <span className="pill">Max {normalizedDocument.maxStacks} stack(s)</span>
                    <span className="pill">{normalizedDocument.requiredQuestIds.length} quest gate(s)</span>
                    <span className="pill accent">Chaos Core export</span>
                  </div>
                  <div className="toolbar">
                    {isMobile ? (
                      <button type="button" className="primary-button" onClick={() => void sendToDesktop()} disabled={!canSendToDesktop || isSendingToDesktop}>
                        {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="ghost-button" onClick={importDraft}>Import draft</button>
                        <button type="button" className="ghost-button" onClick={saveDraft}>Save draft file</button>
                        <button type="button" className="primary-button" onClick={() => void exportBundle()}>Export bundle</button>
                      </>
                    )}
                  </div>
                </div>
              </Panel>

            </div>

            <div className="tool-suite-column tool-suite-column-narrow">
              <Panel title="Summary" subtitle="The generated player-facing readout is derived from the proc metadata plus your flow graph.">
                <div className="stack-list compact">
                  {summaryLines.map((line, index) => (
                    <p key={`${index}:${line}`} className="muted">{line}</p>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel
              title="Effect Flow Composer"
              subtitle="Build field-mod proc behavior with the same shared selector / condition / action system used by cards across the full workspace width."
              className="tool-suite-span-full effect-flow-panel"
              actions={<button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("fieldmod-flow", "Field Mod Effect Flow")}>Pop out</button>}
            >
              <EffectFlowComposer
                value={normalizedDocument.effectFlow}
                onChange={(effectFlow) => patchDocument((current) => ({ ...normalizeFieldMod(current), effectFlow }))}
                mode="fieldmod"
              />
            </Panel>
          </div>
        );
      }}
    />
  );
}
