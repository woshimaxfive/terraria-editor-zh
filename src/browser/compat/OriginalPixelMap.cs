// Extracted unchanged method from fixed original TEdit5 PixelMap.cs. MS-PL source, LICENSE in ../source.
using TEdit.Common;
using TEdit.Terraria;
public static class OriginalPixelMap {
    public static TEditColor AlphaBlend(this TEditColor background, TEditColor color)
    {
        return AlphaBlend(background.A, background.R, background.B, background.G,
                          color.A, color.R, color.B, color.G);
    }
    public static TEditColor AlphaBlend(byte a1, byte r1, byte b1, byte g1, byte a2, byte r2, byte b2, byte g2)
    {
        var a = (byte)((a2 / 255F) * a2 + (1F - a2 / 255F) * a1);
        var r = (byte)((a2 / 255F) * r2 + (1F - a2 / 255F) * r1);
        var g = (byte)((a2 / 255F) * g2 + (1F - a2 / 255F) * g1);
        var b = (byte)((a2 / 255F) * b2 + (1F - a2 / 255F) * b1);
        return TEditColor.FromNonPremultiplied(r, g, b, a);
    }
    public static TEditColor GetTileColor(Tile tile, TEditColor background, RenderLayerVisibility? layers = null)
    {
        var c = new TEditColor(0, 0, 0, 0);

        if (tile.Wall > 0 && (layers?.Wall ?? true))
        {

            if (WorldConfiguration.WallProperties.Count > tile.Wall)
            {
                if (WorldConfiguration.WallProperties[tile.Wall].Color.A != 0)
                    c = c.AlphaBlend(WorldConfiguration.WallProperties[tile.Wall].Color);
                else
                    c = background;
            }
            else
                c = c.AlphaBlend(TEditColor.Magenta); // Add out-of-range colors

            byte brightness = 255;
            if (layers?.Coatings ?? true)
            {
                // echo: 169
                // normal: 211
                // illuminant: 255

                brightness = 211;
                if (tile.InvisibleWall) { brightness = 169; }
                if (tile.FullBrightWall) { brightness = 255; }
            }

            // blend paint
            if (tile.WallColor > 0 && tile.WallColor < WorldConfiguration.PaintProperties.Count && (!(layers?.Tile ?? true) || tile.TileColor == 0))
            {
                var paint = WorldConfiguration.PaintProperties[tile.WallColor].Color;
                switch (tile.WallColor)
                {
                    case 29:
                        float light = c.B * 0.3f * (brightness / 255.0f);
                        c.R = (byte)(c.R * light);
                        c.G = (byte)(c.G * light);
                        c.B = (byte)(c.B * light);
                        break;
                    case 30:
                        c.R = (byte)((byte.MaxValue - c.R) * 0.5 * (brightness / 255.0f));
                        c.G = (byte)((byte.MaxValue - c.G) * 0.5 * (brightness / 255.0f));
                        c.B = (byte)((byte.MaxValue - c.B) * 0.5 * (brightness / 255.0f));
                        break;
                    default:
                        paint.A = (byte)brightness;
                        c = c.AlphaBlend(paint);
                        break;
                }
            }
            else
            {
                c.R = (byte)(c.R * (brightness / 255.0f));
                c.G = (byte)(c.G * (brightness / 255.0f));
                c.B = (byte)(c.B * (brightness / 255.0f));
            }
        }
        else
            c = background;

        if (tile.IsActive && (layers?.Tile ?? true))
        {
            if (WorldConfiguration.TileProperties.Count > tile.Type)
                c = c.AlphaBlend(WorldConfiguration.TileProperties[tile.Type].Color);
            else
                c = c.AlphaBlend(TEditColor.Magenta); // Add out-of-range colors

            byte brightness = 255;
            if ((layers?.Coatings ?? true))
            {
                // echo: 169
                // normal: 211
                // illuminant: 255

                brightness = 211;
                if (tile.InvisibleBlock) { brightness = 169; }
                if (tile.FullBrightBlock) { brightness = 255; }
            }

            // blend paint
            if (tile.TileColor > 0 && tile.TileColor < WorldConfiguration.PaintProperties.Count)
            {
                var paint = WorldConfiguration.PaintProperties[tile.TileColor].Color;

                switch (tile.TileColor)
                {
                    case 29:
                        float light = c.B * 0.3f * (brightness / 255.0f);
                        c.R = (byte)(c.R * light);
                        c.G = (byte)(c.G * light);
                        c.B = (byte)(c.B * light);
                        break;
                    case 30:
                        c.R = (byte)((byte.MaxValue - c.R) * 0.5 * (brightness / 255.0f));
                        c.G = (byte)((byte.MaxValue - c.G) * 0.5 * (brightness / 255.0f));
                        c.B = (byte)((byte.MaxValue - c.B) * 0.5 * (brightness / 255.0f));
                        break;
                    default:
                        paint.A = (byte)brightness;
                        c = c.AlphaBlend(paint);
                        break;
                }
            }
            else
            {
                c.R = (byte)(c.R * (brightness / 255.0f));
                c.G = (byte)(c.G * (brightness / 255.0f));
                c.B = (byte)(c.B * (brightness / 255.0f));
            }
        }

        if (tile.LiquidAmount > 0 && (layers?.Liquid ?? true))
        {
            if (tile.LiquidType == LiquidType.Lava) c = c.AlphaBlend(WorldConfiguration.GlobalColors["Lava"]);
            else if (tile.LiquidType == LiquidType.Honey) c = c.AlphaBlend(WorldConfiguration.GlobalColors["Honey"]);
            else if (tile.LiquidType == LiquidType.Shimmer) c = c.AlphaBlend(WorldConfiguration.GlobalColors["Shimmer"]);
            else c = c.AlphaBlend(WorldConfiguration.GlobalColors["Water"]);
        }

        if (tile.WireRed && (layers?.WireRed ?? true))
        {
            c = c.AlphaBlend(WorldConfiguration.GlobalColors["Wire"]);
        }
        if (tile.WireGreen && (layers?.WireGreen ?? true))
        {
            c = c.AlphaBlend(WorldConfiguration.GlobalColors["Wire2"]);
        }
        if (tile.WireBlue && (layers?.WireBlue ?? true))
        {
            c = c.AlphaBlend(WorldConfiguration.GlobalColors["Wire1"]);
        }
        if (tile.WireYellow && (layers?.WireYellow ?? true))
        {
            c = c.AlphaBlend(WorldConfiguration.GlobalColors["Wire3"]);
        }

        return c;
    }
}
public class RenderLayerVisibility {public bool Wall=true,Tile=true,Liquid=true,WireRed=true,WireBlue=true,WireGreen=true,WireYellow=true,Coatings=true;}
