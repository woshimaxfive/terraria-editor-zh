using System.Text.RegularExpressions;
using TEdit.Terraria;
using TEdit.Common;
namespace TEdit.Port;
public sealed partial class Session {
 static TEditColor[]? defaultTileColors,defaultWallColors;
 string? currentPalette;
 readonly Dictionary<string,TEditColor> textureColors=new();
 void ConfigurePalette(string mode){
  if(mode is not ("Default" or "Minimap" or "Realistic"))throw new ArgumentException("颜色模式无效");
  defaultTileColors??=WorldConfiguration.TileProperties.Select(t=>t.Color).ToArray();defaultWallColors??=WorldConfiguration.WallProperties.Select(t=>t.Color).ToArray();
  if(currentPalette==mode)return;
  for(int i=0;i<defaultTileColors.Length;i++)WorldConfiguration.TileProperties[i].Color=defaultTileColors[i];for(int i=0;i<defaultWallColors.Length;i++)WorldConfiguration.WallProperties[i].Color=defaultWallColors[i];
  if(mode=="Minimap"){if(!TEdit.Render.MapColorLoader.LoadMapColors())throw new InvalidOperationException("原版地图颜色表未加载");TEdit.Render.MapColorLoader.ApplyMinimapColors();}
  if(mode=="Realistic")foreach(var (key,color) in textureColors)ApplyTextureColor(key,color);
  currentPalette=mode;
 }
 static void ApplyTextureColor(string key,TEditColor color){var match=Regex.Match(key,@"^(tiles|wall)_(\d+)$");if(!match.Success||color.A==0)return;int id=int.Parse(match.Groups[2].Value);if(match.Groups[1].Value=="tiles"){if(id<WorldConfiguration.TileProperties.Count&&!WorldConfiguration.TileProperties[id].IsFramed)WorldConfiguration.TileProperties[id].Color=color;}else if(id<WorldConfiguration.WallProperties.Count)WorldConfiguration.WallProperties[id].Color=color;}
 public void RegisterPaletteTexture(string key,int width,int height,byte[] rgba){
  if(width<1||height<1||width>4096||height>4096||rgba.Length!=(long)width*height*4)throw new ArgumentException("贴图颜色数据无效");
  key=key.ToLowerInvariant();if(!Regex.IsMatch(key,@"^(tiles|wall)_\d+$"))return;
  int origin=key.StartsWith("tiles_")?18:44;if(width<origin+16||height<origin+16)return;
  var texture=new PaletteTexture(key,width,height,rgba);var color=OriginalTextureColor.GetTextureTileColor(texture,new(origin,origin,16,16));textureColors[key]=color;if(currentPalette=="Realistic")ApplyTextureColor(key,color);
 }
}
public sealed class PaletteTexture(string name,int width,int height,byte[] rgba){
 public string Name=>name;
 public void GetData(int level,TEdit.Geometry.RectangleInt32 source,TEditColor[] colors,int start,int count){for(int y=0;y<source.Height;y++)for(int x=0;x<source.Width;x++){int i=((source.Y+y)*width+source.X+x)*4;colors[start+y*source.Width+x]=new(rgba[i],rgba[i+1],rgba[i+2],rgba[i+3]);}}
}
