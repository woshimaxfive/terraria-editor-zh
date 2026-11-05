using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using TEdit.Editor;
using TEdit.Editor.Tools;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.UI;

namespace TEdit.Port;
public sealed record ToolPoint(int X,int Y,bool Shift=false,bool Ctrl=false,bool Secondary=false,long TimeMs=0,bool Alt=false,string[]? Actions=null);
public sealed partial class Session {
 public static readonly string[] ToolNames=["Brush","Pencil","Fill","Picker","Hammer","Morph","Selection","Sprite","Arrow","Point","Paste"];
 static readonly JsonSerializerOptions ToolJson=new(){Converters={new JsonStringEnumConverter()}};
 Dictionary<string,BaseTool>? tools;
 Dictionary<string,BaseTool> Tools=>tools??=new(){["Brush"]=brush!,["Pencil"]=new PencilTool(vm!),["Fill"]=new FillTool(vm!),["Picker"]=new PickerTool(vm!),["Hammer"]=new HammerAreaTool(vm!),["Morph"]=new MorphTool(vm!),["Selection"]=new SelectionTool(vm!),["Sprite"]=new SpriteTool2(vm!),["Arrow"]=new ArrowTool(vm!),["Point"]=new PointTool(vm!),["Paste"]=new PasteTool(vm!)};
 object Model(string group)=>group switch{"paint"=>vm!.TilePicker,"brush"=>vm!.Brush,"mask"=>vm!.MaskSettings,"morph"=>vm!.MorphToolOptions,_=>throw new ArgumentException("未知工具参数组")};
 static bool EditableProperty(PropertyInfo p)=>p.SetMethod?.IsPublic==true&&p.GetMethod?.IsPublic==true&&p.Name is not ("PlatformStairDirection" or "OffsetX" or "OffsetY" or "IsLocked")&&(p.PropertyType.IsEnum||p.PropertyType==typeof(bool)||p.PropertyType==typeof(int)||p.PropertyType==typeof(byte)||p.PropertyType==typeof(double)||p.PropertyType==typeof(string));
 static PropertyInfo[] Properties(object model)=>model.GetType().GetProperties().Where(EditableProperty).ToArray();
 public object ToolSchema()=>new[]{"paint","brush","mask","morph"}.ToDictionary(group=>group,group=>Properties(Model(group)).Select(p=>new{name=p.Name,type=p.PropertyType==typeof(bool)?"bool":p.PropertyType.IsEnum?"enum":p.PropertyType==typeof(string)?"string":"number",choices=p.PropertyType.IsEnum?Enum.GetNames(p.PropertyType):Array.Empty<string>()}).ToArray());
 public object CaptureToolState()=>JsonSerializer.SerializeToElement(new {paint=Properties(Model("paint")).ToDictionary(p=>p.Name,p=>p.GetValue(Model("paint"))),brush=Properties(Model("brush")).ToDictionary(p=>p.Name,p=>p.GetValue(Model("brush"))),mask=Properties(Model("mask")).ToDictionary(p=>p.Name,p=>p.GetValue(Model("mask"))),morph=Properties(Model("morph")).ToDictionary(p=>p.Name,p=>p.GetValue(Model("morph"))),selection=new{x=vm!.Selection.SelectionArea.X,y=vm.Selection.SelectionArea.Y,width=vm.Selection.SelectionArea.Width,height=vm.Selection.SelectionArea.Height,active=vm.Selection.IsActive}},ToolJson);
 public string ToolStateJson()=>JsonSerializer.Serialize(CaptureToolState(),ToolJson);
 // Parse and validate the whole request before changing any live setting or tile.
 List<(object Model,PropertyInfo Property,object? Value)> ValidateToolState(JsonElement state){
  if(state.ValueKind!=JsonValueKind.Object)throw new ArgumentException("工具参数必须是对象");
  var assignments=new List<(object,PropertyInfo,object?)>();
  foreach(var group in state.EnumerateObject()){
   if(group.Name=="selection")continue;
   var model=Model(group.Name);var allowed=Properties(model).ToDictionary(p=>p.Name);
   foreach(var entry in group.Value.EnumerateObject()){
    if(!allowed.TryGetValue(entry.Name,out var property))throw new ArgumentException("未知工具参数："+entry.Name);
    object? value;
    try{value=JsonSerializer.Deserialize(entry.Value.GetRawText(),property.PropertyType,ToolJson);}catch(Exception e){throw new ArgumentException("参数类型无效："+entry.Name,e);}
    if(property.PropertyType.IsEnum&&(value==null||!Enum.IsDefined(property.PropertyType,value)))throw new ArgumentException("枚举值无效："+entry.Name);
    if(value is double number&&(!double.IsFinite(number)||Math.Abs(number)>360))throw new ArgumentException("角度无效");
    if(value is int integer){
     int min=0,max=65535;
     if(group.Name=="brush")switch(entry.Name){case "Width":case "Height":min=1;max=400;break;case "Outline":min=1;max=200;break;case "SprayDensity":min=1;max=100;break;case "SprayTickMs":min=10;max=100;break;}
     if(entry.Name is "Tile" or "TileMaskValue")min=-1;
     if(entry.Name is "TileColor" or "WallColor" or "TilePaintMaskValue" or "WallPaintMaskValue")max=31;
     if(entry.Name=="TrackTunnelHeight"){min=1;max=10;}
     if(integer<min||integer>max)throw new ArgumentException("参数超出范围："+entry.Name);
     if(group.Name=="paint"&&entry.Name=="Tile"&&integer>=0&&!WorldConfiguration.TileBricks.Any(t=>t.Id==integer))throw new ArgumentException("普通方块参数不能指定家具");
     if(entry.Name is "Wall" or "WallMaskValue"&&integer>=WorldConfiguration.WallProperties.Count)throw new ArgumentException("墙壁 ID 无效");
    }
    if(value is string text&&(text.Length>100||group.Name!="morph"||entry.Name!="TargetBiome"))throw new ArgumentException("文本参数无效");
    assignments.Add((model,property,value));
   }
  }
  var prospectiveMorph=new MorphToolOptions();prospectiveMorph.Mode=vm!.MorphToolOptions.Mode;prospectiveMorph.TargetBiome=vm.MorphToolOptions.TargetBiome;
  foreach(var assignment in assignments.Where(a=>a.Item1==vm.MorphToolOptions).OrderBy(a=>a.Item2.Name=="Mode"?-1:0))assignment.Item2.SetValue(prospectiveMorph,assignment.Item3);
  if(!prospectiveMorph.TargetBiomes.Contains(prospectiveMorph.TargetBiome))throw new ArgumentException("当前转换模式没有这个生态目标");
  if(state.TryGetProperty("selection",out var selection)){
   int x=selection.GetProperty("x").GetInt32(),y=selection.GetProperty("y").GetInt32(),w=selection.GetProperty("width").GetInt32(),h=selection.GetProperty("height").GetInt32();
   if(selection.GetProperty("active").GetBoolean()&&(w<1||h<1||x<0||y<0||(long)x+w>World!.TilesWide||(long)y+h>World.TilesHigh))throw new ArgumentException("选区超出世界");
  }
  return assignments;
 }
 public void RestoreToolState(JsonElement state){
  var assignments=ValidateToolState(state);vm!.Brush.IsLocked=false;
  // Original setter dependencies: Morph.Mode before TargetBiome; size before Outline.
  foreach(var (model,property,value) in assignments.OrderBy(a=>a.Property.Name=="Mode"?-2:a.Property.Name=="Outline"?2:0))property.SetValue(model,value);
  if(!vm.MorphToolOptions.TargetBiomes.Contains(vm.MorphToolOptions.TargetBiome))throw new ArgumentException("当前转换模式没有这个生态目标");
  if(state.TryGetProperty("selection",out var selection)){
   vm.Selection.SelectionArea=new RectangleInt32(selection.GetProperty("x").GetInt32(),selection.GetProperty("y").GetInt32(),selection.GetProperty("width").GetInt32(),selection.GetProperty("height").GetInt32());vm.Selection.IsActive=selection.GetProperty("active").GetBoolean();
  }
 }
 public bool ExecuteTool(JsonElement request){RequireWorld();var before=Floating.FloatingPasteBuffer;try{return ExecuteToolCore(request);}finally{FinishFloatingMemory(before);}}
 bool ExecuteToolCore(JsonElement request){
  if(vm==null)throw new InvalidOperationException("请先打开世界");
  if(replayPlayer!=null)throw new InvalidOperationException("当前处于回放浏览；先执行 AdoptReplayFrame 将该帧设为编辑起点");
  string name=request.GetProperty("tool").GetString()??"";
  if(!ToolNames.Contains(name))throw new ArgumentException("工具无效");
  var points=JsonSerializer.Deserialize<ToolPoint[]>(request.GetProperty("points").GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??[];
  string[] allowedActions=["editor.draw","editor.secondary","editor.draw.constrain","editor.draw.line","editor.wire.trace","selection.adjust.startpoint","selection.adjust.endpoint"];
  if(points.Any(p=>p.Actions is {} a&&(a.Length>7||a.Any(x=>!allowedActions.Contains(x)))))throw new ArgumentException("指针动作无效");
  if(points.Length<2||points.Length>4096||points.Any(p=>!World!.ValidTileLocation(p.X,p.Y)||p.TimeMs<0||p.TimeMs>60_000)||points.Zip(points.Skip(1)).Any(pair=>pair.First.TimeMs>pair.Second.TimeMs))throw new ArgumentException("笔画点数、坐标或时间无效");
  var state=request.GetProperty("settings").GetProperty("toolState");ValidateToolState(state);
  if(name=="Point"&&vm.SelectedPoint==null)throw new ArgumentException("请先选择世界点位或NPC");
  // Object inspection is independent of the number of world cells.
  if(points.Any(p=>p.Alt||p.Actions?.Contains("editor.wire.trace")==true)&&name is not ("Brush" or "Pencil"))throw new ArgumentException("请使用画笔或铅笔追踪电线");
  if(name=="Sprite"){
   var sprite=vm.SelectedSpriteItem??throw new ArgumentException("请先选择家具样式");
   var selected=state.GetProperty("selection");var area=new RectangleInt32(selected.GetProperty("x").GetInt32(),selected.GetProperty("y").GetInt32(),selected.GetProperty("width").GetInt32(),selected.GetProperty("height").GetInt32());
   foreach(var p in points)if((long)p.X+sprite.SizeTiles.X>World!.TilesWide||(long)p.Y+sprite.SizeTiles.Y>World.TilesHigh||selected.GetProperty("active").GetBoolean()&&(!area.Contains(p.X,p.Y)||!area.Contains(p.X+sprite.SizeTiles.X-1,p.Y+sprite.SizeTiles.Y-1)))throw new ArgumentException("完整家具必须位于世界和选区内");
  }
  int width=state.GetProperty("brush").GetProperty("Width").GetInt32(),height=state.GetProperty("brush").GetProperty("Height").GetInt32();
  long path=1;for(int i=1;i<points.Length;i++)path+=Math.Max(Math.Abs(points[i].X-points[i-1].X),Math.Abs(points[i].Y-points[i-1].Y))+1;
  if(points[0].Ctrl&&Tools[name].HasLinePreviewAnchor)path+=Math.Max(Math.Abs(points[0].X-Tools[name].LinePreviewAnchor.X),Math.Abs(points[0].Y-Tools[name].LinePreviewAnchor.Y))+1;
  if(state.GetProperty("brush").GetProperty("IsSpray").GetBoolean())path+=points[^1].TimeMs/10+points.Length;
  // Original bounded point/brush inputs execute in the cancellable Worker.
  // The loaded world is bounded; a full standard world is a valid fill region.
  if(name=="Fill"){
   bool active=state.GetProperty("selection").GetProperty("active").GetBoolean();
   long area=active?(long)state.GetProperty("selection").GetProperty("width").GetInt32()*state.GetProperty("selection").GetProperty("height").GetInt32():(long)World!.TilesWide*World.TilesHigh;
   if(area>WorldFiles.MaxWorldCells)throw new ArgumentException("填充范围超出已加载世界容量");
   if(active&&!new RectangleInt32(state.GetProperty("selection").GetProperty("x").GetInt32(),state.GetProperty("selection").GetProperty("y").GetInt32(),state.GetProperty("selection").GetProperty("width").GetInt32(),state.GetProperty("selection").GetProperty("height").GetInt32()).Contains(points[0].X,points[0].Y))throw new ArgumentException("填充起点不在选区内");
  }
  var tool=Tools[name];RestoreToolState(state);
  if(name=="Picker"){RequireWorld();ClipboardSpriteMetadata.Build();}
  int before=UndoIndex;
  if(name=="Arrow"){vm.SelectedChest=null;vm.SelectedSign=null;vm.SelectedTileEntity=null;vm.SelectedXmas=null;}
  if(name is "Brush" or "Pencil" && (bool)tool.GetType().GetProperty("IsCadWireMode")!.GetValue(tool)!){
   // Desktop pointer hover updates the route before the second click. The UI
   // submits batched strokes, so reproduce that event before its MouseDown.
   long budget=((long)World!.TilesWide+World.TilesHigh)*(width+height+vm.TilePicker.TrackTunnelHeight);
   if(budget>4_194_304)throw new ArgumentException("CAD 路径超过工作预算");
   tool.MouseMove(new(){Location=new(points[0].X,points[0].Y)});
  }
  for(int i=0;i<points.Length;i++){
   StrokeClock.Now=points[i].TimeMs;
   var point=points[i];var e=new TileMouseState{Location=new Vector2Int32(point.X,point.Y)};
   if(i!=points.Length-1){
    if(point.Actions is {} actions)e.Actions.AddRange(actions);
    else e.Actions.Add(point.Alt?"editor.wire.trace":point.Secondary?"editor.secondary":point.Ctrl&&name=="Selection"?"selection.adjust.startpoint":point.Shift&&name=="Selection"?"selection.adjust.endpoint":point.Ctrl?"editor.draw.line":point.Shift?"editor.draw.constrain":"editor.draw");
   }
   if(i==0)tool.MouseDown(e);else if(i==points.Length-1)tool.MouseUp(e);else tool.MouseMove(e);
  }
  if(name=="Point")vm.UndoManager.SaveUndo();
  if(name=="Arrow"){
   var p=points[^1];
   DomainResult=vm.SelectedChest!=null?new TEdit.Scripting.Api.ChestApi(World!).GetAt(p.X,p.Y):vm.SelectedSign!=null?new TEdit.Scripting.Api.SignApi(World!).GetAt(p.X,p.Y):vm.SelectedTileEntity!=null?new TEdit.Scripting.Api.TileEntityApi(World!).GetAt(p.X,p.Y):vm.SelectedXmas is {} tree?new{x=tree.X,y=tree.Y,star=vm.SelectedXmasStar,garland=vm.SelectedXmasGarland,bulb=vm.SelectedXmasBulb,light=vm.SelectedXmasLight}:new{message="没有可编辑对象",trace=vm.WireTraceHighlight.Count};
  }
  // Picker, selection and an unfinished CAD anchor also change recoverable state.
  return true;
 }
}
