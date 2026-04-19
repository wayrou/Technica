export type TechnicaUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "up-to-date"
  | "skipped"
  | "failed";

export interface TechnicaUpdateEvent {
  status: TechnicaUpdateStatus;
  message: string;
}

export interface TechnicaUpdateOptions {
  manual?: boolean;
  onEvent?: (event: TechnicaUpdateEvent) => void;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function canUseTechnicaUpdater() {
  return isTauriRuntime() && import.meta.env.PROD;
}

function emitUpdateEvent(options: TechnicaUpdateOptions, status: TechnicaUpdateStatus, message: string) {
  options.onEvent?.({
    status,
    message
  });
}

export async function checkAndInstallTechnicaUpdate(options: TechnicaUpdateOptions = {}) {
  if (!canUseTechnicaUpdater()) {
    emitUpdateEvent(options, "skipped", "Updater checks only run in installed desktop builds.");
    return "skipped" as const;
  }

  emitUpdateEvent(options, "checking", "Checking for Technica updates...");

  try {
    const [{ check }, { relaunch }] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/plugin-process")
    ]);
    const update = await check();

    if (!update) {
      emitUpdateEvent(options, "up-to-date", "Technica is up to date.");
      return "up-to-date" as const;
    }

    emitUpdateEvent(options, "available", `Technica ${update.version} is available. Installing update...`);
    let downloaded = 0;
    let contentLength = 0;
    let lastProgressNotice = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? 0;
        downloaded = 0;
        emitUpdateEvent(options, "downloading", "Downloading Technica update...");
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (contentLength > 0) {
          const percent = Math.floor((downloaded / contentLength) * 100);
          if (percent >= lastProgressNotice + 25) {
            lastProgressNotice = percent;
            emitUpdateEvent(options, "downloading", `Downloading Technica update... ${Math.min(percent, 100)}%`);
          }
        }
        return;
      }

      if (event.event === "Finished") {
        emitUpdateEvent(options, "installing", "Installing Technica update...");
      }
    });

    emitUpdateEvent(options, "installing", "Technica update installed. Relaunching...");
    await relaunch();
    return "installed" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Technica update check failed.";
    emitUpdateEvent(options, "failed", message);
    return "failed" as const;
  }
}
