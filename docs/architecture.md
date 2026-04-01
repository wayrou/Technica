# Technica Architecture

## Goals

- Keep Technica separate from Chaos Core runtime code.
- Optimize for fast authoring and clear exports.
- Preserve local-first workflows with autosaved drafts and importable draft files.
- Export stable, explicit JSON that a later adapter can transform safely.

## High-level structure

- React + TypeScript handles the authoring UI, state, validation, and export generation.
- Tauri provides the desktop shell without coupling the authoring logic to Rust.
- Each editor owns its own state model, validation rules, and export bundle builder.
- Shared utilities cover persistence, draft envelopes, bundle generation, and common record parsing.

## Design choices

### Dialogue Studio

- Uses a lightweight authoring DSL so designers can move quickly in plain text.
- Parser output normalizes labels, choices, jumps, flags, and metadata.
- Raw authored text is exported alongside parsed JSON so humans and importers both get a useful source.

### Quest Creator

- Uses structured forms instead of hand-authored JSON to reduce designer error.
- Keeps ids explicit so downstream tools can reference states, objectives, steps, and branches reliably.
- Branches are stored at the step level to make quest flow readable in exported JSON.

### Map Editor

- Starts with a grid/tile field map workflow for the MVP.
- Keeps tile fields explicit instead of compressing them into engine-specific encodings.
- Stores objects and zones as rectangle-based placements with metadata for later adapters.

## Local-first behavior

- Drafts are autosaved in browser storage so work reopens quickly.
- Each editor can also export a draft JSON envelope for backup or transfer.
- Destructive actions use confirmation prompts before replacing the current draft.

## Planned future extensions

- Richer dialogue graph visualization and node-based editing.
- More map layers, palette sets, stamps, and multi-tile prefabs.
- Schema adapters and direct export targets for Chaos Core import pipelines.
