import type { ValidationIssue } from "../types/common";

interface IssueListProps {
  issues: ValidationIssue[];
  emptyLabel: string;
}

export function IssueList({ issues, emptyLabel }: IssueListProps) {
  if (issues.length === 0) {
    return <div className="empty-state compact">{emptyLabel}</div>;
  }

  return (
    <div className="issue-list">
      {issues.map((issue, index) => (
        <article key={`${issue.message}-${index}`} className={`issue-card ${issue.severity}`}>
          <div className="issue-card-heading">
            <span className="issue-pill">{issue.severity}</span>
            {issue.line ? <span className="muted">Line {issue.line}</span> : null}
            {issue.field ? <span className="muted">{issue.field}</span> : null}
          </div>
          <p>{issue.message}</p>
        </article>
      ))}
    </div>
  );
}
