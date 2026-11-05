using TEdit.Common;
using Color=TEdit.Common.TEditColor;
using Rectangle=TEdit.Geometry.RectangleInt32;
using Texture2D=TEdit.Port.PaletteTexture;
namespace TEdit.Port;
public static class OriginalTextureColor {
    public static TEditColor GetTextureTileColor(Texture2D texture, Rectangle source, bool useAverage = true)
    {
        Dictionary<Color, int> colorHistogram = new Dictionary<Color, int>();

        var color = new Color[source.Height * source.Width];

        if (texture.Name != null) // Catch any possible texture errors.
            texture.GetData(0, source, color, 0, color.Length);

        for (int i = 0; i < color.Length; i++)
        {
            if (color[i].PackedValue > 0)
            {
                if (colorHistogram.TryGetValue(color[i], out int count))
                {
                    colorHistogram[color[i]] = count + 1;
                }
                else
                {
                    colorHistogram[color[i]] = 1;
                }
            }
        }

        if (colorHistogram.Count == 0) return TEditColor.Transparent;

        if (useAverage)
        {
            var r = colorHistogram.Sum(kvp => kvp.Key.R) / colorHistogram.Count;
            var g = colorHistogram.Sum(kvp => kvp.Key.G) / colorHistogram.Count;
            var b = colorHistogram.Sum(kvp => kvp.Key.B) / colorHistogram.Count;
            return new TEditColor((byte)r, (byte)g, (byte)b, (byte)255);
        }
        else
        {

            var colorModes = colorHistogram.Where(kvp => kvp.Value == colorHistogram.Max(kvp => kvp.Value)).Select(kvp => kvp.Key).ToList();
            var r2 = colorModes.Sum(c => c.R) / colorModes.Count;
            var g2 = colorModes.Sum(c => c.G) / colorModes.Count;
            var b2 = colorModes.Sum(c => c.B) / colorModes.Count;
            var colorMode = new Color(r2, g2, b2);

            return new TEditColor(
                colorMode.R,
                colorMode.G,
                colorMode.B,
                (byte)255);
        }




    }


}
