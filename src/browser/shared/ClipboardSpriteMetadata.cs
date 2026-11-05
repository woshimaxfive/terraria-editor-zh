using TEdit.Terraria;
using TEdit.Terraria.Objects;
namespace TEdit.Port;
// Extracted from frozen WorldViewModel.BuildSpritesFromConfig; no textures needed.
public static class ClipboardSpriteMetadata {
 public static void Build(){lock(WorldConfiguration.Sprites2Lock){
  WorldConfiguration.Sprites2.Clear();
            foreach (var tile in WorldConfiguration.TileProperties.Where(t => t.IsFramed && t.Frames != null && t.Frames.Count > 0))
            {
                var sprite = new SpriteSheet
                {
                    Tile = (ushort)tile.Id,
                    Name = tile.Name,
                    SizeTiles = tile.FrameSize,
                    SizePixelsRender = tile.TextureGrid,
                    SizePixelsInterval = tile.TextureGrid + tile.FrameGap,
                    IsAnimated = tile.IsAnimated
                };

                // Add a SpriteItemPreview for each frame from config
                int styleIndex = 0;
                foreach (var frame in tile.Frames)
                {
                    var spriteItem = new SpriteItem
                    {
                        Tile = sprite.Tile,
                        Style = styleIndex++,
                        Name = frame.ToString(),
                        UV = frame.UV,
                        SizeTiles = frame.Size.X > 0 && frame.Size.Y > 0 ? frame.Size : tile.FrameSize[0],
                        SizePixelsInterval = sprite.SizePixelsInterval,
                        Anchor = frame.Anchor,
                        StyleColor = frame.Color.A > 0 ? frame.Color : tile.Color,
                    };

                    // Set custom preview config for special tiles
                    OriginalSpritePreviewConfig.ConfigureSpecialTilePreview(spriteItem,tile,frame);


                    sprite.Styles.Add(spriteItem);
                }

                WorldConfiguration.Sprites2.Add(sprite);
            }
 }}
}
