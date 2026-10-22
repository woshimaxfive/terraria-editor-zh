# Existing-object metadata

Extracted from the pinned TEdit source listed in source.json, under MS-PL. LICENSE and the exact source hashes are retained and published with the modified metadata. No game executable, texture, audio, full localization file or user world is distributed.

The catalogue contains only item identification labels (Chinese and English), IDs and search keys; missing Chinese labels fall back to their English names. items are tuples defined by itemFields. The separate editing-limits table contains IDs/stack limits, known prefixes and save-version item boundaries, so the Worker does not load the display catalogue. The browser lazy-loads ObjectEditor; the existing service worker precaches its chunk for offline use.

New item IDs are bounded by the opened world format; new summoner prefixes are unavailable before the first pinned 1.4.5 release format. Untouched unknown items are retained. Item/prefix combinations have not all been checked inside the game. Positions, object counts and slot counts remain unchanged in this stage. Existing variable-size chests retain their original capacity. Browser edits are bounded to 1000 slots and 1 MiB UTF-8 text per field, with a pre-write shared history budget check. Those are browser resource limits, not a claim about all desktop capabilities.
