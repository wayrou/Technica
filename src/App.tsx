import { Suspense, lazy, useEffect, useRef, useState } from "react";
import technicaLogo from "./assets/technica-logo.png";
import { EditorErrorBoundary } from "./components/EditorErrorBoundary";
import { useMobileSession } from "./hooks/useMobileSession";
import { usePersistentState } from "./hooks/usePersistentState";
import { useTechnicaRuntime } from "./hooks/useTechnicaRuntime";
import type { EditorKind } from "./types/common";
import { notify } from "./utils/dialogs";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "./utils/mobileProtocol";
import {
  getRequestedPopoutTab,
  openTechnicaPopout,
  type TechnicaTabId
} from "./utils/popout";

const DialogueStudio = lazy(() =>
  import("./features/dialogue/DialogueStudio").then((module) => ({ default: module.DialogueStudio }))
);
const QuestCreator = lazy(() =>
  import("./features/quest/QuestCreator").then((module) => ({ default: module.QuestCreator }))
);
const MapEditor = lazy(() =>
  import("./features/map/MapEditor").then((module) => ({ default: module.MapEditor }))
);
const NpcEditor = lazy(() =>
  import("./features/npc/NpcEditor").then((module) => ({ default: module.NpcEditor }))
);
const GearEditor = lazy(() =>
  import("./features/gear/GearEditor").then((module) => ({ default: module.GearEditor }))
);
const ItemEditor = lazy(() =>
  import("./features/item/ItemEditor").then((module) => ({ default: module.ItemEditor }))
);
const CardEditor = lazy(() =>
  import("./features/card/CardEditor").then((module) => ({ default: module.CardEditor }))
);
const UnitEditor = lazy(() =>
  import("./features/unit/UnitEditor").then((module) => ({ default: module.UnitEditor }))
);
const OperationEditor = lazy(() =>
  import("./features/operation/OperationEditor").then((module) => ({ default: module.OperationEditor }))
);
const ClassEditor = lazy(() =>
  import("./features/class/ClassEditor").then((module) => ({ default: module.ClassEditor }))
);
const DatabaseExplorer = lazy(() =>
  import("./features/database/DatabaseExplorer").then((module) => ({ default: module.DatabaseExplorer }))
);
const MobileSessionPanel = lazy(() =>
  import("./features/mobile/MobileSessionPanel").then((module) => ({ default: module.MobileSessionPanel }))
);
const DESKTOP_STARTUP_FALLBACK_TABS = new Set<TechnicaTabId>(["map", "card"]);

const MOBILE_INBOX_TARGETS: Partial<Record<EditorKind, { storageKey: string; tabId: TechnicaTabId }>> = {
  dialogue: {
    storageKey: "technica.dialogue.document",
    tabId: "dialogue"
  },
  quest: {
    storageKey: "technica.quest.document",
    tabId: "quest"
  },
  npc: {
    storageKey: "technica.npc.document",
    tabId: "npc"
  },
  item: {
    storageKey: "technica.item.document",
    tabId: "item"
  },
  gear: {
    storageKey: "technica.gear.document",
    tabId: "gear"
  },
  card: {
    storageKey: "technica.card.document",
    tabId: "card"
  },
  unit: {
    storageKey: "technica.unit.document",
    tabId: "unit"
  },
  operation: {
    storageKey: "technica.operation.document",
    tabId: "operation"
  },
  class: {
    storageKey: "technica.class.document",
    tabId: "class"
  },
  map: {
    storageKey: "technica.map.document",
    tabId: "map"
  }
};

const tabs: Array<{ id: TechnicaTabId; label: string }> = [
  {
    id: "dialogue",
    label: "Dialogue Editor"
  },
  {
    id: "quest",
    label: "Quest Editor"
  },
  {
    id: "map",
    label: "Map Editor"
  },
  {
    id: "npc",
    label: "NPC Editor"
  },
  {
    id: "gear",
    label: "Gear Editor"
  },
  {
    id: "item",
    label: "Item Editor"
  },
  {
    id: "card",
    label: "Card Editor"
  },
  {
    id: "unit",
    label: "Unit Editor"
  },
  {
    id: "operation",
    label: "Operation Editor"
  },
  {
    id: "class",
    label: "Class Editor"
  },
  {
    id: "database",
    label: "Database"
  }
];

export default function App() {
  const runtime = useTechnicaRuntime();
  const mobileSession = useMobileSession();
  const requestedPopoutTab = getRequestedPopoutTab();
  const [storedActiveTab, setStoredActiveTab] = usePersistentState<TechnicaTabId>("technica.activeTab", "dialogue");
  const [isMobileSessionOpen, setIsMobileSessionOpen] = useState(false);
  const mobileSessionPopoverRef = useRef<HTMLDivElement | null>(null);
  const activeTab: TechnicaTabId =
    requestedPopoutTab ??
    (runtime.isDesktop && DESKTOP_STARTUP_FALLBACK_TABS.has(storedActiveTab) ? "dialogue" : storedActiveTab);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Technica";
  const mobileTabs = tabs;

  useEffect(() => {
    if (!isMobileSessionOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!mobileSessionPopoverRef.current?.contains(event.target as Node)) {
        setIsMobileSessionOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileSessionOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileSessionOpen]);

  function handleOpenTab(tabId: TechnicaTabId) {
    if (requestedPopoutTab) {
      void openTechnicaPopout(tabId, tabs.find((tab) => tab.id === tabId)?.label ?? "Editor");
      return;
    }

    setStoredActiveTab(tabId);
  }

  function handleOpenMobileInboxEntry(entry: MobileInboxEntry) {
    if (typeof window === "undefined") {
      return;
    }

    if (entry.contentType === "database-selection") {
      notify("Database selections are not wired into the mobile inbox yet.");
      return;
    }

    const target = MOBILE_INBOX_TARGETS[entry.contentType];
    if (!target) {
      notify(`${entry.contentType} mobile review is not wired up yet.`);
      return;
    }

    try {
      window.localStorage.setItem(target.storageKey, JSON.stringify(entry.payload));
      window.dispatchEvent(
        new CustomEvent(TECHNICA_MOBILE_INBOX_OPEN_EVENT, {
          detail: {
            entry
          }
        })
      );
      setStoredActiveTab(target.tabId);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load the mobile inbox entry.");
    }
  }

  function renderActiveEditor() {
    if (activeTab === "dialogue") {
      return <DialogueStudio />;
    }
    if (activeTab === "quest") {
      return <QuestCreator />;
    }
    if (activeTab === "map") {
      return <MapEditor />;
    }
    if (activeTab === "npc") {
      return <NpcEditor />;
    }
    if (activeTab === "gear") {
      return <GearEditor />;
    }
    if (activeTab === "item") {
      return <ItemEditor />;
    }
    if (activeTab === "card") {
      return <CardEditor />;
    }
    if (activeTab === "unit") {
      return <UnitEditor />;
    }
    if (activeTab === "operation") {
      return <OperationEditor />;
    }
    if (activeTab === "class") {
      return <ClassEditor />;
    }
    return <DatabaseExplorer onOpenEditor={handleOpenTab} />;
  }

  return (
    <div
      className={[
        "app-shell",
        requestedPopoutTab ? "popout-shell" : "",
        isMobileSessionOpen ? "mobile-session-open" : "",
        runtime.surface === "mobile" ? "surface-mobile" : "surface-desktop",
        runtime.isPhone ? "device-phone" : "",
        runtime.isTablet ? "device-tablet" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-surface={runtime.surface}
      data-device-type={runtime.deviceType ?? undefined}
      data-session-id={runtime.sessionId ?? undefined}
    >
      <div className="app-backdrop" />
      {isMobileSessionOpen && runtime.isDesktop && !requestedPopoutTab ? <div className="header-mobile-session-scrim" /> : null}
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src={technicaLogo} alt="Technica logo" />
          <div className="brand-copy">
            <h1>{requestedPopoutTab ? activeTabLabel : "Technica"}</h1>
            {runtime.isMobile ? (
              <p className="runtime-pill">
                {runtime.isPhone ? "Mobile Phone" : "Mobile Tablet"}
                {runtime.sessionId ? ` · Session ${runtime.sessionId}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        {runtime.isDesktop && !requestedPopoutTab ? (
          <div className="app-header-actions" ref={mobileSessionPopoverRef}>
            <button
              type="button"
              className={isMobileSessionOpen ? "header-utility-button active" : "header-utility-button"}
              onClick={() => setIsMobileSessionOpen((current) => !current)}
              aria-expanded={isMobileSessionOpen}
              aria-haspopup="dialog"
            >
              <span className="header-utility-label">Mobile Session</span>
              <span className="header-utility-status">{isMobileSessionOpen ? "Close" : "Open"}</span>
            </button>
            {isMobileSessionOpen ? (
              <div className="header-mobile-session-popover" role="dialog" aria-label="Mobile session">
                <Suspense fallback={<div className="empty-state compact">Loading mobile session...</div>}>
                  <MobileSessionPanel onOpenInboxEntry={handleOpenMobileInboxEntry} />
                </Suspense>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {!requestedPopoutTab && runtime.isDesktop ? (
        <nav className="tab-nav" aria-label="Technica editors">
          {tabs.map((tab) => (
            <div key={tab.id} className="tab-nav-item">
              <button
                type="button"
                className={tab.id === activeTab ? "tab-button active" : "tab-button"}
                onClick={() => setStoredActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
              </button>
              {runtime.isDesktop ? (
                <button
                  type="button"
                  className="tab-popout-button"
                  onClick={() => void openTechnicaPopout(tab.id, tab.label)}
                  aria-label={`Pop out ${tab.label}`}
                >
                  Open
                </button>
              ) : null}
            </div>
          ))}
        </nav>
      ) : null}

      {runtime.isMobile ? (
        <>
          <div className="mobile-session-banner">
            <strong>
              {mobileSession.isEnabled
                ? mobileSession.connectionState === "connected"
                  ? "Connected to desktop"
                  : mobileSession.connectionState === "pairing"
                    ? "Pairing with desktop"
                    : mobileSession.connectionState === "reconnecting"
                      ? "Reconnecting to desktop"
                      : "Mobile session issue"
                : "Mobile preview mode"}
            </strong>
            <span>
              {mobileSession.isEnabled
                ? mobileSession.session?.localUrl ?? runtime.sessionOrigin ?? "Waiting for session details"
                : "Open through the pairing URL from the desktop app to attach this shell to a live Technica session."}
            </span>
            {mobileSession.error ? <small>{mobileSession.error}</small> : null}
          </div>

          <nav className="mobile-tab-nav" aria-label="Technica mobile editors">
            {mobileTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? "mobile-tab-button active" : "mobile-tab-button"}
                onClick={() => setStoredActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </>
      ) : null}

      <main className="app-main">
        <EditorErrorBoundary>
          <Suspense fallback={<div className="empty-state compact">Loading editor...</div>}>
            {renderActiveEditor()}
          </Suspense>
        </EditorErrorBoundary>
      </main>
    </div>
  );
}
