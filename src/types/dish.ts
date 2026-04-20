import type { MerchantListingDocument } from "./merchant";

export interface DishDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  cost: number;
  unlockAfterOperationFloor: number;
  merchant: MerchantListingDocument;
  requiredQuestIds: string[];
  effect: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}
