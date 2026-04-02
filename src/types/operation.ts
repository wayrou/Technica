import type { KeyValueRecord } from "./common";

export type OperationRoomType =
  | "tavern"
  | "battle"
  | "event"
  | "shop"
  | "rest"
  | "boss"
  | "field_node"
  | "key_room"
  | "elite"
  | "treasure";

export const operationRoomTypes: OperationRoomType[] = [
  "tavern",
  "battle",
  "event",
  "shop",
  "rest",
  "boss",
  "field_node",
  "key_room",
  "elite",
  "treasure"
];

export interface OperationRoomDocument {
  id: string;
  label: string;
  type: OperationRoomType;
  x: number;
  y: number;
  connections: string[];
  battleTemplate?: string;
  eventTemplate?: string;
  shopInventory: string[];
  metadata: KeyValueRecord;
}

export interface OperationFloorDocument {
  id: string;
  name: string;
  startingRoomId: string;
  rooms: OperationRoomDocument[];
}

export interface OperationDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  codename: string;
  description: string;
  recommendedPower: number;
  floors: OperationFloorDocument[];
  metadata: KeyValueRecord;
  createdAt: string;
  updatedAt: string;
}
