# Material catalogue

Selected ordinary blocks and player walls from [TEdit Web](https://github.com/TEdit/terraria-map-editor-web/tree/17d60d01483ff3a7ad551c7b0eeba71fd4a23394/src/utils/dbs) (`editable-tiles.js` and `editable-walls.js`). Upstream revision: `17d60d01483ff3a7ad551c7b0eeba71fd4a23394`, MIT; originally created by cokolele, maintained by the TEdit contributors. The complete notice is retained in `public/THIRD_PARTY_NOTICES.txt`.

Upstream source SHA-256 hashes:

- `editable-tiles.js`: SHA-256 `2510e59818fbe82bc0bd11d0ed01eddf6fc547a3b4fe8344f4109bff99358694`
- `editable-walls.js`: SHA-256 `514c4ae2198e5fde74d0189548b423d5f41d56c2d6d86c9a40675b4f803c049c`

This is a curated subset, not the complete Terraria material registry. Every entry predates the minimum supported save format 194, and is round-trip tested against all seven supported-version fixtures. Newer and frame-dependent materials, natural walls, ropes, tracks, platforms and plants remain excluded. At runtime block IDs must also be present and non-frame-important in the opened world's format header. Display aliases such as Living Wood Wand / Living Wood, grouping and editing policy are maintained by this project.

Chinese display names were checked against the locally installed Terraria 1.4.5.8 item names (executable SHA-256 `960A03BFF6050CF7BE16DFC1A7B19E10FC2C4F8F835A6A3B135A50DD9E6BA2F3`); `Leaf Block` is an editor description. Dirt also accepts the alias 泥土. Only the names needed for identification are included. Terraria names and game resources belong to their respective owners; the project MIT license grants no rights to those resources. This catalogue includes no executable, full language resource, game textures or desktop MS-PL localization data. Other separately licensed metadata are identified in THIRD_PARTY_NOTICES.txt.
