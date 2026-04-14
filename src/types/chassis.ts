import type { ResourceWalletDocument } from "./resources";
import { runtimeId } from "../utils/id";

export const chassisSlotTypes = ["weapon", "helmet", "chestpiece", "accessory"] as const;

export type ChassisSlotTypeDocument = (typeof chassisSlotTypes)[number];

export interface ChassisDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  slotType: ChassisSlotTypeDocument;
  stability: number;
  kg: number;
  bu: number;
  w: number;
  cardSlots: number;
  description: string;
  buildCost: ResourceWalletDocument;
  unlockAfterFloor: number;
  availableInHavenShop: boolean;
  havenShopUnlockAfterFloor: number;
  requiredQuestIds: string[];
  allowedCardTags: string[];
  allowedCardFamilies: string[];
  createdAt: string;
  updatedAt: string;
}

export function createChassisId(name: string) {
  return runtimeId(name, "chassis");
}
