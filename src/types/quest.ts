import type { KeyValueRecord } from "./common";

export type QuestRewardType = "xp" | "item" | "currency" | "flag" | "custom";
export type QuestObjectiveType = "talk" | "collect" | "visit" | "defeat" | "custom";
export type QuestStateKind = "active" | "success" | "failure" | "custom";
export type QuestRuntimeType = "hunt" | "escort" | "exploration" | "delivery" | "collection" | "clear";
export type QuestRuntimeStatus = "available" | "active" | "completed" | "failed";

export interface QuestReward {
  id: string;
  type: QuestRewardType;
  label: string;
  amount: number;
  value: string;
  metadata: KeyValueRecord;
}

export interface QuestState {
  id: string;
  label: string;
  description: string;
  terminal: boolean;
  kind: QuestStateKind;
}

export interface QuestObjective {
  id: string;
  title: string;
  description: string;
  type: QuestObjectiveType;
  target: string;
  optional: boolean;
  targetCount: number;
  successStateId?: string;
  failureStateId?: string;
  notes: string;
}

export interface QuestBranch {
  id: string;
  label: string;
  condition: string;
  nextStepId?: string;
  resultingStateId?: string;
  note: string;
}

export interface QuestStep {
  id: string;
  title: string;
  summary: string;
  objectiveIds: string[];
  successNextStepId?: string;
  failureNextStepId?: string;
  successStateId?: string;
  failureStateId?: string;
  branches: QuestBranch[];
}

export interface QuestDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  title: string;
  summary: string;
  description: string;
  questType: QuestRuntimeType;
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  status: QuestRuntimeStatus;
  tags: string[];
  prerequisites: string[];
  requiredQuestIds: string[];
  followUpQuestIds: string[];
  rewards: QuestReward[];
  states: QuestState[];
  objectives: QuestObjective[];
  steps: QuestStep[];
  initialStepId: string;
  successStateId: string;
  failureStateId: string;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
