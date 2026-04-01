# Map Schema

Main file: `map.json`

## Top-level fields

- `schemaVersion`
- `sourceApp`
- `id`
- `name`
- `width`
- `height`
- `tileSize`
- `tiles`
- `objects`
- `zones`
- `metadata`
- `createdAt`
- `updatedAt`

## Tile shape

- `terrain`
- `walkable`
- `wall`
- `floor`
- `metadata`

Tiles are stored as rows from top to bottom.

## Object shape

- `id`
- `type`
- `sprite`
- `label`
- `action`
- `x`
- `y`
- `width`
- `height`
- `metadata`

## Zone shape

- `id`
- `label`
- `action`
- `x`
- `y`
- `width`
- `height`
- `metadata`

Objects and zones use top-left tile coordinates and tile-unit width and height.
