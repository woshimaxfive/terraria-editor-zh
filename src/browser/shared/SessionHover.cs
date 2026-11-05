using System.Text.Json;
namespace TEdit.Port;
public sealed partial class Session {
 public string RenderHoverJson(string json){
  using var doc=JsonDocument.Parse(json);var p=doc.RootElement;
  if(World==null||!p.TryGetProperty("cursor",out var cursor)||cursor.ValueKind!=JsonValueKind.Object)return "{}";
  int x=cursor.GetProperty("x").GetInt32(),y=cursor.GetProperty("y").GetInt32();if(!World.ValidTileLocation(x,y))return "{}";
  var info=new OriginalMouseTile(p.TryGetProperty("language",out var language)?language.GetString()??"zh-Hans":"zh-Hans");
  info.UpdateTileInfo(World.Tiles[x,y]);info.UpdateDepth(x,y,World.TilesWide,World.TilesHigh,World.GroundLevel,World.RockLevel);
  return JsonSerializer.Serialize(new{position=$"{x}, {y}",depth=info.DepthText,tile=info.TileName,wall=info.WallName,extra=info.TileExtras,uv=$"{info.UV.X}, {info.UV.Y}",paint=info.Paint});
 }
}
