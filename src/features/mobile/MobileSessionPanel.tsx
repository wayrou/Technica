import { useEffect, useState } from "react";
import { Panel } from "../../components/Panel";
import { QrCodePanel } from "../../components/QrCodePanel";
import { notify } from "../../utils/dialogs";
import {
  acceptMobileInboxEntry,
  getMobileSessionStatus,
  listMobileInboxEntries,
  rejectMobileInboxEntry,
  startMobileSession,
  stopMobileSession
} from "../../utils/mobileSession";
import type { MobileInboxEntry, MobileSessionSummary } from "../../utils/mobileProtocol";

interface MobileSessionPanelProps {
  onOpenInboxEntry?: (entry: MobileInboxEntry) => void;
}

function formatTimestamp(value: string) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return value;
  }

  return new Date(asNumber).toLocaleString();
}

export function MobileSessionPanel({ onOpenInboxEntry }: MobileSessionPanelProps) {
  const [session, setSession] = useState<MobileSessionSummary | null>(null);
  const [inboxEntries, setInboxEntries] = useState<MobileInboxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const pairingUrl = session?.localUrl ? `${session.localUrl}/pair/${session.pairing.token}` : "";

  async function refreshSessionStatus() {
    try {
      const nextSession = await getMobileSessionStatus();
      setSession(nextSession);
      setInboxEntries(nextSession ? await listMobileInboxEntries() : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not refresh the mobile session status.");
    }
  }

  async function handleStartSession() {
    setIsLoading(true);
    try {
      const nextSession = await startMobileSession();
      setSession(nextSession);
      setInboxEntries(await listMobileInboxEntries());
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not start a mobile session.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStopSession() {
    setIsLoading(true);
    try {
      await stopMobileSession();
      setSession(null);
      setInboxEntries([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not stop the mobile session.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`Copied ${label}.`);
    } catch {
      notify(`Could not copy the ${label}.`);
    }
  }

  async function handleOpenInboxEntry(entryId: string) {
    setBusyEntryId(entryId);
    try {
      const acceptedEntry = await acceptMobileInboxEntry(entryId);
      setInboxEntries((current) => current.filter((entry) => entry.id !== entryId));
      onOpenInboxEntry?.(acceptedEntry);
      await refreshSessionStatus();
      notify(`Opened ${acceptedEntry.title} in Technica.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not open the mobile inbox entry.");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleRejectInboxEntry(entryId: string) {
    setBusyEntryId(entryId);
    try {
      const rejectedEntry = await rejectMobileInboxEntry(entryId);
      setInboxEntries((current) => current.filter((entry) => entry.id !== entryId));
      await refreshSessionStatus();
      notify(`Removed ${rejectedEntry.title} from the desktop inbox.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not reject the mobile inbox entry.");
    } finally {
      setBusyEntryId(null);
    }
  }

  useEffect(() => {
    void refreshSessionStatus();

    const intervalId = window.setInterval(() => {
      void refreshSessionStatus();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <Panel
      title="Mobile Session"
      subtitle="Start a local phone/tablet session from the desktop app, then scan the pairing QR code or open the pairing URL on the same network."
      actions={
        <div className="toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={() => void refreshSessionStatus()}
            disabled={isLoading}
          >
            Refresh
          </button>
          {session ? (
            <button
              type="button"
              className="ghost-button danger"
              onClick={() => void handleStopSession()}
              disabled={isLoading}
            >
              Stop session
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleStartSession()}
              disabled={isLoading}
            >
              Start session
            </button>
          )}
        </div>
      }
    >
      {session ? (
        <div className="mobile-session-grid">
          <div className="mobile-session-card full">
            {pairingUrl ? (
              <div className="mobile-session-pairing">
                <QrCodePanel
                  value={pairingUrl}
                  label="Scan to pair"
                  hint="Open the camera on your phone or tablet and scan this code while connected to the same local network."
                />
                <div className="mobile-session-instructions">
                  <div className="chip-row">
                    <span className="pill accent">1. Start session</span>
                    <span className="pill accent">2. Scan QR</span>
                    <span className="pill accent">3. Join on mobile</span>
                  </div>
                  <div className="stack-list">
                    <div>
                      <span className="muted">Pairing URL</span>
                      <strong>{pairingUrl}</strong>
                    </div>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleCopy(pairingUrl, "pairing URL")}
                      >
                        Copy pairing URL
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleCopy(session.pairing.token, "pairing token")}
                      >
                        Copy token
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state compact">
                The mobile session server started, but a pairing URL is not available yet.
              </div>
            )}
          </div>
          <div className="mobile-session-card">
            <span className="muted">Session id</span>
            <strong>{session.sessionId}</strong>
          </div>
          <div className="mobile-session-card">
            <span className="muted">Pairing token</span>
            <strong>{session.pairing.token}</strong>
          </div>
          <div className="mobile-session-card">
            <span className="muted">Expires at</span>
            <strong>{formatTimestamp(session.pairing.expiresAt)}</strong>
          </div>
          <div className="mobile-session-card">
            <span className="muted">Joined devices</span>
            <strong>{session.joinedDevices.length}</strong>
          </div>
          <div className="mobile-session-card">
            <span className="muted">Inbox</span>
            <strong>{inboxEntries.length}</strong>
          </div>
          <div className="mobile-session-card full">
            <span className="muted">LAN URL</span>
            <strong>{session.localUrl ?? "Server unavailable"}</strong>
            <div className="toolbar">
              {session.localUrl ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void handleCopy(session.localUrl ?? "", "mobile session URL")}
                >
                  Copy URL
                </button>
              ) : null}
              {pairingUrl ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void handleCopy(pairingUrl, "pairing URL")}
                >
                  Copy pairing URL
                </button>
              ) : null}
            </div>
          </div>
          <div className="mobile-session-card full">
            <span className="muted">Desktop inbox</span>
            <div className="database-list">
              {inboxEntries.length === 0 ? (
                <div className="empty-state compact">
                  Drafts sent from mobile will land here for review.
                </div>
              ) : (
                inboxEntries.map((entry) => (
                  <div key={entry.id} className="database-entry">
                    <strong>{entry.title}</strong>
                    <span>
                      {entry.contentType} · {entry.deviceLabel}
                    </span>
                    <small>
                      {entry.summary} · Received {formatTimestamp(entry.submittedAt)}
                    </small>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleOpenInboxEntry(entry.id)}
                        disabled={busyEntryId === entry.id}
                      >
                        Open in editor
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={() => void handleRejectInboxEntry(entry.id)}
                        disabled={busyEntryId === entry.id}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="mobile-session-card full">
            <span className="muted">Joined devices</span>
            <div className="database-list">
              {session.joinedDevices.length === 0 ? (
                <div className="empty-state compact">No phones or tablets have paired yet.</div>
              ) : (
                session.joinedDevices.map((device) => (
                  <div key={device.deviceId} className="database-entry">
                    <strong>{device.label}</strong>
                    <span>{device.deviceType}</span>
                    <small>
                      Joined {formatTimestamp(device.joinedAt)} · Last seen {formatTimestamp(device.lastSeenAt)}
                    </small>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state compact">
          No mobile session is running. Start one here to bring up the local Technica session server.
        </div>
      )}
    </Panel>
  );
}
