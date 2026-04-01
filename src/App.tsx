import { DialogueStudio } from "./features/dialogue/DialogueStudio";
import { MapEditor } from "./features/map/MapEditor";
import { QuestCreator } from "./features/quest/QuestCreator";
import { usePersistentState } from "./hooks/usePersistentState";
import type { EditorKind } from "./types/common";

const tabs: Array<{ id: EditorKind; label: string; summary: string }> = [
  {
    id: "dialogue",
    label: "Dialogue Studio",
    summary: "Author text, validate it, preview the flow, and export raw + parsed bundles."
  },
  {
    id: "quest",
    label: "Quest Creator",
    summary: "Build quest logic with structured controls instead of hand-editing JSON."
  },
  {
    id: "map",
    label: "Map Editor",
    summary: "Paint terrain, place objects, define interaction zones, and export readable map data."
  }
];

export default function App() {
  const [activeTab, setActiveTab] = usePersistentState<EditorKind>("technica.activeTab", "dialogue");

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <header className="app-header">
        <div>
          <h1>Technica</h1>
          <p className="hero-copy">
            A standalone local-first authoring tool for dialogue, quests, and maps with stable export bundles for
            downstream importers.
          </p>
        </div>
      </header>

      <nav className="tab-nav" aria-label="Technica editors">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.summary}</small>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === "dialogue" ? <DialogueStudio /> : null}
        {activeTab === "quest" ? <QuestCreator /> : null}
        {activeTab === "map" ? <MapEditor /> : null}
      </main>
    </div>
  );
}
