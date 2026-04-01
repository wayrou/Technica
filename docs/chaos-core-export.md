# Chaos Core Export Target

Technica now supports a dedicated export target named `Chaos Core`.

## Goals

- Produce runtime-first JSON that matches Chaos Core's current subsystems closely.
- Keep importer glue thin and predictable.
- Preserve richer authoring state in sidecar source files instead of making Chaos Core parse editor data.

## Bundle shape

Each Chaos Core bundle contains:

- `manifest.json`
- One primary runtime file such as `oak_square.fieldmap.json`
- One sidecar source file such as `oak_square.source.json`
- For dialogue, a raw authored text file such as `village_guide_intro.dialogue.txt`
- `README.md`

## Manifest fields

- `targetGame`: always `"chaos-core"`
- `targetSchemaVersion`: content-specific runtime schema version
- `contentType`: `map`, `quest`, or `dialogue`
- `entryFile`: runtime file to ingest first
- `contentId`: normalized runtime id
- `dependencies`: cross-content references
- `sourceAppVersion`: Technica app version

## Map runtime shape

- `id`
- `name`
- `width`
- `height`
- `tiles`: 2D tile grid with `x`, `y`, `walkable`, and runtime-safe `type`
- `objects`
- `interactionZones`
- `metadata`

Notes:

- Unsupported editor terrain values are mapped to a safe Chaos Core tile type.
- Original visual terrain is preserved in tile metadata when needed.
- Interactive objects get matching interaction zones if one is not already present.

## Quest runtime shape

- `id`
- `title`
- `description`
- `questType`
- `difficultyTier`
- `status`
- `objectives`
- `rewards`
- `metadata`

Notes:

- Authoring rewards are collapsed into the flatter Chaos Core reward object.
- Unsupported completion effects are preserved in `metadata.chaosCoreExtensions`.
- Full authoring state/step/branch data remains available in the sidecar source file.

## Dialogue runtime shape

- `id`
- `title`
- `sceneId`
- `entryNodeId`
- `tags`
- `metadata`
- `nodes`
- `source.rawSource`

Notes:

- Dialogue exports now produce a deterministic node graph.
- Choice effects and `@set` commands are exported as structured effects with real JSON booleans/numbers.
- Runtime no longer needs to parse the raw authoring DSL.
