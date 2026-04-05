import type { EditorKind } from "../types/common";
import { isTauriRuntime } from "./chaosCoreDatabase";

export type TechnicaTabId = EditorKind | "database";
export type TechnicaPopoutId = TechnicaTabId | "card-preview" | "class-preview";

export function getRequestedPopoutTab(): TechnicaPopoutId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("popout") !== "1") {
    return null;
  }

  const tab = params.get("tab");
  if (
    tab === "dialogue" ||
    tab === "quest" ||
    tab === "map" ||
    tab === "npc" ||
    tab === "gear" ||
    tab === "item" ||
    tab === "crafting" ||
    tab === "dish" ||
    tab === "fieldmod" ||
    tab === "schema" ||
    tab === "card" ||
    tab === "unit" ||
    tab === "operation" ||
    tab === "class" ||
    tab === "database" ||
    tab === "card-preview" ||
    tab === "class-preview"
  ) {
    return tab;
  }

  return null;
}

export async function openTechnicaPopout(tab: TechnicaPopoutId, title: string) {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("popout", "1");
  nextUrl.searchParams.set("tab", tab);
  const url = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;

  if (isTauriRuntime()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `technica-${tab}-${Date.now()}`;
      const popout = new WebviewWindow(label, {
        title: `Technica - ${title}`,
        url,
        width: 1680,
        height: 1080,
        resizable: true,
        decorations: true,
      });

      void popout.once("tauri://created", () => {});
      void popout.once("tauri://error", () => {
        window.open(url, "_blank", "popup=yes,width=1680,height=1080");
      });
      return;
    } catch {
      // Fall through to a browser pop-out.
    }
  }

  window.open(url, "_blank", "popup=yes,width=1680,height=1080");
}
