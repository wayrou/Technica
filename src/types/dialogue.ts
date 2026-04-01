import type { KeyValueRecord } from "./common";

export interface DialogueLine {
  id: string;
  kind: "line";
  speaker: string;
  text: string;
  mood?: string;
  portraitKey?: string;
  sceneId?: string;
  condition?: string;
  tags: string[];
  metadata: KeyValueRecord;
}

export interface DialogueChoice {
  id: string;
  kind: "choice";
  text: string;
  target: string;
  condition?: string;
  tags: string[];
  setFlags: KeyValueRecord;
  metadata: KeyValueRecord;
}

export interface DialogueJump {
  id: string;
  kind: "jump";
  target: string;
  condition?: string;
}

export interface DialogueSetFlag {
  id: string;
  kind: "set";
  flag: string;
  value: string;
}

export interface DialogueEnd {
  id: string;
  kind: "end";
}

export type DialogueEntry =
  | DialogueLine
  | DialogueChoice
  | DialogueJump
  | DialogueSetFlag
  | DialogueEnd;

export interface DialogueLabel {
  id: string;
  label: string;
  entries: DialogueEntry[];
}

export interface DialogueDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  title: string;
  sceneId: string;
  rawSource: string;
  metadata: KeyValueRecord;
  tags: string[];
  entryLabel: string;
  labels: DialogueLabel[];
  stats: {
    labelCount: number;
    lineCount: number;
    choiceCount: number;
  };
  createdAt: string;
  updatedAt: string;
}
