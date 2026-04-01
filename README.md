# Technica

Technica is a standalone desktop authoring tool for the Chaos Core project. It is deliberately separate from the game runtime and exports stable, human-readable content bundles that a later adapter can transform into Chaos Core-specific formats.

## What ships in the MVP

- Dialogue Studio with text authoring, parsing, validation, flow preview, local draft persistence, draft import, and export bundles.
- Quest Creator with structured form editing, validation, live JSON preview, local drafts, draft import, and export bundles.
- Map Editor with tile painting, walkability and wall controls, object placement, interaction zones, zoom, pan, local drafts, draft import, and export bundles.
- Stable JSON schemas with `schemaVersion`, `sourceApp`, timestamps, and adapter-friendly field names.

## Run commands

- Web UI only: `npm run dev:web`
- Desktop app with Tauri: `npm run dev:desktop`
- Frontend production build: `npm run build`
- Desktop production build: `npm run build:desktop`

## Export bundle layout

Each export bundle is zipped and contains:

- `manifest.json`
- One main data file such as `dialogue.json`, `quest.json`, or `map.json`
- An authored source file when relevant, such as `dialogue.txt`
- `README.md` with importer notes

## Project structure

- [`src`](/Users/alexhungate/Desktop/technica-core/src): React + TypeScript app
- [`src/features/dialogue`](/Users/alexhungate/Desktop/technica-core/src/features/dialogue): Dialogue Studio parser, preview, and UI
- [`src/features/quest`](/Users/alexhungate/Desktop/technica-core/src/features/quest): Quest Creator UI
- [`src/features/map`](/Users/alexhungate/Desktop/technica-core/src/features/map): Map Editor UI and grid helpers
- [`src-tauri`](/Users/alexhungate/Desktop/technica-core/src-tauri): Tauri desktop shell
- [`docs`](/Users/alexhungate/Desktop/technica-core/docs): Architecture, schema, and import docs
- [`examples/exports`](/Users/alexhungate/Desktop/technica-core/examples/exports): Sample export bundles in unzipped form
