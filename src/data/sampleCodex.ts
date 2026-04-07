import type { CodexDocument } from "../types/codex";
import { isoNow } from "../utils/date";

export function createBlankCodexEntry(): CodexDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "codex_new_entry",
    title: "Untitled Codex Entry",
    entryType: "lore",
    content: "",
    unlockAfterFloor: 0,
    requiredDialogueIds: [],
    requiredQuestIds: [],
    requiredGearIds: [],
    requiredItemIds: [],
    requiredSchemaIds: [],
    requiredFieldModIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleCodexEntry(): CodexDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "codex_haven_foundry_notes",
    title: "Foundry Notes",
    entryType: "tech",
    content:
      "The HAVEN generator lattice can be stabilized with redundant steam bafflers, but every field crew report warns that the gain in output also raises long-term maintenance burden.",
    unlockAfterFloor: 2,
    requiredDialogueIds: ["npc_commander"],
    requiredQuestIds: [],
    requiredGearIds: [],
    requiredItemIds: ["item_foundry_sealant"],
    requiredSchemaIds: [],
    requiredFieldModIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
