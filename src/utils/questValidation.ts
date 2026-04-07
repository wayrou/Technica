import type { ValidationIssue } from "../types/common";
import type { QuestDocument } from "../types/quest";

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  });

  return Array.from(duplicates);
}

export function validateQuestDocument(document: QuestDocument) {
  const issues: ValidationIssue[] = [];

  if (!document.id.trim()) {
    issues.push({
      severity: "error",
      field: "id",
      message: "Quest id is required."
    });
  }

  if (!document.title.trim()) {
    issues.push({
      severity: "error",
      field: "title",
      message: "Quest title is required."
    });
  }

  if (!document.description.trim()) {
    issues.push({
      severity: "warning",
      field: "description",
      message: "Quest description is empty."
    });
  }

  if (document.objectives.length === 0) {
    issues.push({
      severity: "warning",
      message: "Add at least one objective so the quest has a designer-visible goal."
    });
  }

  if (document.steps.length === 0) {
    issues.push({
      severity: "warning",
      message: "Add at least one step so the quest flow has progression."
    });
  }

  findDuplicates(document.states.map((state) => state.id)).forEach((duplicate) => {
    issues.push({
      severity: "error",
      message: `Quest state id '${duplicate}' is duplicated.`
    });
  });

  findDuplicates(document.objectives.map((objective) => objective.id)).forEach((duplicate) => {
    issues.push({
      severity: "error",
      message: `Quest objective id '${duplicate}' is duplicated.`
    });
  });

  findDuplicates(document.steps.map((step) => step.id)).forEach((duplicate) => {
    issues.push({
      severity: "error",
      message: `Quest step id '${duplicate}' is duplicated.`
    });
  });

  findDuplicates(document.requiredQuestIds).forEach((duplicate) => {
    issues.push({
      severity: "warning",
      message: `Required quest id '${duplicate}' is duplicated.`
    });
  });

  const stateIds = new Set(document.states.map((state) => state.id));
  const objectiveIds = new Set(document.objectives.map((objective) => objective.id));
  const stepIds = new Set(document.steps.map((step) => step.id));

  if (!stepIds.has(document.initialStepId)) {
    issues.push({
      severity: "error",
      message: `Initial step '${document.initialStepId}' does not exist.`
    });
  }

  if (!stateIds.has(document.successStateId)) {
    issues.push({
      severity: "error",
      message: `Success state '${document.successStateId}' does not exist.`
    });
  }

  if (!stateIds.has(document.failureStateId)) {
    issues.push({
      severity: "error",
      message: `Failure state '${document.failureStateId}' does not exist.`
    });
  }

  document.objectives.forEach((objective) => {
    if (!objective.target.trim()) {
      issues.push({
        severity: "warning",
        message: `Objective '${objective.id}' has no target value yet.`
      });
    }

    if (objective.successStateId && !stateIds.has(objective.successStateId)) {
      issues.push({
        severity: "error",
        message: `Objective '${objective.id}' references missing success state '${objective.successStateId}'.`
      });
    }

    if (objective.failureStateId && !stateIds.has(objective.failureStateId)) {
      issues.push({
        severity: "error",
        message: `Objective '${objective.id}' references missing failure state '${objective.failureStateId}'.`
      });
    }
  });

  document.steps.forEach((step) => {
    step.objectiveIds.forEach((objectiveId) => {
      if (!objectiveIds.has(objectiveId)) {
        issues.push({
          severity: "error",
          message: `Step '${step.id}' references missing objective '${objectiveId}'.`
        });
      }
    });

    [step.successNextStepId, step.failureNextStepId].forEach((nextStepId) => {
      if (nextStepId && !stepIds.has(nextStepId)) {
        issues.push({
          severity: "error",
          message: `Step '${step.id}' points to missing next step '${nextStepId}'.`
        });
      }
    });

    [step.successStateId, step.failureStateId].forEach((stateId) => {
      if (stateId && !stateIds.has(stateId)) {
        issues.push({
          severity: "error",
          message: `Step '${step.id}' points to missing state '${stateId}'.`
        });
      }
    });

    step.branches.forEach((branch) => {
      if (!branch.condition.trim()) {
        issues.push({
          severity: "warning",
          message: `Branch '${branch.id}' on step '${step.id}' has no condition.`
        });
      }

      if (branch.nextStepId && !stepIds.has(branch.nextStepId)) {
        issues.push({
          severity: "error",
          message: `Branch '${branch.id}' points to missing step '${branch.nextStepId}'.`
        });
      }

      if (branch.resultingStateId && !stateIds.has(branch.resultingStateId)) {
        issues.push({
          severity: "error",
          message: `Branch '${branch.id}' points to missing state '${branch.resultingStateId}'.`
        });
      }
    });
  });

  const hasTerminalState = document.states.some((state) => state.terminal);
  if (!hasTerminalState) {
    issues.push({
      severity: "warning",
      message: "No terminal state is marked. Importers may need to infer quest completion."
    });
  }

  return issues;
}
