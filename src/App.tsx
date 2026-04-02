import { CardEditor } from "./features/card/CardEditor";
import { ClassEditor } from "./features/class/ClassEditor";
import { DatabaseExplorer } from "./features/database/DatabaseExplorer";
import { DialogueStudio } from "./features/dialogue/DialogueStudio";
import { GearEditor } from "./features/gear/GearEditor";
import { ItemEditor } from "./features/item/ItemEditor";
import { MapEditor } from "./features/map/MapEditor";
import { NpcEditor } from "./features/npc/NpcEditor";
import { OperationEditor } from "./features/operation/OperationEditor";
import { QuestCreator } from "./features/quest/QuestCreator";
import { UnitEditor } from "./features/unit/UnitEditor";
import { usePersistentState } from "./hooks/usePersistentState";
import {
  getRequestedPopoutTab,
  openTechnicaPopout,
  type TechnicaTabId
} from "./utils/popout";

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
        <div>
          <h1>{requestedPopoutTab ? activeTabLabel : "Technica"}</h1>
          {!requestedPopoutTab ? (
            <p className="hero-copy">
              A standalone local-first authoring tool for dialogue, quests, maps, gear, items, cards, units,
              operations, and classes with Chaos Core-ready export bundles built for direct import.
            </p>
          ) : null}
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
        {renderActiveEditor()}
      </main>
    </div>
  );
}
