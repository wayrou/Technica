export const codexEntryTypes = ["lore", "faction", "bestiary", "tech"] as const;

export type CodexEntryType = (typeof codexEntryTypes)[number];

export interface CodexDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  title: string;
  entryType: CodexEntryType;
  content: string;
  unlockAfterFloor: number;
  requiredDialogueIds: string[];
  requiredQuestIds: string[];
  requiredGearIds: string[];
  requiredItemIds: string[];
  requiredSchemaIds: string[];
  requiredFieldModIds: string[];
  createdAt: string;
  updatedAt: string;
}
