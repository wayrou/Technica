import { useRef, type ChangeEvent } from "react";
import { Panel } from "../../components/Panel";
import { IssueList } from "../../components/IssueList";
import { sampleDialogueSource } from "../../data/sampleDialogue";
import { usePersistentState } from "../../hooks/usePersistentState";
import { confirmAction, notify } from "../../utils/dialogs";
import { parseDialogueSource } from "../../utils/dialogueParser";
import { buildDialogueBundle, createDraftEnvelope, downloadBundle, downloadDraftFile } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
import { DialoguePreview } from "./DialoguePreview";

const authoringReference = `Authoring format
@id village-guide-intro
@title Village Guide Intro
@scene oak-square
@meta ambience=morning_market
@tag onboarding, village

:start
Guide [mood=warm portrait=guide_smile]: First time in Oak Square?
? Ask about the board -> courier_board [tags=quest]
? Leave -> goodbye

:courier_board
@set learned_courier_board=true
Guide: The board near the fountain lists local work.
-> goodbye

:goodbye
Guide: Good luck out there.
END`;

export function DialogueStudio() {
  const [source, setSource] = usePersistentState("technica.dialogue.source", sampleDialogueSource);
  const importRef = useRef<HTMLInputElement | null>(null);
  const { document, issues } = parseDialogueSource(source);

  async function handleExportBundle() {
    await downloadBundle(buildDialogueBundle(document));
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await readTextFile(file);
    if (file.name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.payload?.rawSource) {
          setSource(parsed.payload.rawSource);
        } else if (parsed.rawSource) {
          setSource(parsed.rawSource);
        } else {
          notify("This JSON file does not contain a Technica dialogue draft or export.");
        }
      } catch {
        notify("Could not parse the selected JSON file.");
      }
    } else {
      setSource(content);
    }

    event.target.value = "";
  }

  function handleReset() {
    if (confirmAction("Replace the current dialogue draft with the sample dialogue?")) {
      setSource(sampleDialogueSource);
    }
  }

  function handleClear() {
    if (confirmAction("Clear the current dialogue source? Your autosaved local draft will be replaced by the blank template.")) {
      setSource("@id new-dialogue\n@title Untitled Dialogue\n@scene scene-id\n\n:start\nNarrator: \nEND\n");
    }
  }

  return (
    <div className="workspace-grid workspace-dialogue">
      <div className="workspace-column">
        <Panel
          title="Dialogue Source"
          subtitle="Write in the friendly authoring format, then validate and preview immediately."
          actions={
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={handleReset}>
                Load sample
              </button>
              <button type="button" className="ghost-button" onClick={handleClear}>
                Clear
              </button>
            </div>
          }
        >
          <textarea
            className="authoring-editor"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{document.stats.labelCount} labels</span>
              <span className="pill">{document.stats.lineCount} lines</span>
              <span className="pill">{document.stats.choiceCount} choices</span>
            </div>
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
                Import draft
              </button>
              <button type="button" className="ghost-button" onClick={() => downloadDraftFile("dialogue", document.title, document)}>
                Save draft file
              </button>
              <button type="button" className="primary-button" onClick={handleExportBundle}>
                Export bundle
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept=".txt,.json"
                onChange={handleImportFile}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Authoring Reference" subtitle="This is the compact syntax the parser understands in the MVP.">
          <pre className="reference-block">{authoringReference}</pre>
        </Panel>
      </div>

      <div className="workspace-column wide">
        <Panel
          title="Dialogue Flow Preview"
          subtitle="Card-based flow preview to catch branching issues before export."
        >
          <DialoguePreview document={document} />
        </Panel>
      </div>

      <div className="workspace-column">
        <Panel title="Validation" subtitle="Clear parser and schema issues show up here.">
          <IssueList issues={issues} emptyLabel="No validation issues. This dialogue is ready to export." />
        </Panel>

        <Panel title="Parsed JSON" subtitle="Normalized output that another tool can import cleanly.">
          <pre className="json-preview">{JSON.stringify(document, null, 2)}</pre>
        </Panel>

        <Panel title="Draft Envelope" subtitle="Local draft files preserve Technica metadata for reopening work later.">
          <pre className="json-preview">{JSON.stringify(createDraftEnvelope("dialogue", document), null, 2)}</pre>
        </Panel>
      </div>
    </div>
  );
}
