import type { TechnicaDeviceType } from "../types/mobile";
import type { MobileInboxEntry, MobileInboxSubmission, MobileSendResult, MobileSessionSummary } from "./mobileProtocol";
import { isTauriRuntime } from "./chaosCoreDatabase";

const MOBILE_DEVICE_ID_STORAGE_KEY = "technica.mobile.deviceId";

function buildSessionUrl(origin: string, path: string) {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function createMobileDeviceId() {
  return `mdev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getOrCreateMobileDeviceId() {
  if (typeof window === "undefined") {
    return "mdev_browser";
  }

  const existing = window.localStorage.getItem(MOBILE_DEVICE_ID_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const nextId = createMobileDeviceId();
  window.localStorage.setItem(MOBILE_DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

function buildMobileDeviceLabel(deviceType: TechnicaDeviceType) {
  const navigatorWithUAData =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { userAgentData?: { platform?: string } })
      : null;
  const platform =
    navigatorWithUAData?.userAgentData?.platform || navigatorWithUAData?.platform || "Browser";
  return `${deviceType === "tablet" ? "Tablet" : "Phone"} · ${platform}`;
}

export function getMobileDeviceIdentity(deviceType: TechnicaDeviceType | null) {
  const normalizedDeviceType: TechnicaDeviceType = deviceType === "tablet" ? "tablet" : "phone";
  return {
    deviceId: getOrCreateMobileDeviceId(),
    deviceType: normalizedDeviceType,
    deviceLabel: buildMobileDeviceLabel(normalizedDeviceType)
  };
}

async function fetchMobileSessionJson<TResponse>(origin: string, path: string, init?: RequestInit) {
  const response = await fetch(buildSessionUrl(origin, path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Session request failed with ${response.status}.`);
  }

  return (await response.json()) as TResponse;
}

async function invokeMobileCommand<TResponse>(
  command: string,
  payload?: Record<string, unknown>
): Promise<TResponse> {
  if (!isTauriRuntime()) {
    throw new Error("Mobile session controls are only available in the Technica desktop app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TResponse>(command, payload);
}

export async function startMobileSession() {
  return invokeMobileCommand<MobileSessionSummary>("start_mobile_session");
}

export async function stopMobileSession() {
  return invokeMobileCommand<void>("stop_mobile_session");
}

export async function getMobileSessionStatus() {
  return invokeMobileCommand<MobileSessionSummary | null>("get_mobile_session_status");
}

export async function listMobileInboxEntries() {
  return invokeMobileCommand<MobileInboxEntry[]>("list_mobile_inbox_entries");
}

export async function acceptMobileInboxEntry(entryId: string) {
  return invokeMobileCommand<MobileInboxEntry>("accept_mobile_inbox_entry", { entryId });
}

export async function rejectMobileInboxEntry(entryId: string) {
  return invokeMobileCommand<MobileInboxEntry>("reject_mobile_inbox_entry", { entryId });
}

export async function submitMobileInboxEntry(options: {
  sessionOrigin: string;
  pairingToken: string;
  deviceType: TechnicaDeviceType | null;
  request: Omit<MobileInboxSubmission, "deviceId" | "deviceLabel" | "deviceType">;
}) {
  const identity = getMobileDeviceIdentity(options.deviceType);
  return fetchMobileSessionJson<MobileSendResult>(
    options.sessionOrigin,
    `/api/inbox/submit?token=${encodeURIComponent(options.pairingToken)}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...options.request,
        ...identity
      } satisfies MobileInboxSubmission)
    }
  );
}
