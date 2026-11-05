// Original SetTileTextures grid extraction, adapted from pixel copies to portable copy commands.
using TEdit.Terraria;
using TEdit.Terraria.Objects;
using TEdit.Geometry;
using TEdit.Port.Rendering;
using Rectangle=TEdit.Geometry.RectangleInt32;
using Texture2D=TEdit.Port.Rendering.Texture2D;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {
 readonly List<RenderPass> previewPasses=new();
 void AddPreviewPatch(Texture2D texture,Rectangle source,Rectangle dest,bool nonzero){
  previewPasses.Add(new(nonzero?"CopyNonzero":"Opaque",null,[new(texture.Key,dest.X,dest.Y,dest.Width,dest.Height,source.X,source.Y,source.Width,source.Height,uint.MaxValue,0,0,0,0,0)],"@preview",previewWidth,previewHeight));
 }
 int previewWidth,previewHeight;
 Texture2D BuildSpritePreview(SpriteItem style,SpriteSheet sprite){
  var tile=_textureDictionary.GetTile(style.Tile);var sourceTexture=tile;var previewConfig=style.PreviewConfig;
  if(previewConfig!=null&&previewConfig.TextureType!=PreviewTextureType.Tile){var alternate=_textureDictionary.GetPreviewTexture(previewConfig,style.Tile);if(alternate!=_textureDictionary.DefaultTexture)sourceTexture=alternate;}
  if(previewConfig?.SourceRect is {} rect){
   var source=Rectangle.Intersect(new(rect.X,rect.Y,rect.Width,rect.Height),sourceTexture.Bounds);previewWidth=Math.Max(1,source.Width);previewHeight=Math.Max(1,source.Height);
   if(source.Width>0&&source.Height>0)AddPreviewPatch(sourceTexture,source,new(0,0,source.Width,source.Height),false);
  }else{
   var uv=TileProperty.GetRenderUV((ushort)style.Tile,style.UV.X,style.UV.Y);var sizeTiles=style.SizeTiles;
   previewWidth=Math.Max(1,sizeTiles.X*sprite.SizePixelsRender.X);previewHeight=Math.Max(1,sizeTiles.Y*sprite.SizePixelsRender.Y);
   Texture2D tileTex=sourceTexture,tileTexture=tile,extraTex=null;
                    for (int x = 0; x < sizeTiles.X; x++)
                    {
                        for (int y = 0; y < sizeTiles.Y; y++)
                        {
                            int sourceX = uv.X + (x * sprite.SizePixelsInterval.X);
                            int sourceY = uv.Y + (y * sprite.SizePixelsInterval.Y);
                            int destX = x * sprite.SizePixelsRender.X;
                            int destY = y * sprite.SizePixelsRender.Y;
                            int renderX = sprite.SizePixelsRender.X;
                            int renderY = sprite.SizePixelsRender.Y;

                            // Handle tall gates (tiles 388, 389) special case
                            if (sprite.Tile == 388 || sprite.Tile == 389)
                            {
                                var offY = uv.Y == 100 ? 94 : 0;
                                switch (y)
                                {
                                    case 0: sourceY = offY; renderY = 18; break;
                                    case 1: sourceY = offY + 20; destY = 18; renderY = 16; break;
                                    case 2: sourceY = offY + 20 + 18; destY = 18 + 16; renderY = 16; break;
                                    case 3: sourceY = offY + 20 + 18 + 18; destY = 18 + 16 + 16; renderY = 16; break;
                                    case 4: sourceY = offY + 20 + 18 + 18 + 18; destY = 18 + 16 + 16 + 16; renderY = 18; break;
                                }
                            }
                            // Handle Chimney (tiles 406) special case
                            else if (sprite.Tile == 406)
                            {
                                switch (uv.Y / 54)
                                {
                                    // On A
                                    case 0: break;
                                    // On B
                                    case 1: sourceY = sourceY % 54 + 56; break;
                                    // Off
                                    case 2: sourceY = sourceY % 54 + 56 * 6; break;
                                }
                            }
                            // Handle Aether Monolith (tiles 658) special case
                            else if (sprite.Tile == 658)
                            {
                                switch (uv.Y / 54)
                                {
                                    // On A
                                    case 0: break;
                                    // On B
                                    case 1: sourceY = sourceY % 54 + 54 * 10; break;
                                    // Off
                                    case 2: sourceY = sourceY % 54 + 54 * 20; break;
                                }
                            }
                            // Handle Radio Thing (tile 733) special case
                            // On state: world UV Y < 54, texture X shifts by +54
                            // Off state: world UV Y >= 54, both axes wrap by 54
                            else if (sprite.Tile == 733)
                            {
                                if (uv.Y < 54)
                                    sourceX = sourceX % 54 + 54;
                                else
                                    sourceX = sourceX % 54;
                                sourceY = sourceY % 54;
                            }
                            // Handle Relic Base (tiles 617) special case
                            else if (sprite.Tile == 617)
                            {
                                if (y == 3)
                                {
                                    tileTex = tileTexture;
                                    sourceX %= 54;
                                }
                                else
                                {
                                    extraTex ??= _textureDictionary.LoadTextureImmediate($"Images\\Extra_198");
                                    tileTex = extraTex;
                                    sourceX = x * 16;
                                    sourceY = y * 16 + uv.X / 54 * 50;
                                }
                            }
                            // Handle Pylons (tiles 597) special case
                            else if (sprite.Tile == 597)
                            {
                                var pylonType = uv.X / 54;

                                extraTex ??= _textureDictionary.LoadTextureImmediate($"Images\\Extra_181");

                                if (extraTex != null)
                                {
                                    var extraTargetRect = new Rectangle(9, 0, 30, 46);
                                    var extraIntersectRect = Rectangle.Intersect(new Rectangle(x * 16, y * 16, 16, 16), extraTargetRect);
                                    var tileLocalRect = new Rectangle(extraIntersectRect.X - x * 16, extraIntersectRect.Y - y * 16, extraIntersectRect.Width, extraIntersectRect.Height);

                                    if (extraIntersectRect.Width > 0 && extraIntersectRect.Height > 0)
                                    {
                                        var extraOffset = new Vector2Int32(extraIntersectRect.X - extraTargetRect.X, extraIntersectRect.Y - extraTargetRect.Y);
                                        var extraSourceRect = new Rectangle(extraOffset.X + (pylonType + 3) * 30, extraOffset.Y, extraIntersectRect.Width, extraIntersectRect.Height);

                                        var tileSourceRect = new Rectangle(sourceX + tileLocalRect.X, sourceY + tileLocalRect.Y, tileLocalRect.Width, tileLocalRect.Height);

                                        // Guard against rectangles outside texture bounds
                                        if (extraSourceRect.X < 0 || extraSourceRect.Y < 0 ||
                                            extraSourceRect.Right > extraTex.Width || extraSourceRect.Bottom > extraTex.Height ||
                                            extraSourceRect.Width <= 0 || extraSourceRect.Height <= 0)
                                            continue;
                                        if (tileSourceRect.X < 0 || tileSourceRect.Y < 0 ||
                                            tileSourceRect.Right > tileTex.Width || tileSourceRect.Bottom > tileTex.Height ||
                                            tileSourceRect.Width <= 0 || tileSourceRect.Height <= 0)
                                            continue;

                                        AddPreviewPatch(extraTex,extraSourceRect,new Rectangle(destX+tileLocalRect.X,destY+tileLocalRect.Y,extraIntersectRect.Width,extraIntersectRect.Height),false);

                                    }
                                }
                            }
                            // Handle Magic Droppers (tiles 373, 374, 375, 461, 709) special case
                            else if (sprite.Tile == 373 || sprite.Tile == 374 || sprite.Tile == 375 || sprite.Tile == 461 || sprite.Tile == 709)
                            {
                                var goreType = sprite.Tile switch { 373 => 706, 374 => 716, 375 => 717, 461 => 943, 709 => 1383, _ => 0 };
                                extraTex ??= _textureDictionary.LoadTextureImmediate($"Images\\Gore_{goreType}");
                                tileTex = extraTex;
                                sourceY = 80;
                            }

                            var source = new Rectangle(sourceX, sourceY, renderX, renderY);

                            // Out of bounds checks (clamp to texture dimensions)
                            if (source.X < 0) { source.Width += source.X; source.X = 0; }
                            if (source.Y < 0) { source.Height += source.Y; source.Y = 0; }
                            if (source.Bottom > tileTex.Height)
                                source.Height -= (source.Bottom - tileTex.Height);
                            if (source.Right > tileTex.Width)
                                source.Width -= (source.Right - tileTex.Width);
                            if (source.Height <= 0 || source.Width <= 0)
                                continue;

                            AddPreviewPatch(tileTex,source,new Rectangle(destX,destY,source.Width,source.Height),sprite.Tile==597);
                        }
                    }

  }
  return new("@preview",previewWidth,previewHeight);
 }
}
