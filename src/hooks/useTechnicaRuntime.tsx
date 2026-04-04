import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  TechnicaDeviceType,
  TechnicaRequestedMode,
  TechnicaRuntime,
  TechnicaRuntimeQuery,
  TechnicaSurface
} from "../types/mobile";

function isRequestedMobileMode(value: string | null): value is Exclude<TechnicaRequestedMode, "auto"> {
  return value === "desktop" || value === "mobile";
}

function isRequestedDeviceType(value: string | null): value is TechnicaDeviceType {
  return value === "phone" || value === "tablet";
}

function readRuntimeQuery(): TechnicaRuntimeQuery {
  if (typeof window === "undefined") {
    return {
      mode: "auto",
      deviceType: null,
      sessionId: null,
      pairingToken: null,
      sessionOrigin: null
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const requestedMode = searchParams.get("mode");
  const requestedDeviceType = searchParams.get("deviceType");
  return {
    mode: isRequestedMobileMode(requestedMode) ? requestedMode : "auto",
    deviceType: isRequestedDeviceType(requestedDeviceType) ? requestedDeviceType : null,
    sessionId: searchParams.get("sessionId"),
    pairingToken: searchParams.get("pairingToken"),
    sessionOrigin: searchParams.get("sessionOrigin")
  };
}

function inferDeviceType(queryDeviceType: TechnicaDeviceType | null, width: number): TechnicaDeviceType {
  if (queryDeviceType) {
    return queryDeviceType;
  }

  return width <= 820 ? "phone" : "tablet";
}

function buildRuntime(query: TechnicaRuntimeQuery, width: number): TechnicaRuntime {
  const isPopout = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("popout") === "1";
  const surface: TechnicaSurface = query.mode === "mobile" ? "mobile" : "desktop";
  const deviceType = surface === "mobile" ? inferDeviceType(query.deviceType, width) : null;
  const isMobile = surface === "mobile";

  return {
    surface,
    requestedMode: query.mode,
    deviceType,
    sessionId: query.sessionId,
    pairingToken: query.pairingToken,
    sessionOrigin: query.sessionOrigin,
    isDesktop: !isMobile,
    isMobile,
    isPhone: deviceType === "phone",
    isTablet: deviceType === "tablet",
    isPopout,
    canPublishDirectly: !isMobile,
    canWriteToRepo: !isMobile,
    query
  };
}

const TechnicaRuntimeContext = createContext<TechnicaRuntime | null>(null);

interface TechnicaRuntimeProviderProps {
  children: ReactNode;
}

export function TechnicaRuntimeProvider({ children }: TechnicaRuntimeProviderProps) {
  const [runtimeQuery, setRuntimeQuery] = useState<TechnicaRuntimeQuery>(() => readRuntimeQuery());
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  useEffect(() => {
    function handleQueryChange() {
      setRuntimeQuery(readRuntimeQuery());
    }

    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("popstate", handleQueryChange);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("popstate", handleQueryChange);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const runtime = useMemo(
    () => buildRuntime(runtimeQuery, viewportWidth),
    [runtimeQuery, viewportWidth]
  );

  return <TechnicaRuntimeContext.Provider value={runtime}>{children}</TechnicaRuntimeContext.Provider>;
}

export function useTechnicaRuntime() {
  const runtime = useContext(TechnicaRuntimeContext);
  if (!runtime) {
    throw new Error("useTechnicaRuntime must be used inside TechnicaRuntimeProvider.");
  }
  return runtime;
}
