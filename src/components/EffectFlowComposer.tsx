import { useEffect, useMemo, useState } from "react";
import {
  createActionNode,
  createConditionNode,
  createSelectorNode,
  describeFlowNode,
  getBranchTargetId,
  humanizeAction,
  humanizeCondition,
  humanizeSelector,
  normalizeEffectFlowDocument,
  removeNodeFromFlow,
  setBranchTarget,
  summarizeEffectFlow,
} from "../utils/effectFlow";
import type {
  EffectActionKind,
  EffectActionNode,
  EffectConditionKind,
  EffectConditionNode,
  EffectFlowDocument,
  EffectFlowNode,
  EffectSelectorKind,
  EffectSelectorNode,
} from "../types/effectFlow";
import {
  effectActionKinds,
  effectConditionKinds,
  effectResourceKeys,
  effectSelectorKinds,
  effectStatKeys,
  effectStatusKeys,
} from "../types/effectFlow";

type ComposerMode = "card" | "fieldmod";

interface EffectFlowComposerProps {
  value: EffectFlowDocument;
  onChange: (next: EffectFlowDocument) => void;
  mode: ComposerMode;
}

const CARD_ACTIONS: EffectActionKind[] = [
  ...effectActionKinds.filter((action) => action !== "gain_resource"),
];

const FIELD_MOD_ACTIONS: EffectActionKind[] = [...effectActionKinds];

const CARD_SELECTORS: EffectSelectorKind[] = [
  ...effectSelectorKinds.filter((selector) => selector !== "hit_target"),
];

const FIELD_MOD_SELECTORS: EffectSelectorKind[] = [...effectSelectorKinds];

function parsePositiveNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

export function EffectFlowComposer({ value, onChange, mode }: EffectFlowComposerProps) {
  const flow = normalizeEffectFlowDocument(value);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(flow.entryNodeId);

  useEffect(() => {
    if (!selectedNodeId || !flow.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(flow.entryNodeId ?? flow.nodes[0]?.id ?? null);
    }
  }, [flow.entryNodeId, flow.nodes, selectedNodeId]);

  const selectedNode = useMemo(
    () => flow.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [flow.nodes, selectedNodeId]
  );

  const availableActions = mode === "card" ? CARD_ACTIONS : FIELD_MOD_ACTIONS;
  const availableSelectors = mode === "card" ? CARD_SELECTORS : FIELD_MOD_SELECTORS;
  const summaryLines = summarizeEffectFlow(flow);
  const orderedNodes = [...flow.nodes].sort((left, right) => {
    if (left.id === flow.entryNodeId) {
      return -1;
    }
    if (right.id === flow.entryNodeId) {
      return 1;
    }
    return 0;
  });

  const patchNode = (nodeId: string, updater: (current: EffectFlowNode) => EffectFlowNode) => {
    onChange({
      ...flow,
      nodes: flow.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
    });
  };

  const addSelector = (selector: EffectSelectorKind) => {
    const node = createSelectorNode(selector);
    onChange({ ...flow, entryNodeId: flow.entryNodeId ?? node.id, nodes: [...flow.nodes, node] });
    setSelectedNodeId(node.id);
  };

  const addCondition = (condition: EffectConditionKind) => {
    const node = createConditionNode(condition);
    onChange({ ...flow, entryNodeId: flow.entryNodeId ?? node.id, nodes: [...flow.nodes, node] });
    setSelectedNodeId(node.id);
  };

  const addAction = (action: EffectActionKind) => {
    const node = createActionNode(action, {
      amount:
        action === "deal_damage" ||
        action === "heal" ||
        action === "grant_shield" ||
        action === "draw_cards" ||
        action === "reduce_cost_next_card" ||
        action === "discard_cards" ||
        action === "exhaust_cards" ||
        action === "restore_strain"
          ? 1
          : undefined,
      tiles: action === "move_target" || action === "knockback" ? 1 : undefined,
      modifierMode: action === "modify_stat" ? "buff" : undefined,
      count: action === "summon_drone" ? 1 : undefined,
      handCountThreshold: action === "draw_until_hand_size" ? 5 : undefined,
    });
    onChange({ ...flow, entryNodeId: flow.entryNodeId ?? node.id, nodes: [...flow.nodes, node] });
    setSelectedNodeId(node.id);
  };

  return (
    <div className="effect-flow-composer">
      <aside className="effect-flow-palette">
        <section className="item-card">
          <div className="item-card-header">
            <h3>Palette</h3>
          </div>
          <div className="stack-list compact">
            <div className="effect-flow-palette-group">
              <div className="effect-flow-palette-label">Selectors</div>
              <div className="chip-row">
                {availableSelectors.map((selector) => (
                  <button key={selector} type="button" className="ghost-button" onClick={() => addSelector(selector)}>
                    {humanizeSelector(selector)}
                  </button>
                ))}
              </div>
            </div>

            <div className="effect-flow-palette-group">
              <div className="effect-flow-palette-label">Conditions</div>
              <div className="chip-row">
                {effectConditionKinds.map((condition) => (
                  <button key={condition} type="button" className="ghost-button" onClick={() => addCondition(condition)}>
                    {humanizeCondition(condition)}
                  </button>
                ))}
              </div>
            </div>

            <div className="effect-flow-palette-group">
              <div className="effect-flow-palette-label">Actions</div>
              <div className="chip-row">
                {availableActions.map((action) => (
                  <button key={action} type="button" className="ghost-button" onClick={() => addAction(action)}>
                    {humanizeAction(action)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </aside>

      <section className="effect-flow-board">
        <div className="item-card">
          <div className="item-card-header">
            <h3>Flow Board</h3>
            <div className="chip-row">
              <span className="pill">{flow.nodes.length} node(s)</span>
              <span className="pill">{flow.edges.length} edge(s)</span>
            </div>
          </div>
          {orderedNodes.length === 0 ? (
            <div className="empty-state compact">Start by adding selectors, checks, and actions from the palette to build your flow.</div>
          ) : (
            <div className="stack-list">
              {orderedNodes.map((node) => (
                <article
                  key={node.id}
                  className={`item-card effect-flow-node-card${selectedNodeId === node.id ? " active" : ""}`}
                >
                  <div className="item-card-header">
                    <div>
                      <h3>{node.label}</h3>
                      <div className="chip-row">
                        <span className="pill">{node.family}</span>
                        {flow.entryNodeId === node.id ? <span className="pill accent">Entry</span> : null}
                      </div>
                    </div>
                    <div className="toolbar">
                      <button type="button" className="ghost-button" onClick={() => setSelectedNodeId(node.id)}>Inspect</button>
                      <button type="button" className="ghost-button" onClick={() => onChange({ ...flow, entryNodeId: node.id })}>Set Entry</button>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={() => {
                          onChange(removeNodeFromFlow(flow, node.id));
                          if (selectedNodeId === node.id) {
                            setSelectedNodeId(null);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="muted">{describeFlowNode(node)}</p>
                  <div className="form-grid effect-flow-link-grid">
                    {node.family === "condition" ? (
                      <>
                        <label className="field">
                          <span>TRUE branch</span>
                          <select
                            value={getBranchTargetId(flow, node.id, "true")}
                            onChange={(event) => onChange(setBranchTarget(flow, node.id, "true", event.target.value || null))}
                          >
                            <option value="">None</option>
                            {flow.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>FALSE branch</span>
                          <select
                            value={getBranchTargetId(flow, node.id, "false")}
                            onChange={(event) => onChange(setBranchTarget(flow, node.id, "false", event.target.value || null))}
                          >
                            <option value="">None</option>
                            {flow.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label className="field full">
                        <span>NEXT</span>
                        <select
                          value={getBranchTargetId(flow, node.id, "next")}
                          onChange={(event) => onChange(setBranchTarget(flow, node.id, "next", event.target.value || null))}
                        >
                          <option value="">None</option>
                          {flow.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="effect-flow-inspector">
        <section className="item-card">
          <div className="item-card-header">
            <h3>Inspector</h3>
          </div>
          {selectedNode ? (
            <div className="stack-list compact">
              <label className="field">
                <span>Label</span>
                <input
                  value={selectedNode.label}
                  onChange={(event) => patchNode(selectedNode.id, (current) => ({ ...current, label: event.target.value }))}
                />
              </label>

              {selectedNode.family === "selector" ? (
                <label className="field">
                  <span>Selector</span>
                  <select
                    value={selectedNode.selector}
                    onChange={(event) =>
                      patchNode(selectedNode.id, (current) => ({
                        ...(current as EffectSelectorNode),
                        selector: event.target.value as EffectSelectorKind,
                      }))
                    }
                  >
                    {availableSelectors.map((selector) => (
                      <option key={selector} value={selector}>
                        {humanizeSelector(selector)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {selectedNode.family === "condition" ? (
                <>
                  <label className="field">
                    <span>Condition</span>
                    <select
                      value={selectedNode.condition}
                      onChange={(event) =>
                        patchNode(selectedNode.id, (current) => ({
                          ...(current as EffectConditionNode),
                          condition: event.target.value as EffectConditionKind,
                        }))
                      }
                    >
                      {effectConditionKinds.map((condition) => (
                        <option key={condition} value={condition}>
                          {humanizeCondition(condition)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Selector override</span>
                    <select
                      value={selectedNode.selector ?? ""}
                      onChange={(event) =>
                        patchNode(selectedNode.id, (current) => ({
                          ...(current as EffectConditionNode),
                          selector: event.target.value ? (event.target.value as EffectSelectorKind) : undefined,
                        }))
                      }
                    >
                      <option value="">Use current targets</option>
                      {availableSelectors.map((selector) => (
                        <option key={selector} value={selector}>
                          {humanizeSelector(selector)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedNode.condition === "target_hp_below_percent" ? (
                    <label className="field">
                      <span>HP threshold %</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={selectedNode.hpThresholdPercent ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectConditionNode),
                            hpThresholdPercent: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.condition === "source_hp_below_percent" ? (
                    <label className="field">
                      <span>Source HP threshold %</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={selectedNode.hpThresholdPercent ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectConditionNode),
                            hpThresholdPercent: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.condition === "target_has_status" ||
                  selectedNode.condition === "target_missing_status" ||
                  selectedNode.condition === "source_has_status" ||
                  selectedNode.condition === "source_missing_status" ? (
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={selectedNode.status ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectConditionNode),
                            status: event.target.value ? (event.target.value as EffectConditionNode["status"]) : undefined,
                          }))
                        }
                      >
                        <option value="">Choose status</option>
                        {effectStatusKeys.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedNode.condition === "hand_size_at_least" ? (
                    <label className="field">
                      <span>Hand size threshold</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.handCountThreshold ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectConditionNode),
                            handCountThreshold: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.condition === "turn_count_at_least" ? (
                    <label className="field">
                      <span>Turn threshold</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.turnCountThreshold ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectConditionNode),
                            turnCountThreshold: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              {selectedNode.family === "action" ? (
                <>
                  <label className="field">
                    <span>Action</span>
                    <select
                      value={selectedNode.action}
                      onChange={(event) =>
                        patchNode(selectedNode.id, (current) => ({
                          ...(current as EffectActionNode),
                          action: event.target.value as EffectActionKind,
                        }))
                      }
                    >
                      {availableActions.map((action) => (
                        <option key={action} value={action}>
                          {humanizeAction(action)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Selector override</span>
                    <select
                      value={selectedNode.selector ?? ""}
                      onChange={(event) =>
                        patchNode(selectedNode.id, (current) => ({
                          ...(current as EffectActionNode),
                          selector: event.target.value ? (event.target.value as EffectSelectorKind) : undefined,
                        }))
                      }
                    >
                      <option value="">Use current targets</option>
                      {availableSelectors.map((selector) => (
                        <option key={selector} value={selector}>
                          {humanizeSelector(selector)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedNode.action === "modify_stat" ? (
                    <>
                      <label className="field">
                        <span>Stat</span>
                        <select
                          value={selectedNode.stat ?? ""}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              stat: event.target.value ? (event.target.value as EffectActionNode["stat"]) : undefined,
                            }))
                          }
                        >
                          <option value="">Choose stat</option>
                          {effectStatKeys.map((stat) => (
                            <option key={stat} value={stat}>
                              {stat.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Mode</span>
                        <select
                          value={selectedNode.modifierMode ?? "buff"}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              modifierMode: event.target.value as EffectActionNode["modifierMode"],
                            }))
                          }
                        >
                          <option value="buff">Buff</option>
                          <option value="debuff">Debuff</option>
                        </select>
                      </label>
                    </>
                  ) : null}

                  {selectedNode.action === "apply_status" ? (
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={selectedNode.status ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            status: event.target.value ? (event.target.value as EffectActionNode["status"]) : undefined,
                          }))
                        }
                      >
                        <option value="">Choose status</option>
                        {effectStatusKeys.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedNode.action === "cleanse_statuses" ? (
                    <label className="field">
                      <span>Status to cleanse</span>
                      <select
                        value={selectedNode.status ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            status: event.target.value ? (event.target.value as EffectActionNode["status"]) : undefined,
                          }))
                        }
                      >
                        <option value="">All statuses</option>
                        {effectStatusKeys.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedNode.action === "gain_resource" ? (
                    <label className="field">
                      <span>Resource</span>
                      <select
                        value={selectedNode.resource ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            resource: event.target.value ? (event.target.value as EffectActionNode["resource"]) : undefined,
                          }))
                        }
                      >
                        <option value="">Choose resource</option>
                        {effectResourceKeys.map((resource) => (
                          <option key={resource} value={resource}>
                            {resource}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedNode.action === "summon_drone" ? (
                    <>
                      <label className="field">
                        <span>Drone type id</span>
                        <input
                          value={selectedNode.droneTypeId ?? ""}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              droneTypeId: event.target.value || undefined,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Count</span>
                        <input
                          type="number"
                          min={1}
                          value={selectedNode.count ?? ""}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              count: parsePositiveNumber(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </>
                  ) : null}

                  {selectedNode.action === "set_flag" ? (
                    <>
                      <label className="field">
                        <span>Flag key</span>
                        <input
                          value={selectedNode.flagKey ?? ""}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              flagKey: event.target.value || undefined,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Flag value</span>
                        <input
                          value={selectedNode.flagValue ?? ""}
                          onChange={(event) =>
                            patchNode(selectedNode.id, (current) => ({
                              ...(current as EffectActionNode),
                              flagValue: event.target.value || undefined,
                            }))
                          }
                        />
                      </label>
                    </>
                  ) : null}

                  {selectedNode.action === "move_target" || selectedNode.action === "knockback" ? (
                    <label className="field">
                      <span>Tiles</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.tiles ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            tiles: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.action !== "set_flag" &&
                  selectedNode.action !== "summon_drone" &&
                  selectedNode.action !== "silence_buffs" &&
                  selectedNode.action !== "cleanse_statuses" &&
                  selectedNode.action !== "draw_until_hand_size" ? (
                    <label className="field">
                      <span>Amount</span>
                      <input
                        type="number"
                        value={selectedNode.amount ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            amount: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.action === "draw_until_hand_size" ? (
                    <label className="field">
                      <span>Target hand size</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.handCountThreshold ?? selectedNode.amount ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            handCountThreshold: parsePositiveNumber(event.target.value),
                            amount: undefined,
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  {selectedNode.action === "modify_stat" || selectedNode.action === "apply_status" || selectedNode.action === "grant_shield" ? (
                    <label className="field">
                      <span>Duration (turns)</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.duration ?? ""}
                        onChange={(event) =>
                          patchNode(selectedNode.id, (current) => ({
                            ...(current as EffectActionNode),
                            duration: parsePositiveNumber(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              <label className="field">
                <span>Note</span>
                <textarea
                  rows={3}
                  value={selectedNode.note ?? ""}
                  onChange={(event) =>
                    patchNode(selectedNode.id, (current) => ({
                      ...current,
                      note: event.target.value || undefined,
                    }))
                  }
                />
              </label>
            </div>
          ) : (
            <div className="empty-state compact">Select a node to edit its parameters.</div>
          )}
        </section>

        <section className="item-card">
          <div className="item-card-header">
            <h3>Summary</h3>
          </div>
          <div className="stack-list compact">
            {summaryLines.map((line, index) => (
              <p key={`${index}:${line}`} className="muted effect-flow-summary-line">
                {line}
              </p>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
