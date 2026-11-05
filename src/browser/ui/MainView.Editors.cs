using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
namespace TEditBrowser;
public partial class MainView {
 public void ValidateNewWorldFields(){foreach(string key in new[]{"Width","Height","Ground","Rock","Hill","Id","CaveNoise","CaveMultiplier","CaveDensity","RoofNoise","FloorNoise","LavaNoise"}){var input=this.FindControl<NumericUpDown>("Form_NewWorld"+key);if(input==null)continue;if(!decimal.TryParse(input.Text,System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.CurrentCulture,out var value)||value<input.Minimum||value>input.Maximum||key is "Width" or "Height" or "Id"&&decimal.Truncate(value)!=value){input.Focus();throw new ArgumentException("请修正新建世界的数值："+key);}}}
 void NewWorldCavePreset(object? sender,SelectionChangedEventArgs e){if(sender is not ComboBox combo||combo.SelectedIndex<0)return;var values=combo.SelectedIndex switch{1=>new[]{.1,.03,2.5},2=>new[]{.12,.04,2.0},_=>new[]{.08,.02,3.0}};Current.NewWorldCaveNoise=values[0];Current.NewWorldCaveMultiplier=values[1];Current.NewWorldCaveDensity=values[2];foreach(var (key,value) in new[]{("CaveNoise",values[0]),("CaveMultiplier",values[1]),("CaveDensity",values[2])})if(this.FindControl<NumericUpDown>("Form_NewWorld"+key) is {} input)input.Value=(decimal)value;}
 async void OpenUvEditorTapped(object? sender,RoutedEventArgs e)=>await OpenUvEditor();
 async Task OpenUvEditor(){try{await CoreBridge.Run("uvEditor",JsonSerializer.Serialize(new{action="open",settings=Current.Settings()}));}catch(Exception ex){Current.Fail(ex.Message);}}
 void BuildUvEditor(JsonElement data){
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label("UV 帧编辑 · "+data.GetProperty("count")+" 格"));
  stack.Children.Add(Label("双击状态栏的 UV 坐标打开。修改在本窗口预览，确定后写入一次撤销记录。"));
  NumericUpDown u=new(){Name="UvStepU",Minimum=short.MinValue,Maximum=short.MaxValue,Value=18},v=new(){Name="UvStepV",Minimum=short.MinValue,Maximum=short.MaxValue,Value=18};
  NumericUpDown manualU=new(){Name="UvManualU",Minimum=short.MinValue,Maximum=short.MaxValue,Value=0},manualV=new(){Name="UvManualV",Minimum=short.MinValue,Maximum=short.MaxValue,Value=0};
  stack.Children.Add(Label("U / V 移动步长"));stack.Children.Add(u);stack.Children.Add(v);
  // Leave the modal before starting a cancellable commit so the status-bar button remains reachable.
  async Task Run(string action,int du=0,int dv=0){try{if(action=="commit")this.FindControl<Border>("DesktopDialog")!.IsVisible=false;await CoreBridge.Run("uvEditor",JsonSerializer.Serialize(new{action,u=du,v=dv}));if(action is "commit" or "cancel"){this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}}catch(Exception ex){Current.Fail(ex.Message);}}
  var arrows=new StackPanel{Orientation=Orientation.Horizontal,Spacing=6};foreach(var (label,du,dv) in new[]{("向左",-1,0),("向右",1,0),("向上",0,-1),("向下",0,1)})arrows.Children.Add(Button(label,async()=>await Run("move",du*(int)(u.Value??0),dv*(int)(v.Value??0))));stack.Children.Add(arrows);
  stack.Children.Add(Label("手动设置 U / V"));stack.Children.Add(manualU);stack.Children.Add(manualV);stack.Children.Add(Button("设置 UV",async()=>await Run("set",(int)(manualU.Value??0),(int)(manualV.Value??0))));
  stack.Children.Add(new TextBox{Name="UvRows",IsReadOnly=true,AcceptsReturn=true,Height=160,Text=string.Join('\n',data.GetProperty("rows").EnumerateArray().Select(t=>$"({t.GetProperty("x")},{t.GetProperty("y")}) · 方块 {t.GetProperty("type")} · UV ({t.GetProperty("u")},{t.GetProperty("v")})"))});
  stack.Children.Add(Button("恢复原 UV",async()=>await Run("restore")));stack.Children.Add(Button("确定 UV 修改",async()=>await Run("commit")));stack.Children.Add(Button("取消 UV 修改",async()=>await Run("cancel")));this.FindControl<Border>("DesktopDialog")!.IsVisible=true;
 }
 string? spriteSheetPng;
 async void OpenSpriteEditor(object? sender,RoutedEventArgs e){
  if(Current.SelectedSprite is not {} item){Current.Fail("先选择一个家具或物体");return;}
  try{
   using(var texture=JsonDocument.Parse(await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="sheetTexture",id=item.Tile}))))spriteSheetPng=texture.RootElement.TryGetProperty("png",out var png)?png.GetString():null;
   using var stored=JsonDocument.Parse(await CoreBridge.DesktopData("sheetRead",JsonSerializer.Serialize(new{tile=item.Tile})));
   await CoreBridge.Run("spriteEditor",JsonSerializer.Serialize(new{action="open",tile=item.Tile,stored=stored.RootElement}));
  }catch(Exception ex){Current.Fail(ex.Message);}
 }
 void BuildSpriteEditor(JsonElement data){
  var payload=JsonNode.Parse(data.GetRawText())!.AsObject();var settings=payload["settings"]!.AsObject();var frames=payload["frames"]!.AsArray();int selected=0;
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label("精灵表编辑 · "+data.GetProperty("name")+" (#"+data.GetProperty("tile")+")"));
  stack.Children.Add(Label("复用原版网格、自动检测、帧生成与保存规则。配置保存在本机浏览器，可下载备份。"));
  foreach(var entry in settings.ToArray())stack.Children.Add(Field(entry.Key,JsonSerializer.SerializeToElement(entry.Value),entry.Value is JsonValue value&&value.TryGetValue<bool>(out _)?"Boolean":entry.Key=="CoordinateHeightsText"?"String":"Int16",v=>settings[entry.Key]=v));
  async Task Run(string action,object? extra=null){try{
   var request=new JsonObject{["action"]=action,["settings"]=settings.DeepClone(),["frames"]=frames.DeepClone(),["selected"]=selected};if(extra!=null)foreach(var pair in JsonSerializer.SerializeToNode(extra)!.AsObject())request[pair.Key]=pair.Value?.DeepClone();
   await CoreBridge.Run("spriteEditor",request.ToJsonString());
   if(action=="save"&&Current.DesktopData is {} result)await CoreBridge.DesktopData("sheetStore",result.GetProperty("data").GetRawText());
   if(action=="reset")await CoreBridge.DesktopData("sheetDelete",JsonSerializer.Serialize(new{tile=data.GetProperty("tile").GetInt32()}));
  }catch(Exception ex){Current.Fail(ex.Message);}}
  var tools=new WrapPanel();foreach(var (label,action) in new[]{("自动检测","auto"),("按网格生成","grid"),("整图单帧","single"),("添加帧","add"),("删除所选帧","remove")})tools.Children.Add(Button(label,async()=>await Run(action)));stack.Children.Add(tools);
  if(spriteSheetPng!=null&&data.GetProperty("width").ValueKind==JsonValueKind.Number){
   using var stream=new MemoryStream(Convert.FromBase64String(spriteSheetPng));var bitmap=new Bitmap(stream);var image=new Image{Name="SpriteSheetImage",Source=bitmap,Stretch=Stretch.Uniform,MaxWidth=600,Height=260};
   int textureW=data.GetProperty("width").GetInt32(),textureH=data.GetProperty("height").GetInt32();(int X,int Y)? start=null;
   (int X,int Y) Cell(Point point){double scale=Math.Min(image.Bounds.Width/textureW,image.Bounds.Height/textureH),ox=(image.Bounds.Width-textureW*scale)/2,oy=(image.Bounds.Height-textureH*scale)/2;int gx=settings["TextureGridX"]!.GetValue<int>()+settings["FrameGapX"]!.GetValue<int>(),gy=settings["TextureGridY"]!.GetValue<int>()+settings["FrameGapY"]!.GetValue<int>();return(Math.Clamp((int)((point.X-ox)/scale/gx),0,Math.Max(0,(textureW-1)/gx)),Math.Clamp((int)((point.Y-oy)/scale/gy),0,Math.Max(0,(textureH-1)/gy)));}
   image.PointerPressed+=(_,e)=>{start=Cell(e.GetPosition(image));e.Pointer.Capture(image);};image.PointerReleased+=async(_,e)=>{var end=Cell(e.GetPosition(image));e.Pointer.Capture(null);if(start is {} begin){start=null;await Run("selection",new{startCol=begin.X,startRow=begin.Y,endCol=end.X,endRow=end.Y});}};
   stack.Children.Add(Label("在贴图上拖选网格，松开后添加一帧"));stack.Children.Add(image);
  }else stack.Children.Add(Label("当前未载入此图格的贴图；选择贴图目录后重新打开可自动检测与拖选。"));
  var choice=new ComboBox{Name="SpriteFrameChoice",ItemsSource=frames.Select((f,i)=>$"{i} · {f!["Name"]} · ({f["UvX"]},{f["UvY"]})").ToArray()};var fields=new StackPanel();choice.SelectionChanged+=(_,_)=>{selected=choice.SelectedIndex;fields.Children.Clear();if(selected<0||selected>=frames.Count)return;var frame=frames[selected]!.AsObject();foreach(var item in frame.ToArray()){
   if(item.Key=="Anchor"){var anchor=new ComboBox{Name="SpriteFrameAnchor",ItemsSource=new[]{"None","Left","Right","Top","Bottom","Center"},SelectedItem=item.Value?.GetValue<string>()};anchor.SelectionChanged+=(_,_)=>frame["Anchor"]=anchor.SelectedItem?.ToString();fields.Children.Add(Label("锚点"));fields.Children.Add(anchor);}
   else fields.Children.Add(Field(item.Key,JsonSerializer.SerializeToElement(item.Value),item.Key is "Name" or "Variety"?"String":"Int16",v=>frame[item.Key]=v));
  }};choice.SelectedIndex=frames.Count==0?-1:Math.Clamp(data.GetProperty("selected").GetInt32(),0,frames.Count-1);stack.Children.Add(choice);stack.Children.Add(fields);
  stack.Children.Add(Button("保存精灵表配置",async()=>await Run("save")));stack.Children.Add(Button("重置精灵表配置",async()=>await Run("reset")));stack.Children.Add(Button("下载精灵表配置",async()=>await CoreBridge.DesktopData("sheetDownload",payload.ToJsonString())));
  stack.Children.Add(Label("帧数："+frames.Count));this.FindControl<Border>("DesktopDialog")!.IsVisible=true;
 }
}
