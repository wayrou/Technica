# Importing Technica Exports Into Chaos Core

Technica exports are intentionally intermediate content bundles. They are not meant to mirror Chaos Core runtime structures one-to-one.

## Recommended import workflow

1. Read `manifest.json` to detect export type and schema version.
2. Load the main data file such as `dialogue.json`, `quest.json`, or `map.json`.
3. Preserve all stable ids and metadata fields during transformation.
4. Map Technica fields into Chaos Core runtime structures using a dedicated adapter layer.
5. Keep the original export bundle available for traceability and re-imports.

## Dialogue import guidance

- Use `dialogue.txt` as the human-authored source of truth when designers need to revise content.
- Use `dialogue.json` for deterministic parsing of labels, branches, flags, and metadata.
- Preserve unknown metadata keys for forward compatibility.

## Quest import guidance

- Keep quest, state, objective, step, and branch ids stable.
- Map step progression and branch conditions into Chaos Core quest flow logic.
- Treat `metadata`, `rewards`, and optional objectives as adapter-owned translation points.

## Map import guidance

- Treat `tiles` as top-to-bottom rows.
- Convert tile terrain and passability into Chaos Core map layers as needed.
- Convert objects and zones into runtime entities or triggers while preserving ids and metadata.

## Adapter guidance

- Gate behavior by `schemaVersion`.
- Avoid inferring hidden meanings from field names.
- Prefer additive adapters so old exports continue to import when schemas grow.
