# Technica Quest Export

Title: Check the Courier Board
Id: quest-courier-board

Importer notes:
- Preserve quest, state, objective, step, and branch ids.
- `initialStepId`, `successStateId`, and `failureStateId` anchor the main flow.
- Keep `metadata` intact even if the first adapter ignores some keys.
