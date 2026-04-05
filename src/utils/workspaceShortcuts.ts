export const TECHNICA_WORKSPACE_COMMAND_EVENT = "technica:workspace-command";

export type WorkspaceCommand =
  | "import-draft"
  | "save-draft"
  | "export-bundle";

export function dispatchWorkspaceCommand(command: WorkspaceCommand) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ command: WorkspaceCommand }>(TECHNICA_WORKSPACE_COMMAND_EVENT, {
      detail: { command },
    })
  );
}
