import { Suspense, lazy, useEffect, useRef, useState } from "react";
import technicaLogo from "./assets/technica-logo.png";
import { EditorErrorBoundary } from "./components/EditorErrorBoundary";
import { Panel } from "./components/Panel";
import { useMobileSession } from "./hooks/useMobileSession";
import { usePersistentState } from "./hooks/usePersistentState";
import { useTechnicaRuntime } from "./hooks/useTechnicaRuntime";
import type { EditorKind } from "./types/common";
import { notify } from "./utils/dialogs";
import { TECHNICA_MOBILE_INBOX_OPEN_EVENT, type MobileInboxEntry } from "./utils/mobileProtocol";
import {
  getRequestedPopoutTab,
  openTechnicaPopout,
  type TechnicaPopoutId,
  type TechnicaTabId
} from "./utils/popout";
import { dispatchWorkspaceCommand } from "./utils/workspaceShortcuts";

const DialogueStudio = lazy(() =>
  import("./features/dialogue/DialogueStudio").then((module) => ({ default: module.DialogueStudio }))
);
const MailEditor = lazy(() =>
  import("./features/mail/MailEditor").then((module) => ({ default: module.MailEditor }))
);
const ChatterEditor = lazy(() =>
  import("./features/chatter/ChatterEditor").then((module) => ({ default: module.ChatterEditor }))
);
const QuestCreator = lazy(() =>
  import("./features/quest/QuestCreator").then((module) => ({ default: module.QuestCreator }))
);
const KeyItemEditor = lazy(() =>
  import("./features/keyItem/KeyItemEditor").then((module) => ({ default: module.KeyItemEditor }))
);
const FactionEditor = lazy(() =>
  import("./features/faction/FactionEditor").then((module) => ({ default: module.FactionEditor }))
);
const ChassisEditor = lazy(() =>
  import("./features/chassis/ChassisEditor").then((module) => ({ default: module.ChassisEditor }))
);
const DoctrineEditor = lazy(() =>
  import("./features/doctrine/DoctrineEditor").then((module) => ({ default: module.DoctrineEditor }))
);
const MapEditor = lazy(() =>
  import("./features/map/MapEditor").then((module) => ({ default: module.MapEditor }))
);
const FieldEnemyEditor = lazy(() =>
  import("./features/fieldEnemy/FieldEnemyEditor").then((module) => ({ default: module.FieldEnemyEditor }))
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
const CraftingEditor = lazy(() =>
  import("./features/crafting/CraftingEditor").then((module) => ({ default: module.CraftingEditor }))
);
const DishEditor = lazy(() =>
  import("./features/dish/DishEditor").then((module) => ({ default: module.DishEditor }))
);
const CodexEditor = lazy(() =>
  import("./features/codex/CodexEditor").then((module) => ({ default: module.CodexEditor }))
);
const FieldModEditor = lazy(() =>
  import("./features/fieldmod/FieldModEditor").then((module) => ({ default: module.FieldModEditor }))
);
const DecorationEditor = lazy(() =>
  import("./features/decoration/DecorationEditor").then((module) => ({ default: module.DecorationEditor }))
);
const SchemaEditor = lazy(() =>
  import("./features/schema/SchemaEditor").then((module) => ({ default: module.SchemaEditor }))
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
const EffectFlowPopoutSurface = lazy(() =>
  import("./features/effects/EffectFlowPopoutSurface").then((module) => ({ default: module.EffectFlowPopoutSurface }))
);
const DatabaseExplorer = lazy(() =>
  import("./features/database/DatabaseExplorer").then((module) => ({ default: module.DatabaseExplorer }))
);
const MobileSessionPanel = lazy(() =>
  import("./features/mobile/MobileSessionPanel").then((module) => ({ default: module.MobileSessionPanel }))
);
const FLOW_POPOUT_BY_TAB: Partial<Record<TechnicaTabId, TechnicaPopoutId>> = {
  card: "card-flow",
  fieldmod: "fieldmod-flow",
};
const workspaceShortcuts = [
  { keys: "Ctrl/Cmd + 1..0", label: "Switch tabs" },
  { keys: "Ctrl/Cmd + S", label: "Save current draft file" },
  { keys: "Ctrl/Cmd + O", label: "Import draft file" },
  { keys: "Ctrl/Cmd + Enter", label: "Export current bundle" },
  { keys: "Ctrl/Cmd + Shift + P", label: "Pop out current editor" },
  { keys: "Ctrl/Cmd + Shift + D", label: "Open database window" },
  { keys: "?", label: "Toggle shortcuts overlay" },
];

const MOBILE_INBOX_TARGETS: Partial<Record<EditorKind, { storageKey: string; tabId: TechnicaTabId }>> = {
  dialogue: {
    storageKey: "technica.dialogue.document",
    tabId: "dialogue"
  },
  mail: {
    storageKey: "technica.mail.document",
    tabId: "mail"
  },
  chatter: {
    storageKey: "technica.chatter.document",
    tabId: "chatter"
  },
  quest: {
    storageKey: "technica.quest.document",
    tabId: "quest"
  },
  key_item: {
    storageKey: "technica.keyItem.document",
    tabId: "key_item"
  },
  faction: {
    storageKey: "technica.faction.document",
    tabId: "faction"
  },
  chassis: {
    storageKey: "technica.chassis.document",
    tabId: "chassis"
  },
  doctrine: {
    storageKey: "technica.doctrine.document",
    tabId: "doctrine"
  },
  field_enemy: {
    storageKey: "technica.fieldEnemy.document",
    tabId: "field_enemy"
  },
  npc: {
    storageKey: "technica.npc.document",
    tabId: "npc"
  },
  item: {
    storageKey: "technica.item.document",
    tabId: "item"
  },
  crafting: {
    storageKey: "technica.crafting.document",
    tabId: "crafting"
  },
  dish: {
    storageKey: "technica.dish.document",
    tabId: "dish"
  },
  codex: {
    storageKey: "technica.codex.document",
    tabId: "codex"
  },
  fieldmod: {
    storageKey: "technica.fieldmod.document",
    tabId: "fieldmod"
  },
  decoration: {
    storageKey: "technica.decoration.document",
    tabId: "decoration"
  },
  schema: {
    storageKey: "technica.schema.document",
    tabId: "schema"
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
    id: "mail",
    label: "Mail Editor"
  },
  {
    id: "chatter",
    label: "Chatter Editor"
  },
  {
    id: "quest",
    label: "Quest Editor"
  },
  {
    id: "key_item",
    label: "Key Item Editor"
  },
  {
    id: "faction",
    label: "Faction Editor"
  },
  {
    id: "chassis",
    label: "Chassis Editor"
  },
  {
    id: "doctrine",
    label: "Doctrine Editor"
  },
  {
    id: "map",
    label: "Map Editor"
  },
  {
    id: "field_enemy",
    label: "Field Enemy Editor"
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
    id: "crafting",
    label: "Crafting Recipe Editor"
  },
  {
    id: "dish",
    label: "Dish Editor"
  },
  {
    id: "codex",
    label: "Codex Entry Editor"
  },
  {
    id: "fieldmod",
    label: "Field Mods"
  },
  {
    id: "decoration",
    label: "Decorations Editor"
  },
  {
    id: "schema",
    label: "Schema Editor"
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
  const [isShortcutOverlayOpen, setIsShortcutOverlayOpen] = useState(false);
  const mobileSessionPopoverRef = useRef<HTMLDivElement | null>(null);
  const requestedEditorPopoutTab: TechnicaTabId | null =
    requestedPopoutTab === "card-flow" ||
    requestedPopoutTab === "fieldmod-flow"
      ? null
      : requestedPopoutTab;
  const activeTab: TechnicaTabId = requestedEditorPopoutTab ?? storedActiveTab;
  const activeTabLabel =
    requestedPopoutTab === "card-flow"
      ? "Card Effect Flow"
      : requestedPopoutTab === "fieldmod-flow"
        ? "Field Mod Effect Flow"
        : tabs.find((tab) => tab.id === activeTab)?.label ?? "Technica";
  const activeSurfaceKey = requestedPopoutTab ?? activeTab;
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

  useEffect(() => {
    function handleGlobalShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      const key = event.key.toLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;

      if (event.key === "Escape" && isShortcutOverlayOpen) {
        setIsShortcutOverlayOpen(false);
        return;
      }

      if (key === "?" && !commandKey) {
        event.preventDefault();
        setIsShortcutOverlayOpen((current) => !current);
        return;
      }

      if (!commandKey) {
        return;
      }

      if (event.shiftKey && key === "p") {
        event.preventDefault();
        void openTechnicaPopout(activeTab, activeTabLabel);
        return;
      }

      if (event.shiftKey && key === "d") {
        event.preventDefault();
        void openTechnicaPopout("database", "Database");
        return;
      }

      if (key >= "0" && key <= "9" && !requestedPopoutTab) {
        const index = key === "0" ? tabs.length - 1 : Number(key) - 1;
        const targetTab = tabs[index];
        if (targetTab) {
          event.preventDefault();
          setStoredActiveTab(targetTab.id);
        }
        return;
      }

      if (isTypingTarget && key !== "s" && key !== "o" && key !== "enter") {
        return;
      }

      if (key === "s") {
        event.preventDefault();
        dispatchWorkspaceCommand("save-draft");
        return;
      }

      if (key === "o") {
        event.preventDefault();
        dispatchWorkspaceCommand("import-draft");
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        dispatchWorkspaceCommand("export-bundle");
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleGlobalShortcuts);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleGlobalShortcuts);
      }
    };
  }, [activeTab, activeTabLabel, isShortcutOverlayOpen, requestedPopoutTab, setStoredActiveTab]);

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
    if (requestedPopoutTab === "card-flow") {
      return <EffectFlowPopoutSurface mode="card" />;
    }
    if (requestedPopoutTab === "fieldmod-flow") {
      return <EffectFlowPopoutSurface mode="fieldmod" />;
    }
    if (activeTab === "dialogue") {
      return <DialogueStudio />;
    }
    if (activeTab === "mail") {
      return <MailEditor />;
    }
    if (activeTab === "chatter") {
      return <ChatterEditor />;
    }
    if (activeTab === "quest") {
      return <QuestCreator />;
    }
  if (activeTab === "key_item") {
    return <KeyItemEditor />;
  }
  if (activeTab === "faction") {
    return <FactionEditor />;
  }
  if (activeTab === "chassis") {
    return <ChassisEditor />;
  }
  if (activeTab === "doctrine") {
    return <DoctrineEditor />;
  }
  if (activeTab === "map") {
    return <MapEditor />;
  }
    if (activeTab === "field_enemy") {
      return <FieldEnemyEditor />;
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
    if (activeTab === "crafting") {
      return <CraftingEditor />;
    }
    if (activeTab === "dish") {
      return <DishEditor />;
    }
    if (activeTab === "codex") {
      return <CodexEditor />;
    }
    if (activeTab === "fieldmod") {
      return <FieldModEditor />;
    }
    if (activeTab === "decoration") {
      return <DecorationEditor />;
    }
    if (activeTab === "schema") {
      return <SchemaEditor />;
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
      data-active-tab={activeSurfaceKey}
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

      {runtime.isDesktop && !requestedPopoutTab ? (
        <div className="workspace-bar">
          <div className="chip-row">
            <span className="pill">Workspace</span>
            <span className="pill">{activeTabLabel}</span>
          </div>
          <div className="toolbar">
            <button type="button" className="ghost-button" onClick={() => void openTechnicaPopout(activeTab, activeTabLabel)}>
              Pop out editor
            </button>
            <button type="button" className="ghost-button" onClick={() => void openTechnicaPopout("database", "Database")}>
              Open database window
            </button>
            {FLOW_POPOUT_BY_TAB[activeTab] ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  void openTechnicaPopout(
                    FLOW_POPOUT_BY_TAB[activeTab]!,
                    activeTab === "card" ? "Card Effect Flow" : "Field Mod Effect Flow"
                  )
                }
              >
                Open effect flow window
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={() => setIsShortcutOverlayOpen((current) => !current)}>
              Shortcuts
            </button>
          </div>
        </div>
      ) : null}

      {isShortcutOverlayOpen ? (
        <div className="workspace-shortcuts-overlay" role="dialog" aria-label="Keyboard shortcuts">
          <Panel
            title="Keyboard Shortcuts"
            subtitle="Desktop workflow shortcuts for moving between tabs, exporting, and opening detached surfaces."
            actions={<button type="button" className="ghost-button" onClick={() => setIsShortcutOverlayOpen(false)}>Close</button>}
          >
            <div className="shortcut-list">
              {workspaceShortcuts.map((shortcut) => (
                <div key={shortcut.keys} className="shortcut-row">
                  <strong>{shortcut.keys}</strong>
                  <span>{shortcut.label}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
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
