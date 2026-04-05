import type { ValidationIssue } from "../types/common";
import type {
  EffectActionKind,
  EffectActionNode,
  EffectConditionKind,
  EffectConditionNode,
  EffectEdgeKind,
  EffectFlowDocument,
  EffectFlowEdge,
  EffectFlowNode,
  EffectResourceKey,
  EffectSelectorKind,
  EffectSelectorNode,
  EffectStatKey,
  EffectStatusKey,
} from "../types/effectFlow";

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSelector(value: unknown): EffectSelectorKind {
  switch (value) {
    case "chosen_target":
    case "chosen_tile":
    case "all_allies":
    case "all_enemies":
    case "all_units":
    case "adjacent_enemies":
    case "random_ally":
    case "random_enemy":
    case "lowest_hp_ally":
    case "lowest_hp_enemy":
    case "strongest_enemy":
    case "weakest_enemy":
    case "hit_target":
      return value;
    default:
      return "self";
  }
}

function readOptionalSelector(value: unknown): EffectSelectorKind | undefined {
  return value === undefined || value === null || value === "" ? undefined : readSelector(value);
}

function readCondition(value: unknown): EffectConditionKind {
  switch (value) {
    case "target_hp_below_percent":
    case "source_hp_below_percent":
    case "target_has_status":
    case "target_missing_status":
    case "source_has_status":
    case "source_missing_status":
    case "target_is_damaged":
    case "hand_size_at_least":
    case "turn_count_at_least":
    case "is_crit":
    case "is_kill":
      return value;
    default:
      return "target_exists";
  }
}

function readAction(value: unknown): EffectActionKind {
  switch (value) {
    case "heal":
    case "grant_shield":
    case "draw_cards":
    case "modify_stat":
    case "apply_status":
    case "move_target":
    case "knockback":
    case "end_turn":
    case "set_flag":
    case "reduce_cost_next_card":
    case "discard_cards":
    case "exhaust_cards":
    case "restore_strain":
    case "cleanse_statuses":
    case "silence_buffs":
    case "draw_until_hand_size":
    case "gain_resource":
    case "summon_drone":
      return value;
    default:
      return "deal_damage";
  }
}

function readStat(value: unknown): EffectStatKey | undefined {
  return value === "atk" || value === "def" || value === "agi" || value === "acc" ? value : undefined;
}

function readStatus(value: unknown): EffectStatusKey | undefined {
  switch (value) {
    case "stunned":
    case "burning":
    case "bleeding":
    case "shocked":
    case "slow":
    case "suppressed":
    case "weakened":
    case "vulnerable":
    case "guarded":
    case "marked":
    case "poisoned":
    case "rooted":
    case "immobilized":
    case "dazed":
      return value;
    default:
      return undefined;
  }
}

function readResource(value: unknown): EffectResourceKey | undefined {
  return value === "wood" || value === "stone" || value === "chaos_shards" ? value : undefined;
}

function readEdgeKind(value: unknown): EffectEdgeKind {
  if (value === "true" || value === "false") {
    return value;
  }
  return "next";
}

function createNodeLabel(family: EffectFlowNode["family"], specific: string) {
  return `${humanizeToken(specific)} ${family === "action" ? "Action" : family === "condition" ? "Check" : "Select"}`;
}

export function createEffectFlowId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlankEffectFlow(): EffectFlowDocument {
  return {
    version: 1,
    entryNodeId: null,
    nodes: [],
    edges: [],
  };
}

export function createSelectorNode(selector: EffectSelectorKind, partial?: Partial<EffectSelectorNode>): EffectSelectorNode {
  return {
    id: partial?.id?.trim() || createEffectFlowId("selector"),
    family: "selector",
    selector,
    label: partial?.label?.trim() || createNodeLabel("selector", selector),
    note: partial?.note?.trim() || undefined,
  };
}

export function createConditionNode(condition: EffectConditionKind, partial?: Partial<EffectConditionNode>): EffectConditionNode {
  return {
    id: partial?.id?.trim() || createEffectFlowId("condition"),
    family: "condition",
    condition,
    label: partial?.label?.trim() || createNodeLabel("condition", condition),
    note: partial?.note?.trim() || undefined,
    selector: partial?.selector,
    hpThresholdPercent: partial?.hpThresholdPercent,
    status: partial?.status,
    handCountThreshold: partial?.handCountThreshold,
    turnCountThreshold: partial?.turnCountThreshold,
  };
}

export function createActionNode(action: EffectActionKind, partial?: Partial<EffectActionNode>): EffectActionNode {
  return {
    id: partial?.id?.trim() || createEffectFlowId("action"),
    family: "action",
    action,
    label: partial?.label?.trim() || createNodeLabel("action", action),
    note: partial?.note?.trim() || undefined,
    selector: partial?.selector,
    amount: partial?.amount,
    duration: partial?.duration,
    tiles: partial?.tiles,
    stat: partial?.stat,
    modifierMode: partial?.modifierMode,
    status: partial?.status,
    flagKey: partial?.flagKey,
    flagValue: partial?.flagValue,
    resource: partial?.resource,
    droneTypeId: partial?.droneTypeId,
    count: partial?.count,
    handCountThreshold: partial?.handCountThreshold,
  };
}

export function createEffectFlowEdge(fromNodeId: string, toNodeId: string, kind: EffectEdgeKind, partial?: Partial<EffectFlowEdge>): EffectFlowEdge {
  return {
    id: partial?.id?.trim() || createEffectFlowId("edge"),
    fromNodeId,
    toNodeId,
    kind,
  };
}

function normalizeNode(value: unknown): EffectFlowNode | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const family = readString(record.family).trim();
  if (family === "selector") {
    return createSelectorNode(readSelector(record.selector), {
      id: readString(record.id),
      label: readString(record.label),
      note: readOptionalString(record.note),
    });
  }

  if (family === "condition") {
    return createConditionNode(readCondition(record.condition), {
      id: readString(record.id),
      label: readString(record.label),
      note: readOptionalString(record.note),
      selector: readOptionalSelector(record.selector),
      hpThresholdPercent: readNumber(record.hpThresholdPercent),
      status: readStatus(record.status),
      handCountThreshold: readNumber(record.handCountThreshold),
      turnCountThreshold: readNumber(record.turnCountThreshold),
    });
  }

  if (family === "action") {
    return createActionNode(readAction(record.action), {
      id: readString(record.id),
      label: readString(record.label),
      note: readOptionalString(record.note),
      selector: readOptionalSelector(record.selector),
      amount: readNumber(record.amount),
      duration: readNumber(record.duration),
      tiles: readNumber(record.tiles),
      stat: readStat(record.stat),
      modifierMode: record.modifierMode === "debuff" ? "debuff" : record.modifierMode === "buff" ? "buff" : undefined,
      status: readStatus(record.status),
      flagKey: readOptionalString(record.flagKey),
      flagValue: readOptionalString(record.flagValue),
      resource: readResource(record.resource),
      droneTypeId: readOptionalString(record.droneTypeId),
      count: readNumber(record.count),
      handCountThreshold: readNumber(record.handCountThreshold),
    });
  }

  return null;
}

function normalizeEdge(value: unknown): EffectFlowEdge | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const fromNodeId = readString(record.fromNodeId).trim();
  const toNodeId = readString(record.toNodeId).trim();
  if (!fromNodeId || !toNodeId) {
    return null;
  }

  return {
    id: readString(record.id, createEffectFlowId("edge")),
    fromNodeId,
    toNodeId,
    kind: readEdgeKind(record.kind),
  };
}

export function normalizeEffectFlowDocument(value: unknown): EffectFlowDocument {
  const record = toRecord(value);
  if (!record) {
    return createBlankEffectFlow();
  }

  const nodes = Array.isArray(record.nodes)
    ? record.nodes.map((entry) => normalizeNode(entry)).filter((entry): entry is EffectFlowNode => entry !== null)
    : [];
  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(record.edges)
    ? record.edges
        .map((entry) => normalizeEdge(entry))
        .filter((entry): entry is EffectFlowEdge => entry !== null)
        .filter((edge) => nodeIdSet.has(edge.fromNodeId) && nodeIdSet.has(edge.toNodeId))
    : [];
  const entryNodeId = readOptionalString(record.entryNodeId);

  return {
    version: 1,
    entryNodeId: entryNodeId && nodeIdSet.has(entryNodeId) ? entryNodeId : nodes[0]?.id ?? null,
    nodes,
    edges,
  };
}

export function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function humanizeSelector(selector: EffectSelectorKind) {
  switch (selector) {
    case "self":
      return "Self";
    case "chosen_target":
      return "Chosen Target";
    case "chosen_tile":
      return "Chosen Tile";
    case "all_allies":
      return "All Allies";
    case "all_enemies":
      return "All Enemies";
    case "all_units":
      return "All Units";
    case "adjacent_enemies":
      return "Adjacent Enemies";
    case "random_ally":
      return "Random Ally";
    case "random_enemy":
      return "Random Enemy";
    case "lowest_hp_ally":
      return "Lowest HP Ally";
    case "lowest_hp_enemy":
      return "Lowest HP Enemy";
    case "strongest_enemy":
      return "Strongest Enemy";
    case "weakest_enemy":
      return "Weakest Enemy";
    case "hit_target":
      return "Hit Target";
  }
}

export function humanizeCondition(condition: EffectConditionKind) {
  switch (condition) {
    case "target_exists":
      return "Target Exists";
    case "target_hp_below_percent":
      return "Target HP Below %";
    case "source_hp_below_percent":
      return "Source HP Below %";
    case "target_has_status":
      return "Target Has Status";
    case "target_missing_status":
      return "Target Missing Status";
    case "source_has_status":
      return "Source Has Status";
    case "source_missing_status":
      return "Source Missing Status";
    case "target_is_damaged":
      return "Target Is Damaged";
    case "hand_size_at_least":
      return "Hand Size At Least";
    case "turn_count_at_least":
      return "Turn Count At Least";
    case "is_crit":
      return "Was Critical Hit";
    case "is_kill":
      return "Was Killing Blow";
  }
}

export function humanizeAction(action: EffectActionKind) {
  switch (action) {
    case "deal_damage":
      return "Deal Damage";
    case "grant_shield":
      return "Grant Shield";
    case "draw_cards":
      return "Draw Cards";
    case "modify_stat":
      return "Modify Stat";
    case "apply_status":
      return "Apply Status";
    case "move_target":
      return "Move Target";
    case "set_flag":
      return "Set Flag";
    case "reduce_cost_next_card":
      return "Reduce Next Card Cost";
    case "discard_cards":
      return "Discard Cards";
    case "exhaust_cards":
      return "Exhaust Cards";
    case "restore_strain":
      return "Restore Strain";
    case "cleanse_statuses":
      return "Cleanse Statuses";
    case "silence_buffs":
      return "Silence Buffs";
    case "draw_until_hand_size":
      return "Draw Until Hand Size";
    case "gain_resource":
      return "Gain Resource";
    case "summon_drone":
      return "Summon Drone";
    default:
      return humanizeToken(action);
  }
}

export function getNodeById(flow: EffectFlowDocument, nodeId: string | null | undefined) {
  if (!nodeId) {
    return undefined;
  }
  return flow.nodes.find((node) => node.id === nodeId);
}

export function getOutgoingEdges(flow: EffectFlowDocument, nodeId: string) {
  return flow.edges.filter((edge) => edge.fromNodeId === nodeId);
}

export function getBranchTargetId(flow: EffectFlowDocument, nodeId: string, kind: EffectEdgeKind) {
  return getOutgoingEdges(flow, nodeId).find((edge) => edge.kind === kind)?.toNodeId ?? "";
}

export function setBranchTarget(flow: EffectFlowDocument, nodeId: string, kind: EffectEdgeKind, toNodeId: string | null): EffectFlowDocument {
  const preservedEdges = flow.edges.filter((edge) => !(edge.fromNodeId === nodeId && edge.kind === kind));
  if (!toNodeId) {
    return {
      ...flow,
      edges: preservedEdges,
    };
  }

  return {
    ...flow,
    edges: [...preservedEdges, createEffectFlowEdge(nodeId, toNodeId, kind)],
  };
}

export function removeNodeFromFlow(flow: EffectFlowDocument, nodeId: string): EffectFlowDocument {
  const nextNodes = flow.nodes.filter((node) => node.id !== nodeId);
  const nextEdges = flow.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId);
  return {
    ...flow,
    entryNodeId: flow.entryNodeId === nodeId ? nextNodes[0]?.id ?? null : flow.entryNodeId,
    nodes: nextNodes,
    edges: nextEdges,
  };
}

export function getReachableNodeIds(flow: EffectFlowDocument): Set<string> {
  const reachable = new Set<string>();
  const visit = (nodeId: string | null | undefined) => {
    if (!nodeId || reachable.has(nodeId)) {
      return;
    }
    reachable.add(nodeId);
    getOutgoingEdges(flow, nodeId).forEach((edge) => visit(edge.toNodeId));
  };
  visit(flow.entryNodeId);
  return reachable;
}

export function describeFlowNode(node: EffectFlowNode) {
  if (node.family === "selector") {
    return `Select ${humanizeSelector(node.selector)}`;
  }

  if (node.family === "condition") {
    switch (node.condition) {
      case "target_hp_below_percent":
      case "source_hp_below_percent":
        return `${humanizeCondition(node.condition)} ${node.hpThresholdPercent ?? 50}%`;
      case "target_has_status":
      case "target_missing_status":
      case "source_has_status":
      case "source_missing_status":
        return `${humanizeCondition(node.condition)} ${node.status ?? "status"}`;
      case "hand_size_at_least":
        return `${humanizeCondition(node.condition)} ${node.handCountThreshold ?? 1}`;
      case "turn_count_at_least":
        return `${humanizeCondition(node.condition)} ${node.turnCountThreshold ?? 1}`;
      default:
        return humanizeCondition(node.condition);
    }
  }

  switch (node.action) {
    case "deal_damage":
      return `Deal ${node.amount ?? 0} damage${node.selector ? ` to ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "heal":
      return `Heal ${node.amount ?? 0}${node.selector ? ` on ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "grant_shield":
      return `Grant ${node.amount ?? 0} shield${node.selector ? ` to ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "draw_cards":
      return `Draw ${node.amount ?? 1} card${node.amount === 1 ? "" : "s"}${node.selector ? ` for ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "modify_stat":
      return `${node.modifierMode === "debuff" ? "Reduce" : "Boost"} ${String(node.stat ?? "stat").toUpperCase()} by ${node.amount ?? 0}${node.duration ? ` for ${node.duration}t` : ""}`;
    case "apply_status":
      return `Apply ${humanizeToken(node.status ?? "status")}${node.duration ? ` for ${node.duration}t` : ""}`;
    case "move_target":
      return `Move target ${node.tiles ?? node.amount ?? 1} tile${(node.tiles ?? node.amount ?? 1) === 1 ? "" : "s"}`;
    case "knockback":
      return `Knock back ${node.tiles ?? node.amount ?? 1} tile${(node.tiles ?? node.amount ?? 1) === 1 ? "" : "s"}`;
    case "end_turn":
      return "End target turn";
    case "set_flag":
      return `Set flag ${node.flagKey ?? "flag"} = ${node.flagValue ?? "true"}`;
    case "reduce_cost_next_card":
      return `Reduce next card cost by ${node.amount ?? 1}`;
    case "discard_cards":
      return `Discard ${node.amount ?? 1} card${(node.amount ?? 1) === 1 ? "" : "s"}${node.selector ? ` from ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "exhaust_cards":
      return `Exhaust ${node.amount ?? 1} card${(node.amount ?? 1) === 1 ? "" : "s"}${node.selector ? ` from ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "restore_strain":
      return `Restore ${node.amount ?? 1} strain${node.selector ? ` on ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "cleanse_statuses":
      return node.status ? `Cleanse ${humanizeToken(node.status)}` : "Cleanse all statuses";
    case "silence_buffs":
      return `Silence buffs${node.selector ? ` on ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "draw_until_hand_size":
      return `Draw until hand size ${node.handCountThreshold ?? node.amount ?? 1}${node.selector ? ` for ${humanizeSelector(node.selector).toLowerCase()}` : ""}`;
    case "gain_resource":
      return `Gain ${node.amount ?? 0} ${humanizeToken(node.resource ?? "resource")}`;
    case "summon_drone":
      return `Summon ${node.count ?? 1} ${humanizeToken(node.droneTypeId ?? "drone")}`;
  }
}

export function summarizeEffectFlow(flow: EffectFlowDocument) {
  const reachable = getReachableNodeIds(flow);
  const lines = flow.nodes
    .filter((node) => reachable.has(node.id) && node.family === "action")
    .map((node) => describeFlowNode(node));

  return lines.length > 0 ? lines : ["No scripted actions yet."];
}

export function createEffectFlowScript(flow: EffectFlowDocument) {
  if (!flow.entryNodeId) {
    return ["ENTRY -> NO NODES"];
  }

  const lines: string[] = [];
  const seen = new Set<string>();

  const walk = (nodeId: string, prefix: string) => {
    if (seen.has(`${prefix}:${nodeId}`)) {
      return;
    }
    seen.add(`${prefix}:${nodeId}`);
    const node = getNodeById(flow, nodeId);
    if (!node) {
      return;
    }

    lines.push(`${prefix}${describeFlowNode(node)}`);

    const nextEdges = getOutgoingEdges(flow, node.id);
    if (node.family === "condition") {
      const trueEdge = nextEdges.find((edge) => edge.kind === "true");
      const falseEdge = nextEdges.find((edge) => edge.kind === "false");
      if (trueEdge) {
        walk(trueEdge.toNodeId, `${prefix}  TRUE -> `);
      }
      if (falseEdge) {
        walk(falseEdge.toNodeId, `${prefix}  FALSE -> `);
      }
      return;
    }

    const nextEdge = nextEdges.find((edge) => edge.kind === "next");
    if (nextEdge) {
      walk(nextEdge.toNodeId, "THEN -> ");
    }
  };

  walk(flow.entryNodeId, "ENTRY -> ");
  return lines;
}

export function validateEffectFlowDocument(flow: EffectFlowDocument, fieldPrefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = flow.nodes.map((node) => node.id);
  const uniqueNodeIds = new Set(nodeIds);

  if (nodeIds.length !== uniqueNodeIds.size) {
    issues.push({
      severity: "error",
      field: fieldPrefix,
      message: "Flow nodes must use unique ids.",
    });
  }

  if (flow.nodes.length > 0 && !flow.entryNodeId) {
    issues.push({
      severity: "error",
      field: fieldPrefix,
      message: "Effect flow needs an entry node.",
    });
  }

  if (flow.entryNodeId && !uniqueNodeIds.has(flow.entryNodeId)) {
    issues.push({
      severity: "error",
      field: `${fieldPrefix}.entryNodeId`,
      message: "Effect flow entry node is missing from the node list.",
    });
  }

  flow.edges.forEach((edge, index) => {
    if (!uniqueNodeIds.has(edge.fromNodeId) || !uniqueNodeIds.has(edge.toNodeId)) {
      issues.push({
        severity: "error",
        field: `${fieldPrefix}.edges.${index}`,
        message: "Every effect-flow edge must point at valid nodes.",
      });
    }
  });

  const edgeKeySet = new Set<string>();
  flow.edges.forEach((edge) => {
    const key = `${edge.fromNodeId}:${edge.kind}:${edge.toNodeId}`;
    if (edgeKeySet.has(key)) {
      issues.push({
        severity: "warning",
        field: fieldPrefix,
        message: `Duplicate ${edge.kind} edge found for '${edge.fromNodeId}'.`,
      });
    }
    edgeKeySet.add(key);
  });

  flow.nodes.forEach((node, index) => {
    const outgoing = getOutgoingEdges(flow, node.id);
    const nextEdges = outgoing.filter((edge) => edge.kind === "next");
    const trueEdges = outgoing.filter((edge) => edge.kind === "true");
    const falseEdges = outgoing.filter((edge) => edge.kind === "false");

    if (node.family === "condition") {
      if (trueEdges.length !== 1 || falseEdges.length !== 1) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}`,
          message: `${node.label || "Condition node"} needs exactly one TRUE and one FALSE branch.`,
        });
      }

      if ((node.condition === "target_hp_below_percent" || node.condition === "source_hp_below_percent") && (node.hpThresholdPercent ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.hpThresholdPercent`,
          message: "HP-threshold checks need a threshold percent greater than 0.",
        });
      }

      if (
        (
          node.condition === "target_has_status" ||
          node.condition === "target_missing_status" ||
          node.condition === "source_has_status" ||
          node.condition === "source_missing_status"
        ) &&
        !node.status
      ) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.status`,
          message: "Status checks need a status to compare against.",
        });
      }

      if (node.condition === "hand_size_at_least" && (node.handCountThreshold ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.handCountThreshold`,
          message: "Hand-size checks need a threshold greater than 0.",
        });
      }

      if (node.condition === "turn_count_at_least" && (node.turnCountThreshold ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.turnCountThreshold`,
          message: "Turn-count checks need a threshold greater than 0.",
        });
      }
    } else if (nextEdges.length > 1 || trueEdges.length > 0 || falseEdges.length > 0) {
      issues.push({
        severity: "error",
        field: `${fieldPrefix}.nodes.${index}`,
        message: `${node.label || "Node"} can only use one NEXT connection.`,
      });
    }

    if (node.family === "action") {
      if (node.action === "modify_stat") {
        if (!node.stat) {
          issues.push({
            severity: "error",
            field: `${fieldPrefix}.nodes.${index}.stat`,
            message: "Stat modification nodes need a stat.",
          });
        }
        if ((node.amount ?? 0) <= 0) {
          issues.push({
            severity: "error",
            field: `${fieldPrefix}.nodes.${index}.amount`,
            message: "Stat modification nodes need an amount greater than 0.",
          });
        }
      }

      if (node.action === "apply_status" && !node.status) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.status`,
          message: "Status application nodes need a status.",
        });
      }

      if (node.action === "gain_resource" && (!node.resource || (node.amount ?? 0) <= 0)) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}`,
          message: "Resource gain nodes need both a resource type and a positive amount.",
        });
      }

      if (node.action === "summon_drone" && (!node.droneTypeId || (node.count ?? 0) <= 0)) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}`,
          message: "Drone summon nodes need a drone id and count.",
        });
      }

      if (
        (node.action === "deal_damage" ||
          node.action === "heal" ||
          node.action === "grant_shield" ||
          node.action === "draw_cards" ||
          node.action === "reduce_cost_next_card" ||
          node.action === "discard_cards" ||
          node.action === "exhaust_cards" ||
          node.action === "restore_strain") &&
        (node.amount ?? 0) <= 0
      ) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.amount`,
          message: `${humanizeAction(node.action)} nodes need an amount greater than 0.`,
        });
      }

      if ((node.action === "move_target" || node.action === "knockback") && (node.tiles ?? node.amount ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.tiles`,
          message: `${humanizeAction(node.action)} nodes need a distance greater than 0.`,
        });
      }

      if (node.action === "draw_until_hand_size" && (node.handCountThreshold ?? node.amount ?? 0) <= 0) {
        issues.push({
          severity: "error",
          field: `${fieldPrefix}.nodes.${index}.handCountThreshold`,
          message: "Draw-until-hand-size nodes need a target hand size greater than 0.",
        });
      }
    }
  });

  const reachable = getReachableNodeIds(flow);
  flow.nodes.forEach((node, index) => {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: "error",
        field: `${fieldPrefix}.nodes.${index}`,
        message: `${node.label || "Node"} is not reachable from the entry node.`,
      });
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const detectCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visiting.add(nodeId);
    const hasCycle = getOutgoingEdges(flow, nodeId).some((edge) => detectCycle(edge.toNodeId));
    visiting.delete(nodeId);
    visited.add(nodeId);
    return hasCycle;
  };

  if (flow.entryNodeId && detectCycle(flow.entryNodeId)) {
    issues.push({
      severity: "error",
      field: fieldPrefix,
      message: "Effect flow cannot contain cycles or loops.",
    });
  }

  return issues;
}
