import type { MailDocument } from "../types/mail";
import { isoNow } from "../utils/date";

export function createBlankMail(): MailDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mail_new_dispatch",
    sender: "S/COM_OS",
    subject: "Untitled Dispatch",
    category: "system",
    content: "",
    unlockAfterFloor: 0,
    requiredDialogueIds: [],
    requiredGearIds: [],
    requiredItemIds: [],
    requiredSchemaIds: [],
    requiredFieldModIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createSampleMail(): MailDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: "1.0.0",
    sourceApp: "Technica",
    id: "mail_foundry_dispatch",
    sender: "Quartermaster Vey",
    subject: "Foundry Allotment Approved",
    category: "official",
    content:
      "Your requisition for the foundry stabilizer kit has been approved. Report to the lower stores before next deployment.\n\nBring the sealant canister with you. Maintenance signed off on the transfer, but they want visual confirmation before they release the second crate.",
    unlockAfterFloor: 0,
    requiredDialogueIds: [],
    requiredGearIds: [],
    requiredItemIds: [],
    requiredSchemaIds: [],
    requiredFieldModIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
