import type { EditorKind } from "../types/common";
import type { TechnicaDeviceType } from "../types/mobile";

export const TECHNICA_MOBILE_INBOX_OPEN_EVENT = "technica:mobile-inbox-open";

export type MobileSessionState = "active" | "inactive";

export type MobileContentType = EditorKind | "database-selection";

export type MobileSendTarget = "desktop-inbox" | "publish-request" | "bundle-request";

export type MobileDocumentPatch =
  | {
      type: "replace_field";
      path: string;
      value: unknown;
    }
  | {
      type: "insert_list_item";
      path: string;
      index: number;
      value: unknown;
    }
  | {
      type: "update_list_item";
      path: string;
      index: number;
      value: unknown;
    }
  | {
      type: "remove_list_item";
      path: string;
      index: number;
    }
  | {
      type: "move_list_item";
      path: string;
      fromIndex: number;
      toIndex: number;
    };

export interface MobilePairingToken {
  token: string;
  expiresAt: string;
}

export interface MobileDeviceInfo {
  deviceId: string;
  label: string;
  deviceType: TechnicaDeviceType;
  joinedAt: string;
  lastSeenAt: string;
}

export interface MobileProjectSnapshot {
  sessionId: string;
  projectId: string;
  generatedAt: string;
  supportedContentTypes: MobileContentType[];
}

export interface MobileSessionSummary {
  state: MobileSessionState;
  sessionId: string;
  projectId: string;
  startedAt: string;
  lastActivityAt: string;
  localUrl: string | null;
  pairing: MobilePairingToken;
  joinedDevices: MobileDeviceInfo[];
  inboxCount: number;
}

export interface MobileInboxEntry {
  id: string;
  contentType: MobileContentType;
  contentId: string;
  title: string;
  deviceId: string;
  deviceLabel: string;
  submittedAt: string;
  summary: string;
  payload: unknown;
}

export interface MobileSendResult {
  accepted: boolean;
  inboxEntryId?: string;
  receivedAt: string;
  message: string;
}

export interface MobileExportRequest {
  contentType: MobileContentType;
  contentId: string;
  title: string;
  target: MobileSendTarget;
  summary?: string;
}

export interface MobileInboxSubmission {
  contentType: MobileContentType;
  contentId: string;
  title: string;
  deviceId: string;
  deviceLabel: string;
  deviceType: TechnicaDeviceType;
  summary?: string;
  payload: unknown;
}
