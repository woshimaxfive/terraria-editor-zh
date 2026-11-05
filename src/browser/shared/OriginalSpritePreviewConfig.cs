using TEdit.Terraria;
using TEdit.Terraria.Objects;
namespace TEdit.Port;
public static class OriginalSpritePreviewConfig {
    public static void ConfigureSpecialTilePreview(SpriteItem spriteItem, TileProperty tile, FrameProperty frame)
    {
        // DeadCellsDisplayJar (tile 698) - texture has 3 layers stacked vertically
        // Y=0: Main jar (36x44px), Y=46: Foreground border, Y=92: Background glow
        // Preview should only show the main jar layer (Y=0)
        // Tile UV.X values are 0, 18, 36 for variants 0, 1, 2
        // But jar texture has variants at X=0, 38, 76 (each 38px apart)
        if (tile.Id == (int)TileType.DeadCellsDisplayJar)
        {
            int variant = frame.UV.X / 18;  // 0, 18, 36 -> 0, 1, 2
            int sourceX = variant * 38;      // 0, 1, 2 -> 0, 38, 76
            spriteItem.PreviewConfig = new PreviewConfig
            {
                TextureType = PreviewTextureType.Tile,
                SourceRect = new System.Drawing.Rectangle(sourceX, 0, 36, 44),
                Offset = new TEdit.Geometry.Vector2Short(-10, 0) // Jar renders with -10px X offset
            };
        }
        // Sleeping Digtoise (tile 751) - 56x46 texture with 7 animation frames
        // Only render from anchor tile (frameX == 0 && frameY == 0)
        // Center 56x46 sprite over 32x32 tile area: offset -12px X, -7px Y
        else if (tile.Id == 751)
        {
            spriteItem.PreviewConfig = new PreviewConfig
            {
                TextureType = PreviewTextureType.Tile,
                SourceRect = new System.Drawing.Rectangle(0, 0, 56, 46),
                Offset = new TEdit.Geometry.Vector2Short(-12, -7)
            };
        }
        // Chillet Egg (tile 752) - 36x38 texture
        // Only render from anchor tile (frameX == 0 && frameY == 0)
        // Offset: -2px X, +5px Y
        else if (tile.Id == 752)
        {
            spriteItem.PreviewConfig = new PreviewConfig
            {
                TextureType = PreviewTextureType.Tile,
                SourceRect = new System.Drawing.Rectangle(0, 0, 36, 38),
                Offset = new TEdit.Geometry.Vector2Short(-2, 2)
            };
        }
        // Tree tiles (tile 5) - identify tree tops and branches logic:
        // frameY >= 198 AND frameX >= 22 triggers tree foliage rendering
        // frameX == 22: tree top (uses Tree_Tops texture)
        // frameX == 44: left branch (uses Tree_Branches texture)
        // frameX == 66: right branch (uses Tree_Branches texture)
        // Variant index = (frameY - 198) / 22 gives 0, 1, or 2 for variants A, B, C
        else if (tile.Id == 5)
        {
            int frameX = frame.UV.X;
            int frameY = frame.UV.Y;

            // Tree foliage: frameY >= 198 AND frameX >= 22
            if (frameY >= 198 && frameX >= 22)
            {
                // Calculate variant index from frameY (0, 1, or 2)
                int variant = (frameY - 198) / 22;

                if (frameX == 22)
                {
                    // Tree top - use Tree_Tops_0 texture
                    // Variants are arranged horizontally at 82px intervals (80px width + 2px gap)
                    // Offset: Bottom anchor - center X, anchor Y at bottom of tile
                    // X = (16-80)/2 = -32, Y = (16-80) = -64
                    spriteItem.PreviewConfig = new PreviewConfig
                    {
                        TextureType = PreviewTextureType.TreeTops,
                        TextureStyle = 0, // Forest tree style
                        SourceRect = new System.Drawing.Rectangle(variant * 82, 0, 80, 80),
                        Offset = new TEdit.Geometry.Vector2Short(-32, -64)
                    };
                }
                else if (frameX == 44)
                {
                    // Left branch - use Tree_Branches_0 texture, left side (X=0)
                    // Variants are arranged vertically at 42px intervals (40px height + 2px gap)
                    // Offset: Right anchor - anchor X at right of tile, center Y
                    // X = (16-40) = -24, Y = (16-40)/2 = -12
                    spriteItem.PreviewConfig = new PreviewConfig
                    {
                        TextureType = PreviewTextureType.TreeBranch,
                        TextureStyle = 0,
                        SourceRect = new System.Drawing.Rectangle(0, variant * 42, 40, 40),
                        Offset = new TEdit.Geometry.Vector2Short(-24, -12)
                    };
                }
                else if (frameX == 66)
                {
                    // Right branch - use Tree_Branches_0 texture, right side (X=42)
                    // Variants are arranged vertically at 42px intervals (40px height + 2px gap)
                    // Offset: Left anchor - anchor X at left of tile, center Y
                    // X = 0, Y = (16-40)/2 = -12
                    spriteItem.PreviewConfig = new PreviewConfig
                    {
                        TextureType = PreviewTextureType.TreeBranch,
                        TextureStyle = 0,
                        SourceRect = new System.Drawing.Rectangle(42, variant * 42, 40, 40),
                        Offset = new TEdit.Geometry.Vector2Short(0, -12)
                    };
                }
            }
            else
            {
                // Tree trunk tiles - use Tiles_5_{treeType} texture based on biome
                // SourceRect uses the tile's UV coordinates
                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.Tree,
                    TextureStyle = -1, // Default forest tree, will be overridden dynamically
                    SourceRect = new System.Drawing.Rectangle(frameX, frameY, 16, 16),
                    Offset = new TEdit.Geometry.Vector2Short(0, 0)
                };
            }
        }
        // Palm trees (tile 323) - similar to regular trees but uses sand-based biomes
        // Palm tops: U >= 88 && U <= 132 (use Tree_Tops_15)
        // Palm trunks: everything else (use Tiles_323)
        else if (tile.Id == 323)
        {
            int frameX = frame.UV.X;
            int frameY = frame.UV.Y;

            if (frameX >= 88 && frameX <= 132)
            {
                // Palm tree top - use Tree_Tops_15 texture
                // source.X = frame variant based on U, source.Y = treeType * 82
                int frameVariant = (frameX - 88) / 22; // 0, 1, or 2
                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.PalmTreeTop,
                    TextureStyle = 0, // Will be determined dynamically for source.Y
                    SourceRect = new System.Drawing.Rectangle(frameVariant * 82, 0, 80, 80),
                    Offset = new TEdit.Geometry.Vector2Short(-32, -64) // Bottom anchor
                };
            }
            else
            {
                // Palm tree trunk - use Tiles_323 texture
                // source.Y is replaced by treeType * 22 (not added)
                // Frame size is 20x20 (textureGrid), srcRect.X is preserved for horizontal position
                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.PalmTree,
                    TextureStyle = 0, // Will be determined dynamically
                    SourceRect = new System.Drawing.Rectangle(frameX, 0, 20, 20), // Y=0 will be replaced by palmType * 22
                    Offset = new TEdit.Geometry.Vector2Short(-2, -2) // Adjust for 20x20 frame vs 16x16 tile
                };
            }
        }
        // Gem Trees (583-589), Vanity Trees (596, 616), Ash Tree (634)
        // Same foliage detection as regular trees but with fixed tree style indices
        else if (tile.Id >= 583 && tile.Id <= 589)
        {
            // Gem trees: style = tileId - 583 + 22 (indices 22-28)
            int treeStyle = tile.Id - 583 + 22;
            ConfigureTreePreview(spriteItem, frame.UV.X, frame.UV.Y, treeStyle);
        }
        else if (tile.Id == 596 || tile.Id == 616)
        {
            // Vanity trees: 596 Sakura = 29, 616 Willow = 30
            int treeStyle = tile.Id == 596 ? 29 : 30;
            ConfigureTreePreview(spriteItem, frame.UV.X, frame.UV.Y, treeStyle);
        }
        else if (tile.Id == 634)
        {
            // Ash tree: style = 31
            ConfigureTreePreview(spriteItem, frame.UV.X, frame.UV.Y, 31);
        }
    }

    private static void ConfigureTreePreview(SpriteItem spriteItem, int frameX, int frameY, int treeStyle)
    {
        // Tree foliage: frameY >= 198 AND frameX >= 22
        if (frameY >= 198 && frameX >= 22)
        {
            // Calculate variant index from frameY (0, 1, or 2)
            int variant = (frameY - 198) / 22;

            if (frameX == 22)
            {
                // Tree top - use Tree_Tops texture
                // Dimensions vary by tree style:
                // - Gem trees (22-28), Ash tree (31): 116x96
                // - Vanity trees (29-30): 118x96
                // - Default (normal trees): 80x80
                int topWidth, topHeight;
                if (treeStyle >= 22 && treeStyle <= 28 || treeStyle == 31)
                {
                    topWidth = 116;
                    topHeight = 96;
                }
                else if (treeStyle == 29 || treeStyle == 30)
                {
                    topWidth = 118;
                    topHeight = 96;
                }
                else
                {
                    topWidth = 80;
                    topHeight = 80;
                }

                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.TreeTops,
                    TextureStyle = treeStyle,
                    SourceRect = new System.Drawing.Rectangle(variant * (topWidth + 2), 0, topWidth, topHeight),
                    Offset = new TEdit.Geometry.Vector2Short((short)(-topWidth / 2), (short)(-topHeight + 16))
                };
            }
            else if (frameX == 44)
            {
                // Left branch - use Tree_Branches texture
                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.TreeBranch,
                    TextureStyle = treeStyle,
                    SourceRect = new System.Drawing.Rectangle(0, variant * 42, 40, 40),
                    Offset = new TEdit.Geometry.Vector2Short(-24, -12)
                };
            }
            else if (frameX == 66)
            {
                // Right branch - use Tree_Branches texture
                spriteItem.PreviewConfig = new PreviewConfig
                {
                    TextureType = PreviewTextureType.TreeBranch,
                    TextureStyle = treeStyle,
                    SourceRect = new System.Drawing.Rectangle(42, variant * 42, 40, 40),
                    Offset = new TEdit.Geometry.Vector2Short(0, -12)
                };
            }
        }
        else
        {
            // Tree trunk tiles - use the tile's own texture
            spriteItem.PreviewConfig = new PreviewConfig
            {
                TextureType = PreviewTextureType.Tile,
                SourceRect = new System.Drawing.Rectangle(frameX, frameY, 20, 20),
                Offset = new TEdit.Geometry.Vector2Short(-2, -2)
            };
        }
    }


}