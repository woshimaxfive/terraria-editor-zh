using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace TEditBrowser;
public sealed record ToolChoice(string Id,string Label){public override string ToString()=>Label;}
public sealed class ToolField : System.ComponentModel.INotifyPropertyChanged {
 public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
 public required string Group {get;init;}
 public required string Name {get;init;}
 public required string Label {get;init;}
 public required string Type {get;init;}
 public string[] Choices {get;init;}=[];
 string textValue="";bool boolValue;
 public string TextValue {get=>textValue;set{if(textValue==value)return;textValue=value;PropertyChanged?.Invoke(this,new(nameof(TextValue)));}}
 public bool BoolValue {get=>boolValue;set{if(boolValue==value)return;boolValue=value;PropertyChanged?.Invoke(this,new(nameof(BoolValue)));}}
 public bool IsBool=>Type=="bool";
 public bool IsEnum=>Type=="enum";
 public bool IsText=>!IsBool&&!IsEnum;
 public JsonNode? Value()=>IsBool?JsonValue.Create(BoolValue):Type=="number"?JsonValue.Create(double.Parse(TextValue,CultureInfo.InvariantCulture)):JsonValue.Create(TextValue);
}
public sealed partial class EditorViewModel {
 public ToolChoice[] Tools {get;}=[new("Brush","笔刷"),new("Pencil","铅笔"),new("Fill","填充"),new("Picker","吸管"),new("Hammer","锤子"),new("Morph","生态转换"),new("Selection","选区"),new("Sprite","家具"),new("Arrow","对象检查"),new("Point","点位"),new("Paste","浮动粘贴")];
 ToolChoice selectedTool=new("Brush","笔刷");
 public ToolChoice SelectedTool {get=>selectedTool;set{if(selectedTool==value)return;selectedTool=value;PropertyChanged?.Invoke(this,new(nameof(SelectedTool)));PropertyChanged?.Invoke(this,new(nameof(DesktopSelection)));}}
 public bool LimitToSelection {get;set;}
 public ToolField[] ToolFields {get;private set;}=[];
 JsonObject? toolDefaults;
 static readonly Dictionary<string,string> Labels=new(){
  ["paint"]="绘制",["brush"]="笔刷",["mask"]="掩码",["morph"]="生态",
  ["PaintMode"]="绘制模式",["Wall"]="墙壁 ID",["Tile"]="方块 ID",["IsEraser"]="橡皮擦",["WallStyleActive"]="绘制墙壁",
  ["RedWireActive"]="红线",["BlueWireActive"]="蓝线",["GreenWireActive"]="绿线",["YellowWireActive"]="黄线",
  ["TrackMode"]="铁轨模式",["JunctionBoxMode"]="接线盒方向",["LiquidAmountMode"]="液体量",["LiquidType"]="液体种类",
  ["BrickStyle"]="斜坡形状",["BrickStyleActive"]="修改斜坡",["ExtrasActive"]="修改致动器",["Actuator"]="致动器",["ActuatorInActive"]="虚化状态",
  ["TilePaintActive"]="修改方块油漆",["WallPaintActive"]="修改墙壁油漆",["TileColor"]="方块油漆 ID",["WallColor"]="墙壁油漆 ID",
  ["EnableTileCoating"]="修改方块涂层",["EnableWallCoating"]="修改墙壁涂层",["TileCoatingEcho"]="方块回声",["WallCoatingEcho"]="墙壁回声",["TileCoatingIlluminant"]="方块发光",["WallCoatingIlluminant"]="墙壁发光",
  ["TrackTunnelEnabled"]="铁轨隧道",["TrackTunnelHeight"]="隧道高度",["TrackSmoothEnabled"]="平滑铁轨",["PlatformStyle"]="平台样式",
  ["Shape"]="笔刷形状",["Rotation"]="旋转角度",["FlipHorizontal"]="水平翻转",["FlipVertical"]="垂直翻转",["IsOutline"]="空心轮廓",["Outline"]="轮廓厚度",["IsSpray"]="喷涂",["SprayDensity"]="喷涂密度（%）",["SprayTickMs"]="喷涂间隔（毫秒）",
  ["MaskPreset"]="掩码预设",["TileMaskValue"]="匹配方块 ID（-1 为空）",["WallMaskMode"]="墙壁匹配方式",["WallMaskValue"]="匹配墙壁 ID",
  ["BrickStyleMaskMode"]="斜坡匹配方式",["BrickStyleMaskValue"]="匹配斜坡",["ActuatorMaskMode"]="致动器匹配",["ActuatorInActiveMaskMode"]="虚化匹配",
  ["TilePaintMaskMode"]="方块油漆匹配方式",["TilePaintMaskValue"]="匹配方块油漆",["WallPaintMaskMode"]="墙壁油漆匹配方式",["WallPaintMaskValue"]="匹配墙壁油漆",
  ["TileEchoMaskMode"]="方块回声匹配",["TileIlluminantMaskMode"]="方块发光匹配",["WallEchoMaskMode"]="墙壁回声匹配",["WallIlluminantMaskMode"]="墙壁发光匹配",
  ["WireRedMaskMode"]="红线匹配",["WireBlueMaskMode"]="蓝线匹配",["WireGreenMaskMode"]="绿线匹配",["WireYellowMaskMode"]="黄线匹配",
  ["LiquidTypeMaskMode"]="液体种类匹配方式",["LiquidTypeMaskValue"]="匹配液体种类",["LiquidLevelMaskMode"]="液体量匹配方式",["LiquidLevelMaskValue"]="匹配液体量",
  ["Mode"]="转换模式",["TargetBiome"]="目标生态",["MossType"]="苔藓 ID",["EnableBaseTiles"]="转换基础方块",["EnableEvilTiles"]="转换邪恶方块",["EnableMoss"]="转换苔藓",["EnableSprites"]="转换植物家具",["EnableDecoSprites"]="转换装饰"
 };
 void InitializeTools(JsonElement info){
  if(ToolFields.Length!=0||!info.TryGetProperty("toolSchema",out var schema)||!info.TryGetProperty("toolState",out var state))return;
  toolDefaults=JsonNode.Parse(state.GetRawText())!.AsObject();var fields=new List<ToolField>();
  foreach(var group in schema.EnumerateObject())foreach(var property in group.Value.EnumerateArray()){
   string name=property.GetProperty("name").GetString()!;
   if((group.Name=="paint"&&name is "Tile" or "TileStyleActive")||(group.Name=="brush"&&name is "Width" or "Height")||(group.Name=="mask"&&name=="TileMaskMode"))continue;
   string type=property.GetProperty("type").GetString()!;var value=state.GetProperty(group.Name).GetProperty(name);
   fields.Add(new(){Group=group.Name,Name=name,Label=Labels.GetValueOrDefault(group.Name,group.Name)+" · "+Labels.GetValueOrDefault(name,name),Type=type,Choices=property.GetProperty("choices").EnumerateArray().Select(v=>v.GetString()!).ToArray(),TextValue=value.ToString(),BoolValue=type=="bool"&&value.GetBoolean()});
  }
  ToolFields=fields.ToArray();SelectedTool=Tools[0];
 }
 JsonObject? BuildToolState(){
  if(toolDefaults==null)return null;
  var state=toolDefaults.DeepClone().AsObject();foreach(var field in ToolFields)state[field.Group]![field.Name]=field.Value();
  state["paint"]!["Tile"]=SelectedMaterial?.Id??1;state["paint"]!["TileStyleActive"]=TileActive;
  state["brush"]!["Width"]=BrushWidth;state["brush"]!["Height"]=BrushHeight;state["mask"]!["TileMaskMode"]=SelectedMask;
  state["selection"]=new JsonObject{["x"]=SelectionX,["y"]=SelectionY,["width"]=SelectionWidth,["height"]=SelectionHeight,["active"]=LimitToSelection};return state;
 }
 void RestoreTools(JsonElement settings){
  if(settings.TryGetProperty("tool",out var tool))SelectedTool=Tools.FirstOrDefault(t=>t.Id==tool.GetString())??Tools[0];
  if(!settings.TryGetProperty("toolState",out var state)||state.ValueKind!=JsonValueKind.Object)return;
  toolDefaults=JsonNode.Parse(state.GetRawText())!.AsObject();
  foreach(var field in ToolFields)if(state.TryGetProperty(field.Group,out var group)&&group.TryGetProperty(field.Name,out var value)){field.TextValue=value.ToString();if(field.IsBool)field.BoolValue=value.GetBoolean();}
  var paint=state.GetProperty("paint");SelectedMaterial=Materials.FirstOrDefault(m=>m.Id==paint.GetProperty("Tile").GetInt32());
  TileActive=paint.GetProperty("TileStyleActive").GetBoolean();SelectedMask=state.GetProperty("mask").GetProperty("TileMaskMode").GetString()!;
  BrushWidth=state.GetProperty("brush").GetProperty("Width").GetInt32();BrushHeight=state.GetProperty("brush").GetProperty("Height").GetInt32();
  var selection=state.GetProperty("selection");LimitToSelection=selection.GetProperty("active").GetBoolean();
  if(LimitToSelection)SelectRectangle(selection.GetProperty("x").GetInt32(),selection.GetProperty("y").GetInt32(),selection.GetProperty("width").GetInt32(),selection.GetProperty("height").GetInt32());
 }
}
