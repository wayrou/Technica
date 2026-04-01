# Dialogue Schema

Main file: `dialogue.json`

## Top-level fields

- `schemaVersion`: Technica schema version.
- `sourceApp`: Always `"Technica"`.
- `id`: Stable dialogue id.
- `title`: Human-readable title.
- `sceneId`: Optional scene grouping key.
- `rawSource`: Original authored text.
- `metadata`: Freeform key/value metadata.
- `tags`: Dialogue-level tags.
- `entryLabel`: First label or explicit conversation entry point.
- `labels`: Array of label blocks.
- `stats`: Counts for labels, lines, and choices.
- `createdAt` and `updatedAt`: ISO timestamps.

## Label shape

- `id`: Stable label record id.
- `label`: Branch target name.
- `entries`: Ordered entries in that label.

## Entry kinds

- `line`: Speaker line with text and optional metadata such as `mood`, `portraitKey`, `sceneId`, `condition`, and tags.
- `choice`: Player-facing choice with a `target`, optional `condition`, optional `setFlags`, and tags.
- `jump`: Unconditional flow continuation to another label.
- `set`: Flag assignment.
- `end`: Terminal conversation marker.
