// Original GenerateBiomeVariantPreviews and helpers: pixel copies become recording copy commands.
using TEdit.Terraria;
using TEdit.Terraria.Objects;
using TEdit.Geometry;
using TEdit.Port.Rendering;
using Rectangle=TEdit.Geometry.RectangleInt32;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {
 Texture2D BuildBiomePreview(SpriteItem style,SpriteSheet sprite,int variantIndex){
  var tile=WorldConfiguration.TileProperties[style.Tile];var variants=tile.BiomeVariants;
  if(variants==null||variantIndex<0||variantIndex>=variants.Count)throw new ArgumentException("生态变体不存在");
  var sourceTexture=_textureDictionary.GetTile(style.Tile);var previewConfig=style.PreviewConfig;
  if(previewConfig!=null&&previewConfig.TextureType!=PreviewTextureType.Tile)sourceTexture=_textureDictionary.GetPreviewTexture(previewConfig,style.Tile);
            var variant = variants[variantIndex];
            var uvOffset = variant.UvOffset;
            Texture2D variantTexture = sourceTexture;
            Rectangle sourceRect;
            

            // Handle special PreviewConfig cases
            if (previewConfig != null)
            {
                switch (previewConfig.TextureType)
                {
                    case PreviewTextureType.TreeTops:
                        // Tree tops use different texture files per biome style
                        // If TextureStyle is set (gem/vanity/ash trees), use it directly
                        // Otherwise map biome variant index to tree style (regular trees)
                        int treeStyle = previewConfig.TextureStyle > 0
                            ? previewConfig.TextureStyle
                            : GetTreeStyleForBiomeVariant(variantIndex);
                        variantTexture = (Texture2D)_textureDictionary.GetTreeTops(treeStyle);
                        sourceRect = previewConfig.SourceRect.HasValue
                            ? new Rectangle(previewConfig.SourceRect.Value.X, previewConfig.SourceRect.Value.Y,
                                           previewConfig.SourceRect.Value.Width, previewConfig.SourceRect.Value.Height)
                            : new Rectangle(0, 0, 80, 80);
                        this.previewWidth = sourceRect.Width;
                        this.previewHeight = sourceRect.Height;
                        break;

                    case PreviewTextureType.TreeBranch:
                        // Tree branches use different texture files per biome style
                        // If TextureStyle is set (gem/vanity/ash trees), use it directly
                        int branchStyle = previewConfig.TextureStyle > 0
                            ? previewConfig.TextureStyle
                            : GetTreeStyleForBiomeVariant(variantIndex);
                        variantTexture = (Texture2D)_textureDictionary.GetTreeBranches(branchStyle);
                        sourceRect = previewConfig.SourceRect.HasValue
                            ? new Rectangle(previewConfig.SourceRect.Value.X, previewConfig.SourceRect.Value.Y,
                                           previewConfig.SourceRect.Value.Width, previewConfig.SourceRect.Value.Height)
                            : new Rectangle(0, 0, 40, 40);
                        this.previewWidth = sourceRect.Width;
                        this.previewHeight = sourceRect.Height;
                        break;

                    case PreviewTextureType.PalmTreeTop:
                        // Palm tree tops: Beach (variants 0-3) use Tree_Tops_15 (80x80, 82px Y spacing)
                        //                 Oasis (variants 4-7) use Tree_Tops_21 (114x98, 98px Y spacing - no gap)
                        bool isOasis = variantIndex >= 4;
                        int palmTopStyle = isOasis ? 21 : 15;
                        variantTexture = (Texture2D)_textureDictionary.GetTreeTops(palmTopStyle);
                        var palmTopRect = previewConfig.SourceRect ?? new System.Drawing.Rectangle(0, 0, 80, 80);
                        // Extract frame variant (0, 1, or 2 for Top A, B, C) from beach X position
                        int palmFrameVariant = palmTopRect.X / 82;
                        int palmTopSourceX, palmTopSourceY, palmTopWidth, palmTopHeight;
                        if (isOasis)
                        {
                            // Oasis: 116px X spacing, 98px Y spacing (no 2px gap), 114x98 size
                            // 4 biome rows: Normal(0), Crimson(1), Hallowed(2), Corrupt(3)
                            palmTopSourceX = palmFrameVariant * 116;
                            palmTopSourceY = (variantIndex - 4) * 98;
                            palmTopWidth = 114;
                            palmTopHeight = 98;
                        }
                        else
                        {
                            // Beach: 82px X spacing, 82px Y spacing, 80x80 size
                            // 4 biome rows: Normal(0), Crimson(1), Hallowed(2), Corrupt(3)
                            palmTopSourceX = palmFrameVariant * 82;
                            palmTopSourceY = variantIndex * 82;
                            palmTopWidth = 80;
                            palmTopHeight = 80;
                        }
                        sourceRect = new Rectangle(palmTopSourceX, palmTopSourceY, palmTopWidth, palmTopHeight);
                        this.previewWidth = palmTopWidth;
                        this.previewHeight = palmTopHeight;
                        break;

                    case PreviewTextureType.PalmTree:
                        // Palm tree trunks use Tiles_323 with Y offset for biome
                        variantTexture = sourceTexture;
                        var palmRect = previewConfig.SourceRect ?? new System.Drawing.Rectangle(style.UV.X, 0, 20, 20);
                        sourceRect = new Rectangle(palmRect.X, uvOffset.Y, palmRect.Width, palmRect.Height);
                        this.previewWidth = sourceRect.Width;
                        this.previewHeight = sourceRect.Height;
                        break;

                    default:
                        // Standard tile with UV offset
                        sourceRect = GetStandardSourceRect(style, sprite, uvOffset);
                        this.previewWidth = style.SizeTiles.X * sprite.SizePixelsRender.X;
                        this.previewHeight = style.SizeTiles.Y * sprite.SizePixelsRender.Y;
                        break;
                }
            }
            else
            {
                // No PreviewConfig - use standard UV offset approach
                sourceRect = GetStandardSourceRect(style, sprite, uvOffset);
                this.previewWidth = style.SizeTiles.X * sprite.SizePixelsRender.X;
                this.previewHeight = style.SizeTiles.Y * sprite.SizePixelsRender.Y;
            }


  if(previewConfig!=null&&previewConfig.TextureType!=PreviewTextureType.Tile){
   if(sourceRect.X>=0&&sourceRect.Y>=0&&sourceRect.Right<=variantTexture.Width&&sourceRect.Bottom<=variantTexture.Height&&sourceRect.Width>0&&sourceRect.Height>0)AddPreviewPatch(variantTexture,sourceRect,new(0,0,sourceRect.Width,sourceRect.Height),false);
  }else{
   var uv=TileProperty.GetRenderUV(style.Tile,style.UV.X,style.UV.Y);
   for(int x=0;x<style.SizeTiles.X;x++)for(int y=0;y<style.SizeTiles.Y;y++){
    var source=new Rectangle(uv.X+x*sprite.SizePixelsInterval.X+uvOffset.X,uv.Y+y*sprite.SizePixelsInterval.Y+uvOffset.Y,sprite.SizePixelsRender.X,sprite.SizePixelsRender.Y);
    source=Rectangle.Intersect(source,variantTexture.Bounds);if(source.Width>0&&source.Height>0)AddPreviewPatch(variantTexture,source,new(x*sprite.SizePixelsRender.X,y*sprite.SizePixelsRender.Y,source.Width,source.Height),false);
   }
  }
  return new("@preview",previewWidth,previewHeight);
 }
    private int GetTreeStyleForBiomeVariant(int biomeVariantIndex)
    {
        var world = _wvm?.CurrentWorld;
        return biomeVariantIndex switch
        {
            0 => world != null ? GetForestTreeStyle(world, 0) : 0,   // Forest
            1 => 1,                                                    // Corruption (fixed)
            2 => world?.BgJungle == 1 ? 11 : 2,                       // Jungle (BgJungle-dependent)
            3 => 3,                                                    // Hallow (fixed)
            4 => world != null ? GetSnowTreeTopIndex(world.BgSnow) : 4, // Snow (BgSnow-dependent)
            5 => 5,                                                    // Crimson (fixed)
            6 => 13,                                                   // Underground Jungle (fixed)
            7 => 14,                                                   // Mushroom (fixed)
            _ => 0
        };
    }

    /// <summary>
    /// Map forest TreeStyle value (0-5) to Tree_Tops texture index.
    /// </summary>
    private static int GetForestTreeStyle(World world, int zone)
    {
        int style = zone switch
        {
            0 => world.TreeStyle0,
            1 => world.TreeStyle1,
            2 => world.TreeStyle2,
            _ => world.TreeStyle3
        };
        if (style == 0) return 0;
        return style == 5 ? 10 : 5 + style;
    }

    /// <summary>
    /// Map BgSnow value to the primary snow tree top index for previews.
    /// </summary>
    private static int GetSnowTreeTopIndex(int bgSnow) => bgSnow switch
    {
        0 => 12,
        2 or 3 or 4 => 16,
        32 or 42 => 16,
        _ => 4
    };

    /// <summary>
    /// Gets standard source rectangle for multi-tile sprites with UV offset.
    /// </summary>
    private static Rectangle GetStandardSourceRect(SpriteItem style, SpriteSheet sprite, Vector2Short uvOffset)
    {
        var uv = TileProperty.GetRenderUV(style.Tile, style.UV.X, style.UV.Y);
        return new Rectangle(
            uv.X + uvOffset.X,
            uv.Y + uvOffset.Y,
            style.SizeTiles.X * sprite.SizePixelsRender.X,
            style.SizeTiles.Y * sprite.SizePixelsRender.Y);
    }


}