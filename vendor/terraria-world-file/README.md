# terraria-world-file

Source: https://github.com/TEdit/terraria-world-file-ts

Pinned commit: `7292cb8509d2aa869583cf9f8549d6f78f7f9a24`.

Originally created by cokolele; maintained by the TEdit contributors. The upstream package.json declares MIT. See LICENSE and the published third-party notices. Only the parser source needed by the browser is included; upstream Git history, tools and worlds are not included.

Local changes:

- WorldTiles.parse rejects negative RLE values and runs crossing a column boundary.
- BinaryReader.readBytes/readArray reject negative lengths and, in strict mode, lengths larger than the remaining file before allocating storage. Every array element in this parser consumes at least one byte.

All other source files match the pinned source after LF normalization. `source.json` records the original source hashes. Keep these changes when reviewing an upstream update and run the world round-trip tests before changing the pinned version.
