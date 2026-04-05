import { CardFacePreview } from "../../components/CardFacePreview";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { ImageAssetField } from "../../components/ImageAssetField";
import { Panel } from "../../components/Panel";
import { createBlankCard, createSampleCard } from "../../data/sampleCard";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import {
  cardDocumentCategories,
  cardDocumentRarities,
  cardDocumentTargetTypes,
  cardDocumentTypes,
  cardEffectBlockActions,
  type CardDocument,
  type CardEffectBlockDocument,
} from "../../types/card";
import { compileCardEffectBlocks, createCardEffectBlock, createCardEffectScript, normalizeCardDocument } from "../../utils/cardComposer";
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
  return Boolean(value && typeof value === "object" && "id" in value && "cardType" in value && "effects" in value && "targetType" in value);
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

function updateBlock(
  blockId: string,
  updater: (block: CardEffectBlockDocument) => CardEffectBlockDocument,
  patchCard: (updater: (current: CardDocument) => CardDocument) => void,
) {
  patchCard((current) => ({
    ...current,
    effectBlocks: current.effectBlocks.map((block) => (block.id === blockId ? updater(block) : block)),
  }));
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
        const compiledEffects = card.effectComposerMode === "blocks" ? compileCardEffectBlocks(card.effectBlocks) : card.effects;
        const scriptLines = createCardEffectScript(card.effectBlocks);
        const patchCard = (updater: (current: CardDocument) => CardDocument) => patchDocument((current) => touchCard(normalize(updater(normalize(current)))));

        return (
          <div className="tool-suite-grid">
            <div className="tool-suite-column">
              <Panel
                title="Card Setup"
                subtitle="Define battle card runtime behavior plus the library metadata Chaos Core needs for display and drops."
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
                  <label className="field"><span>Target</span><select value={card.targetType} onChange={(event) => patchCard((current) => ({ ...current, targetType: event.target.value as CardDocument["targetType"] }))}>{cardDocumentTargetTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                  <label className="field"><span>Strain cost</span><input type="number" value={card.strainCost} onChange={(event) => patchCard((current) => ({ ...current, strainCost: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Range</span><input type="number" value={card.range} onChange={(event) => patchCard((current) => ({ ...current, range: Number(event.target.value || 0) }))} /></label>
                  <label className="field"><span>Damage</span><input type="number" value={card.damage ?? ""} onChange={(event) => patchCard((current) => ({ ...current, damage: event.target.value === "" ? undefined : Number(event.target.value) }))} /></label>
                  <label className="field"><span>Source class id</span><input value={card.sourceClassId ?? ""} onChange={(event) => patchCard((current) => ({ ...current, sourceClassId: event.target.value || undefined }))} /></label>
                  <label className="field"><span>Source gear id</span><input value={card.sourceEquipmentId ?? ""} onChange={(event) => patchCard((current) => ({ ...current, sourceEquipmentId: event.target.value || undefined }))} /></label>
                  <label className="field full"><span>Composer mode</span><select value={card.effectComposerMode} onChange={(event) => patchCard((current) => ({ ...current, effectComposerMode: event.target.value as CardDocument["effectComposerMode"] }))}><option value="blocks">Visual blocks</option><option value="manual">Manual runtime effects</option></select></label>
                  <label className="field full"><span>Metadata</span><textarea rows={5} value={serializeKeyValueLines(card.metadata)} onChange={(event) => patchCard((current) => ({ ...current, metadata: parseKeyValueLines(event.target.value) }))} /></label>
                </div>
                <div className="toolbar split">
                  <div className="chip-row"><span className="pill">{card.cardType}</span><span className="pill">{compiledEffects.length} runtime effect(s)</span><span className="pill accent">Chaos Core export</span></div>
                  <div className="toolbar">
                    {isMobile ? <button type="button" className="primary-button" onClick={() => void sendToDesktop()} disabled={!canSendToDesktop || isSendingToDesktop}>{isSendingToDesktop ? "Sending..." : "Send to Desktop"}</button> : <><button type="button" className="ghost-button" onClick={importDraft}>Import draft</button><button type="button" className="ghost-button" onClick={saveDraft}>Save draft file</button><button type="button" className="primary-button" onClick={() => void exportBundle()}>Export bundle</button></>}
                  </div>
                </div>
              </Panel>

              <Panel
                title="Effect Composer"
                subtitle="Author card behavior as ordered blocks, then compile them straight into Chaos Core runtime effects."
                actions={<button type="button" className="ghost-button" onClick={() => patchCard((current) => ({ ...current, effectBlocks: [...current.effectBlocks, createCardEffectBlock({ action: "damage", amount: 4 })], effectComposerMode: "blocks" }))}>Add block</button>}
              >
                {card.effectComposerMode === "blocks" ? (
                  <div className="stack-list">
                    {card.effectBlocks.length === 0 ? <div className="empty-state compact">No effect blocks yet.</div> : null}
                    {card.effectBlocks.map((block, index) => (
                      <article key={block.id} className="item-card effect-block-card">
                        <div className="item-card-header">
                          <h3>Block {index + 1}</h3>
                          <div className="toolbar">
                            <button type="button" className="ghost-button danger" onClick={() => patchCard((current) => ({ ...current, effectBlocks: current.effectBlocks.filter((entry) => entry.id !== block.id) }))}>Remove</button>
                          </div>
                        </div>
                        <div className="form-grid">
                          <label className="field"><span>Action</span><select value={block.action} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, action: event.target.value as CardEffectBlockDocument["action"] }), patchCard)}>{cardEffectBlockActions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
                          <label className="field"><span>Amount</span><input type="number" value={block.amount ?? ""} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, amount: event.target.value === "" ? undefined : Number(event.target.value) }), patchCard)} /></label>
                          <label className="field"><span>Duration</span><input type="number" value={block.duration ?? ""} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, duration: event.target.value === "" ? undefined : Number(event.target.value) }), patchCard)} /></label>
                          <label className="field"><span>Tiles</span><input type="number" value={block.tiles ?? ""} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, tiles: event.target.value === "" ? undefined : Number(event.target.value) }), patchCard)} /></label>
                          <label className="field"><span>Stat</span><input value={block.stat ?? ""} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, stat: event.target.value || undefined }), patchCard)} /></label>
                          <label className="field full"><span>Condition</span><input value={block.condition ?? ""} placeholder="Optional designer rule note" onChange={(event) => updateBlock(block.id, (current) => ({ ...current, condition: event.target.value || undefined }), patchCard)} /></label>
                          <label className="field full"><span>Note</span><input value={block.note ?? ""} placeholder="Optional design note" onChange={(event) => updateBlock(block.id, (current) => ({ ...current, note: event.target.value || undefined }), patchCard)} /></label>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="stack-list">
                    {card.effects.length === 0 ? <div className="empty-state compact">No manual effects yet.</div> : null}
                    {card.effects.map((effect, index) => (
                      <article key={`${effect.type}-${index}`} className="item-card">
                        <div className="item-card-header">
                          <h3>{effect.type || `Effect ${index + 1}`}</h3>
                          <button type="button" className="ghost-button danger" onClick={() => patchCard((current) => ({ ...current, effects: current.effects.filter((_, effectIndex) => effectIndex !== index) }))}>Remove</button>
                        </div>
                        <div className="form-grid">
                          <label className="field"><span>Type</span><input value={effect.type} onChange={(event) => patchCard((current) => ({ ...current, effects: current.effects.map((entry, effectIndex) => effectIndex === index ? { ...entry, type: event.target.value } : entry) }))} /></label>
                          <label className="field"><span>Amount</span><input type="number" value={effect.amount ?? ""} onChange={(event) => patchCard((current) => ({ ...current, effects: current.effects.map((entry, effectIndex) => effectIndex === index ? { ...entry, amount: event.target.value === "" ? undefined : Number(event.target.value) } : entry) }))} /></label>
                          <label className="field"><span>Duration</span><input type="number" value={effect.duration ?? ""} onChange={(event) => patchCard((current) => ({ ...current, effects: current.effects.map((entry, effectIndex) => effectIndex === index ? { ...entry, duration: event.target.value === "" ? undefined : Number(event.target.value) } : entry) }))} /></label>
                          <label className="field"><span>Stat</span><input value={effect.stat ?? ""} onChange={(event) => patchCard((current) => ({ ...current, effects: current.effects.map((entry, effectIndex) => effectIndex === index ? { ...entry, stat: event.target.value || undefined } : entry) }))} /></label>
                          <label className="field"><span>Tiles</span><input type="number" value={effect.tiles ?? ""} onChange={(event) => patchCard((current) => ({ ...current, effects: current.effects.map((entry, effectIndex) => effectIndex === index ? { ...entry, tiles: event.target.value === "" ? undefined : Number(event.target.value) } : entry) }))} /></label>
                        </div>
                      </article>
                    ))}
                    <button type="button" className="ghost-button" onClick={() => patchCard((current) => ({ ...current, effects: [...current.effects, { type: "damage", amount: 4 }] }))}>Add manual effect</button>
                  </div>
                )}
              </Panel>
            </div>

            <div className="tool-suite-column tool-suite-column-narrow">
              <Panel title="Preview" subtitle="Live card face and block-script view." actions={<button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("card-preview", "Card Preview")}>Pop out</button>}>
                <CardFacePreview document={card} />
              </Panel>
              <Panel title="Compiled Runtime" subtitle="This is the effect payload Chaos Core will ingest from the current draft."><pre className="json-preview">{JSON.stringify(compiledEffects, null, 2)}</pre></Panel>
              <Panel title="Block Script"><pre className="json-preview">{scriptLines.join("\n")}</pre></Panel>
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
          </div>
        );
      }}
    />
  );
}
