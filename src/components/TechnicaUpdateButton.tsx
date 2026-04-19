import { useEffect, useRef, useState } from "react";
import { notify } from "../utils/dialogs";
import {
  canUseTechnicaUpdater,
  checkAndInstallTechnicaUpdate,
  type TechnicaUpdateStatus
} from "../utils/technicaUpdater";

interface TechnicaUpdateButtonProps {
  autoCheck?: boolean;
}

const busyStatuses: TechnicaUpdateStatus[] = ["checking", "available", "downloading", "installing"];

export function TechnicaUpdateButton({ autoCheck = true }: TechnicaUpdateButtonProps) {
  const [status, setStatus] = useState<TechnicaUpdateStatus>("idle");
  const hasAutoChecked = useRef(false);
  const isAvailable = canUseTechnicaUpdater();
  const isBusy = busyStatuses.includes(status);

  async function runUpdateCheck(manual: boolean) {
    if (!isAvailable || isBusy) {
      return;
    }

    const result = await checkAndInstallTechnicaUpdate({
      manual,
      onEvent: (event) => {
        setStatus(event.status);
        if (manual || event.status === "available" || event.status === "installing" || event.status === "failed") {
          notify(event.message);
        }
      }
    });

    if (result === "up-to-date" || result === "failed" || result === "skipped") {
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  }

  useEffect(() => {
    if (!autoCheck || !isAvailable || hasAutoChecked.current) {
      return;
    }

    hasAutoChecked.current = true;
    const timeout = window.setTimeout(() => {
      void runUpdateCheck(false);
    }, 2400);

    return () => window.clearTimeout(timeout);
  }, [autoCheck, isAvailable]);

  if (!isAvailable) {
    return null;
  }

  const label =
    status === "checking"
      ? "Checking updates"
      : status === "downloading"
        ? "Downloading update"
        : status === "installing"
          ? "Installing update"
          : "Check updates";

  return (
    <button
      type="button"
      className={isBusy ? "header-utility-button active" : "header-utility-button"}
      onClick={() => void runUpdateCheck(true)}
      disabled={isBusy}
    >
      <span className="header-utility-label">Technica Updates</span>
      <span className="header-utility-status">{label}</span>
    </button>
  );
}
