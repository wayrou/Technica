import { TECHNICA_SCHEMA_VERSION, TECHNICA_SOURCE_APP } from "../types/common";
import type { QuestDocument } from "../types/quest";
import { isoNow } from "../utils/date";

export function createSampleQuest(): QuestDocument {
  const timestamp = isoNow();

  return {
    schemaVersion: TECHNICA_SCHEMA_VERSION,
    sourceApp: TECHNICA_SOURCE_APP,
    id: "check_the_courier_board",
    title: "Check the Courier Board",
    summary: "Speak with the guide, inspect the board, and pick up your first local job.",
    description:
      "This onboarding quest introduces the village square, teaches the player how to pick up jobs, and optionally awards a navigation hint.",
    questType: "exploration",
    difficultyTier: 1,
    status: "available",
    tags: ["onboarding", "village", "courier"],
    prerequisites: ["dialogue:village_guide_intro"],
    requiredQuestIds: [],
    followUpQuestIds: [],
    rewards: [
      {
        id: "reward-xp",
        type: "xp",
        label: "Intro XP",
        amount: 50,
        value: "xp",
        metadata: {}
      },
      {
        id: "reward-flag",
        type: "flag",
        label: "Unlock village jobs",
        amount: 1,
        value: "unlock_village_jobs",
        metadata: {}
      }
    ],
    states: [
      {
        id: "state-active",
        label: "Active",
        description: "Quest is in progress.",
        terminal: false,
        kind: "active"
      },
      {
        id: "state-success",
        label: "Completed",
        description: "The player read the board.",
        terminal: true,
        kind: "success"
      },
      {
        id: "state-failure",
        label: "Missed",
        description: "The player left the area without reading the board.",
        terminal: true,
        kind: "failure"
      }
    ],
    objectives: [
      {
        id: "obj-talk-guide",
        title: "Talk to the village guide",
        description: "Start the conversation with the guide in Oak Square.",
        type: "talk",
        target: "village_guide",
        optional: false,
        targetCount: 1,
        notes: ""
      },
      {
        id: "obj-read-board",
        title: "Read the courier board",
        description: "Inspect the courier board near the fountain.",
        type: "visit",
        target: "courier_board",
        optional: false,
        targetCount: 1,
        successStateId: "state-success",
        notes: ""
      },
      {
        id: "obj-ask-rewards",
        title: "Ask about rewards",
        description: "Optional follow-up to explain why jobs matter.",
        type: "talk",
        target: "village_guide",
        optional: true,
        targetCount: 1,
        notes: "Optional flavor step."
      }
    ],
    steps: [
      {
        id: "step-intro",
        title: "Meet the guide",
        summary: "Trigger the opening conversation.",
        objectiveIds: ["obj-talk-guide"],
        successNextStepId: "step-board",
        branches: []
      },
      {
        id: "step-board",
        title: "Inspect the board",
        summary: "Walk to the board and read it.",
        objectiveIds: ["obj-read-board", "obj-ask-rewards"],
        successStateId: "state-success",
        failureStateId: "state-failure",
        branches: [
          {
            id: "branch-leave-square",
            label: "Player leaves the square",
            condition: "player_left_square",
            resultingStateId: "state-failure",
            note: "Marks the quest as missed if the player leaves early."
          }
        ]
      }
    ],
    initialStepId: "step-intro",
    successStateId: "state-success",
    failureStateId: "state-failure",
    metadata: {
      region: "oak_square",
      designer: "Technica MVP"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
