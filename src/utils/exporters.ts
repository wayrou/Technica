import JSZip from "jszip";
import {
  TECHNICA_SCHEMA_VERSION,
  TECHNICA_SOURCE_APP,
  TECHNICA_SOURCE_APP_VERSION,
  type DraftEnvelope,
  type ExportBundleFile,
  type EditorKind,
  type ExportBundle,
  type ExportManifest,
  type ExportTarget
} from "../types/common";
import type { CardDocument } from "../types/card";
import type { ClassDocument } from "../types/class";
import type { CodexDocument } from "../types/codex";
import type { CraftingDocument } from "../types/crafting";
import type { DecorationDocument } from "../types/decoration";
import type { DialogueDocument } from "../types/dialogue";
import type { DishDocument } from "../types/dish";
import type { FieldEnemyDocument } from "../types/fieldEnemy";
import type { FieldModDocument } from "../types/fieldmod";
import type { GearDocument } from "../types/gear";
import type { ItemDocument } from "../types/item";
import type { MapDocument } from "../types/map";
import type { MailDocument } from "../types/mail";
import type { NpcDocument } from "../types/npc";
import type { OperationDocument } from "../types/operation";
import type { QuestDocument } from "../types/quest";
import type { SchemaDocument } from "../types/schema";
import type { UnitDocument } from "../types/unit";
import {
  buildChaosCoreCardBundle,
  buildChaosCoreClassBundle,
  buildChaosCoreCodexBundle,
  buildChaosCoreCraftingBundle,
  buildChaosCoreDishBundle,
  buildChaosCoreFieldEnemyBundle,
  buildChaosCoreFieldModBundle,
  buildChaosCoreGearBundle,
  buildChaosCoreItemBundle,
  buildChaosCoreMailBundle,
  buildChaosCoreNpcBundle,
  buildChaosCoreOperationBundle,
  buildChaosCoreSchemaBundle,
  buildChaosCoreUnitBundle
} from "./chaosCoreContentExport";
import {
  buildChaosCoreDialogueBundle,
  buildChaosCoreMapBundle,
  buildChaosCoreQuestBundle,
  createWorkspaceReferenceIndex
} from "./chaosCoreExport";
import { createImageAssetExport } from "./assets";
import { isoNow } from "./date";
import { downloadBlob, downloadText } from "./file";
import { runtimeId, slugify } from "./id";

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function createDraftEnvelope<TPayload>(draftType: EditorKind, payload: TPayload): DraftEnvelope<TPayload> {
  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    draftType,
    savedAt: isoNow(),
    payload
  };
}

export function downloadDraftFile<TPayload>(draftType: EditorKind, title: string, payload: TPayload) {
  const filename = `${slugify(title || draftType)}-${draftType}-draft.json`;
  downloadText(filename, prettyJson(createDraftEnvelope(draftType, payload)));
}

export async function downloadBundle(bundle: ExportBundle) {
  const archive = new JSZip();
  bundle.files.forEach((file) => {
    archive.file(file.name, file.content, file.encoding === "base64" ? { base64: true } : undefined);
  });

  const blob = await archive.generateAsync({ type: "blob" });
  downloadBlob(`${bundle.bundleName}.zip`, blob);
}

export function buildDialogueBundle(document: DialogueDocument): ExportBundle {
  const manifest: ExportManifest = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: "dialogue" as const,
    contentType: "dialogue",
    targetGame: "generic",
    targetSchemaVersion: "technica-dialogue.v1",
    exportedAt: isoNow(),
    contentId: runtimeId(document.id || document.title, "dialogue"),
    title: document.title,
    description: "Dialogue export containing author source plus normalized branching JSON.",
    entryFile: "dialogue.json",
    dependencies: [],
    files: ["manifest.json", "dialogue.json", "dialogue.txt", "README.md"]
  };

  const readme = `# Technica Dialogue Export

Title: ${document.title}
Id: ${document.id}
Scene: ${document.sceneId}

This bundle was exported from Technica and is intentionally decoupled from Chaos Core internals.

Importer notes:
- \`dialogue.txt\` is the authored source of truth for human editing.
- \`dialogue.json\` is a normalized parse that keeps stable labels, choices, flags, and metadata.
- Choice and jump targets refer to label names in the same file.
- Unknown metadata keys should be preserved when adapting to Chaos Core structures.
`;

  return {
    bundleName: `${slugify(document.title, document.id)}-dialogue-export`,
    manifest,
    files: [
      {
        name: "manifest.json",
        content: prettyJson(manifest)
      },
      {
        name: "dialogue.json",
        content: prettyJson(document)
      },
      {
        name: "dialogue.txt",
        content: document.rawSource
      },
      {
        name: "README.md",
        content: readme
      }
    ]
  };
}

export function buildQuestBundle(document: QuestDocument): ExportBundle {
  const manifest: ExportManifest = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: "quest" as const,
    contentType: "quest",
    targetGame: "generic",
    targetSchemaVersion: "technica-quest.v1",
    exportedAt: isoNow(),
    contentId: runtimeId(document.id || document.title, "quest"),
    title: document.title,
    description: "Quest export containing structured states, objectives, and branching step data.",
    entryFile: "quest.json",
    dependencies: [],
    files: ["manifest.json", "quest.json", "README.md"]
  };

  const readme = `# Technica Quest Export

Title: ${document.title}
Id: ${document.id}

Importer notes:
- Keep quest, state, step, branch, and objective ids stable during adaptation.
- \`initialStepId\`, \`successStateId\`, and \`failureStateId\` anchor the main flow.
- Optional objectives are safe to surface as bonus or flavor content.
- Preserve \`metadata\` and reward payloads even if the first Chaos Core adapter does not consume them yet.
`;

  return {
    bundleName: `${slugify(document.title, document.id)}-quest-export`,
    manifest,
    files: [
      {
        name: "manifest.json",
        content: prettyJson(manifest)
      },
      {
        name: "quest.json",
        content: prettyJson(document)
      },
      {
        name: "README.md",
        content: readme
      }
    ]
  };
}

export function buildMapBundle(document: MapDocument): ExportBundle {
  const manifest: ExportManifest = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: "map" as const,
    contentType: "map",
    targetGame: "generic",
    targetSchemaVersion: "technica-map.v1",
    exportedAt: isoNow(),
    contentId: runtimeId(document.id || document.name, "map"),
    title: document.name,
    description: "Tile-based map export containing terrain, passability, objects, and interaction zones.",
    entryFile: "map.json",
    dependencies: [],
    files: ["manifest.json", "map.json", "README.md"]
  };

  const readme = `# Technica Map Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- \`tiles\` are stored as rows from top to bottom.
- Objects and zones use top-left coordinates with width and height in tile units.
- Terrain, wall, walkable, and metadata fields are intentionally explicit to support multiple downstream adapters.
- Preserve ids and metadata when converting into Chaos Core runtime formats.
`;

  return {
    bundleName: `${slugify(document.name, document.id)}-map-export`,
    manifest,
    files: [
      {
        name: "manifest.json",
        content: prettyJson(manifest)
      },
      {
        name: "map.json",
        content: prettyJson(document)
      },
      {
        name: "README.md",
        content: readme
      }
    ]
  };
}

function buildGenericBundle<TDocument>(
  document: TDocument,
  options: {
    contentType:
      | "gear"
      | "item"
      | "card"
      | "unit"
      | "operation"
      | "class"
      | "field_enemy"
      | "crafting"
      | "dish"
      | "fieldmod"
      | "schema"
      | "codex"
      | "mail"
      | "decoration";
    title: string;
    fallbackId: string;
    targetSchemaVersion: string;
    description: string;
    entryFile: string;
    readme: string;
    extraFiles?: ExportBundleFile[];
  }
): ExportBundle {
  const manifest: ExportManifest = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: options.contentType,
    contentType: options.contentType,
    targetGame: "generic",
    targetSchemaVersion: options.targetSchemaVersion,
    exportedAt: isoNow(),
    contentId: options.fallbackId,
    title: options.title,
    description: options.description,
    entryFile: options.entryFile,
    dependencies: [],
    files: [
      "manifest.json",
      options.entryFile,
      ...(options.extraFiles?.map((file) => file.name) ?? []),
      "README.md"
    ]
  };

  return {
    bundleName: `${slugify(options.title, options.fallbackId)}-${options.contentType}-export`,
    manifest,
    files: [
      {
        name: "manifest.json",
        content: prettyJson(manifest)
      },
      {
        name: options.entryFile,
        content: prettyJson(document)
      },
      ...(options.extraFiles ?? []),
      {
        name: "README.md",
        content: options.readme
      }
    ]
  };
}

export function buildNpcBundle(document: NpcDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "npc");
  const portraitAsset = document.portraitAsset
    ? createImageAssetExport(contentId, "portrait", document.portraitAsset)
    : null;
  const spriteAsset = document.spriteAsset
    ? createImageAssetExport(contentId, "sprite", document.spriteAsset)
    : null;

  const manifest: ExportManifest = {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    sourceAppVersion: TECHNICA_SOURCE_APP_VERSION,
    exportType: "npc",
    contentType: "npc",
    targetGame: "generic",
    targetSchemaVersion: "technica-npc.v1",
    exportedAt: isoNow(),
    contentId,
    title: document.name,
    description: "NPC export containing map placement, route behavior, dialogue link, and art metadata.",
    entryFile: "npc.json",
    dependencies: [],
    files: [
      "manifest.json",
      "npc.json",
      ...(portraitAsset ? [portraitAsset.runtimePath] : []),
      ...(spriteAsset ? [spriteAsset.runtimePath] : []),
      "README.md"
    ]
  };

  return {
    bundleName: `${slugify(document.name, contentId)}-npc-export`,
    manifest,
    files: [
      { name: "manifest.json", content: prettyJson(manifest) },
      { name: "npc.json", content: prettyJson(document) },
      ...(portraitAsset ? [portraitAsset.file] : []),
      ...(spriteAsset ? [spriteAsset.file] : []),
      {
        name: "README.md",
        content: `# Technica NPC Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve map placement, route mode, and dialogue id.
- Portrait and sprite image assets export to \`assets/\` when present.
`
      }
    ]
  };
}

export function buildGearBundle(document: GearDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "gear");
  const iconAsset = document.iconAsset ? createImageAssetExport(contentId, "icon", document.iconAsset) : null;
  return buildGenericBundle(document, {
    contentType: "gear",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-gear.v1",
    description: "Gear export containing structured equipment, inventory, and loadout metadata.",
    entryFile: "gear.json",
    readme: `# Technica Gear Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve slot, stat, and inventory profile fields exactly.
- \`cardsGranted\` and \`attachedModules\` are meant to stay stable across downstream adapters.
- Metadata should be preserved even when the first target does not consume every field.
 - Attached gear icons export to \`assets/\` when present.
`,
    extraFiles: iconAsset ? [iconAsset.file] : []
  });
}

export function buildItemBundle(document: ItemDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "item");
  const iconAsset = document.iconAsset ? createImageAssetExport(contentId, "icon", document.iconAsset) : null;
  return buildGenericBundle(document, {
    contentType: "item",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-item.v1",
    description: "Inventory item export with quantity, weight, bulk, and power metadata.",
    entryFile: "item.json",
    readme: `# Technica Item Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve quantity, stackability, and physical load values during adaptation.
- Generic imports should retain unknown metadata fields.
 - Attached item icons export to \`assets/\` when present.
`,
    extraFiles: iconAsset ? [iconAsset.file] : []
  });
}

export function buildFieldEnemyBundle(document: FieldEnemyDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "field_enemy");
  const spriteAsset = document.spriteAsset ? createImageAssetExport(contentId, "sprite", document.spriteAsset) : null;
  return buildGenericBundle(document, {
    contentType: "field_enemy",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-field-enemy.v1",
    description: "Field enemy export with spawn rules, light-combat stats, drop data, and sprite metadata.",
    entryFile: "field_enemy.json",
    readme: `# Technica Field Enemy Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve spawn targets, floor rules, and per-map spawn count.
- Sprite assets export to \`assets/\` when present.
- Item drops use 0-1 chance values and explicit quantities.
`,
    extraFiles: spriteAsset ? [spriteAsset.file] : []
  });
}

export function buildCardBundle(document: CardDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "card");
  const artAsset = document.artAsset ? createImageAssetExport(contentId, "art", document.artAsset) : null;
  return buildGenericBundle(document, {
    contentType: "card",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-card.v1",
    description: "Battle card export with runtime effects plus library metadata.",
    entryFile: "card.json",
    readme: `# Technica Card Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve \`effects\`, \`targetType\`, \`range\`, and source references.
- Library-facing metadata such as rarity and category should survive adaptation.
 - Attached card art exports to \`assets/\` when present.
`,
    extraFiles: artAsset ? [artAsset.file] : []
  });
}

export function buildUnitBundle(document: UnitDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "unit");
  return buildGenericBundle(document, {
    contentType: "unit",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-unit.v1",
    description: "Unit export containing recruit profile, stats, loadout, and roster flags.",
    entryFile: "unit.json",
    readme: `# Technica Unit Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve class id, stat block, and loadout references.
- \`startingInRoster\` and \`deployInParty\` control how adapters stage the unit into a playable save.
`
  });
}

export function buildOperationBundle(document: OperationDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.codename, "operation");
  return buildGenericBundle(document, {
    contentType: "operation",
    title: document.codename,
    fallbackId: contentId,
    targetSchemaVersion: "technica-operation.v1",
    description: "Operation export with explicit floors, room graph data, and mission metadata.",
    entryFile: "operation.json",
    readme: `# Technica Operation Export

Codename: ${document.codename}
Id: ${document.id}

Importer notes:
- Room ids, floor ids, and connections should remain stable during adaptation.
- Preserve optional battle, event, and shop inventory metadata.
`
  });
}

export function buildClassBundle(document: ClassDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "class");
  return buildGenericBundle(document, {
    contentType: "class",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-class.v1",
    description: "Class export with base stats, weapon disciplines, and unlock conditions.",
    entryFile: "class.json",
    readme: `# Technica Class Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve class ids and unlock condition references exactly.
- Weapon disciplines and innate ability text should survive adaptation.
`
  });
}

export function buildCraftingBundle(document: CraftingDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "recipe");
  return buildGenericBundle(document, {
    contentType: "crafting",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-crafting.v1",
    description: "Crafting recipe export with resource costs, grant items, and unlock metadata.",
    entryFile: "crafting.json",
    readme: `# Technica Crafting Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve resource costs and all crafted grant items.
- Acquisition metadata captures whether the recipe is purchased, floor-locked, found, rewarded, or known from the start.
`
  });
}

export function buildDishBundle(document: DishDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "dish");
  return buildGenericBundle(document, {
    contentType: "dish",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-dish.v1",
    description: "Dish export for tavern or mess-hall meals.",
    entryFile: "dish.json",
    readme: `# Technica Dish Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve the visible effect text, purchase cost, unlock floor, and tavern-facing description.
`
  });
}

export function buildFieldModBundle(document: FieldModDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "field_mod");
  return buildGenericBundle(document, {
    contentType: "fieldmod",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-fieldmod.v1",
    description: "Field mod export for black-market augments.",
    entryFile: "fieldmod.json",
    readme: `# Technica Field Mod Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve scope, rarity, cost, unlock floor, and the player-facing effect summary.
`
  });
}

export function buildSchemaBundle(document: SchemaDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, document.kind);
  return buildGenericBundle(document, {
    contentType: "schema",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-schema.v1",
    description: `Schema export for ${document.kind} authorization content.`,
    entryFile: "schema.json",
    readme: `# Technica Schema Export

Name: ${document.name}
Id: ${document.id}

  Importer notes:
  - Preserve whether this document defines a C.O.R.E. authorization or a fortification.
  - The editable schema fields now mirror Chaos Core's native schema definitions.
  - Core entries include category, operational requirements, outputs, upkeep, income, support radius, unlock data, and room-tag fields.
  - Fortifications include build cost, unlock data, preferred room tags, and placeholder state.
  `
    });
  }

export function buildCodexBundle(document: CodexDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.title, "codex_entry");
  return buildGenericBundle(document, {
    contentType: "codex",
    title: document.title,
    fallbackId: contentId,
    targetSchemaVersion: "technica-codex.v1",
    description: "Codex entry export with lore category, body copy, and unlock conditions.",
    entryFile: "codex.json",
    readme: `# Technica Codex Export

Title: ${document.title}
Id: ${document.id}

Importer notes:
- Preserve the entry type, body text, and every unlock requirement exactly.
- Unlock requirements are additive: floor gates, completed-dialogue gates, and owned-content gates can all be required together.
`
  });
}

export function buildMailBundle(document: MailDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.subject, "mail");
  return buildGenericBundle(document, {
    contentType: "mail",
    title: document.subject,
    fallbackId: contentId,
    targetSchemaVersion: "technica-mail.v1",
    description: "Mailbox entry export with sender, subject, message pages, and unlock conditions.",
    entryFile: "mail.json",
    readme: `# Technica Mail Export

Subject: ${document.subject}
Id: ${document.id}

Importer notes:
- Preserve sender, subject, category, and message body text exactly.
- Unlock requirements are additive: floor gates, completed-dialogue gates, and owned-content gates can all be required together.
- Separate message pages with blank lines when adapting the content to paged UI surfaces.
`
  });
}

export function buildDecorationBundle(document: DecorationDocument): ExportBundle {
  const contentId = runtimeId(document.id || document.name, "decoration");
  const spriteAsset = document.spriteAsset
    ? createImageAssetExport(contentId, "sprite", document.spriteAsset)
    : null;
  return buildGenericBundle(document, {
    contentType: "decoration",
    title: document.name,
    fallbackId: contentId,
    targetSchemaVersion: "technica-decoration.v1",
    description: "Decoration export with sprite art and field-build footprint sizing.",
    entryFile: "decoration.json",
    readme: `# Technica Decoration Export

Name: ${document.name}
Id: ${document.id}

Importer notes:
- Preserve tile size exactly so HAVEN build mode can place the decoration at the intended footprint.
- Sprite art exports to \`assets/\` when present.
`,
    extraFiles: spriteAsset ? [spriteAsset.file] : []
  });
}

export function buildDialogueBundleForTarget(document: DialogueDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreDialogueBundle(
      document,
      createWorkspaceReferenceIndex({ dialogue: document })
    );
  }

  return buildDialogueBundle(document);
}

export function buildQuestBundleForTarget(document: QuestDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreQuestBundle(
      document,
      createWorkspaceReferenceIndex({ quest: document })
    );
  }

  return buildQuestBundle(document);
}

export function buildMapBundleForTarget(document: MapDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreMapBundle(
      document,
      createWorkspaceReferenceIndex({ map: document })
    );
  }

  return buildMapBundle(document);
}

export function buildGearBundleForTarget(document: GearDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreGearBundle(document, createWorkspaceReferenceIndex({ gear: document }));
  }

  return buildGearBundle(document);
}

export function buildItemBundleForTarget(document: ItemDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreItemBundle(document, createWorkspaceReferenceIndex({ item: document }));
  }

  return buildItemBundle(document);
}

export function buildFieldEnemyBundleForTarget(document: FieldEnemyDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreFieldEnemyBundle(document);
  }

  return buildFieldEnemyBundle(document);
}

export function buildCardBundleForTarget(document: CardDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreCardBundle(document, createWorkspaceReferenceIndex({ card: document }));
  }

  return buildCardBundle(document);
}

export function buildUnitBundleForTarget(document: UnitDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreUnitBundle(document, createWorkspaceReferenceIndex({ unit: document }));
  }

  return buildUnitBundle(document);
}

export function buildOperationBundleForTarget(document: OperationDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreOperationBundle(document, createWorkspaceReferenceIndex({ operation: document }));
  }

  return buildOperationBundle(document);
}

export function buildClassBundleForTarget(document: ClassDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreClassBundle(document, createWorkspaceReferenceIndex({ class: document }));
  }

  return buildClassBundle(document);
}

export function buildCraftingBundleForTarget(document: CraftingDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreCraftingBundle(document);
  }

  return buildCraftingBundle(document);
}

export function buildDishBundleForTarget(document: DishDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreDishBundle(document);
  }

  return buildDishBundle(document);
}

export function buildFieldModBundleForTarget(document: FieldModDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreFieldModBundle(document);
  }

  return buildFieldModBundle(document);
}

export function buildSchemaBundleForTarget(document: SchemaDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreSchemaBundle(document);
  }

  return buildSchemaBundle(document);
}

export function buildCodexBundleForTarget(document: CodexDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreCodexBundle(document);
  }

  return buildCodexBundle(document);
}

export function buildMailBundleForTarget(document: MailDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreMailBundle(document);
  }

  return buildMailBundle(document);
}

export function buildDecorationBundleForTarget(document: DecorationDocument, _target: ExportTarget) {
  return buildDecorationBundle(document);
}

export function buildNpcBundleForTarget(document: NpcDocument, target: ExportTarget) {
  if (target === "chaos-core") {
    return buildChaosCoreNpcBundle(document, createWorkspaceReferenceIndex({ npc: document }));
  }

  return buildNpcBundle(document);
}
