# TEdit furniture definitions and frame geometry

Pinned source: TEdit/Terraria-Map-Editor `84e3fc3466d405675a09da763169774b82c22d4d` (MS-PL).

`entity-rules.json` extracts all nine display-doll poses, 24 leashed kite IDs and 93 leashed critter IDs from `TileEntityType.cs`. These are exact desktop enums. Existing unrecognized values are preserved unless the user explicitly edits that field.

The application adds 162 Chinese category labels in `src/editing/furnitureLabels.js` for grouping names that do not exactly match item names. These project translations are separate from the original catalogue. All 412 categories have Chinese labels; individual style names or varieties may retain their original text.

`catalogue.json` extracts every configured selectable framed tile (412 types, 9546 styles), dimensions, frame intervals, wrap configuration and tile ID version limits. `source.json` records original hashes. Chinese labels reuse exact name matches from the separately attributed `tedit-objects` catalogue; untranslated labels retain the original names. No textures, previews, worlds or complete language resources are included.

`src/editing/furniture.js` adapts `SpriteItem.GetTiles`, `TileProperty.GetWorldUV` and the Christmas-tree branch of `SpritePlacer.Place`. Static configured wrap thresholds are used so placements do not depend on local texture loading. The desktop tool places at the requested upper-left coordinate; frame anchors label the preview and do not shift placement. The source placement tool does not simulate game support physics.

`legacy-equipment.json` extracts item armor texture indices and rackable item IDs from the pinned current item data. The embedded frame codec in `src/editing/legacyEquipment.js` also adapts the original author's historical `SaveMannequin`, `SaveRack` and ArrowTool read logic from commit `2d82b59158de75b08d5af3199b41034f9853a776` (tag `3.10.18105.218`, MS-PL). Exact source paths and hashes for both versions are in `source.json`. Armor texture indices are separate from item IDs. Legacy racks encode the item and prefix in the first two cells of the middle row. They do not create modern tile entities.

Complete legacy structures can be placed, inspected, edited or removed. Same-origin direction changes retain embedded contents; male/female legacy mannequins share the three armor slots. Explicitly clearing a rack restores its empty catalogue frames. These structure, empty-slot, content-loss confirmation and shared-history rules are browser adaptations. Untouched unknown contents remain unchanged; new contents are bounded by the world item-version limit and legacy frame representation (rack item IDs at most 4899). Game reload compatibility remains a separate acceptance step.

Catalogue coverage is not proof that every style is valid in every old game version. Tile ID/version limits and world frame-importance flags must be checked by the file adapter. Neither the catalogue nor the editor emulates game migration of legacy tiles to their modern equivalents.
