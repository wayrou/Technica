import type { MapSceneProp, MapScenePropKind } from "../../types/map";

export type ScenePropPreset = {
  id: string;
  kind: MapScenePropKind;
  label: string;
  summary: string;
  width: number;
  height: number;
  scale: number;
  rotationYaw: number;
  elevation: number;
  heightOffset: number;
  modelKey: string;
  modelAssetPath: string;
  materialKey: string;
  sceneId: string;
  blocksMovement: boolean;
  providesCover: boolean;
  metadata?: Record<string, string>;
  materialSuggestions?: string[];
};

export const SCENE_PROP_PRESETS: ScenePropPreset[] = [
  {
    id: "cargo_crates",
    kind: "cover",
    label: "Cargo Crates",
    summary: "Half-cover cargo stack for docks, markets, and deck skirmishes.",
    width: 2,
    height: 1,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "crate_stack_a",
    modelAssetPath: "",
    materialKey: "weathered_wood",
    sceneId: "",
    blocksMovement: true,
    providesCover: true,
    metadata: { coverRating: "half" },
    materialSuggestions: ["weathered_wood", "salted_oak", "ironbound_crate"]
  },
  {
    id: "market_stall",
    kind: "setpiece",
    label: "Market Stall",
    summary: "Wide dressing setpiece for tavern lanes, bazaars, and port rows.",
    width: 2,
    height: 2,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "market_stall_a",
    modelAssetPath: "",
    materialKey: "canvas_tan",
    sceneId: "",
    blocksMovement: true,
    providesCover: false,
    materialSuggestions: ["canvas_tan", "dock_canvas_red", "wayfarer_blue"]
  },
  {
    id: "pipe_run",
    kind: "setpiece",
    label: "Pipe Run",
    summary: "Industrial pipe cluster for maintenance corridors and steam rooms.",
    width: 2,
    height: 1,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0.1,
    modelKey: "pipe_run_a",
    modelAssetPath: "",
    materialKey: "aged_brass",
    sceneId: "",
    blocksMovement: true,
    providesCover: false,
    materialSuggestions: ["aged_brass", "steamworks_iron", "oxidized_copper"]
  },
  {
    id: "bulkhead_door",
    kind: "door",
    label: "Bulkhead Door",
    summary: "Standard field door for bespoke room-to-room ingress routes.",
    width: 1,
    height: 1,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "bulkhead_door_a",
    modelAssetPath: "",
    materialKey: "painted_steel",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    materialSuggestions: ["painted_steel", "brass_trim", "watch_oil_green"]
  },
  {
    id: "service_stairs",
    kind: "stairs",
    label: "Service Stairs",
    summary: "Short deck stairs for authored same-map traversal and level changes.",
    width: 1,
    height: 2,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "service_stairs_a",
    modelAssetPath: "",
    materialKey: "steel_grate",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    materialSuggestions: ["steel_grate", "iron_tread", "anchor_plate"]
  },
  {
    id: "transit_portal",
    kind: "portal",
    label: "Transit Portal",
    summary: "Stable portal frame for authored imported-map handoffs.",
    width: 1,
    height: 1,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "transit_portal_a",
    modelAssetPath: "",
    materialKey: "chaos_glass",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    metadata: { fxProfile: "portal_stable" },
    materialSuggestions: ["chaos_glass", "ember_gate", "lantern_azure"]
  },
  {
    id: "lantern_cluster",
    kind: "light",
    label: "Lantern Cluster",
    summary: "Warm hanging light cluster for markets, taverns, and hab decks.",
    width: 2,
    height: 1,
    scale: 1,
    rotationYaw: 20,
    elevation: 0,
    heightOffset: 0.2,
    modelKey: "lantern_cluster_a",
    modelAssetPath: "",
    materialKey: "warm_brass",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    metadata: { lightProfile: "market_warm" },
    materialSuggestions: ["warm_brass", "amber_glow", "harbor_gold"]
  },
  {
    id: "hazard_decal",
    kind: "decal",
    label: "Hazard Decal",
    summary: "Floor warning graphic for traversal routes, combat rooms, and machinery.",
    width: 2,
    height: 1,
    scale: 1,
    rotationYaw: 0,
    elevation: 0,
    heightOffset: 0,
    modelKey: "hazard_decal_a",
    modelAssetPath: "",
    materialKey: "warning_paint",
    sceneId: "",
    blocksMovement: false,
    providesCover: false,
    metadata: { decalType: "hazard" },
    materialSuggestions: ["warning_paint", "faded_yellow", "redwake_safety"]
  }
];

const GLOBAL_SCENE_PROP_MATERIALS = [
  "aged_brass",
  "amber_glow",
  "anchor_plate",
  "brass_trim",
  "canvas_tan",
  "chaos_glass",
  "dock_canvas_red",
  "faded_yellow",
  "harbor_gold",
  "iron_tread",
  "oxidized_copper",
  "painted_steel",
  "salted_oak",
  "steel_grate",
  "steamworks_iron",
  "warning_paint",
  "warm_brass",
  "watch_oil_green",
  "weathered_wood",
  "wayfarer_blue"
];

export function getScenePropPresets(kind?: MapScenePropKind | null) {
  return kind ? SCENE_PROP_PRESETS.filter((preset) => preset.kind === kind) : SCENE_PROP_PRESETS;
}

export function findScenePropPreset(presetId: string | undefined | null) {
  if (!presetId) {
    return null;
  }

  return SCENE_PROP_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getScenePropMaterialSuggestions(
  kind?: MapScenePropKind | null,
  selectedPresetId?: string,
  currentModelKey?: string,
  currentMaterialKey?: string
) {
  const presets = getScenePropPresets(kind);
  const fromPreset = findScenePropPreset(selectedPresetId)?.materialSuggestions ?? [];
  const fromModel = presets
    .filter((preset) => !currentModelKey || preset.modelKey === currentModelKey)
    .flatMap((preset) => preset.materialSuggestions ?? [preset.materialKey]);

  return Array.from(
    new Set(
      [...fromPreset, ...fromModel, ...GLOBAL_SCENE_PROP_MATERIALS, currentMaterialKey ?? ""]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function applyScenePropPreset(prop: MapSceneProp, preset: ScenePropPreset): MapSceneProp {
  return {
    ...prop,
    assetPresetId: preset.id,
    kind: preset.kind,
    label: preset.label,
    width: preset.width,
    height: preset.height,
    scale: preset.scale,
    rotationYaw: preset.rotationYaw,
    elevation: preset.elevation,
    heightOffset: preset.heightOffset,
    modelKey: preset.modelKey,
    modelAssetPath: preset.modelAssetPath,
    materialKey: preset.materialKey,
    sceneId: preset.sceneId,
    blocksMovement: preset.blocksMovement,
    providesCover: preset.providesCover,
    metadata: {
      ...(prop.metadata ?? {}),
      ...(preset.metadata ?? {})
    }
  };
}
