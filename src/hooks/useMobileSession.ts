import { useEffect, useMemo, useState } from "react";
import { useTechnicaRuntime } from "./useTechnicaRuntime";
import { getMobileDeviceIdentity } from "../utils/mobileSession";
import type { MobileSessionSummary } from "../utils/mobileProtocol";

export type MobileConnectionState =
  | "idle"
  | "pairing"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface PairingResponse {
  paired: boolean;
  session: MobileSessionSummary;
}

interface SessionStatusResponse {
  session: MobileSessionSummary;
}

function buildSessionUrl(origin: string, path: string) {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function updateRuntimeQuery(session: MobileSessionSummary, sessionOrigin: string, pairingToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("mode", "mobile");
  nextUrl.searchParams.set("sessionId", session.sessionId);
  nextUrl.searchParams.set("pairingToken", pairingToken);
  nextUrl.searchParams.set("sessionOrigin", sessionOrigin);
  window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useMobileSession() {
  const runtime = useTechnicaRuntime();
  const [connectionState, setConnectionState] = useState<MobileConnectionState>("idle");
  const [session, setSession] = useState<MobileSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionOrigin = runtime.sessionOrigin;
  const pairingToken = runtime.pairingToken;
  const deviceIdentity = useMemo(() => getMobileDeviceIdentity(runtime.deviceType), [runtime.deviceType]);

  const isEnabled = useMemo(
    () => runtime.isMobile && Boolean(sessionOrigin && pairingToken),
    [pairingToken, runtime.isMobile, sessionOrigin]
  );

  useEffect(() => {
    let cancelled = false;

    async function pairAndPoll() {
      if (!isEnabled || !sessionOrigin || !pairingToken) {
        setConnectionState(runtime.isMobile ? "disconnected" : "idle");
        setSession(null);
        setError(null);
        return;
      }

      setConnectionState("pairing");
      setError(null);

      async function fetchJson<TResponse>(url: string) {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Session request failed with ${response.status}.`);
        }

        return (await response.json()) as TResponse;
      }

      try {
        const pairResponse = await fetchJson<PairingResponse>(
          buildSessionUrl(
            sessionOrigin,
            `/api/pair/${pairingToken}?deviceId=${encodeURIComponent(deviceIdentity.deviceId)}&deviceLabel=${encodeURIComponent(deviceIdentity.deviceLabel)}&deviceType=${encodeURIComponent(deviceIdentity.deviceType)}`
          )
        );

        if (cancelled) {
          return;
        }

        setSession(pairResponse.session);
        updateRuntimeQuery(pairResponse.session, sessionOrigin, pairingToken);
        setConnectionState("connected");
      } catch (nextError) {
        if (!cancelled) {
          setConnectionState("error");
          setError(nextError instanceof Error ? nextError.message : "Could not pair with the desktop session.");
        }
        return;
      }

      const intervalId = window.setInterval(async () => {
        try {
          const statusResponse = await fetchJson<SessionStatusResponse>(
            buildSessionUrl(sessionOrigin, `/session/status?token=${encodeURIComponent(pairingToken)}`)
          );
          if (cancelled) {
            return;
          }
          setSession(statusResponse.session);
          setConnectionState("connected");
          setError(null);
        } catch (nextError) {
          if (cancelled) {
            return;
          }
          setConnectionState((current) => (current === "connected" ? "reconnecting" : "error"));
          setError(nextError instanceof Error ? nextError.message : "Could not refresh the desktop session.");
        }
      }, 5000);

      return () => {
        window.clearInterval(intervalId);
      };
    }

    let cleanup: (() => void) | undefined;
    void pairAndPoll().then((nextCleanup) => {
      cleanup = nextCleanup;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [deviceIdentity.deviceId, deviceIdentity.deviceLabel, deviceIdentity.deviceType, isEnabled, pairingToken, runtime.isMobile, sessionOrigin]);

  return {
    connectionState,
    session,
    error,
    isEnabled
  };
}
