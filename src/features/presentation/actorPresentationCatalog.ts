import type { FieldEnemyPresentationDocument } from "../../types/fieldEnemy";
import type { NpcPresentationDocument } from "../../types/npc";

type ActorPresentationPreset<TMode extends string> = {
  id: string;
  label: string;
  summary: string;
  mode: TMode;
  modelKey: string;
  modelAssetPath: string;
  materialKey: string;
  scale: number;
  heightOffset: number;
  facingMode: "camera" | "movement" | "fixed";
  previewPose: string;
  metadata?: Record<string, string>;
  materialSuggestions?: string[];
};

export type NpcPresentationPreset = ActorPresentationPreset<NpcPresentationDocument["mode"]>;
export type FieldEnemyPresentationPreset = ActorPresentationPreset<FieldEnemyPresentationDocument["mode"]>;

export const NPC_PRESENTATION_PRESETS: NpcPresentationPreset[] = [
  {
    id: "guide_billboard",
    label: "Guide Billboard",
    summary: "Low-friction sprite presentation for social hubs, ports, and taverns.",
    mode: "billboard_sprite",
    modelKey: "",
    modelAssetPath: "",
    materialKey: "",
    scale: 1,
    heightOffset: 0,
    facingMode: "camera",
    previewPose: "idle",
    metadata: { interactionRadius: "1.25" },
    materialSuggestions: []
  },
  {
    id: "lantern_guild_navigator",
    label: "Lantern Guild Navigator",
    summary: "Light-footed 3D navigator setup for bespoke field scenes and deck guidance roles.",
    mode: "model_3d",
    modelKey: "lantern_guild_navigator",
    modelAssetPath: "",
    materialKey: "wayfarer_blue",
    scale: 1,
    heightOffset: 0,
    facingMode: "camera",
    previewPose: "idle",
    metadata: { interactionRadius: "1.4" },
    materialSuggestions: ["wayfarer_blue", "harbor_gold", "weathered_canvas"]
  },
  {
    id: "dock_worker_3d",
    label: "Dock Worker",
    summary: "Practical 3D dockhand setup for port logistics, cargo decks, and supply lanes.",
    mode: "model_3d",
    modelKey: "dock_worker_a",
    modelAssetPath: "",
    materialKey: "canvas_tan",
    scale: 1,
    heightOffset: 0,
    facingMode: "movement",
    previewPose: "idle",
    metadata: { interactionRadius: "1.1" },
    materialSuggestions: ["canvas_tan", "salted_oak", "dock_canvas_red"]
  }
];

export const FIELD_ENEMY_PRESENTATION_PRESETS: FieldEnemyPresentationPreset[] = [
  {
    id: "scrap_billboard",
    label: "Scrap Billboard",
    summary: "Fallback billboard profile for simple field enemies and lightweight encounters.",
    mode: "billboard_sprite",
    modelKey: "",
    modelAssetPath: "",
    materialKey: "",
    scale: 1,
    heightOffset: 0,
    facingMode: "camera",
    previewPose: "idle",
    materialSuggestions: []
  },
  {
    id: "brass_scuttler_3d",
    label: "Brass Scuttler",
    summary: "Fast 3D skirmisher profile for scrap faction ambush groups and bespoke 3D ruins.",
    mode: "model_3d",
    modelKey: "brass_scuttler",
    modelAssetPath: "",
    materialKey: "aged_brass",
    scale: 1,
    heightOffset: 0,
    facingMode: "movement",
    previewPose: "idle",
    materialSuggestions: ["aged_brass", "steamworks_iron", "oxidized_copper"]
  },
  {
    id: "chaos_predator_stalker",
    label: "Chaos Predator Stalker",
    summary: "Sharper 3D predator profile for bespoke field hunts and aggressive encounter staging.",
    mode: "model_3d",
    modelKey: "chaos_predator_stalker",
    modelAssetPath: "",
    materialKey: "chaos_glass",
    scale: 1.05,
    heightOffset: 0,
    facingMode: "movement",
    previewPose: "prowl",
    materialSuggestions: ["chaos_glass", "ember_gate", "lantern_azure"]
  }
];

const GLOBAL_ACTOR_MATERIALS = [
  "aged_brass",
  "canvas_tan",
  "chaos_glass",
  "dock_canvas_red",
  "ember_gate",
  "harbor_gold",
  "lantern_azure",
  "oxidized_copper",
  "salted_oak",
  "steamworks_iron",
  "wayfarer_blue",
  "weathered_canvas"
];

export function findNpcPresentationPreset(presetId: string | undefined | null) {
  if (!presetId) {
    return null;
  }

  return NPC_PRESENTATION_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function findFieldEnemyPresentationPreset(presetId: string | undefined | null) {
  if (!presetId) {
    return null;
  }

  return FIELD_ENEMY_PRESENTATION_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getActorMaterialSuggestions(
  presets: Array<ActorPresentationPreset<string>>,
  selectedPresetId?: string,
  currentModelKey?: string,
  currentMaterialKey?: string
) {
  const fromPreset =
    presets.find((preset) => preset.id === selectedPresetId)?.materialSuggestions ?? [];
  const fromModel = presets
    .filter((preset) => !currentModelKey || preset.modelKey === currentModelKey)
    .flatMap((preset) => preset.materialSuggestions ?? [preset.materialKey]);

  return Array.from(
    new Set(
      [...fromPreset, ...fromModel, ...GLOBAL_ACTOR_MATERIALS, currentMaterialKey ?? ""]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function applyNpcPresentationPreset(
  presentation: NpcPresentationDocument,
  preset: NpcPresentationPreset
): NpcPresentationDocument {
  return {
    ...presentation,
    assetPresetId: preset.id,
    mode: preset.mode,
    modelKey: preset.modelKey,
    modelAssetPath: preset.modelAssetPath,
    materialKey: preset.materialKey,
    scale: preset.scale,
    heightOffset: preset.heightOffset,
    facingMode: preset.facingMode,
    previewPose: preset.previewPose,
    metadata: {
      ...(presentation.metadata ?? {}),
      ...(preset.metadata ?? {})
    }
  };
}

export function applyFieldEnemyPresentationPreset(
  presentation: FieldEnemyPresentationDocument,
  preset: FieldEnemyPresentationPreset
): FieldEnemyPresentationDocument {
  return {
    ...presentation,
    assetPresetId: preset.id,
    mode: preset.mode,
    modelKey: preset.modelKey,
    modelAssetPath: preset.modelAssetPath,
    materialKey: preset.materialKey,
    scale: preset.scale,
    heightOffset: preset.heightOffset,
    facingMode: preset.facingMode,
    previewPose: preset.previewPose,
    metadata: {
      ...(presentation.metadata ?? {}),
      ...(preset.metadata ?? {})
    }
  };
}
