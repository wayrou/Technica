import type { ImageAsset } from "./common";
import type { MerchantListingDocument } from "./merchant";

export interface DecorationDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  tileSize: number;
  merchant: MerchantListingDocument;
  spriteAsset?: ImageAsset;
  requiredQuestIds: string[];
  createdAt: string;
  updatedAt: string;
}
