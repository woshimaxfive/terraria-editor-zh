using System.Drawing;
using System.Text.Json;
namespace TEdit.Port;
public sealed record PixelArtOptions(int Spacing=4,string Scaling="Bilinear",string Rotation="None",string Axis="XAxis",bool UseTiles=true,bool UseWalls=true,bool BuildSafe=true,bool UniqueColors=true,bool Backdrop=false,int LanczosA=3,double GaussianSigma=1);
public sealed class RgbaBitmap {
 public int Width {get;}
 public int Height {get;}
 readonly byte[] rgba;
 public RgbaBitmap(int width,int height,byte[] bytes){if(width<1||height<1||width>1024||height>1024||(long)width*height*4!=bytes.LongLength)throw new ArgumentException("图片尺寸或RGBA长度无效（最大1024×1024）");Width=width;Height=height;rgba=bytes;}
 public Color GetPixel(int x,int y){if(x<0||y<0||x>=Width||y>=Height)throw new ArgumentOutOfRangeException();int i=(x+y*Width)*4;return Color.FromArgb(rgba[i+3],rgba[i],rgba[i+1],rgba[i+2]);}
}
public sealed partial class Session {
 public void GeneratePixelArt(JsonElement request){RequireWorld();var image=new RgbaBitmap(request.GetProperty("width").GetInt32(),request.GetProperty("height").GetInt32(),request.GetProperty("rgba").GetBytesFromBase64());var options=JsonSerializer.Deserialize<PixelArtOptions>(request.GetProperty("options").GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??new();var next=new OriginalPixelArt().Convert(image,options);ValidateSize(next.Size.X,next.Size.Y);clipboard=next;clipboardIdentity=ClipboardIdentity.FromWorld(World!);ClipboardRevision++;DomainResult=new{message="原版像素画已生成到剪贴板",width=next.Size.X,height=next.Size.Y};}
}
