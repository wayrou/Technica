import type { ClassTrainingGridNodeDocument } from "../types/class";

function compareGridNodes(left: ClassTrainingGridNodeDocument, right: ClassTrainingGridNodeDocument) {
  return left.row - right.row || left.col - right.col || left.name.localeCompare(right.name);
}

export function ClassTrainingGridBoard({
  nodes,
  title,
}: {
  nodes: ClassTrainingGridNodeDocument[];
  title?: string;
}) {
  const sortedNodes = [...nodes].sort(compareGridNodes);
  const maxColumns = Math.max(3, ...sortedNodes.map((node) => node.col));
  const maxRows = Math.max(2, ...sortedNodes.map((node) => node.row));

  return (
    <div className="class-grid-preview-shell">
      {title ? <div className="class-grid-preview-title">{title}</div> : null}
      <div
        className="class-grid-preview-board"
        style={{
          gridTemplateColumns: `repeat(${maxColumns}, minmax(180px, 1fr))`,
          gridTemplateRows: `repeat(${maxRows}, minmax(160px, auto))`,
        }}
      >
        {sortedNodes.map((node) => (
          <article
            key={node.id}
            className="class-grid-preview-node"
            style={{
              gridColumn: node.col,
              gridRow: node.row,
            }}
          >
            <span className="class-grid-preview-cost">{node.cost} SP</span>
            <strong>{node.name}</strong>
            <p>{node.description}</p>
            {node.benefit ? <small>{node.benefit}</small> : null}
            {node.requires && node.requires.length > 0 ? (
              <div className="chip-row">
                {node.requires.map((requirement) => (
                  <span key={`${node.id}:${requirement}`} className="pill">
                    Req: {requirement}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
