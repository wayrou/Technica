import { CardFacePreview } from "../../components/CardFacePreview";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { EffectFlowComposer } from "../../components/EffectFlowComposer";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankCard, createSampleCard } from "../../data/sampleCard";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import {
  cardDocumentCategories,
  cardDocumentRarities,
  cardDocumentTargetTypes,
  cardDocumentTypes,
  type CardDocument,
} from "../../types/card";
import {
  createCardEffectFlowFromLegacyEffects,
  createLegacyCardEffectsFromFlow,
  normalizeCardDocument,
} from "../../utils/cardComposer";
import { isoNow } from "../../utils/date";
import { notify } from "../../utils/dialogs";
import { buildCardBundleForTarget } from "../../utils/exporters";
import { validateCardDocument } from "../../utils/contentValidation";
import { openTechnicaPopout } from "../../utils/popout";
import { parseKeyValueLines, serializeKeyValueLines } from "../../utils/records";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";

function touchCard(document: CardDocument): CardDocument {
  return { ...document, updatedAt: isoNow() };
}

function normalize(document: unknown) {
  return normalizeCardDocument(document, createBlankCard());
}

function isCardDocument(value: unknown): value is CardDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "cardType" in value && "targetType" in value);
}

function loadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry, setDocument: (document: CardDocument) => void) {
  try {
    const parsed = normalize(JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent));
    if (!isCardDocument(parsed)) {
      notify("That Chaos Core database entry does not match the Technica card format.");
      return;
    }
    setDocument(touchCard(parsed));
  } catch {
    notify("Could not load the selected card from the Chaos Core database.");
  }
}

export function CardEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.card.document"
      exportTargetKey="technica.card.exportTarget"
      draftType="card"
      initialDocument={createSampleCard()}
      createBlank={createBlankCard}
      createSample={createSampleCard}
      validate={(document) => validateCardDocument(normalize(document))}
      buildBundleForTarget={(document, target) => buildCardBundleForTarget(normalize(document), target)}
      getTitle={(document) => normalize(document).name}
      isImportPayload={isCardDocument}
      touchDocument={(document) => touchCard(normalize(document))}
      replacePrompt="Replace the current card draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica card draft or export."
      renderWorkspace={({ document, setDocument, patchDocument, loadSample, clearDocument, importDraft, saveDraft, exportBundle, isMobile, canSendToDesktop, isSendingToDesktop, sendToDesktop }) => {
        const card = normalize(document);
        const legacyEffects = createLegacyCardEffectsFromFlow(card.effectFlow);
        const patchCard = (updater: (current: CardDocument) => CardDocument) => patchDocument((current) => touchCard(normalize(updater(normalize(current)))));

        return (
          <div className="tool-suite-grid">
            <div className="tool-suite-column">
              <Panel
                title="Card Setup"
                subtitle="Define battle card identity, metadata, and the shared flow script Chaos Core will execute."
                actions={<div className="toolbar"><button type="button" className="ghost-button" onClick={loadSample}>Load sample</button><button type="button" className="ghost-button" onClick={clearDocument}>Clear</button></div>}
              >
                <div className="form-grid">
                  <label className="field"><span>Card id</span><input value={card.id} onChange={(event) => patchCard((current) => ({ ...current, id: event.target.value }))} /></label>
                  <label className="field"><span>Name</span><input value={card.name} onChange={(event) => patchCard((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label className="field full"><span>Description</span><textarea rows={4} value={card.description} onChange={(event) => patchCard((current) => ({ ...current, description: event.target.value }))} /></label>
                  <div className="field full"><ImageAssetField label="Card art" emptyLabel="No card art attached." hint="Exports as a stable asset file for Chaos Core imports." asset={card.artAsset} onChange={(artAsset) => patchCard((current) => ({ ...current, artAsset }))} /></div>
                  <label className="field"><span>Type</span><select value={card.cardType} onChange={(event) => patchCard((current) => ({ ...current, cardType: event.target.value as CardDocument["cardType"] }))}>{cardDocumentTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                  <label className="field"><span>Rarity</span><select value={card.rarity} onChange={(event) => patchCard((current) => ({ ...current, rarity: event.target.value as CardDocument["rarity"] }))}>{cardDocumentRarities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                  <label className="field"><span>Category</span><select value={card.category} onChange={(event) => patchCard((current) => ({ ...current, category: event.target.value as CardDocument["category"] }))}>{cardDocumentCategories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                  <label className="field"><span>Target</span><select value={card.targetType} onChange={(event) => patchCard((current) => ({ ...current, targetType: event.target.value as CardDocument["targetType"], effectFlow: card.effectFlow.nodes.length > 0 ? card.effectFlow : createCardEffectFlowFromLegacyEffects(card.effects, event.target.value as CardDocument["targetType"]) }))}>{cardDocumentTargetTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                  <label className="field"><span>Strain cost</span><input type="number" value={card.strainCost} onChange={(event) => patchCard((current) => ({ ...current, strainCost: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Range</span><input type="number" value={card.range} onChange={(event) => patchCard((current) => ({ ...current, range: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Base damage</span><input type="number" value={card.damage ?? ""} onChange={(event) => patchCard((current) => ({ ...current, damage: event.target.value === "" ? undefined : Number(event.target.value) }))} /></label>
                  <label className="field"><span>Source class id</span><input value={card.sourceClassId ?? ""} onChange={(event) => patchCard((current) => ({ ...current, sourceClassId: event.target.value || undefined }))} /></label>
                  <label className="field"><span>Source gear id</span><input value={card.sourceEquipmentId ?? ""} onChange={(event) => patchCard((current) => ({ ...current, sourceEquipmentId: event.target.value || undefined }))} /></label>
                  <label className="field full"><span>Metadata</span><textarea rows={5} value={serializeKeyValueLines(card.metadata)} onChange={(event) => patchCard((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))} /></label>
                </div>
                <div className="toolbar split">
                  <div className="chip-row"><span className="pill">{card.cardType}</span><span className="pill">{card.effectFlow.nodes.length} flow node(s)</span><span className="pill">{legacyEffects.length} legacy runtime effect(s)</span><span className="pill accent">Chaos Core export</span></div>
                  <div className="toolbar">
                    {isMobile ? <button type="button" className="primary-button" onClick={() => void sendToDesktop()} disabled={!canSendToDesktop || isSendingToDesktop}>{isSendingToDesktop ? "Sending..." : "Send to Desktop"}</button> : <><button type="button" className="ghost-button" onClick={importDraft}>Import draft</button><button type="button" className="ghost-button" onClick={saveDraft}>Save draft file</button><button type="button" className="primary-button" onClick={() => void exportBundle()}>Export bundle</button></>}
                  </div>
                </div>
              </Panel>

            </div>

            <div className="tool-suite-column tool-suite-column-narrow">
              <Panel title="Preview" subtitle="Live card face with the current authored effect text." actions={<button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("card-preview", "Card Preview")}>Pop out</button>}>
                <CardFacePreview document={card} />
              </Panel>
            </div>

            <div className="tool-suite-column">
              <ChaosCoreDatabasePanel
                contentType="card"
                currentDocument={card}
                buildBundle={(current) => buildCardBundleForTarget(normalize(current), "chaos-core")}
                onLoadEntry={(entry) => loadDatabaseEntry(entry, setDocument)}
                subtitle="Publish card runtime JSON and card art directly into the Chaos Core repo, then reload the live card database here."
              />
            </div>

            <Panel
              title="Effect Flow Composer"
              subtitle="Build card behavior as a deterministic DAG with selectors, conditions, and actions across the full workspace width."
              className="tool-suite-span-full effect-flow-panel"
              actions={<button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("card-flow", "Card Effect Flow")}>Pop out</button>}
            >
              <EffectFlowComposer
                value={card.effectFlow}
                onChange={(effectFlow) => patchCard((current) => ({ ...current, effectFlow }))}
                mode="card"
              />
            </Panel>
          </div>
        );
      }}
    />
  );
}
