using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.LogicalTree;
using Avalonia.VisualTree;
using Avalonia.Media;
namespace TEditBrowser;
public partial class MainView {
 string? desktopDataIdentity,scriptIdentity;
 readonly Dictionary<string,JsonNode?> worldChanges=[];
 readonly Dictionary<string,Control> worldRows=[];
 string worldPropertyQuery="";
 Dictionary<string,string> scriptExamples=[];
 bool desktopReady;
 bool syncingRenderPreferences;
 string? desktopSession;
 Control[] dialogParts=[];
 void InitializeDesktop(){
  SyncLanguageMenus();
  desktopReady=true;Current.PropertyChanged+=(_,e)=>{if(e.PropertyName!=nameof(EditorViewModel.Status))RefreshDesktopData();};
  Current.NewWorldCreated+=()=>{this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();if(Current.NewWorldOres){ShowPluginDialog();var choice=this.FindControl<ComboBox>("PluginChoice");if(choice!=null)choice.SelectedIndex=choice.Items.Cast<object>().ToList().FindIndex(v=>v.ToString()=="矿石生成");}};
  dialogParts=this.FindControl<StackPanel>("DesktopDialogContent")!.Children.ToArray();
  AddHandler(KeyDownEvent,DesktopKeyDown,RoutingStrategies.Tunnel);
  AddHandler(KeyUpEvent,DesktopKeyUp,RoutingStrategies.Tunnel);
  _=LoadDesktopExamples();_=RestoreDesktopPreferences();_=RestoreInputBindings();
 }
 async Task LoadDesktopExamples(){try{var json=await CoreBridge.DesktopData("examples","");scriptExamples=JsonSerializer.Deserialize<Dictionary<string,string>>(json)!;this.FindControl<ComboBox>("ScriptExamples")!.ItemsSource=scriptExamples.Keys.Where(k=>!k.EndsWith(".ts")).ToArray();}catch(Exception e){Current.Fail(e.Message);}}
 void DesktopMenu(object? sender,RoutedEventArgs e){if(e.Source!=sender)return;if(sender is MenuItem item&&item.Tag is string action){e.Handled=true;_=DesktopAction(action,item.IsChecked);}}
 public void SyncLanguageMenus(){foreach(var item in this.GetLogicalDescendants().OfType<MenuItem>())if(item.Tag is string action&&action.StartsWith("language:"))item.IsChecked=action[9..]==DesktopLanguage.Language;}
 public void ApplyRenderPreferences(string json){
  using var doc=JsonDocument.Parse(json);var view=doc.RootElement;
  var layers=new Dictionary<string,bool>();
  if(view.TryGetProperty("layers",out var values))foreach(var value in values.EnumerateObject()){
   if(value.Name=="ShowAllWires")foreach(string color in new[]{"Red","Blue","Green","Yellow"})layers["Show"+color+"Wires"]=value.Value.GetBoolean();
   else layers[value.Name]=value.Value.GetBoolean();
  }
  bool Enabled(string name)=>layers.GetValueOrDefault(name,name is not ("ShowGrid" or "ShowBuffRadii" or "WorldBorderOverlay" or "ShowNbtOverlay" or "MinimapBackground" or "ShowWireTransparency"));
  string mode=view.TryGetProperty("colorMode",out var colorMode)?colorMode.GetString()??"Default":"Default";
  foreach(var item in this.GetLogicalDescendants().OfType<MenuItem>())if(item.Tag is string action){
   if(action.StartsWith("layer:")){string name=action[6..];item.IsChecked=name=="ShowAllWires"?new[]{"Red","Blue","Green","Yellow"}.All(c=>Enabled("Show"+c+"Wires")):Enabled(name);}
   else if(action.StartsWith("color:"))item.IsChecked=action[6..]==mode;
  }
  if(this.FindControl<Slider>("MenuGlowIntensity") is {} slider){syncingRenderPreferences=true;try{slider.Value=view.TryGetProperty("lightGlowIntensity",out var intensity)?intensity.GetDouble():.5;}finally{syncingRenderPreferences=false;}}
  syncingRenderPreferences=true;try{foreach(var (control,key,initial) in new[]{("MenuTextureThreshold","textureVisibilityZoomLevel",6d),("MenuBackgroundScale","backgroundScaleZoom",9d)})if(this.FindControl<Slider>(control) is {} input)input.Value=view.TryGetProperty(key,out var number)?number.GetDouble():initial;}finally{syncingRenderPreferences=false;}
 }
 void DesktopButton(object? sender,RoutedEventArgs e){if(sender is Button b&&b.Tag is string a)_=DesktopAction(a);}
 async Task DesktopAction(string action,bool enabled=true){
  try{
   if(action.StartsWith("language:")){DesktopLanguage.Apply(action[9..]);await CoreBridge.DesktopData("preference",JsonSerializer.Serialize(new{language=DesktopLanguage.Language,tab=Current.SidebarIndex}));return;}
   if(action.StartsWith("layer:")){await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="setLayer",name=action[6..],enabled}));return;}
   if(action.StartsWith("color:")){await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new{colorMode=action[6..]}}));return;}
   if(action.StartsWith("selectionPng:")){if(!Current.CanExportSelection)return;int scale=int.TryParse(action[13..],out var n)?n:1;await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="exportRegion",area=new{x=Current.SelectionX,y=Current.SelectionY,width=Current.SelectionWidth,height=Current.SelectionHeight},scale,tiles=false}));return;}
   switch(action){
    case "open":Current.OpenCommand.Execute(null);break;
    case "export":Current.ExportCommand.Execute(null);break;
    case "undo":Current.UndoCommand.Execute(null);break;
    case "redo":Current.RedoCommand.Execute(null);break;
    case "copy":Current.CopyCommand.Execute(null);break;
    case "cut":Current.CutCommand.Execute(null);break;
    case "delete":Current.DeleteCommand.Execute(null);break;
    case "paste":Current.SelectedTool=Current.Tools.First(t=>t.Id=="Paste");Current.SidebarIndex=4;break;
    case "reload":await Current.Run("reloadOriginal");break;
    case "textures":await CoreBridge.ChooseTextures();break;
    case "crop":case "expand":ShowTransformDialog(action);break;
    case "plugins":ShowPluginDialog();break;
    case "settings":await OpenDesktopSettings();break;
    case "new":case "version":ShowDesktopDialog(action);break;
    case "uvEditor":await OpenUvEditor();break;
    case "update":await ShowBrowserUpdate();break;
    case "close":await CoreBridge.DesktopData("close","");break;
    case "wiki":await CoreBridge.DesktopData("wiki","");break;
    case "log":Current.SidebarIndex=13;break;
    case "cad":Current.CadCycleCommand.Execute(null);break;
    case "zoomIn":case "zoomOut":await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="zoom",factor=action=="zoomIn"?1.2:1/1.2}));break;
    case "mapTiles":await ExportRegion(true,true);break;
    case "about":ShowDesktopAbout();break;
   }
  }catch(Exception ex){Current.Fail(ex.Message);}
 }
 void ChooseDesktopTool(object? sender,RoutedEventArgs e){if(sender is Button b&&b.Tag is string id){Current.SelectedTool=Current.Tools.First(t=>t.Id==id);if(id=="Sprite")Current.SidebarIndex=3;else if(id=="Paste")Current.SidebarIndex=4;else if(id=="Arrow")Current.SidebarIndex=2;map.Focus();}}
 void ShowDesktopDialog(string action){var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();if(action=="settings"){BuildDesktopSettings(stack);}else foreach(var part in dialogParts.Where(p=>p.Tag as string==action)){if(part is Expander expander)expander.IsExpanded=true;foreach(var nested in part.GetLogicalDescendants().OfType<Expander>())nested.IsExpanded=true;stack.Children.Add(part);}this.FindControl<Border>("DesktopDialog")!.IsVisible=true;}
 void CloseDesktopDialog(object? sender,RoutedEventArgs e){this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}
 void ShowMessage(string title,string message){var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(new TextBlock{Text=title,FontSize=20});stack.Children.Add(new TextBlock{Text=message,TextWrapping=TextWrapping.Wrap});this.FindControl<Border>("DesktopDialog")!.IsVisible=true;}
 async void DesktopTabChanged(object? sender,SelectionChangedEventArgs e){if(e.Source!=sender||!desktopReady)return;if(this.FindControl<TabControl>("DesktopTabs")?.SelectedItem is TabItem tab&&tab.Tag is string page){if(page=="special")page=this.FindControl<ComboBox>("SpecialKind")?.SelectedIndex==1?"signs":"chests";if(page is "world" or "chests" or "signs" or "npc" or "analysis" or "bestiary" or "banners" or "entity" or "creative" or "nbt"){if(Current.Editable)await Current.Run("desktopRead",new{page});}}}
 async void SpecialKindChanged(object? sender,SelectionChangedEventArgs e){if(!desktopReady||!Current.Editable)return;await Current.Run("desktopRead",new{page=this.FindControl<ComboBox>("SpecialKind")?.SelectedIndex==1?"signs":"chests"});}
 async void RefreshDesktopPanel(object? sender,RoutedEventArgs e){if(sender is Button b&&b.Tag is string page)await Current.Run("desktopRead",new{page});}
 async void GlowIntensityChanged(object? sender,RangeBaseValueChangedEventArgs e){if(desktopReady&&!syncingRenderPreferences)try{await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new{lightGlowIntensity=e.NewValue}}));}catch(Exception ex){Current.Fail(ex.Message);}}
 async void RenderPreferenceChanged(object? sender,RangeBaseValueChangedEventArgs e){if(desktopReady&&!syncingRenderPreferences&&sender is Slider {Tag:string key})try{await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new Dictionary<string,double>{{key,e.NewValue}}}));}catch(Exception ex){Current.Fail(ex.Message);}}
 void RefreshDesktopData(){
  BuildPalette();
  if(desktopSession!=Current.DesktopSessionId){desktopSession=Current.DesktopSessionId;desktopDataIdentity=null;scriptIdentity=null;worldChanges.Clear();worldRows.Clear();foreach(string host in new[]{"WorldPropertiesContent","SpecialContent","NpcContent","AnalysisContent","BestiaryContent","BannersContent","EntityContent","CreativeContent","NbtContent"})this.FindControl<StackPanel>(host)?.Children.Clear();if(desktopSession!=null)Avalonia.Threading.Dispatcher.UIThread.Post(()=>{if(Current.Editable)DesktopTabChanged(this.FindControl<TabControl>("DesktopTabs"),new SelectionChangedEventArgs(SelectingItemsControl.SelectionChangedEvent,Array.Empty<object>(),Array.Empty<object>()){Source=this.FindControl<TabControl>("DesktopTabs")});});}
  if(Current.DesktopData is {} d&&d.GetRawText()!=desktopDataIdentity){desktopDataIdentity=d.GetRawText();BuildDesktopPanel(d.GetProperty("page").GetString()!,d.GetProperty("data"));}
  if(Current.ScriptData is {} s&&s.GetRawText()!=scriptIdentity){scriptIdentity=s.GetRawText();var log=this.FindControl<TextBox>("ScriptLog");if(s.TryGetProperty("found",out var found))this.FindControl<ListBox>("ScriptFound")!.ItemsSource=found.EnumerateArray().Select(f=>new FindChoice(f.GetProperty("name").GetString()??"",f.GetProperty("x").GetInt32(),f.GetProperty("y").GetInt32())).ToArray();if(s.TryGetProperty("navigate",out var navigate)&&navigate.ValueKind==JsonValueKind.Object)_=CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="center",x=navigate.GetProperty("x").GetInt32(),y=navigate.GetProperty("y").GetInt32()}));if(log!=null)log.Text=string.Join('\n',s.GetProperty("logs").EnumerateArray().Select(l=>$"[{l.GetProperty("level")}] {l.GetProperty("message")}"))+"\n"+(s.GetProperty("success").GetBoolean()?"完成":"失败")+$" · {s.GetProperty("elapsedMs")} ms";}
 }
 static Button Button(string label,Action action){var b=new Button{Content=label,HorizontalAlignment=HorizontalAlignment.Left};b.Click+=(_,_)=>{var root=Instance;if(root!=null){Control scope=root.FindControl<Border>("DesktopDialog") is {IsVisible:true} dialog?dialog:root;var invalid=scope.GetVisualDescendants().OfType<TextBox>().FirstOrDefault(c=>c.IsEffectivelyVisible&&c.Classes.Contains("invalidField"));if(invalid!=null){Current.Fail("请先修正输入："+DesktopLanguage.Field(invalid.Tag as string??"字段"));invalid.Focus();return;}}action();};return b;}
 static TextBlock Label(string text)=>new(){Text=text,TextWrapping=TextWrapping.Wrap};
 static Control Field(string name,JsonElement value,string type,Action<JsonNode?> changed){
  var row=new Grid{ColumnDefinitions=new("*,120"),Margin=new(0,2)};row.Children.Add(new TextBlock{Text=DesktopLanguage.Field(name),VerticalAlignment=VerticalAlignment.Center,TextWrapping=TextWrapping.Wrap});Control input;
  if(type is "Boolean" or "bool"){bool previous=value.ValueKind==JsonValueKind.True;var c=new CheckBox{IsChecked=previous};c.IsCheckedChanged+=(_,_)=>{bool next=c.IsChecked==true;if(next==previous)return;previous=next;changed(JsonValue.Create(next));};input=c;}
  else{string? previous=value.ValueKind==JsonValueKind.String?value.GetString():value.ToString();var c=new TextBox{Text=previous,Tag=name};c.TextChanged+=(_,_)=>{if(c.Text==previous)return;previous=c.Text;try{var parsed=ParseField(c.Text??"",type);changed(parsed);c.Classes.Remove("invalidField");c.ClearValue(BorderBrushProperty);}catch{c.Classes.Add("invalidField");c.BorderBrush=Brushes.OrangeRed;}};input=c;}
  input.Tag=name;
  if(type=="Color"&&input is TextBox color){
   row.ColumnDefinitions=new("*,180");color.Width=112;color.Name="Color_"+Guid.NewGuid().ToString("N");
   var picker=new Button{Content="选色",Tag="color:"+name};picker.Click+=async(_,_)=>{try{await CoreBridge.DesktopData("chooseColor",JsonSerializer.Serialize(new{value=color.Text,target=color.Name}));}catch(Exception ex){Current.Fail(ex.Message);}};
   var colors=new StackPanel{Orientation=Orientation.Horizontal,Spacing=4};colors.Children.Add(color);colors.Children.Add(picker);input=colors;
  }
  Grid.SetColumn(input,1);row.Children.Add(input);return row;
 }
 static JsonNode? ParseField(string text,string type){
  if(type=="String")return JsonValue.Create(text);
  if(type is "Int64" or "UInt64"){if(type=="Int64")_ = long.Parse(text,System.Globalization.CultureInfo.InvariantCulture);else _ = ulong.Parse(text,System.Globalization.CultureInfo.InvariantCulture);return JsonValue.Create(text);}
  if(type=="Color"){if(text.Length!=7||text[0]!='#'||!uint.TryParse(text.AsSpan(1),System.Globalization.NumberStyles.HexNumber,System.Globalization.CultureInfo.InvariantCulture,out _))throw new FormatException("颜色格式为 #RRGGBB");return JsonValue.Create(text);}
  Type? numeric=type switch{"Byte"=>typeof(byte),"SByte"=>typeof(sbyte),"Int16"=>typeof(short),"UInt16"=>typeof(ushort),"Int32"=>typeof(int),"UInt32"=>typeof(uint),"Single"=>typeof(float),"Double"=>typeof(double),"Decimal"=>typeof(decimal),_=>null};
  if(numeric!=null){using var doc=JsonDocument.Parse(text);if(doc.RootElement.ValueKind!=JsonValueKind.Number)throw new FormatException("请输入数字");_ = JsonSerializer.Deserialize(text,numeric);}
  return JsonNode.Parse(text);
 }
 void BuildDesktopPanel(string page,JsonElement data){
  if(page=="uvEditor"){BuildUvEditor(data);return;}
  if(page=="spriteEditor"){BuildSpriteEditor(data);return;}
  string name=page switch{"world"=>"WorldPropertiesContent","chests" or "signs"=>"SpecialContent",_=>char.ToUpperInvariant(page[0])+page[1..]+"Content"};var stack=this.FindControl<StackPanel>(name);if(stack==null)return;stack.Children.Clear();
  if(page=="world"){
   worldChanges.Clear();worldRows.Clear();stack.Children.Add(Button("保存世界属性",()=>_=Current.Run("desktopEdit",new{page,values=worldChanges})));
   foreach(var f in data.EnumerateArray()){string key=f.GetProperty("name").GetString()!;var row=BackgroundField(key,f.GetProperty("value"))??Field(key,f.GetProperty("value"),f.GetProperty("type").GetString()!,value=>worldChanges[key]=value);worldRows[key]=row;stack.Children.Add(row);}FilterWorldRows();return;
  }
  if(page=="creative"){
   var values=JsonNode.Parse(data.GetRawText())!.AsArray();stack.Children.Add(Button("保存旅途能力",()=>_=Current.Run("desktopEdit",new{page,values})));
   foreach(var row in values){var item=row!.AsObject();var val=JsonSerializer.SerializeToElement(item["value"]);string id=item["name"]!.GetValue<string>();var enabled=new CheckBox{Content=id,IsChecked=item["value"]!=null};enabled.IsCheckedChanged+=(_,_)=>{if(enabled.IsChecked!=true)item["value"]=null;else item["value"]=item["type"]!.GetValue<string>()=="float"?JsonValue.Create(0.5):JsonValue.Create(true);};stack.Children.Add(enabled);stack.Children.Add(Field(id,val,item["type"]!.GetValue<string>()=="float"?"Single":"Boolean",v=>item["value"]=v));}return;
  }
  if(page=="banners"||page=="bestiary"){stack.Children.Add(Button("从其他世界导入",()=>ImportDesktopMetadata(page)));
   var values=JsonNode.Parse(data.GetRawText())!.AsArray();stack.Children.Add(Button("保存修改",()=>_=Current.Run("desktopEdit",new{page,values})));
   foreach(var (operation,label) in (page=="banners"?new[]{("max","全部设为9999"),("reset","全部清零")}:new[]{("complete","完成图鉴"),("reset","重置图鉴"),("tally","更新击杀统计")}))stack.Children.Add(Button(label,()=>_=Current.Run("desktopEdit",new{page,operation})));
   var filter=new TextBox{PlaceholderText="搜索名称或 ID"};stack.Children.Add(filter);var rows=new List<(string,Control)>();
   foreach(var row in values){var item=row!.AsObject();string id=item["name"]!.GetValue<string>();string count=page=="banners"?"count":"kills";var panel=new StackPanel();panel.Children.Add(Field(id,JsonSerializer.SerializeToElement(item[count]),"Int32",v=>item[count]=v));if(page=="banners")panel.Children.Add(Label("击杀数："+item["kills"]));if(page=="bestiary")foreach(string field in new[]{"near","talked"}){if(item[field=="near"?"canNear":"canTalk"]!.GetValue<bool>())panel.Children.Add(Field(field=="near"?"已遇见":"已交谈",JsonSerializer.SerializeToElement(item[field]),"Boolean",v=>item[field]=v));}rows.Add((id,panel));stack.Children.Add(panel);}filter.TextChanged+=(_,_)=>{foreach(var (id,row) in rows)row.IsVisible=id.Contains(filter.Text??"",StringComparison.OrdinalIgnoreCase);};return;
  }
  if(page=="nbt"){var tree=new TreeView();foreach(var node in data.EnumerateArray())tree.Items.Add(NbtNode(node));stack.Children.Add(tree);return;}
  if(page=="analysis"){stack.Children.Add(new TextBox{Text=data.ValueKind==JsonValueKind.String?data.GetString():JsonSerializer.Serialize(data,new JsonSerializerOptions{WriteIndented=true}),IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap});return;}
  if(page=="npc"){var id=new TextBox{PlaceholderText="NPC 名称或 ID"};var display=new TextBox{PlaceholderText="显示名称"};stack.Children.Add(id);stack.Children.Add(display);stack.Children.Add(Button("添加 NPC 到出生点",()=>{using var info=JsonDocument.Parse(Current.Info);ObjectCommand(page,"npc","Create",id.Text??"",display.Text??"",info.RootElement.GetProperty("spawnX").GetInt32(),info.RootElement.GetProperty("spawnY").GetInt32());}));}
  if(data.ValueKind==JsonValueKind.Array){foreach(var item in data.EnumerateArray()){var copy=item.Clone();string label=item.TryGetProperty("name",out var n)?n.ToString():item.TryGetProperty("type",out n)?n.ToString():page;int x=item.TryGetProperty("x",out var xx)?(int)xx.GetDouble():0,y=item.TryGetProperty("y",out var yy)?(int)yy.GetDouble():0;if(page=="npc"){x/=16;y/=16;}var exp=new Expander{Header=$"{label}  {x}, {y}",HorizontalAlignment=HorizontalAlignment.Stretch};exp.PropertyChanged+=(_,e)=>{if(e.Property==Expander.IsExpandedProperty&&exp.IsExpanded&&exp.Content==null){var content=new StackPanel{Spacing=4};content.Children.Add(Button("定位",()=>_=CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="center",x,y}))));content.Children.Add(ObjectEditor(page,copy));exp.Content=content;}};stack.Children.Add(exp);}if(data.GetArrayLength()==0)stack.Children.Add(Label("当前世界没有这些对象"));}
 }
 static TreeViewItem NbtNode(JsonElement n){var item=new TreeViewItem{Header=$"{n.GetProperty("name")}  [{n.GetProperty("type")}]  {n.GetProperty("value")}"};foreach(var c in n.GetProperty("children").EnumerateArray())item.Items.Add(NbtNode(c));return item;}
 void PropertySearch(object? sender,TextChangedEventArgs e){if(sender is TextBox box){worldPropertyQuery=box.Text??"";FilterWorldRows();}}
 void FilterWorldRows(){foreach(var (name,row) in worldRows)row.IsVisible=name.Contains(worldPropertyQuery,StringComparison.OrdinalIgnoreCase)||DesktopLanguage.Field(name).Contains(worldPropertyQuery,StringComparison.OrdinalIgnoreCase);}
 async void DesktopFind(object? sender,RoutedEventArgs e){try{int[] ids=(this.FindControl<TextBox>("FindIds")!.Text??"").Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(int.Parse).ToArray();if(ids.Length==0)throw new ArgumentException("请输入查找 ID");int kind=this.FindControl<ComboBox>("FindKind")!.SelectedIndex;var data=await Current.CallDomain("plugin","Find",kind==2?ids:Array.Empty<int>(),kind==0?ids:Array.Empty<int>(),kind==1?ids:Array.Empty<int>(),kind==3?ids:Array.Empty<int>(),Array.Empty<int>(),false);this.FindControl<ListBox>("FindResults")!.ItemsSource=data.GetProperty("results").EnumerateArray().Select(v=>new FindChoice(v.GetProperty("Name").GetString()!,v.GetProperty("X").GetInt32(),v.GetProperty("Y").GetInt32())).ToArray();}catch(Exception ex){Current.Fail(ex.Message);}}
 sealed record FindChoice(string Name,int X,int Y){public override string ToString()=>$"{Name} @ {X}, {Y}";}
 async void FindResultSelected(object? sender,SelectionChangedEventArgs e){if(sender is ListBox list&&list.SelectedItem is FindChoice item)await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="center",x=item.X,y=item.Y}));}
 void ScriptLanguageChanged(object? sender,SelectionChangedEventArgs e){if(!desktopReady)return;this.FindControl<ScriptCodeEditor>("ScriptEditor")?.SetLanguage(this.FindControl<ComboBox>("ScriptLanguage")?.SelectedIndex??0);}
 void ScriptExampleChanged(object? sender,SelectionChangedEventArgs e){if(sender is ComboBox c&&c.SelectedItem is string name&&scriptExamples.TryGetValue(name,out var code)){this.FindControl<ScriptCodeEditor>("ScriptEditor")!.Text=code;this.FindControl<ComboBox>("ScriptLanguage")!.SelectedIndex=name.EndsWith(".lua")?1:0;}}
 async void RunDesktopScript(object? sender,RoutedEventArgs e){try{await Current.Run("script",new{language=this.FindControl<ComboBox>("ScriptLanguage")!.SelectedIndex==1?"lua":"js",code=this.FindControl<ScriptCodeEditor>("ScriptEditor")!.Text??"",timeoutMs=checked(int.Parse(this.FindControl<TextBox>("ScriptTimeout")!.Text!)*1000)});}catch(Exception ex){Current.Fail(ex.Message);}}
 readonly Dictionary<string,JsonNode?> playerChanges=[];
 Dictionary<string,int> playerResearch=[];bool researchChanged;
 async void OpenPlayer(object? sender,RoutedEventArgs e){try{using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("openPlayer",""));BuildPlayerPanel(doc.RootElement);}catch(Exception ex){this.FindControl<TextBlock>("PlayerStatus")!.Text=ex.Message;}}
 async void SavePlayer(object? sender,RoutedEventArgs e){try{var invalid=this.FindControl<StackPanel>("PlayerContent")!.GetLogicalDescendants().OfType<TextBox>().FirstOrDefault(c=>c.Classes.Contains("invalidField"));if(invalid!=null){foreach(var tab in invalid.GetLogicalAncestors().OfType<TabItem>())tab.IsSelected=true;invalid.Focus();throw new ArgumentException("请先修正输入："+DesktopLanguage.Field(invalid.Tag as string??"字段"));}if(playerChanges.Count>0||researchChanged){await CoreBridge.DesktopData("editPlayer",JsonSerializer.Serialize(new{values=playerChanges,research=playerResearch}));playerChanges.Clear();researchChanged=false;}await CoreBridge.DesktopData("savePlayer","");this.FindControl<TextBlock>("PlayerStatus")!.Text="已导出玩家副本";}catch(Exception ex){this.FindControl<TextBlock>("PlayerStatus")!.Text=ex.Message;}}
 void BuildPlayerPanel(JsonElement state){
  state=state.Clone();
  if(!state.TryGetProperty("fields",out var list))return;playerChanges.Clear();playerResearch=JsonSerializer.Deserialize<Dictionary<string,int>>(state.GetProperty("research"))!;researchChanged=false;this.FindControl<TextBlock>("PlayerStatus")!.Text=$"{state.GetProperty("name")} · v{state.GetProperty("version")}";
  var stack=this.FindControl<StackPanel>("PlayerContent")!;stack.Children.Clear();BuildPlayerPreview(stack,list.EnumerateArray().FirstOrDefault(f=>f.GetProperty("path").GetString()=="CurrentLoadoutIndex").GetProperty("value").GetInt32());var tabs=new TabControl();
  var fields=list.EnumerateArray().Select(f=>f.Clone()).ToArray();
  string Group(string path)=>path.Split('.')[0].Split('[')[0] switch{"Armor" or "Dye" or "MiscEquips" or "MiscDyes" or "Loadouts" or "CurrentLoadoutIndex" or "HideVisibleAccessory"=>"装备","Inventory" or "TrashItem" or "CraftingRefundItems"=>"物品栏","Bank1" or "Bank2" or "Bank3" or "Bank4"=>"储物栏","Buffs"=>"增益","JourneyPowers"=>"旅途模式",_=>"属性"};
  foreach(string name in new[]{"装备","物品栏","储物栏","增益","属性","旅途模式"}){
   var panel=new StackPanel{Spacing=4};var tab=new TabItem{Header=name,Content=panel};tabs.Items.Add(tab);bool built=false;
   void Build(){if(built)return;built=true;foreach(var field in fields.Where(f=>Group(f.GetProperty("path").GetString()!)==name)){string path=field.GetProperty("path").GetString()!;panel.Children.Add(Field(path,field.GetProperty("value"),field.GetProperty("type").GetString()!,v=>{playerChanges[path]=v;if(path.StartsWith("Appearance.")||path.StartsWith("Armor[")||path.StartsWith("Dye[")||path.StartsWith("Loadouts[")||path.StartsWith("HideVisibleAccessory["))QueuePlayerPreview();}));}if(name=="旅途模式"){foreach(var p in state.GetProperty("research").EnumerateObject())panel.Children.Add(Field(p.Name,p.Value,"Int32",value=>{playerResearch[p.Name]=value!.GetValue<int>();researchChanged=true;}));var key=new TextBox{PlaceholderText="研究项目内部名称"};var count=new TextBox{Text="1"};panel.Children.Add(key);panel.Children.Add(count);panel.Children.Add(Button("添加/更新研究项",()=>{if(string.IsNullOrWhiteSpace(key.Text)||!int.TryParse(count.Text,out var number)||number<0){Current.Fail("请输入研究项目与非负数量");return;}playerResearch[key.Text]=number;researchChanged=true;this.FindControl<TextBlock>("PlayerStatus")!.Text="研究修改待导出";}));}}
   tab.PropertyChanged+=(_,e)=>{if(e.Property==TabItem.IsSelectedProperty&&tab.IsSelected)Build();};
   if(name=="装备")Build();
  }stack.Children.Add(tabs);
 }
}
