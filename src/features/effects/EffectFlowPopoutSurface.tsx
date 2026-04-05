import { EffectFlowComposer } from "../../components/EffectFlowComposer";
import { Panel } from "../../components/Panel";
import { createBlankCard } from "../../data/sampleCard";
import { createBlankFieldMod } from "../../data/sampleFieldMod";
import { usePersistentState } from "../../hooks/usePersistentState";
import {
  fieldModRarities,
  fieldModScopes,
  fieldModStackModes,
  fieldModTriggers,
  type FieldModDocument,
} from "../../types/fieldmod";
import { normalizeCardDocument } from "../../utils/cardComposer";
import { normalizeEffectFlowDocument } from "../../utils/effectFlow";

type EffectFlowPopoutMode = "card" | "fieldmod";

function normalizeFieldModDraft(document: Partial<FieldModDocument> | null | undefined): FieldModDocument {
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
    effectFlow: normalizeEffectFlowDocument(candidate.effectFlow),
  };
}

export function EffectFlowPopoutSurface({ mode }: { mode: EffectFlowPopoutMode }) {
  if (mode === "card") {
    return <CardEffectFlowPopoutSurface />;
  }

  return <FieldModEffectFlowPopoutSurface />;
}

function CardEffectFlowPopoutSurface() {
  const fallback = createBlankCard();
  const [storedDocument, setStoredDocument] = usePersistentState("technica.card.document", fallback);
  const document = normalizeCardDocument(storedDocument, fallback);

  return (
    <Panel
      title="Card Effect Flow"
      subtitle="Detached full-width editor for the current card draft's flow graph."
      className="effect-flow-popout-panel"
    >
      <EffectFlowComposer
        value={document.effectFlow}
        onChange={(effectFlow) =>
          setStoredDocument((current) => ({
            ...normalizeCardDocument(current, fallback),
            effectFlow,
          }))
        }
        mode="card"
      />
    </Panel>
  );
}

function FieldModEffectFlowPopoutSurface() {
  const fallback = createBlankFieldMod();
  const [storedDocument, setStoredDocument] = usePersistentState("technica.fieldmod.document", fallback);
  const document = normalizeFieldModDraft(storedDocument);

  return (
    <Panel
      title="Field Mod Effect Flow"
      subtitle="Detached full-width editor for the current field mod draft's flow graph."
      className="effect-flow-popout-panel"
    >
      <EffectFlowComposer
        value={document.effectFlow}
        onChange={(effectFlow) =>
          setStoredDocument((current) => ({
            ...normalizeFieldModDraft(current),
            effectFlow,
          }))
        }
        mode="fieldmod"
      />
    </Panel>
  );
}
