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
- `vertical` optional
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

## Optional vertical layer shape

`vertical` is omitted unless a map author enables vertical layers in the map editor. The base `tiles` grid remains the complete 2D runtime map.

- `schemaVersion`
- `defaultLayerId`
- `elevationStep`
- `layers`
- `connectors`
- `metadata`

## Vertical layer shape

- `id`
- `name`
- `elevation`
- `visibleIn2d`
- `cells`
- `metadata`

Layer cells are sparse. A missing cell inherits from the base 2D tile at the same `x`,`y`.

## Vertical cell shape

- `x`
- `y`
- `heightOffset`
- `walkable` optional override
- `edges` optional `north`, `east`, `south`, and `west` edge kinds
- `metadata`

Edge kinds are `open`, `ledge`, `rail`, and `wall`.

## Vertical connector shape

- `id`
- `kind`
- `from`
- `to`
- `bidirectional`
- `metadata`

Connector kinds are `stairs`, `ramp`, `ladder`, `drop`, `jump`, `elevator`, and `grapple`.
