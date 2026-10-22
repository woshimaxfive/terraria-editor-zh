# World property rules

Desktop TEdit source references and SHA-256 values are pinned in source.json; MS-PL is retained in LICENSE. Browser field patches, expected header/footer encoding, shared history and detached drafts are maintained here without new dependencies.

This group covers name, format-aware difficulty, hardmode, the day/night clock, moon/weather, boss/event flags and resident unlock/boost flags. Names are nonblank single-line valid Unicode, at most 1024 UTF-8 bytes. Only known available fields may change; existing unrelated/unknown values remain intact. Float32 values are normalized to their on-disk representation. Mechanical boss flags derive their aggregate flag; renaming updates the footer.

Coordinates, identity and generation data remain read-only in this sidebar. Progress flags do not regenerate terrain or move NPCs. Numeric event/quest counters, backgrounds/tree/cave styles, terrain levels/ores, special seeds, NPC records and furniture are separate remaining work. Existing seven-format fixtures and browser downloads do not replace game reload, real complex-world or physical phone acceptance.
