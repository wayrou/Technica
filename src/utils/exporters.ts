import JSZip from "jszip";
import {
  TECHNICA_SCHEMA_VERSION,
  TECHNICA_SOURCE_APP,
  TECHNICA_SOURCE_APP_VERSION,
  type DraftEnvelope,
  type EditorKind,
  type ExportBundle,
  type ExportManifest,
  type ExportTarget
} from "../types/common";
import type { DialogueDocument } from "../types/dialogue";
import type { MapDocument } from "../types/map";
import type { QuestDocument } from "../types/quest";
import {
  buildChaosCoreDialogueBundle,
  buildChaosCoreMapBundle,
  buildChaosCoreQuestBundle,
  createWorkspaceReferenceIndex
} from "./chaosCoreExport";
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
    archive.file(file.name, file.content);
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
