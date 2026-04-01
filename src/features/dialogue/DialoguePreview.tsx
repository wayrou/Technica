import type { DialogueDocument, DialogueEntry } from "../../types/dialogue";

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
          <div className="chip-row">
            <span className="chip link-chip">to {entry.target}</span>
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
        <p>Continue to {entry.target}</p>
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
  if (document.labels.length === 0) {
    return <div className="empty-state">Add a label like <code>:start</code> to begin previewing the flow.</div>;
  }

  return (
    <div className="flow-grid">
      {document.labels.map((label) => (
        <article key={label.id} className="flow-card">
          <header>
            <div>
              <h3>{label.label}</h3>
              <p>{label.entries.length} entries</p>
            </div>
            {label.label === document.entryLabel ? <span className="pill accent">entry</span> : null}
          </header>
          <div className="flow-card-body">
            {label.entries.map((entry) => (
              <div key={entry.id}>{renderEntry(entry)}</div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
