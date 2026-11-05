using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using TEdit.Editor;
using TEdit.Editor.Tools;
using TEdit.Geometry;
using TEdit.Terraria;
namespace TEdit.Port;

// Only durable interaction coordinates/flags are copied. Scratch buffers, timers,
// world references and random generators remain owned by the original tools.
public sealed partial class Session {
 static readonly JsonSerializerOptions InteractionJson=new(){IncludeFields=true,Converters={new JsonStringEnumConverter()}};
 static readonly HashSet<string> InteractionFields=["_isDrawing","_isConstraining","_isLineMode","_constrainDirection","_constrainDirectionLocked","_anchorPoint","_startPoint","_endPoint","_leftPoint","_rightPoint","_hasLastClickPosition","_lineMouseDownPos","_lineLastWasClick","_isCadWireMode","_isCadAnchored","_cadRoutingMode","_cadVerticalFirstOverride","_cadAnchor","_cadLastCursor","_cadPreviewPath","_cadPreviewTunnel"];
 static IEnumerable<FieldInfo> DurableFields(BaseTool tool){for(Type? t=tool.GetType();t!=null&&t!=typeof(BaseTool);t=t.BaseType)foreach(var field in t.GetFields(BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.DeclaredOnly))if(InteractionFields.Contains(field.Name))yield return field;}
 public object CaptureInteraction()=>new{tools=new[]{"Brush","Pencil","Sprite"}.ToDictionary(name=>name,name=>DurableFields(Tools[name]).ToDictionary(f=>f.Name,f=>JsonSerializer.SerializeToElement(f.GetValue(Tools[name]),f.FieldType,InteractionJson))),chain=vm!.WireChainMode,sheet=vm.SelectedSpriteSheet?.Tile,sprite=vm.SelectedSpriteItem is {} s?new{tile=(int)s.Tile,style=s.Style}:null,point=vm.SelectedPoint,traceColor=vm.WireTraceColor,trace=vm.WireTraceHighlight.Select(p=>new{x=p.X,y=p.Y}).ToArray()};
 public void RestoreInteraction(JsonElement state){
  var changes=new List<(BaseTool Tool,FieldInfo Field,object? Value)>();
  foreach(var group in state.GetProperty("tools").EnumerateObject()){
   if(group.Name is not ("Brush" or "Pencil" or "Sprite"))throw new InvalidDataException("交互工具名称无效");
   var tool=Tools[group.Name];var fields=DurableFields(tool).ToDictionary(f=>f.Name);
   foreach(var item in group.Value.EnumerateObject()){
    if(!fields.TryGetValue(item.Name,out var field))throw new InvalidDataException("交互字段无效");
    var value=JsonSerializer.Deserialize(item.Value.GetRawText(),field.FieldType,InteractionJson);
    if(field.FieldType.IsEnum&&(value==null||!Enum.IsDefined(field.FieldType,value)))throw new InvalidDataException("交互枚举无效");
    if(value is int direction&&(direction<0||direction>2))throw new InvalidDataException("约束方向无效");
    IEnumerable<Vector2Int32> coords=value is Vector2Int32 p?[p]:value as List<Vector2Int32>??[];
    if(coords.Take(1_048_577).Count()>1_048_576||coords.Any(p=>Math.Abs((long)p.X)>100000||Math.Abs((long)p.Y)>100000))throw new InvalidDataException("交互坐标或容量无效");
    changes.Add((tool,field,value));
   }
  }
  int color=state.GetProperty("traceColor").GetInt32();var trace=state.GetProperty("trace").EnumerateArray().Select(p=>new Vector2Int32(p.GetProperty("x").GetInt32(),p.GetProperty("y").GetInt32())).ToArray();
  if(color<0||color>4||trace.Length>World!.Tiles.Length||trace.Any(p=>!World!.ValidTileLocation(p)))throw new InvalidDataException("电线追踪恢复无效");
  var sprite=state.GetProperty("sprite");if(sprite.ValueKind!=JsonValueKind.Null)SelectSprite(sprite.GetProperty("tile").GetInt32(),sprite.GetProperty("style").GetInt32());
  if(state.TryGetProperty("sheet",out var sheet)&&sheet.ValueKind==JsonValueKind.Null)vm!.SelectedSpriteSheet=null;
  foreach(var (tool,field,value) in changes){if(field.IsInitOnly){var list=(List<Vector2Int32>)field.GetValue(tool)!;list.Clear();list.AddRange((List<Vector2Int32>)value!);}else field.SetValue(tool,value);}
  vm!.WireChainMode=state.GetProperty("chain").GetBoolean();vm.SelectedPoint=state.GetProperty("point").GetString();vm.WireTraceColor=color;vm.WireTraceHighlight=trace.ToHashSet();
 }
 public object InteractionInfo()=>new{points=new[]{"Spawn","Dungeon"}.Concat(World!.NPCs.Select(n=>n.Name)).Concat(World.TeamNames.Select(t=>"Team "+t)).ToArray(),chain=vm!.WireChainMode,sheet=vm.SelectedSpriteSheet?.Tile,sprite=vm.SelectedSpriteItem is {} s?new{tile=(int)s.Tile,style=s.Style}:null,point=vm.SelectedPoint,traceColor=vm.WireTraceColor,traceCount=vm.WireTraceHighlight.Count,cad=new[]{"Brush","Pencil"}.Select(name=>new{tool=name,enabled=(bool)Tools[name].GetType().GetProperty("IsCadWireMode")!.GetValue(Tools[name])!,mode=Tools[name].GetType().GetProperty("CadRoutingMode")!.GetValue(Tools[name])!.ToString(),preview=Tools[name].CadPreviewPath.Select(p=>new{x=p.X,y=p.Y}).ToArray(),tunnel=Tools[name].CadPreviewTunnelPath.Select(p=>new{x=p.X,y=p.Y}).ToArray()}).ToArray()};
 public void ConfigureCad(JsonElement request){
  string name=request.GetProperty("tool").GetString()??"",operation=request.GetProperty("operation").GetString()??"";
  if(name is not ("Brush" or "Pencil")||operation is not ("cycle" or "direction" or "cancel" or "exit" or "chain" or "preview" or "clearTrace"))throw new ArgumentException("CAD 操作无效");
  if(operation=="preview"){
   int x=request.GetProperty("x").GetInt32(),y=request.GetProperty("y").GetInt32();if(!World!.ValidTileLocation(x,y))throw new ArgumentException("预览坐标超出世界");
   var tool=Tools[name];// Original CAD coordinates are bounded by the loaded world.
   // Hover is a separate command; it never commits a drawing operation.
   if((bool)tool.GetType().GetProperty("IsCadWireMode")!.GetValue(tool)!)tool.MouseMove(new(){Location=new(x,y)});return;
  }
  if(operation=="chain"){vm!.WireChainMode=request.GetProperty("enabled").GetBoolean();return;}
  if(operation=="clearTrace"){vm!.ClearWireTrace();return;}
  string method=operation switch{"cycle"=>"CycleWireMode","direction"=>"ToggleVerticalFirst","cancel"=>"CancelCadWire",_=>"ExitCadWireMode"};
  Tools[name].GetType().GetMethod(method)!.Invoke(Tools[name],null);
 }
 public object SpriteCatalog(){ClipboardSpriteMetadata.Build();return WorldConfiguration.Sprites2.SelectMany(sheet=>sheet.Styles.Select(s=>new{tile=(int)s.Tile,style=s.Style,name=sheet.Name+" · "+s.Name,width=s.SizeTiles.X,height=s.SizeTiles.Y,variants=WorldConfiguration.TileProperties[s.Tile].BiomeVariants?.Select(v=>v.Name).ToArray()??Array.Empty<string>()})).ToArray();}
 public void SelectSprite(int tile,int style){
  RequireWorld();ClipboardSpriteMetadata.Build();var sheet=WorldConfiguration.Sprites2.FirstOrDefault(s=>s.Tile==tile);var sprite=sheet?.Styles.FirstOrDefault(s=>s.Style==style);
  if(sprite==null)throw new ArgumentException("家具或样式不存在");vm!.SelectedSpriteSheet=sheet;vm.SelectedSpriteItem=sprite;
 }
 public void ClearSpriteSelection(){RequireWorld();vm!.SelectedSpriteSheet=null;}
}
