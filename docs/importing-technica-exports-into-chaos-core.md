# Importing Technica Exports Into Chaos Core

Technica `Chaos Core` exports are built to be dropped straight into Chaos Core's `Import Content` screen.

## Recommended import workflow

1. In Technica, export using the `Chaos Core` target.
2. In Chaos Core, open `Import Content` from the main menu.
3. Drag in the exported `.zip` bundle, or choose it manually.
4. Chaos Core reads `manifest.json`, loads the runtime `entryFile`, and registers the content in-game.
5. Keep the original export bundle available for traceability and re-imports.

## Dialogue import guidance

- Chaos Core consumes the runtime dialogue graph directly.
- `dialogue.txt` stays in the bundle as the human-authored source of truth.
- Preserve unknown metadata keys for forward compatibility.

## Quest import guidance

- Keep quest and objective ids stable.
- Chaos Core consumes the runtime quest file directly.
- `metadata`, rewards, and optional objectives should remain additive and forward-compatible.

## Map import guidance

- `tiles` are stored as top-to-bottom rows.
- Chaos Core consumes the runtime field map directly.
- Objects and interaction zones should keep stable ids and metadata.

## Adapter guidance

- Gate behavior by `schemaVersion`.
- Avoid inferring hidden meanings from field names.
- Prefer additive import handling so old exports continue to work as schemas grow.
