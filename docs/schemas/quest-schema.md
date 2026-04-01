# Quest Schema

Main file: `quest.json`

## Top-level fields

- `schemaVersion`
- `sourceApp`
- `id`
- `title`
- `summary`
- `description`
- `tags`
- `prerequisites`
- `followUpQuestIds`
- `rewards`
- `states`
- `objectives`
- `steps`
- `initialStepId`
- `successStateId`
- `failureStateId`
- `metadata`
- `createdAt`
- `updatedAt`

## Rewards

- `id`
- `type`: `xp`, `item`, `currency`, `flag`, or `custom`
- `label`
- `amount`
- `value`
- `metadata`

## States

- `id`
- `label`
- `description`
- `terminal`
- `kind`: `active`, `success`, `failure`, or `custom`

## Objectives

- `id`
- `title`
- `description`
- `type`
- `optional`
- `targetCount`
- `successStateId`
- `failureStateId`
- `notes`

## Steps and branches

- Each step references one or more objective ids.
- Steps can point to next steps and/or resulting states.
- Branches carry a `condition`, optional `nextStepId`, optional `resultingStateId`, and a designer note.
