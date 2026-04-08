import type { ImageAsset } from "./common";

export interface KeyItemDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  iconAsset?: ImageAsset;
  iconPath?: string;
  createdAt: string;
  updatedAt: string;
}
