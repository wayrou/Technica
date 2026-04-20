import { ImageAssetField } from "../../components/ImageAssetField";
import { MerchantListingFields } from "../../components/MerchantListingFields";
import { Panel } from "../../components/Panel";
import { createBlankDecoration, createSampleDecoration } from "../../data/sampleDecoration";
import type { DecorationDocument } from "../../types/decoration";
import { normalizeMerchantListingDocument } from "../../types/merchant";
import { StructuredDocumentStudio } from "../content/StructuredDocumentStudio";
import { isoNow } from "../../utils/date";
import { buildDecorationBundleForTarget } from "../../utils/exporters";
import { validateDecorationDocument } from "../../utils/contentValidation";
import { parseCommaList, serializeCommaList } from "../../utils/records";

function normalizeDecoration(document: Partial<DecorationDocument> | null | undefined): DecorationDocument {
  const fallback = createBlankDecoration();
  const candidate = document ?? {};

  return {
    ...fallback,
    ...candidate,
    tileSize: Number.isFinite(candidate.tileSize) ? Number(candidate.tileSize) : fallback.tileSize,
    merchant: normalizeMerchantListingDocument(candidate.merchant, fallback.merchant),
    requiredQuestIds: Array.from(new Set((candidate.requiredQuestIds ?? []).map(String).map((entry) => entry.trim()).filter(Boolean)))
  };
}

function touchDecoration(document: DecorationDocument): DecorationDocument {
  return {
    ...normalizeDecoration(document),
    updatedAt: isoNow()
  };
}

function isDecorationDocument(value: unknown): value is DecorationDocument {
  return Boolean(value && typeof value === "object" && "id" in value && "tileSize" in value);
}

export function DecorationEditor() {
  return (
    <StructuredDocumentStudio
      storageKey="technica.decoration.document"
      exportTargetKey="technica.decoration.exportTarget"
      draftType="decoration"
      initialDocument={createSampleDecoration()}
      createBlank={createBlankDecoration}
      createSample={createSampleDecoration}
      validate={(document) => validateDecorationDocument(normalizeDecoration(document))}
      buildBundleForTarget={(document, target) => buildDecorationBundleForTarget(normalizeDecoration(document), target)}
      getTitle={(document) => normalizeDecoration(document).name}
      isImportPayload={isDecorationDocument}
      touchDocument={touchDecoration}
      replacePrompt="Replace the current decoration draft with the imported file?"
      invalidImportMessage="That file does not look like a Technica decoration draft or export."
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
        sendToDesktop
      }) => {
        const decoration = normalizeDecoration(document);

        return (
          <Panel
            title="Decorations Editor"
            subtitle="Author placeable HAVEN decoration assets with sprite art and tile footprint sizing."
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
                <span>Decoration id</span>
                <input
                  value={decoration.id}
                  onChange={(event) => patchDocument((current) => ({ ...normalizeDecoration(current), id: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={decoration.name}
                  onChange={(event) => patchDocument((current) => ({ ...normalizeDecoration(current), name: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Tile size</span>
                <input
                  type="number"
                  min={1}
                  value={decoration.tileSize}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...normalizeDecoration(current),
                      tileSize: Number(event.target.value || 1)
                    }))
                  }
                />
              </label>
              <label className="field full">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={decoration.description}
                  onChange={(event) =>
                    patchDocument((current) => ({ ...normalizeDecoration(current), description: event.target.value }))
                  }
                />
              </label>
              <label className="field full">
                <span>Require completed quests</span>
                <input
                  value={serializeCommaList(decoration.requiredQuestIds)}
                  placeholder="quest_restore_signal_grid, quest_clear_foundry_gate"
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...normalizeDecoration(current),
                      requiredQuestIds: parseCommaList(event.target.value)
                    }))
                  }
                />
              </label>
              <div className="field full">
                <ImageAssetField
                  label="Sprite"
                  emptyLabel="No decoration sprite attached."
                  hint="This sprite will be used by the upcoming HAVEN field-map build mode."
                  asset={decoration.spriteAsset}
                  onChange={(spriteAsset) => patchDocument((current) => ({ ...normalizeDecoration(current), spriteAsset }))}
                />
              </div>
            </div>

            <MerchantListingFields
              value={decoration.merchant}
              onChange={(merchant) => patchDocument((current) => ({ ...normalizeDecoration(current), merchant }))}
            />

            <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{decoration.tileSize} tile footprint</span>
              <span className="pill">{decoration.requiredQuestIds.length} quest gate(s)</span>
              <span className="pill accent">Decoration export</span>
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
      }}
    />
  );
}
