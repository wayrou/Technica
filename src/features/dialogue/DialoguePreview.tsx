import type { DialogueDocument, DialogueEntry } from "../../types/dialogue";

function renderTargetConnector(target: string) {
  return (
    <div className="flow-jump-line" aria-label={`Links to ${target}`}>
      <span className="flow-jump-stem" />
      <span className="flow-jump-arrow">↳</span>
      <span className="flow-target-chip">{target}</span>
    </div>
  );
}

function renderEntry(entry: DialogueEntry) {
  if (entry.kind === "line") {
    return (
      <div className="flow-row line-entry">
        <div className="flow-badge speaker">{entry.speaker}</div>
        <div>
          <p>{entry.text}</p>
          <div className="chip-row">
            {entry.mood ? <span className="chip">mood: {entry.mood}</span> : null}
            {entry.portraitKey ? <span className="chip">portrait: {entry.portraitKey}</span> : null}
            {entry.sceneId ? <span className="chip">scene: {entry.sceneId}</span> : null}
            {entry.condition ? <span className="chip">if {entry.condition}</span> : null}
            {entry.tags.map((tag) => (
              <span key={tag} className="chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (entry.kind === "choice") {
    return (
      <div className="flow-row choice-entry">
        <div className="flow-badge choice">choice</div>
        <div>
          <p>{entry.text}</p>
          {renderTargetConnector(entry.target)}
          <div className="chip-row">
            {entry.condition ? <span className="chip">if {entry.condition}</span> : null}
            {Object.entries(entry.setFlags).map(([flag, value]) => (
              <span key={flag} className="chip">
                set {flag}={value}
              </span>
            ))}
            {entry.tags.map((tag) => (
              <span key={tag} className="chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (entry.kind === "jump") {
    return (
      <div className="flow-row utility-entry">
        <div className="flow-badge jump">jump</div>
        <div>
          <p>Continue conversation</p>
          {renderTargetConnector(entry.target)}
        </div>
      </div>
    );
  }

  if (entry.kind === "set") {
    return (
      <div className="flow-row utility-entry">
        <div className="flow-badge flag">flag</div>
        <p>
          Set {entry.flag}={entry.value}
        </p>
      </div>
    );
  }

  return (
    <div className="flow-row utility-entry">
      <div className="flow-badge end">end</div>
      <p>Conversation ends here.</p>
    </div>
  );
}

interface DialoguePreviewProps {
  document: DialogueDocument;
}

export function DialoguePreview({ document }: DialoguePreviewProps) {
  const visibleLabels = document.labels.filter((label) => !label.continuationForChoiceClusterId);
  const continuationLabelsByClusterId = new Map(
    document.labels
      .filter((label) => label.continuationForChoiceClusterId)
      .map((label) => [label.continuationForChoiceClusterId as string, label])
  );
  const lastVisibleBranchIdByClusterId = new Map<string, string>();
  visibleLabels.forEach((label) => {
    if (label.choiceClusterId) {
      lastVisibleBranchIdByClusterId.set(label.choiceClusterId, label.id);
    }
  });

  if (visibleLabels.length === 0) {
    return <div className="empty-state">Add a conversation branch to begin previewing the flow.</div>;
  }

  return (
    <div className="flow-grid">
      {visibleLabels.map((label) => (
        <div key={label.id} className="flow-preview-stack">
          <details className="flow-card flow-branch" open>
            <summary className="flow-branch-summary">
              <div>
                <h3>{label.label}</h3>
                <p>{label.entries.length} entries</p>
              </div>
              <div className="chip-row">
                {label.choiceClusterId ? <span className="pill">choice branch</span> : null}
                {label.label === document.entryLabel ? <span className="pill accent">entry</span> : null}
              </div>
            </summary>
            <div className="flow-card-body">
              {label.entries.map((entry) => (
                <div key={entry.id} className="flow-node-shell">
                  {renderEntry(entry)}
                </div>
              ))}
              {label.autoContinueTarget ? (
                <div className="flow-node-shell">{renderTargetConnector(label.autoContinueTarget)}</div>
              ) : null}
            </div>
          </details>

          {label.choiceClusterId &&
          continuationLabelsByClusterId.has(label.choiceClusterId) &&
          lastVisibleBranchIdByClusterId.get(label.choiceClusterId) === label.id ? (
            <details className="flow-card flow-branch" open>
              <summary className="flow-branch-summary">
                <div>
                  <h3>After choices</h3>
                  <p>{continuationLabelsByClusterId.get(label.choiceClusterId)?.entries.length ?? 0} entries</p>
                </div>
                <span className="pill accent">shared</span>
              </summary>
              <div className="flow-card-body">
                {continuationLabelsByClusterId.get(label.choiceClusterId)?.entries.map((entry) => (
                  <div key={entry.id} className="flow-node-shell">
                    {renderEntry(entry)}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}
