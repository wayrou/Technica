export const mailCategories = ["personal", "official", "system"] as const;

export type MailCategory = (typeof mailCategories)[number];

export interface MailDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  sender: string;
  subject: string;
  category: MailCategory;
  content: string;
  unlockAfterFloor: number;
  requiredDialogueIds: string[];
  requiredGearIds: string[];
  requiredItemIds: string[];
  requiredSchemaIds: string[];
  requiredFieldModIds: string[];
  createdAt: string;
  updatedAt: string;
}
