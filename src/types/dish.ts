export interface DishDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  cost: number;
  unlockAfterOperationFloor: number;
  effect: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}
