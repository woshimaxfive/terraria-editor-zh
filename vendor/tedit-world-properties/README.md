# World property rules

Pinned desktop field, clock, boundary/layer setter and background catalogue sources and SHA-256 values are in source.json; MS-PL is retained in LICENSE. Required Chinese quest identification labels reuse the pinned tedit-objects catalogue. Desktop quest 25 has a source spelling alias documented in source.json. No game preview images, sprite sheets or textures are included.

Format-aware property groups cover name/difficulty, time/weather/progress, numeric events and quests, ores/evil markers, exact selectable background/tree/cave IDs, region boundaries, terrain levels and special seed flags. Draft boundaries clamp to adjacent boundaries; colliding layers shift the other layer by six. Safe layer limits use the pinned 478-tile bottom margin; the view option is not serialized. Layer-gap repair follows desktop adjustment priority. Only validated final field patches may enter shared history; independent header/footer expectations preserve every unrelated field and unknown untouched choice. Names remain nonblank single-line valid Unicode at most 1024 UTF-8 bytes.

Progress and seed markers do not regenerate terrain or move NPCs. Changing a field that was added after a file format is rejected. Style choices follow the pinned desktop catalogue, and byte-preserving older-format roundtrips do not prove game behavior for every newer style/combination. NPC records, furniture and complete texture previews remain separate work. Seven-format fixtures, derived large worlds and simulated touch do not replace actual game reload and physical phone acceptance.

现代格式从 treeTopsVariations 读取对应的有效样式；明确编辑时按原版 World.FileV2 同步对应旧字段和数组槽位，保留未编辑的未知值及额外条目。短数组按原版以零补足，且只在编辑样式时扩展。

身份与位置字段复用原版 WorldPropertiesView、World、PointTool 和存档尾校验语义；空队伍首次启用以当前出生点初始化六队，非空列表不补齐，未知额外条目保留。网页位置工具在松手时确认，拖动、第二指、Resize 或 Esc 取消未确认点按，复用属性事务和共享历史。GUID 字节序已与实际 .NET 参考核对。
