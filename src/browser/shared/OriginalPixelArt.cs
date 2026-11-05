/*
Copyright (c) 2024 RussDev7

This source is subject to the Microsoft Public License.
See http://www.microsoft.com/opensource/licenses.mspx#Ms-PL.
All other rights reserved.

THIS CODE AND INFORMATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND,
EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND/OR FITNESS FOR A PARTICULAR PURPOSE.
 */

// Quantization, sampling kernels and tile rotation extracted from RussDev7's
// ImageToPixelartEditorViewModel (Ms-PL); see frozen source for the full notice.
using System.Drawing;
using System.Xml.Linq;
using TEdit.Editor.Clipboard;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Editor.Plugins;
using Bitmap=TEdit.Port.RgbaBitmap;
namespace TEdit.Port;
public sealed class OriginalPixelArt {
 Color[] Clrs=[];
 List<TileWallData> ClrsTileWallData=[];
 public RotationAngle RotationAngle {get;set;}
 public WorldAxis WorldAxis {get;set;}
 static readonly Lazy<List<TileWallData>> Palette=new(()=>{using var stream=typeof(OriginalPixelArt).Assembly.GetManifestResourceStream("TEdit.Port.MapColors.xml")!;return ReadData(stream,null);});
 public ClipboardBuffer Convert(RgbaBitmap btm,PixelArtOptions options){
  if(!Enum.TryParse<ScalingMode>(options.Scaling,out var scaling)||!Enum.IsDefined(scaling)||!Enum.TryParse<RotationAngle>(options.Rotation,out var rotation)||!Enum.IsDefined(rotation)||!Enum.TryParse<WorldAxis>(options.Axis,out var axis)||!Enum.IsDefined(axis))throw new ArgumentException("采样、旋转或轴向无效");
  RotationAngle=rotation;WorldAxis=axis;
  int num=options.Spacing;if(num<1||num>32||options.LanczosA<1||options.LanczosA>8||!double.IsFinite(options.GaussianSigma)||options.GaussianSigma<0.01||options.GaussianSigma>10)throw new ArgumentException("像素画采样参数超出预算");
  var filteredList=Palette.Value.Where(data=>((options.UseTiles&&data.Type=="Tile")||(options.UseWalls&&data.Type=="Wall"))&&(!options.BuildSafe||data.BuildSafe)).ToList();
  if(options.UniqueColors)filteredList=filteredList.GroupBy(data=>data.Color).Select(group=>group.First()).ToList();
  if(filteredList.Count==0)throw new ArgumentException("颜色过滤没有可用材料");
  ClrsTileWallData=filteredList;Clrs=filteredList.Select(d=>Color.FromArgb(unchecked((int)ConvertHex(d.Color)))).ToArray();
  int blocksPerRow=(btm.Width+num-1)/num,blocksPerColumn=(btm.Height+num-1)/num;
  if((long)blocksPerRow*blocksPerColumn*Clrs.Length>64000000)throw new ArgumentException("像素与调色板超过6400万次比较预算，请增加间距");
  bool swapped=rotation is RotationAngle.Rotate90 or RotationAngle.Rotate270;
  var buffer=new ClipboardBuffer(new(swapped?blocksPerColumn+1:blocksPerRow+1,swapped?blocksPerRow+1:blocksPerColumn+1),true);
  for(int x=0;x<btm.Width;x+=num)for(int y=0;y<btm.Height;y+=num){
   var final=scaling switch{ScalingMode.NearestNeighbor=>NearestNeighborInterpolation(btm,x,y,num,options.Backdrop),ScalingMode.Bicubic=>BicubicInterpolation(btm,x,y,options.Backdrop),ScalingMode.Lanczos=>LanczosInterpolation(btm,x,y,num,options.LanczosA,options.Backdrop),ScalingMode.Hermite=>HermiteInterpolation(btm,x,y,options.Backdrop),ScalingMode.Spline=>SplineInterpolation(btm,x,y,num,options.Backdrop),ScalingMode.Gaussian=>GaussianInterpolation(btm,x,y,options.GaussianSigma,options.Backdrop),_=>BilinearInterpolation(btm,x,y,num,options.Backdrop)};
   Point p=GetRotationData(x/num,y/num,blocksPerRow,blocksPerColumn);
   if(final.A==0){buffer.Tiles[p.X,p.Y]=new Tile{Type=0,IsActive=false};continue;}
   string html=$"#{final.A:X2}{final.R:X2}{final.G:X2}{final.B:X2}";
   var matched=ClrsTileWallData.FirstOrDefault(t=>t.Color.Equals(html,StringComparison.OrdinalIgnoreCase));
   if(matched!=null)buffer.Tiles[p.X,p.Y]=matched.Type=="Tile"?new Tile{Type=(ushort)matched.Id,TileColor=(byte)matched.Paint,IsActive=true}:new Tile{Wall=(ushort)matched.Id,WallColor=(byte)matched.Paint,IsActive=false};
  }
  return buffer;
 }
 static uint ConvertHex(string color)=>uint.Parse(color.AsSpan(1),System.Globalization.NumberStyles.HexNumber,System.Globalization.CultureInfo.InvariantCulture);
    private Color NearestNeighborInterpolation(Bitmap bmp, int x, int y, int num, bool includeTransparent)
    {
        int nx = Math.Min(x + num / 2, bmp.Width - 1);
        int ny = Math.Min(y + num / 2, bmp.Height - 1);
        Color nearestColor = bmp.GetPixel(nx, ny);

        if (includeTransparent || nearestColor.A != 0)
        {
            if (includeTransparent && nearestColor.A == 0)
                nearestColor = Color.Lime;

            return Clr(new Color[] { nearestColor });
        }
        return nearestColor;
    }

    private Color BilinearInterpolation(Bitmap bmp, int x, int y, int num, bool includeTransparent)
    {
        List<Color> block = new();

        for (int v = 0; v < num; v++)
        {
            for (int c = 0; c < num; c++)
            {
                if (x + v < bmp.Width && y + c < bmp.Height)
                {
                    Color color = bmp.GetPixel(x + v, y + c);
                    if (includeTransparent || color.A != 0)
                    {
                        if (includeTransparent && color.A == 0)
                            color = Color.Lime;
                        block.Add(color);
                    }
                }
            }
        }

        if (block.Count == 0)
            return Color.Transparent;

        return Clr(block.ToArray());
    }

    private Color BicubicInterpolation(Bitmap bmp, int x, int y, bool includeTransparent)
    {
        double[] dx = new double[4];
        double[] dy = new double[4];

        for (int i = 0; i < 4; i++)
        {
            dx[i] = CubicPolynomial(i - 1);
            dy[i] = CubicPolynomial(i - 1);
        }

        double r = 0, g = 0, b = 0;
        double sum = 0;
        for (int i = -1; i <= 2; i++)
        {
            for (int j = -1; j <= 2; j++)
            {
                int px = Math.Min(Math.Max(x + i, 0), bmp.Width - 1);
                int py = Math.Min(Math.Max(y + j, 0), bmp.Height - 1);
                Color pixel = bmp.GetPixel(px, py);

                if (includeTransparent || pixel.A != 0)
                {
                    if (includeTransparent && pixel.A == 0)
                        pixel = Color.Lime;

                    double coeff = dx[i + 1] * dy[j + 1];
                    r += pixel.R * coeff;
                    g += pixel.G * coeff;
                    b += pixel.B * coeff;
                    sum += coeff;
                }
            }
        }

        if (sum == 0)
            return Color.Transparent;

        Color interpolatedColor = Color.FromArgb(Clamp(r / sum), Clamp(g / sum), Clamp(b / sum));
        return Clr(new Color[] { interpolatedColor });
    }

    private Color LanczosInterpolation(Bitmap bmp, int x, int y, int num, int a, bool includeTransparent)
    {
        double r = 0, g = 0, b = 0;
        double sum = 0;

        for (int i = -a + 1; i <= a; i++)
        {
            for (int j = -a + 1; j <= a; j++)
            {
                int px = Math.Min(Math.Max(x + i, 0), bmp.Width - 1);
                int py = Math.Min(Math.Max(y + j, 0), bmp.Height - 1);
                Color pixel = bmp.GetPixel(px, py);

                if (includeTransparent || pixel.A != 0)
                {
                    if (includeTransparent && pixel.A == 0)
                        pixel = Color.Lime;

                    double lanczosWeight = LanczosKernel(i / (double)num, a) * LanczosKernel(j / (double)num, a);
                    r += pixel.R * lanczosWeight;
                    g += pixel.G * lanczosWeight;
                    b += pixel.B * lanczosWeight;
                    sum += lanczosWeight;
                }
            }
        }

        if (sum == 0)
            return Color.Transparent;

        Color interpolatedColor = Color.FromArgb(Clamp(r / sum), Clamp(g / sum), Clamp(b / sum));
        return Clr(new Color[] { interpolatedColor });
    }

    private Color HermiteInterpolation(Bitmap bmp, int x, int y, bool includeTransparent)
    {
        double[] dx = new double[2];
        double[] dy = new double[2];

        dx[0] = HermitePolynomial(0);
        dx[1] = HermitePolynomial(1);

        dy[0] = HermitePolynomial(0);
        dy[1] = HermitePolynomial(1);

        double r = 0, g = 0, b = 0;
        double sum = 0;
        for (int i = 0; i < 2; i++)
        {
            for (int j = 0; j < 2; j++)
            {
                int px = Math.Min(Math.Max(x + i, 0), bmp.Width - 1);
                int py = Math.Min(Math.Max(y + j, 0), bmp.Height - 1);
                Color pixel = bmp.GetPixel(px, py);

                if (includeTransparent || pixel.A != 0)
                {
                    if (includeTransparent && pixel.A == 0)
                        pixel = Color.Lime;

                    double coeff = dx[i] * dy[j];
                    r += pixel.R * coeff;
                    g += pixel.G * coeff;
                    b += pixel.B * coeff;
                    sum += coeff;
                }
            }
        }

        if (sum == 0)
            return Color.Transparent;

        Color interpolatedColor = Color.FromArgb(Clamp(r / sum), Clamp(g / sum), Clamp(b / sum));
        return Clr(new Color[] { interpolatedColor });
    }

    private Color SplineInterpolation(Bitmap bmp, int x, int y, int num, bool includeTransparent)
    {
        double r = 0, g = 0, b = 0;
        double sum = 0;

        for (int i = -1; i <= 2; i++)
        {
            for (int j = -1; j <= 2; j++)
            {
                int px = Math.Min(Math.Max(x + i, 0), bmp.Width - 1);
                int py = Math.Min(Math.Max(y + j, 0), bmp.Height - 1);
                Color pixel = bmp.GetPixel(px, py);

                if (includeTransparent || pixel.A != 0)
                {
                    if (includeTransparent && pixel.A == 0)
                        pixel = Color.Lime;

                    double coeff = SplineKernel(i / (double)num) * SplineKernel(j / (double)num);
                    r += pixel.R * coeff;
                    g += pixel.G * coeff;
                    b += pixel.B * coeff;
                    sum += coeff;
                }
            }
        }

        if (sum == 0)
            return Color.Transparent;

        Color interpolatedColor = Color.FromArgb(Clamp(r / sum), Clamp(g / sum), Clamp(b / sum));
        return Clr(new Color[] { interpolatedColor });
    }

    private Color GaussianInterpolation(Bitmap bmp, int x, int y, double sigma, bool includeTransparent)
    {
        double r = 0, g = 0, b = 0;
        double sum = 0;

        int radius = (int)Math.Ceiling(3 * sigma);

        for (int i = -radius; i <= radius; i++)
        {
            for (int j = -radius; j <= radius; j++)
            {
                int px = Math.Min(Math.Max(x + i, 0), bmp.Width - 1);
                int py = Math.Min(Math.Max(y + j, 0), bmp.Height - 1);
                Color pixel = bmp.GetPixel(px, py);

                if (includeTransparent || pixel.A != 0)
                {
                    if (includeTransparent && pixel.A == 0)
                        pixel = Color.Lime;

                    double weight = GaussianKernel(i, j, sigma);
                    r += pixel.R * weight;
                    g += pixel.G * weight;
                    b += pixel.B * weight;
                    sum += weight;
                }
            }
        }

        if (sum == 0)
            return Color.Transparent;

        Color interpolatedColor = Color.FromArgb(Clamp(r / sum), Clamp(g / sum), Clamp(b / sum));
        return Clr(new Color[] { interpolatedColor });
    }

    private static double HermitePolynomial(double x)
    {
        if (x == 0) return 1.0;
        if (x < 0) x = -x;
        double x3 = x * x * x;
        double x2 = x * x;
        return (2 * x3) - (3 * x2) + 1;
    }

    private static double LanczosKernel(double x, int a)
    {
        if (x == 0) return 1.0;
        if (x < -a || x > a) return 0.0;

        x *= Math.PI;
        return a * Math.Sin(x) * Math.Sin(x / a) / (x * x);
    }

    private static double CubicPolynomial(double x)
    {
        x = Math.Abs(x);
        if (x <= 1)
            return 1.5 * x * x * x - 2.5 * x * x + 1;
        else if (x < 2)
            return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
        else
            return 0;
    }

    private static double SplineKernel(double x)
    {
        x = Math.Abs(x);
        if (x <= 1)
        {
            return 1.0 - 2.0 * x * x + x * x * x;
        }
        else if (x < 2)
        {
            return 4.0 - 8.0 * x + 5.0 * x * x - x * x * x;
        }
        return 0.0;
    }

    private static double GaussianKernel(int x, int y, double sigma)
    {
        double expPart = Math.Exp(-(x * x + y * y) / (2 * sigma * sigma));
        double normalPart = 1 / (2 * Math.PI * sigma * sigma);
        return normalPart * expPart;
    }

    private static int Clamp(double value)
    {
        return (int)Math.Max(0, Math.Min(255, value));
    }



    public Color Clr(Color[] cs)
    {
        int r = 0;
        int g = 0;
        int b = 0;

        for (int i = 0; i < cs.Length; i++)
        {
            r += cs[i].R;
            g += cs[i].G;
            b += cs[i].B;
        }

        r /= cs.Length;
        g /= cs.Length;
        b /= cs.Length;

        int near = 1000;
        int ind = 0;

        for (int cl = 0; cl < Clrs.Length; cl++)
        {
            int valR = (Clrs[cl].R - r);
            int valG = (Clrs[cl].G - g);
            int valB = (Clrs[cl].B - b);

            if (valR < 0) valR = -valR;
            if (valG < 0) valG = -valG;
            if (valB < 0) valB = -valB;

            int total = valR + valG + valB;

            if (total < near)
            {
                ind = cl;
                near = total;
            }
        }

        return Clrs[ind];
    }



    private Point GetRotationData(int xInput, int yInput, int maxWidth, int maxHeight)
    {
        int x, y;
        if (WorldAxis == WorldAxis.XAxis)
        {
            (x, y) = RotationAngle switch
            {
                RotationAngle.Rotate90 => (maxHeight - 1 - yInput, xInput),
                RotationAngle.Rotate180 => (maxWidth - 1 - xInput, maxHeight - 1 - yInput),
                RotationAngle.Rotate270 => (yInput, maxWidth - 1 - xInput),
                _ => (xInput, yInput)
            };
        }
        else
        {
            (x, y) = RotationAngle switch
            {
                RotationAngle.Rotate90 => (yInput, xInput),
                RotationAngle.Rotate180 => (xInput, maxHeight - 1 - yInput),
                RotationAngle.Rotate270 => (maxWidth - 1 - yInput, maxHeight - 1 - xInput),
                _ => (maxWidth - 1 - xInput, yInput)
            };
        }

        return new Point(x, y);
    }

    public class TileWallData
    {
        public string Type { get; set; } = string.Empty;
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Paint { get; set; }
        public string Color { get; set; } = string.Empty;
        public bool BuildSafe { get; set; }
    }

    public static List<TileWallData> ReadData(Stream stream, IProgress<int>? progress)
    {
        var dataList = new List<TileWallData>();

        var doc = XDocument.Load(stream);
        var elements = doc.Descendants().Where(e => e.Name == "Tile" || e.Name == "Wall").ToList();

        int totalElements = elements.Count;
        for (int i = 0; i < totalElements; i++)
        {
            var element = elements[i];
            var data = new TileWallData
            {
                Type = element.Name.LocalName,
                Id = int.Parse(element.Attribute("Id")!.Value),
                Name = element.Attribute("Name")!.Value,
                Paint = int.Parse(element.Attribute("Paint")!.Value),
                Color = element.Attribute("Color")!.Value,
                BuildSafe = bool.Parse(element.Attribute("BuildSafe")!.Value)
            };
            dataList.Add(data);

            progress?.Report((i + 1) * 100 / totalElements);
        }

        return dataList;
    }


}
