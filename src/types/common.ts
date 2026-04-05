export const TECHNICA_SCHEMA_VERSION = "1.0.0";
export const TECHNICA_SOURCE_APP = "Technica";
export const TECHNICA_SOURCE_APP_VERSION = "0.1.0";

export type EditorKind =
  | "dialogue"
  | "quest"
  | "map"
  | "npc"
  | "gear"
  | "item"
  | "card"
  | "unit"
  | "operation"
  | "class"
  | "crafting"
  | "dish"
  | "fieldmod"
  | "schema";
export type DatabaseContentType = Exclude<EditorKind, "crafting" | "dish" | "fieldmod">;
export type Severity = "error" | "warning";
export type KeyValueRecord = Record<string, string>;
export type ExportTarget = "generic" | "chaos-core";

export interface ImageAsset {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export interface ExportDependency {
  contentType: EditorKind | "scene";
  id: string;
  relation: string;
}

export interface ValidationIssue {
  severity: Severity;
  message: string;
  field?: string;
  line?: number;
}

export interface ExportManifest {
  schemaVersion: string;
  sourceApp: typeof TECHNICA_SOURCE_APP;
  sourceAppVersion: string;
  exportType: EditorKind;
  contentType: EditorKind;
  targetGame: string;
  targetSchemaVersion: string;
  exportedAt: string;
  contentId: string;
  title: string;
  description: string;
  entryFile: string;
  dependencies: ExportDependency[];
  files: string[];
}

export interface ExportBundleFile {
  name: string;
  content: string;
  encoding?: "utf8" | "base64";
}

export interface ExportBundle {
  bundleName: string;
  manifest: ExportManifest;
  files: ExportBundleFile[];
}

export interface DraftEnvelope<TPayload> {
  schemaVersion: string;
  sourceApp: typeof TECHNICA_SOURCE_APP;
  draftType: EditorKind;
  savedAt: string;
  payload: TPayload;
}
