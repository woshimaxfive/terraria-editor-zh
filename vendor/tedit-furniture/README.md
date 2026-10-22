# TEdit furniture definitions and frame geometry

Pinned source: TEdit/Terraria-Map-Editor `84e3fc3466d405675a09da763169774b82c22d4d` (MS-PL).

`entity-rules.json` extracts all nine display-doll poses, 24 leashed kite IDs and 93 leashed critter IDs from `TileEntityType.cs`. These are exact desktop enums. Existing unrecognized values are preserved unless the user explicitly edits that field.

The application adds 162 Chinese category labels in `src/editing/furnitureLabels.js` for grouping names that do not exactly match item names. These project translations are separate from the original catalogue. All 412 categories have Chinese labels; individual style names or varieties may retain their original text.

`catalogue.json` extracts every configured selectable framed tile (412 types, 9546 styles), dimensions, frame intervals, wrap configuration and tile ID version limits. `source.json` records original hashes. Chinese labels reuse exact name matches from the separately attributed `tedit-objects` catalogue; untranslated labels retain the original names. No textures, previews, worlds or complete language resources are included.

`src/editing/furniture.js` adapts `SpriteItem.GetTiles`, `TileProperty.GetWorldUV` and the Christmas-tree branch of `SpritePlacer.Place`. Static configured wrap thresholds are used so placements do not depend on local texture loading. The desktop tool places at the requested upper-left coordinate; frame anchors label the preview and do not shift placement. The source placement tool does not simulate game support physics.

Catalogue coverage is not proof that every style is valid in every old game version. Tile ID/version limits and world frame-importance flags must be checked by the file adapter. Legacy equipment tiles have different game semantics from modern display-doll/weapon-rack entities and need explicit version handling before placement.
