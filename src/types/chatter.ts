import { runtimeId } from "../utils/id";

export const chatterLocations = ["black_market", "tavern", "port"] as const;

export type ChatterLocation = (typeof chatterLocations)[number];

export interface ChatterDocument {
  id: string;
  location: ChatterLocation;
  content: string;
  aerissResponse: string;
  createdAt: string;
  updatedAt: string;
}

export const chatterLocationLabels: Record<ChatterLocation, string> = {
  black_market: "Black Market",
  tavern: "Tavern",
  port: "Port",
};

function summarizeContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "new_chatter";
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 8)
    .join("_");
}

export function createChatterId(location: ChatterLocation, content: string) {
  return runtimeId(`${location}_${summarizeContent(content)}`, "chatter");
}
