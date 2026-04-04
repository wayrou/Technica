export type TechnicaSurface = "desktop" | "mobile";

export type TechnicaRequestedMode = "desktop" | "mobile" | "auto";

export type TechnicaDeviceType = "phone" | "tablet";

export interface TechnicaRuntimeQuery {
  mode: TechnicaRequestedMode;
  deviceType: TechnicaDeviceType | null;
  sessionId: string | null;
  pairingToken: string | null;
  sessionOrigin: string | null;
}

export interface TechnicaRuntime {
  surface: TechnicaSurface;
  requestedMode: TechnicaRequestedMode;
  deviceType: TechnicaDeviceType | null;
  sessionId: string | null;
  pairingToken: string | null;
  sessionOrigin: string | null;
  isDesktop: boolean;
  isMobile: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isPopout: boolean;
  canPublishDirectly: boolean;
  canWriteToRepo: boolean;
  query: TechnicaRuntimeQuery;
}
