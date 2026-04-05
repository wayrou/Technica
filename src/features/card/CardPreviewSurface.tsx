import { Panel } from "../../components/Panel";
import { CardFacePreview } from "../../components/CardFacePreview";
import { createBlankCard } from "../../data/sampleCard";
import { usePersistentState } from "../../hooks/usePersistentState";
import { normalizeCardDocument } from "../../utils/cardComposer";

export function CardPreviewSurface() {
  const [storedDocument] = usePersistentState("technica.card.document", createBlankCard());
  const document = normalizeCardDocument(storedDocument, createBlankCard());

  return (
    <Panel
      title="Card Preview"
      subtitle="Detached live preview of the current card draft and its compiled effect script."
    >
      <CardFacePreview document={document} />
    </Panel>
  );
}
