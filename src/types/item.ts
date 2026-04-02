import type { KeyValueRecord } from "./common";

export type ItemKind = "resource" | "equipment" | "consumable";

export const itemKinds: ItemKind[] = ["resource", "equipment", "consumable"];

export interface ItemDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  stackable: boolean;
  quantity: number;
  massKg: number;
  bulkBu: number;
  powerW: number;
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
