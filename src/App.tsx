import { CardEditor } from "./features/card/CardEditor";
import { ClassEditor } from "./features/class/ClassEditor";
import { DialogueStudio } from "./features/dialogue/DialogueStudio";
import { GearEditor } from "./features/gear/GearEditor";
import { ItemEditor } from "./features/item/ItemEditor";
import { MapEditor } from "./features/map/MapEditor";
import { OperationEditor } from "./features/operation/OperationEditor";
import { QuestCreator } from "./features/quest/QuestCreator";
import { UnitEditor } from "./features/unit/UnitEditor";
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
  },
  {
    id: "gear",
    label: "Gear Forge",
    summary: "Author owned gear that lands directly in Chaos Core loadout, inventory, and deck systems."
  },
  {
    id: "item",
    label: "Item Forge",
    summary: "Create portable resources and consumables with explicit mass, bulk, and power footprints."
  },
  {
    id: "card",
    label: "Card Forge",
    summary: "Build battle cards with structured effects and library metadata for direct Chaos Core import."
  },
  {
    id: "unit",
    label: "Unit Foundry",
    summary: "Create roster-ready unit templates with class, stat, and loadout wiring already intact."
  },
  {
    id: "operation",
    label: "Operation Builder",
    summary: "Author floor graphs and room nodes for direct-run Chaos Core operations."
  },
  {
    id: "class",
    label: "Class Lab",
    summary: "Design new class branches with unlock conditions, weapon disciplines, and base stat packages."
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
            A standalone local-first authoring tool for dialogue, quests, maps, gear, items, cards, units,
            operations, and classes with Chaos Core-ready export bundles built for direct import.
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
        {activeTab === "gear" ? <GearEditor /> : null}
        {activeTab === "item" ? <ItemEditor /> : null}
        {activeTab === "card" ? <CardEditor /> : null}
        {activeTab === "unit" ? <UnitEditor /> : null}
        {activeTab === "operation" ? <OperationEditor /> : null}
        {activeTab === "class" ? <ClassEditor /> : null}
      </main>
    </div>
  );
}
