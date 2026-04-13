import type { ResourceWalletDocument } from "./resources";
import { runtimeId } from "../utils/id";

export const doctrineIntentTags = [
  "assault",
  "skirmish",
  "suppression",
  "sustain",
  "control",
  "mobility"
] as const;

export type DoctrineIntentTagDocument = (typeof doctrineIntentTags)[number];

export interface DoctrineDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  shortDescription: string;
  intentTags: DoctrineIntentTagDocument[];
  stabilityModifier: number;
  strainBias: number;
  procBias: number;
  buildCostModifier: ResourceWalletDocument;
  doctrineRules: string;
  description: string;
  unlockAfterFloor: number;
  requiredQuestIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function createDoctrineId(name: string) {
  return runtimeId(name, "doctrine");
}
