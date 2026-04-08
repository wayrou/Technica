import { runtimeId } from "../utils/id";

export interface FactionDocument {
  schemaVersion: string;
  sourceApp: "Technica";
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactionOption {
  id: string;
  name: string;
  description: string;
  origin: "preset" | "game" | "technica";
}

const BASE_FACTION_PRESETS = [
  "maw",
  "rivet",
  "anchor",
  "null",
  "scrap",
  "black banner",
  "chaos predators",
  "reliquary",
  "silt",
  "lantern guild",
  "company of quills",
  "fairhaven military",
  "Old Hand",
  "Trackers",
  "Coilwright",
  "Redwake",
  "Charter Guild",
  "Wayfarer"
] as const;

export const factionPresets: FactionOption[] = BASE_FACTION_PRESETS.map((name) => ({
  id: runtimeId(name, "faction"),
  name,
  description: "",
  origin: "preset"
}));

export function createFactionId(name: string) {
  return runtimeId(name, "new_faction");
}

export function mergeFactionOptions(
  extraOptions: Array<Pick<FactionOption, "id" | "name"> & Partial<Pick<FactionOption, "description" | "origin">>> = []
) {
  const merged = new Map<string, FactionOption>();

  factionPresets.forEach((option) => {
    merged.set(option.id, option);
  });

  extraOptions.forEach((option) => {
    const id = createFactionId(option.id);
    if (!id) {
      return;
    }

    merged.set(id, {
      id,
      name: option.name?.trim() || option.id,
      description: option.description ?? merged.get(id)?.description ?? "",
      origin: option.origin ?? merged.get(id)?.origin ?? "technica"
    });
  });

  return Array.from(merged.values()).sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );
}
