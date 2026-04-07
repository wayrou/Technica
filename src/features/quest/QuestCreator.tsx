import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChaosCoreDatabasePanel } from "../../components/ChaosCoreDatabasePanel";
import { IssueList } from "../../components/IssueList";
import { Panel } from "../../components/Panel";
import { createSampleQuest } from "../../data/sampleQuest";
import { useTechnicaRuntime } from "../../hooks/useTechnicaRuntime";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { QuestDocument, QuestObjective, QuestReward, QuestState, QuestStep } from "../../types/quest";
import { isoNow } from "../../utils/date";
import { confirmAction, notify } from "../../utils/dialogs";
import { buildQuestBundleForTarget, downloadBundle, downloadDraftFile } from "../../utils/exporters";
import { readTextFile } from "../../utils/file";
import type { LoadedChaosCoreDatabaseEntry } from "../../utils/chaosCoreDatabase";
import { createSequentialId } from "../../utils/id";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "../../utils/mobileProtocol";
import { submitMobileInboxEntry } from "../../utils/mobileSession";
import {
  parseCommaList,
  parseKeyValueLines,
  parseMultilineList,
  serializeCommaList,
  serializeKeyValueLines,
  serializeMultilineList
} from "../../utils/records";
import { validateQuestDocument } from "../../utils/questValidation";

const QUEST_STORAGE_KEY = "technica.quest.document";

function sanitizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
}

function createBlankQuest(): QuestDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "new_quest",
    title: "Untitled Quest",
    summary: "",
    description: "",
    questType: "exploration",
    difficultyTier: 1,
    status: "available",
    tags: [],
    prerequisites: [],
    requiredQuestIds: [],
    followUpQuestIds: [],
    rewards: [],
    states: [
      {
        id: "state-active",
        label: "Active",
        description: "Quest is in progress.",
        terminal: false,
        kind: "active"
      },
      {
        id: "state-success",
        label: "Success",
        description: "Quest completed successfully.",
        terminal: true,
        kind: "success"
      },
      {
        id: "state-failure",
        label: "Failure",
        description: "Quest failed.",
        terminal: true,
        kind: "failure"
      }
    ],
    objectives: [],
    steps: [],
    initialStepId: "",
    successStateId: "state-success",
    failureStateId: "state-failure",
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function touchQuest(document: QuestDocument) {
  return {
    ...document,
    updatedAt: isoNow()
  };
}

function normalizeQuestDocument(document: Partial<QuestDocument> | null | undefined): QuestDocument {
  const fallback = createBlankQuest();
  const candidate = document ?? {};

  return {
    ...fallback,
    ...candidate,
    tags: sanitizeIdList(candidate.tags),
    prerequisites: sanitizeIdList(candidate.prerequisites),
    requiredQuestIds: sanitizeIdList(candidate.requiredQuestIds),
    followUpQuestIds: sanitizeIdList(candidate.followUpQuestIds)
  };
}

function isQuestDocumentPayload(value: unknown): value is QuestDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<QuestDocument>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.states) &&
    Array.isArray(candidate.steps)
  );
}

export function QuestCreator() {
  const runtime = useTechnicaRuntime();
  const [questState, setQuest] = usePersistentState(QUEST_STORAGE_KEY, createSampleQuest());
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);
  const quest = normalizeQuestDocument(questState);
  const deferredQuest = useDeferredValue(questState);
  const issues = useMemo(() => validateQuestDocument(normalizeQuestDocument(deferredQuest)), [deferredQuest]);
  const canSendToDesktop = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);

  useEffect(() => {
    function handleMobileInboxOpen(event: Event) {
      const customEvent = event as CustomEvent<{ entry?: MobileInboxEntry }>;
      const entry = customEvent.detail?.entry;
      if (entry?.contentType !== "quest") {
        return;
      }

        if (!isQuestDocumentPayload(entry.payload)) {
          notify("The mobile quest draft could not be loaded because its payload is invalid.");
          return;
        }

      setQuest(touchQuest(normalizeQuestDocument(entry.payload)));
    }

    if (typeof window !== "undefined") {
      window.addEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(TECHNICA_MOBILE_INBOX_OPEN_EVENT, handleMobileInboxOpen);
      }
    };
  }, [setQuest]);

  function patchQuest(updater: (current: QuestDocument) => QuestDocument) {
    setQuest((current) => touchQuest(normalizeQuestDocument(updater(normalizeQuestDocument(current)))));
  }

  function updateTopLevel<K extends keyof QuestDocument>(field: K, value: QuestDocument[K]) {
    patchQuest((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateReward(id: string, updater: (reward: QuestReward) => QuestReward) {
    patchQuest((current) => ({
      ...current,
      rewards: current.rewards.map((reward) => (reward.id === id ? updater(reward) : reward))
    }));
  }

  function updateState(id: string, updater: (state: QuestState) => QuestState) {
    patchQuest((current) => ({
      ...current,
      states: current.states.map((state) => (state.id === id ? updater(state) : state))
    }));
  }

  function updateObjective(id: string, updater: (objective: QuestObjective) => QuestObjective) {
    patchQuest((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => (objective.id === id ? updater(objective) : objective))
    }));
  }

  function updateStep(id: string, updater: (step: QuestStep) => QuestStep) {
    patchQuest((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === id ? updater(step) : step))
    }));
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await readTextFile(file));
      const payload = parsed.payload ?? parsed;
      if (!payload.id || !payload.states || !payload.steps) {
        notify("That file does not look like a Technica quest draft or export.");
      } else if (confirmAction("Replace the current quest draft with the imported file?")) {
        setQuest(touchQuest(normalizeQuestDocument(payload as QuestDocument)));
      }
    } catch {
      notify("Could not parse the selected quest JSON file.");
    }

    event.target.value = "";
  }

  function handleResetSample() {
    if (confirmAction("Replace the current quest draft with the sample quest?")) {
      setQuest(touchQuest(normalizeQuestDocument(createSampleQuest())));
    }
  }

  function handleClear() {
    if (confirmAction("Clear the current quest draft and replace it with a blank quest template?")) {
      setQuest(touchQuest(createBlankQuest()));
    }
  }

  function handleLoadDatabaseEntry(entry: LoadedChaosCoreDatabaseEntry) {
    try {
      const parsed = JSON.parse(entry.editorContent ?? entry.sourceContent ?? entry.runtimeContent);
      const payload = parsed.payload ?? parsed;
      if (!payload.id || !payload.states || !payload.steps) {
        notify("That Chaos Core quest entry does not match the Technica quest format.");
        return;
      }
      setQuest(touchQuest(normalizeQuestDocument(payload as QuestDocument)));
    } catch {
      notify("Could not load the selected quest from the Chaos Core database.");
    }
  }

  async function handleSendToDesktop() {
    if (!runtime.sessionOrigin || !runtime.pairingToken) {
      notify("Open this editor through the desktop pairing URL before sending content back.");
      return;
    }

    setIsSendingToDesktop(true);
    try {
      const currentQuest = touchQuest(quest);
      const sendResult = await submitMobileInboxEntry({
        sessionOrigin: runtime.sessionOrigin,
        pairingToken: runtime.pairingToken,
        deviceType: runtime.deviceType,
        request: {
          contentType: "quest",
          contentId: currentQuest.id,
          title: currentQuest.title,
          summary: `${currentQuest.objectives.length} objectives, ${currentQuest.steps.length} steps, ${currentQuest.states.length} states`,
          payload: currentQuest
        }
      });
      notify(sendResult.message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not send this quest draft to the desktop inbox.");
    } finally {
      setIsSendingToDesktop(false);
    }
  }

  return (
    <div className={issues.length > 0 ? "workspace-grid" : "workspace-grid validation-collapsed"}>
      <div className="workspace-column">
        <Panel
          title="Quest Setup"
          subtitle="Core quest identity, metadata, and export actions."
          actions={
            <div className="toolbar">
              <button type="button" className="ghost-button" onClick={handleResetSample}>
                Load sample
              </button>
              <button type="button" className="ghost-button" onClick={handleClear}>
                Clear
              </button>
            </div>
          }
        >
          <div className="form-grid">
            <label className="field">
              <span>Quest id</span>
              <input value={quest.id} onChange={(event) => updateTopLevel("id", event.target.value)} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={quest.title} onChange={(event) => updateTopLevel("title", event.target.value)} />
            </label>
            <label className="field full">
              <span>Summary</span>
              <input value={quest.summary} onChange={(event) => updateTopLevel("summary", event.target.value)} />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea
                rows={5}
                value={quest.description}
                onChange={(event) => updateTopLevel("description", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Quest type</span>
              <select
                value={quest.questType}
                onChange={(event) => updateTopLevel("questType", event.target.value as QuestDocument["questType"])}
              >
                <option value="exploration">Exploration</option>
                <option value="delivery">Delivery</option>
                <option value="collection">Collection</option>
                <option value="clear">Clear</option>
                <option value="hunt">Hunt</option>
                <option value="escort">Escort</option>
              </select>
            </label>
            <label className="field">
              <span>Difficulty tier</span>
              <select
                value={quest.difficultyTier}
                onChange={(event) =>
                  updateTopLevel("difficultyTier", Number(event.target.value) as QuestDocument["difficultyTier"])
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={quest.status}
                onChange={(event) => updateTopLevel("status", event.target.value as QuestDocument["status"])}
              >
                <option value="available">Available</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                value={serializeCommaList(quest.tags)}
                onChange={(event) => updateTopLevel("tags", parseCommaList(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Prerequisites</span>
              <textarea
                rows={4}
                value={serializeMultilineList(quest.prerequisites)}
                onChange={(event) => updateTopLevel("prerequisites", parseMultilineList(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Follow-up quests</span>
              <textarea
                rows={4}
                value={serializeMultilineList(quest.followUpQuestIds)}
                onChange={(event) => updateTopLevel("followUpQuestIds", parseMultilineList(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Require completed quests</span>
              <textarea
                rows={4}
                value={serializeMultilineList(quest.requiredQuestIds)}
                onChange={(event) => updateTopLevel("requiredQuestIds", parseMultilineList(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Initial step id</span>
              <input
                value={quest.initialStepId}
                onChange={(event) => updateTopLevel("initialStepId", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Success state id</span>
              <input
                value={quest.successStateId}
                onChange={(event) => updateTopLevel("successStateId", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Failure state id</span>
              <input
                value={quest.failureStateId}
                onChange={(event) => updateTopLevel("failureStateId", event.target.value)}
              />
            </label>
            <label className="field full">
              <span>Metadata</span>
              <textarea
                rows={5}
                value={serializeKeyValueLines(quest.metadata)}
                onChange={(event) => updateTopLevel("metadata", parseKeyValueLines(event.target.value))}
              />
            </label>
          </div>

          <div className="toolbar split">
            <div className="chip-row">
              <span className="pill">{quest.objectives.length} objectives</span>
              <span className="pill">{quest.steps.length} steps</span>
              <span className="pill">{quest.states.length} states</span>
              <span className="pill">{quest.requiredQuestIds.length} quest gate(s)</span>
              <span className="pill accent">Chaos Core export</span>
            </div>
            <div className="toolbar">
              {runtime.isMobile ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleSendToDesktop()}
                  disabled={!canSendToDesktop || isSendingToDesktop}
                >
                  {isSendingToDesktop ? "Sending..." : "Send to Desktop"}
                </button>
              ) : (
                <>
                  <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
                    Import draft
                  </button>
                  <button type="button" className="ghost-button" onClick={() => downloadDraftFile("quest", quest.title, quest)}>
                    Save draft file
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={async () => {
                      try {
                        await downloadBundle(buildQuestBundleForTarget(quest, "chaos-core"));
                      } catch (error) {
                        notify(error instanceof Error ? error.message : "Could not export the quest bundle.");
                      }
                    }}
                  >
                    Export bundle
                  </button>
                </>
              )}
              <input ref={importRef} hidden type="file" accept=".json" onChange={handleImportFile} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Rewards"
          subtitle="Optional reward payloads stay explicit so adapters can translate them later."
          actions={
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                patchQuest((current) => ({
                  ...current,
                  rewards: [
                    ...current.rewards,
                    {
                      id: createSequentialId("reward", current.rewards.map((item) => item.id)),
                      type: "xp",
                      label: "New reward",
                      amount: 1,
                      value: "",
                      metadata: {}
                    }
                  ]
                }))
              }
            >
              Add reward
            </button>
          }
        >
          <div className="stack-list">
            {quest.rewards.length === 0 ? <div className="empty-state compact">No rewards yet.</div> : null}
            {quest.rewards.map((reward) => (
              <article key={reward.id} className="item-card">
                <div className="item-card-header">
                  <h3>{reward.label || reward.id}</h3>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => {
                      if (confirmAction(`Remove reward '${reward.id}'?`)) {
                        patchQuest((current) => ({
                          ...current,
                          rewards: current.rewards.filter((item) => item.id !== reward.id)
                        }));
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Reward id</span>
                    <input value={reward.id} onChange={(event) => updateReward(reward.id, (item) => ({ ...item, id: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select value={reward.type} onChange={(event) => updateReward(reward.id, (item) => ({ ...item, type: event.target.value as QuestReward["type"] }))}>
                      <option value="xp">XP</option>
                      <option value="item">Item</option>
                      <option value="currency">Currency</option>
                      <option value="flag">Flag</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Label</span>
                    <input value={reward.label} onChange={(event) => updateReward(reward.id, (item) => ({ ...item, label: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Amount</span>
                    <input
                      type="number"
                      value={reward.amount}
                      onChange={(event) =>
                        updateReward(reward.id, (item) => ({
                          ...item,
                          amount: Number(event.target.value || 0)
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Value</span>
                    <input value={reward.value} onChange={(event) => updateReward(reward.id, (item) => ({ ...item, value: event.target.value }))} />
                  </label>
                  <label className="field full">
                    <span>Metadata</span>
                    <textarea
                      rows={3}
                      value={serializeKeyValueLines(reward.metadata)}
                      onChange={(event) =>
                        updateReward(reward.id, (item) => ({
                          ...item,
                          metadata: parseKeyValueLines(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel
          title="States"
          subtitle="States make success, failure, and branch outcomes easier to inspect."
          actions={
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                patchQuest((current) => ({
                  ...current,
                  states: [
                    ...current.states,
                    {
                      id: createSequentialId("state", current.states.map((item) => item.id)),
                      label: "New state",
                      description: "",
                      terminal: false,
                      kind: "custom"
                    }
                  ]
                }))
              }
            >
              Add state
            </button>
          }
        >
          <div className="stack-list">
            {quest.states.map((state) => (
              <article key={state.id} className="item-card">
                <div className="item-card-header">
                  <h3>{state.label || state.id}</h3>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => {
                      if (confirmAction(`Remove state '${state.id}'?`)) {
                        patchQuest((current) => ({
                          ...current,
                          states: current.states.filter((item) => item.id !== state.id)
                        }));
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>State id</span>
                    <input value={state.id} onChange={(event) => updateState(state.id, (item) => ({ ...item, id: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Kind</span>
                    <select value={state.kind} onChange={(event) => updateState(state.id, (item) => ({ ...item, kind: event.target.value as QuestState["kind"] }))}>
                      <option value="active">Active</option>
                      <option value="success">Success</option>
                      <option value="failure">Failure</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Label</span>
                    <input value={state.label} onChange={(event) => updateState(state.id, (item) => ({ ...item, label: event.target.value }))} />
                  </label>
                  <label className="field field-inline">
                    <span>Terminal</span>
                    <input
                      type="checkbox"
                      checked={state.terminal}
                      onChange={(event) => updateState(state.id, (item) => ({ ...item, terminal: event.target.checked }))}
                    />
                  </label>
                  <label className="field full">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={state.description}
                      onChange={(event) => updateState(state.id, (item) => ({ ...item, description: event.target.value }))}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <ChaosCoreDatabasePanel
          contentType="quest"
          currentDocument={quest}
          buildBundle={(current) => buildQuestBundleForTarget(current, "chaos-core")}
          onLoadEntry={handleLoadDatabaseEntry}
          subtitle="Publish quests into the Chaos Core repo and pull live in-game quest data back into this editor for balance passes."
        />
      </div>

      <div className="workspace-column wide">
        <Panel
          title="Objectives"
          subtitle="Objectives are structured so designers can branch and mark optional content without hand-writing JSON."
          actions={
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                patchQuest((current) => ({
                  ...current,
                  objectives: [
                    ...current.objectives,
                    {
                      id: createSequentialId("objective", current.objectives.map((item) => item.id)),
                      title: "New objective",
                      description: "",
                      type: "custom",
                      target: "",
                      optional: false,
                      targetCount: 1,
                      notes: ""
                    }
                  ]
                }))
              }
            >
              Add objective
            </button>
          }
        >
          <div className="stack-list">
            {quest.objectives.length === 0 ? <div className="empty-state compact">No objectives yet.</div> : null}
            {quest.objectives.map((objective) => (
              <article key={objective.id} className="item-card">
                <div className="item-card-header">
                  <h3>{objective.title || objective.id}</h3>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => {
                      if (confirmAction(`Remove objective '${objective.id}'?`)) {
                        patchQuest((current) => ({
                          ...current,
                          objectives: current.objectives.filter((item) => item.id !== objective.id)
                        }));
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Objective id</span>
                    <input
                      value={objective.id}
                      onChange={(event) => updateObjective(objective.id, (item) => ({ ...item, id: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={objective.type}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          type: event.target.value as QuestObjective["type"]
                        }))
                      }
                    >
                      <option value="talk">Talk</option>
                      <option value="collect">Collect</option>
                      <option value="visit">Visit</option>
                      <option value="defeat">Defeat</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={objective.title}
                      onChange={(event) => updateObjective(objective.id, (item) => ({ ...item, title: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Target</span>
                    <input
                      value={objective.target}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          target: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Target count</span>
                    <input
                      type="number"
                      min={1}
                      value={objective.targetCount}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          targetCount: Number(event.target.value || 1)
                        }))
                      }
                    />
                  </label>
                  <label className="field field-inline">
                    <span>Optional</span>
                    <input
                      type="checkbox"
                      checked={objective.optional}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          optional: event.target.checked
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Success state id</span>
                    <input
                      value={objective.successStateId ?? ""}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          successStateId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Failure state id</span>
                    <input
                      value={objective.failureStateId ?? ""}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          failureStateId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={objective.description}
                      onChange={(event) =>
                        updateObjective(objective.id, (item) => ({
                          ...item,
                          description: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field full">
                    <span>Notes</span>
                    <textarea
                      rows={3}
                      value={objective.notes}
                      onChange={(event) => updateObjective(objective.id, (item) => ({ ...item, notes: event.target.value }))}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel
          title="Steps & Branches"
          subtitle="Sequence objectives, branch conditionally, and point outcomes to later steps or states."
          actions={
            <button
              className="ghost-button"
              onClick={() =>
                patchQuest((current) => ({
                  ...current,
                  steps: [
                    ...current.steps,
                    {
                      id: createSequentialId("step", current.steps.map((item) => item.id)),
                      title: "New step",
                      summary: "",
                      objectiveIds: [],
                      branches: []
                    }
                  ]
                }))
              }
            >
              Add step
            </button>
          }
        >
          <div className="stack-list">
            {quest.steps.length === 0 ? <div className="empty-state compact">No steps yet.</div> : null}
            {quest.steps.map((step) => (
              <article key={step.id} className="item-card">
                <div className="item-card-header">
                  <h3>{step.title || step.id}</h3>
                  <div className="toolbar">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          branches: [
                            ...item.branches,
                            {
                              id: createSequentialId("branch", item.branches.map((entry) => entry.id)),
                              label: "New branch",
                              condition: "",
                              note: ""
                            }
                          ]
                        }))
                      }
                    >
                      Add branch
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() => {
                        if (confirmAction(`Remove step '${step.id}'?`)) {
                          patchQuest((current) => ({
                            ...current,
                            steps: current.steps.filter((item) => item.id !== step.id)
                          }));
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Step id</span>
                    <input value={step.id} onChange={(event) => updateStep(step.id, (item) => ({ ...item, id: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input value={step.title} onChange={(event) => updateStep(step.id, (item) => ({ ...item, title: event.target.value }))} />
                  </label>
                  <label className="field full">
                    <span>Summary</span>
                    <textarea rows={3} value={step.summary} onChange={(event) => updateStep(step.id, (item) => ({ ...item, summary: event.target.value }))} />
                  </label>
                  <label className="field full">
                    <span>Objective ids</span>
                    <input
                      value={serializeCommaList(step.objectiveIds)}
                      onChange={(event) =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          objectiveIds: parseCommaList(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Success next step</span>
                    <input
                      value={step.successNextStepId ?? ""}
                      onChange={(event) =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          successNextStepId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Failure next step</span>
                    <input
                      value={step.failureNextStepId ?? ""}
                      onChange={(event) =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          failureNextStepId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Success state</span>
                    <input
                      value={step.successStateId ?? ""}
                      onChange={(event) =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          successStateId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Failure state</span>
                    <input
                      value={step.failureStateId ?? ""}
                      onChange={(event) =>
                        updateStep(step.id, (item) => ({
                          ...item,
                          failureStateId: event.target.value || undefined
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="subsection">
                  <h4>Branches</h4>
                  <div className="stack-list">
                    {step.branches.length === 0 ? <div className="empty-state compact">No branches on this step.</div> : null}
                    {step.branches.map((branch) => (
                      <article key={branch.id} className="nested-card">
                        <div className="item-card-header">
                          <h4>{branch.label || branch.id}</h4>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() =>
                              updateStep(step.id, (item) => ({
                                ...item,
                                branches: item.branches.filter((entry) => entry.id !== branch.id)
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-grid">
                          <label className="field">
                            <span>Branch id</span>
                            <input
                              value={branch.id}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id ? { ...entry, id: event.target.value } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Label</span>
                            <input
                              value={branch.label}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id ? { ...entry, label: event.target.value } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field full">
                            <span>Condition</span>
                            <input
                              value={branch.condition}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id ? { ...entry, condition: event.target.value } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Next step id</span>
                            <input
                              value={branch.nextStepId ?? ""}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id
                                      ? { ...entry, nextStepId: event.target.value || undefined }
                                      : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Resulting state id</span>
                            <input
                              value={branch.resultingStateId ?? ""}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id
                                      ? { ...entry, resultingStateId: event.target.value || undefined }
                                      : entry
                                  )
                                }))
                              }
                            />
                          </label>
                          <label className="field full">
                            <span>Note</span>
                            <textarea
                              rows={3}
                              value={branch.note}
                              onChange={(event) =>
                                updateStep(step.id, (item) => ({
                                  ...item,
                                  branches: item.branches.map((entry) =>
                                    entry.id === branch.id ? { ...entry, note: event.target.value } : entry
                                  )
                                }))
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      {issues.length > 0 ? (
        <div className="workspace-column">
          <Panel title="Validation" subtitle="Required fields and cross-reference issues appear here.">
            <IssueList issues={issues} emptyLabel="No validation issues. This quest is ready to export." />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
