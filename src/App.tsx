import { Suspense, lazy } from "react";
import technicaLogo from "./assets/technica-logo.png";
import { EditorErrorBoundary } from "./components/EditorErrorBoundary";
import { usePersistentState } from "./hooks/usePersistentState";
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
  const requestedPopoutTab = getRequestedPopoutTab();
  const [storedActiveTab, setStoredActiveTab] = usePersistentState<TechnicaTabId>("technica.activeTab", "dialogue");
  const activeTab: TechnicaTabId = requestedPopoutTab ?? storedActiveTab;
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Technica";

  function handleOpenTab(tabId: TechnicaTabId) {
    if (requestedPopoutTab) {
      void openTechnicaPopout(tabId, tabs.find((tab) => tab.id === tabId)?.label ?? "Editor");
      return;
    }

    setStoredActiveTab(tabId);
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
    <div className={requestedPopoutTab ? "app-shell popout-shell" : "app-shell"}>
      <div className="app-backdrop" />
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src={technicaLogo} alt="Technica logo" />
          <h1>{requestedPopoutTab ? activeTabLabel : "Technica"}</h1>
        </div>
      </header>

      {!requestedPopoutTab ? (
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
              <button
                type="button"
                className="tab-popout-button"
                onClick={() => void openTechnicaPopout(tab.id, tab.label)}
                aria-label={`Pop out ${tab.label}`}
              >
                Open
              </button>
            </div>
          ))}
        </nav>
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
