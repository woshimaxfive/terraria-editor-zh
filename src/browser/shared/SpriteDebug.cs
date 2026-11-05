using System.Text.Json;
using TEdit.Editor.Plugins;
namespace TEdit.Port;
public sealed partial class Session {
 internal void GenerateSpriteDebug(string textureSizesJson){
  RequireWorld();ClipboardSpriteMetadata.Build();var sizes=JsonSerializer.Deserialize<int[][]>(textureSizesJson)??throw new ArgumentException("贴图尺寸缺失");if(sizes.Length>2048||sizes.Any(s=>s==null||s.Length!=3||s[0]<0||s[0]>65535||s[1]<1||s[1]>32767||s[2]<1||s[2]>32767)||sizes.Select(s=>s[0]).Distinct().Count()!=sizes.Length)throw new ArgumentException("贴图尺寸清单无效");var byTile=sizes.ToDictionary(s=>s[0]);
  var sheets=TEdit.Terraria.WorldConfiguration.Sprites2;foreach(var sheet in sheets){if(!byTile.TryGetValue(sheet.Tile,out var size))throw new ArgumentException("缺少实际 Tiles_"+sheet.Tile+" 的尺寸");sheet.SizeTexture=new((short)size[1],(short)size[2]);}
  int x=0,y=0,currentMaxX=0;long work=0;
  foreach(var sprite in sheets){int width=sprite.SizeTexture.Width/sprite.SizePixelsInterval.Width,height=sprite.SizeTexture.Height/sprite.SizePixelsInterval.Height;if(sprite.IsAnimated){width=sprite.SizeTiles[0].X;height=sprite.SizeTiles[0].Y;}int offset=sprite.Styles.Select(style=>(style.UV/style.SizePixelsInterval).Y).DefaultIfEmpty().Max();if(y+height+offset>=World!.TilesHigh){x+=currentMaxX;currentMaxX=0;y=0;}currentMaxX=Math.Max(currentMaxX,width);foreach(var style in sprite.Styles){var p=style.UV/style.SizePixelsInterval;if(x+p.X<0||y+p.Y<0||x+p.X+style.SizeTiles.X>World!.TilesWide||y+p.Y+style.SizeTiles.Y>World.TilesHigh)throw new ArgumentException("当前世界无法容纳原版完整家具调试布局，请打开更大的测试世界");work+=(long)style.SizeTiles.X*style.SizeTiles.Y;}y+=height;}
  if(work>1_048_576)throw new ArgumentException("家具调试布局超过1048576格工作预算");new SpriteDebuggerPlugin(vm!).Execute();DomainResult=new{message="已按原版布局生成家具调试图",styles=sheets.Sum(s=>s.Styles.Count),cells=work};
 }
}
