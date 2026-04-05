import type { CardDocument } from "../types/card";
import { compileCardEffectBlocks, createCardEffectScript, normalizeCardDocument } from "../utils/cardComposer";

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTurns(duration?: number) {
  if (!duration || duration <= 0) {
    return "";
  }

  return duration === 1 ? " for 1 turn" : ` for ${duration} turns`;
}

function formatEffectLine(effect: CardDocument["effects"][number]) {
  const effectType = effect.type.trim().toLowerCase();

  switch (effectType) {
    case "damage":
      return `Deal ${effect.amount ?? 0} damage.`;
    case "heal":
      return `Restore ${effect.amount ?? 0} HP.`;
    case "def_up":
      return `Gain +${effect.amount ?? 0} DEF${formatTurns(effect.duration)}.`;
    case "atk_up":
      return `Gain +${effect.amount ?? 0} ATK${formatTurns(effect.duration)}.`;
    case "agi_up":
      return `Gain +${effect.amount ?? 0} AGI${formatTurns(effect.duration)}.`;
    case "acc_up":
      return `Gain +${effect.amount ?? 0} ACC${formatTurns(effect.duration)}.`;
    case "push":
      return `Push ${effect.tiles ?? effect.amount ?? 1} tile${(effect.tiles ?? effect.amount ?? 1) === 1 ? "" : "s"}.`;
    case "move":
      return `Move ${effect.tiles ?? effect.amount ?? 1} tile${(effect.tiles ?? effect.amount ?? 1) === 1 ? "" : "s"}.`;
    case "stun":
      return `Stun${formatTurns(effect.duration || 1)}.`;
    case "burn":
      return effect.amount
        ? `Inflict Burn for ${effect.amount} damage${formatTurns(effect.duration)}.`
        : `Inflict Burn${formatTurns(effect.duration)}.`;
    case "end_turn":
      return "End the target's turn.";
    case "set_flag":
      return "Set a scenario flag.";
    default:
      return humanizeToken(effect.type);
  }
}

function getCategoryBadge(category: string) {
  switch (category.toLowerCase()) {
    case "attack":
      return "ATK";
    case "defense":
      return "DEF";
    case "utility":
      return "UTL";
    case "mobility":
      return "MOV";
    case "buff":
      return "BUF";
    case "debuff":
      return "DEB";
    case "steam":
      return "STM";
    case "chaos":
      return "CHS";
    default:
      return "CRD";
  }
}

export function CardFacePreview({ document }: { document: CardDocument }) {
  const normalized = normalizeCardDocument(document, document);
  const compiledEffects =
    normalized.effectComposerMode === "blocks"
      ? compileCardEffectBlocks(normalized.effectBlocks)
      : normalized.effects;
  const scriptLines = createCardEffectScript(normalized.effectBlocks);
  const effectLines = compiledEffects.map((effect) => formatEffectLine(effect));
  const cardCopy = [normalized.description.trim(), ...effectLines].filter(Boolean);

  return (
    <div className="card-workbench-preview">
      <div className={`database-card-face rarity-${normalized.rarity}`}>
        <div className="database-card-face-cost">{normalized.strainCost}</div>
        <div className="database-card-face-type">{getCategoryBadge(normalized.category)}</div>
        <div className="database-card-face-art">
          {normalized.artAsset?.dataUrl ? (
            <img className="database-card-art-image" src={normalized.artAsset.dataUrl} alt={normalized.name} />
          ) : (
            <span className="database-card-face-art-glyph">{getCategoryBadge(normalized.category)}</span>
          )}
        </div>
        <div className="database-card-face-rulebox">
          <div className="database-card-face-title">{normalized.name || "Untitled Card"}</div>
          <div className="database-card-face-copy">
            {cardCopy.length > 0 ? (
              cardCopy.map((line, index) => (
                <p key={`${normalized.id}:${index}`} className="database-card-face-copy-line">
                  {line}
                </p>
              ))
            ) : (
              <p className="database-card-face-copy-line muted">No card text yet.</p>
            )}
          </div>
          <div className="database-card-face-detail-row">
            <span>Range {normalized.range}</span>
            <span>{humanizeToken(normalized.rarity)}</span>
          </div>
          <div className="database-card-face-target">{humanizeToken(normalized.targetType)}</div>
        </div>
      </div>

      <div className="card-preview-script-shell">
        <div className="card-preview-script-title">Effect Script</div>
        <pre className="json-preview tall card-preview-script">{scriptLines.join("\n")}</pre>
      </div>
    </div>
  );
}
