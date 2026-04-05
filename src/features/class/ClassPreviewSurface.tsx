import { Panel } from "../../components/Panel";
import { ClassTrainingGridBoard } from "../../components/ClassTrainingGridBoard";
import { createBlankClass } from "../../data/sampleClass";
import { usePersistentState } from "../../hooks/usePersistentState";
import { createDefaultTrainingGrid, normalizeTrainingGrid } from "../../utils/classTrainingGrid";

export function ClassPreviewSurface() {
  const fallback = createBlankClass();
  const [storedDocument] = usePersistentState("technica.class.document", fallback);
  const document = {
    ...fallback,
    ...(storedDocument as typeof fallback),
  };
  const trainingGrid = normalizeTrainingGrid(
    (storedDocument as { trainingGrid?: unknown })?.trainingGrid,
    createDefaultTrainingGrid(document)
  );

  return (
    <Panel
      title="Class Training Grid Preview"
      subtitle="Detached live preview of the current class training grid."
    >
      <ClassTrainingGridBoard nodes={trainingGrid} title={document.name || "Untitled Class"} />
    </Panel>
  );
}
