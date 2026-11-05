// TEdit frozen WorldRenderXna methods, MS-PL. Bitmap storage/texture readback adapted.
using TEdit.Terraria;
using TEdit.Terraria.DataModel;
using Int32Rect=TEdit.Geometry.RectangleInt32;
using Rectangle=TEdit.Geometry.RectangleInt32;
namespace TEdit.Port;
public sealed class OriginalBackgroundPreview(PreviewTextures textures) {
 readonly PreviewTextures _textureDictionary=textures;
 public BackgroundBitmap? Render(string category,int id){
  var property=typeof(BackgroundStyleConfiguration).GetProperty(category);
  if(property?.GetValue(WorldConfiguration.BackgroundStyles) is not List<BackgroundStyle> styles)throw new ArgumentException("背景分类不存在");
  var style=styles.FirstOrDefault(s=>s.Id==id)??throw new ArgumentException("背景样式不存在");
  if(category=="TreeStyles")return style.Textures is {Length:>0}?CreateTreeTopFramePreview(style.Textures[0],128):null;
  if(category=="UnderworldBackgrounds"){
   if(style.Textures is not {Length:>0}||style.Textures[0]<0)return null;
   int index=style.Textures[0];var texture=textures.GetUnderworld(index);
   return texture==textures.DefaultTexture?null:CreateScaledPreview(index,texture,128);
  }
  return CreateCompositeBackgroundPreview(style,128);
 }
    private BackgroundBitmap CreateTreeTopFramePreview(int treeTopIndex, int maxDim = 64)
    {
        var tex = (PreviewTexture)_textureDictionary.GetTreeTops(treeTopIndex);
        if (tex == null || tex == _textureDictionary.DefaultTexture) return null;

        // Frame 0 dimensions depend on tree style
        int fw = 80, fh = 80;
        switch (treeTopIndex)
        {
            case 2: case 11: case 13: fw = 114; fh = 96; break;
            case 3: fh = 140; break;
            case 22: case 23: case 24: case 25: case 26: case 27: case 28:
            case 31: fw = 116; fh = 96; break;
            case 29: case 30: fw = 118; fh = 96; break;
        }

        var bitmap = BackgroundBitmap.FromTexture(tex);
        int cropW = Math.Min(fw, bitmap.PixelWidth);
        int cropH = Math.Min(fh, bitmap.PixelHeight);

        // Crop frame 0 using CroppedBitmap, then copy into a new BackgroundBitmap
        var cropped = BackgroundBitmap.Crop(bitmap, new Int32Rect(0, 0, cropW, cropH));
        var croppedWb = cropped;

        double scale = Math.Min((double)maxDim / cropW, (double)maxDim / cropH);
        if (scale >= 1.0) return croppedWb;

        int newWidth = Math.Max(1, (int)(cropW * scale));
        int newHeight = Math.Max(1, (int)(cropH * scale));
        return croppedWb.Resize(newWidth, newHeight);
    }

    private BackgroundBitmap CreateCompositeBackgroundPreview(BackgroundStyle style, int maxDimension)
    {
        // Collect layers in draw order (back to front), same as DrawSurfaceBackground
        var layerIndices = new List<int>();
        if (style.Textures is { Length: > 0 } && style.Textures[0] >= 0)
            layerIndices.Add(style.Textures[0]);
        if (style.SecondaryTextures is { Length: > 0 } && style.SecondaryTextures[0] >= 0)
            layerIndices.Add(style.SecondaryTextures[0]);
        if (style.SecondaryTextures is { Length: > 1 } && style.SecondaryTextures[1] >= 0)
            layerIndices.Add(style.SecondaryTextures[1]);
        if (style.Textures is { Length: > 1 } && style.Textures[1] >= 0)
            layerIndices.Add(style.Textures[1]);
        if (style.Textures is { Length: > 2 } && style.Textures[2] >= 0)
            layerIndices.Add(style.Textures[2]);

        if (layerIndices.Count == 0) return null;

        // Single layer: fast path
        if (layerIndices.Count == 1)
        {
            var tex = _textureDictionary.GetBackground(layerIndices[0]);
            if (tex == null || tex == _textureDictionary.DefaultTexture) return null;
            return CreateScaledPreview(layerIndices[0], tex, maxDimension);
        }

        // Use first layer to determine composite dimensions
        var baseTex = _textureDictionary.GetBackground(layerIndices[0]);
        if (baseTex == null || baseTex == _textureDictionary.DefaultTexture) return null;

        var baseRect = GetBackgroundSourceRect(layerIndices[0], baseTex);
        int compW = baseRect.Width;
        int compH = baseRect.Height;
        if (compW <= 0 || compH <= 0) return null;

        // Create BGRA32 composite buffer
        var composite = new byte[compW * compH * 4];

        foreach (int texIdx in layerIndices)
        {
            var tex = _textureDictionary.GetBackground(texIdx);
            if (tex == null || tex == _textureDictionary.DefaultTexture) continue;

            var srcRect = GetBackgroundSourceRect(texIdx, tex);
            var bitmap = BackgroundBitmap.FromTexture(tex);

            // Scale layer to composite width, preserve aspect ratio, bottom-anchor
            int layerDrawH = (int)((float)srcRect.Height / srcRect.Width * compW);
            int yOffset = compH - layerDrawH; // bottom-anchored

            // Read source pixels (only the first frame region)
            int srcPixelW = Math.Min(srcRect.Width, bitmap.PixelWidth - srcRect.X);
            int srcPixelH = Math.Min(srcRect.Height, bitmap.PixelHeight - srcRect.Y);
            if (srcPixelW <= 0 || srcPixelH <= 0) continue;
            var srcPixels = new byte[srcPixelW * srcPixelH * 4];
            bitmap.CopyPixels(new Int32Rect(srcRect.X, srcRect.Y, srcPixelW, srcPixelH), srcPixels, srcPixelW * 4, 0);

            // Blit with alpha compositing (source over destination)
            for (int dy = Math.Max(0, yOffset); dy < compH; dy++)
            {
                // Map destination Y to source Y
                float srcYf = (float)(dy - yOffset) / layerDrawH * srcPixelH;
                int srcY = Math.Min((int)srcYf, srcPixelH - 1);

                for (int dx = 0; dx < compW; dx++)
                {
                    float srcXf = (float)dx / compW * srcPixelW;
                    int srcX = Math.Min((int)srcXf, srcPixelW - 1);

                    int si = (srcY * srcPixelW + srcX) * 4;
                    int di = (dy * compW + dx) * 4;

                    byte sB = srcPixels[si];
                    byte sG = srcPixels[si + 1];
                    byte sR = srcPixels[si + 2];
                    byte sA = srcPixels[si + 3];

                    if (sA == 0) continue;
                    if (sA == 255)
                    {
                        composite[di] = sB;
                        composite[di + 1] = sG;
                        composite[di + 2] = sR;
                        composite[di + 3] = 255;
                        continue;
                    }

                    // Standard alpha compositing: src over dst
                    byte dB = composite[di];
                    byte dG = composite[di + 1];
                    byte dR = composite[di + 2];
                    byte dA = composite[di + 3];

                    int outA = sA + dA * (255 - sA) / 255;
                    if (outA > 0)
                    {
                        composite[di] = (byte)((sB * sA + dB * dA * (255 - sA) / 255) / outA);
                        composite[di + 1] = (byte)((sG * sA + dG * dA * (255 - sA) / 255) / outA);
                        composite[di + 2] = (byte)((sR * sA + dR * dA * (255 - sA) / 255) / outA);
                        composite[di + 3] = (byte)outA;
                    }
                }
            }
        }

        // Create BackgroundBitmap from composite
        var result = new BackgroundBitmap(compW, compH);
        result.WritePixels(new Int32Rect(0, 0, compW, compH), composite, compW * 4, 0);

        // Scale to preview size
        double scale = Math.Min((double)maxDimension / compW, (double)maxDimension / compH);
        if (scale >= 1.0) return result;

        int newW = Math.Max(1, (int)(compW * scale));
        int newH = Math.Max(1, (int)(compH * scale));
        return result.Resize(newW, newH);
    }

    private BackgroundBitmap CreateScaledPreview(int texIndex, PreviewTexture texture, int maxDimension)
    {
        if (texture == null || texture == _textureDictionary.DefaultTexture)
            return null;

        var srcRect = GetBackgroundSourceRect(texIndex, texture);
        var bitmap = BackgroundBitmap.FromTexture(texture);

        // Crop to first frame if texture is a sprite sheet or if srcRect is smaller
        if (srcRect.Width < bitmap.PixelWidth || srcRect.Height < bitmap.PixelHeight)
        {
            int cropW = Math.Min(srcRect.Width, bitmap.PixelWidth - srcRect.X);
            int cropH = Math.Min(srcRect.Height, bitmap.PixelHeight - srcRect.Y);
            if (cropW <= 0 || cropH <= 0) return null;
            bitmap = BackgroundBitmap.Crop(bitmap, new Int32Rect(srcRect.X, srcRect.Y, cropW, cropH));
        }

        int previewW = bitmap.PixelWidth;
        int previewH = bitmap.PixelHeight;

        // Calculate scale to fit within maxDimension while preserving aspect ratio
        double scale = Math.Min(
            (double)maxDimension / previewW,
            (double)maxDimension / previewH);

        if (scale >= 1.0) return bitmap; // No scaling needed if already smaller

        int newWidth = Math.Max(1, (int)(previewW * scale));
        int newHeight = Math.Max(1, (int)(previewH * scale));

        return bitmap.Resize(newWidth, newHeight);
    }

    private static Rectangle GetBackgroundSourceRect(int texIndex, PreviewTexture tex)
    {
        var spriteSheets = WorldConfiguration.BackgroundStyles?.SpriteSheetById;
        if (spriteSheets != null && spriteSheets.TryGetValue(texIndex, out var sheet))
        {
            int frameW = tex.Width / sheet.Columns;
            int frameH = tex.Height / sheet.Rows;
            return new Rectangle(0, 0, frameW, frameH);
        }

        return new Rectangle(0, 0, tex.Width, tex.Height);
    }
}
