export type EffectSelectorKind =
  | "self"
  | "chosen_target"
  | "chosen_tile"
  | "all_allies"
  | "all_enemies"
  | "all_units"
  | "adjacent_enemies"
  | "random_ally"
  | "random_enemy"
  | "lowest_hp_ally"
  | "lowest_hp_enemy"
  | "strongest_enemy"
  | "weakest_enemy"
  | "hit_target";

export type EffectConditionKind =
  | "target_exists"
  | "target_hp_below_percent"
  | "source_hp_below_percent"
  | "target_has_status"
  | "target_missing_status"
  | "source_has_status"
  | "source_missing_status"
  | "target_is_damaged"
  | "hand_size_at_least"
  | "turn_count_at_least"
  | "is_crit"
  | "is_kill";

export type EffectActionKind =
  | "deal_damage"
  | "heal"
  | "grant_shield"
  | "draw_cards"
  | "modify_stat"
  | "apply_status"
  | "move_target"
  | "knockback"
  | "end_turn"
  | "set_flag"
  | "reduce_cost_next_card"
  | "discard_cards"
  | "exhaust_cards"
  | "restore_strain"
  | "cleanse_statuses"
  | "silence_buffs"
  | "draw_until_hand_size"
  | "gain_resource"
  | "summon_drone";

export type EffectNodeFamily = "selector" | "condition" | "action";
export type EffectEdgeKind = "next" | "true" | "false";
export type EffectStatKey = "atk" | "def" | "agi" | "acc";
export type EffectStatusKey =
  | "stunned"
  | "burning"
  | "bleeding"
  | "shocked"
  | "slow"
  | "suppressed"
  | "weakened"
  | "vulnerable"
  | "guarded"
  | "marked"
  | "poisoned"
  | "rooted"
  | "immobilized"
  | "dazed";
export type EffectResourceKey = "wood" | "stone" | "chaos_shards";

export interface EffectFlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: EffectEdgeKind;
}

interface EffectFlowNodeBase {
  id: string;
  family: EffectNodeFamily;
  label: string;
  note?: string;
}

export interface EffectSelectorNode extends EffectFlowNodeBase {
  family: "selector";
  selector: EffectSelectorKind;
}

export interface EffectConditionNode extends EffectFlowNodeBase {
  family: "condition";
  condition: EffectConditionKind;
  selector?: EffectSelectorKind;
  hpThresholdPercent?: number;
  status?: EffectStatusKey;
  handCountThreshold?: number;
  turnCountThreshold?: number;
}

export interface EffectActionNode extends EffectFlowNodeBase {
  family: "action";
  action: EffectActionKind;
  selector?: EffectSelectorKind;
  amount?: number;
  duration?: number;
  tiles?: number;
  stat?: EffectStatKey;
  modifierMode?: "buff" | "debuff";
  status?: EffectStatusKey;
  flagKey?: string;
  flagValue?: string;
  resource?: EffectResourceKey;
  droneTypeId?: string;
  count?: number;
  handCountThreshold?: number;
}

export type EffectFlowNode = EffectSelectorNode | EffectConditionNode | EffectActionNode;

export interface EffectFlowDocument {
  version: 1;
  entryNodeId: string | null;
  nodes: EffectFlowNode[];
  edges: EffectFlowEdge[];
}

export const effectSelectorKinds: EffectSelectorKind[] = [
  "self",
  "chosen_target",
  "chosen_tile",
  "all_allies",
  "all_enemies",
  "all_units",
  "adjacent_enemies",
  "random_ally",
  "random_enemy",
  "lowest_hp_ally",
  "lowest_hp_enemy",
  "strongest_enemy",
  "weakest_enemy",
  "hit_target",
];

export const effectConditionKinds: EffectConditionKind[] = [
  "target_exists",
  "target_hp_below_percent",
  "source_hp_below_percent",
  "target_has_status",
  "target_missing_status",
  "source_has_status",
  "source_missing_status",
  "target_is_damaged",
  "hand_size_at_least",
  "turn_count_at_least",
  "is_crit",
  "is_kill",
];

export const effectActionKinds: EffectActionKind[] = [
  "deal_damage",
  "heal",
  "grant_shield",
  "draw_cards",
  "modify_stat",
  "apply_status",
  "move_target",
  "knockback",
  "end_turn",
  "set_flag",
  "reduce_cost_next_card",
  "discard_cards",
  "exhaust_cards",
  "restore_strain",
  "cleanse_statuses",
  "silence_buffs",
  "draw_until_hand_size",
  "gain_resource",
  "summon_drone",
];

export const effectStatKeys: EffectStatKey[] = ["atk", "def", "agi", "acc"];
export const effectStatusKeys: EffectStatusKey[] = [
  "stunned",
  "burning",
  "bleeding",
  "shocked",
  "slow",
  "suppressed",
  "weakened",
  "vulnerable",
  "guarded",
  "marked",
  "poisoned",
  "rooted",
  "immobilized",
  "dazed",
];
export const effectResourceKeys: EffectResourceKey[] = ["wood", "stone", "chaos_shards"];
