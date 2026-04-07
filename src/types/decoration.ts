import type { ImageAsset } from "./common";

export interface DecorationDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  tileSize: number;
  spriteAsset?: ImageAsset;
  requiredQuestIds: string[];
  createdAt: string;
  updatedAt: string;
}
