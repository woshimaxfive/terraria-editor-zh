using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
namespace TEditBrowser;
public partial class MainView {
 async Task ShowBrowserUpdate(){
  using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("checkUpdate",""));var result=doc.RootElement;
  ShowMessage("检查更新",result.GetProperty("available").GetBoolean()?"发现新的网页版本。请先下载保存世界，再刷新页面载入新版。":"当前页面已是此站点的最新版本。");
  this.FindControl<StackPanel>("DesktopDialogContent")!.Children.Add(Label("当前构建："+result.GetProperty("current").GetString()+"\n站点构建："+result.GetProperty("latest").GetString()));
 }
 void ShowTransformDialog(string mode){
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label(mode=="crop"?"裁剪世界":"扩展世界"));
  stack.Children.Add(Label("使用原版世界变换规则创建新世界，成功后重置撤销历史。"));
  using var doc=JsonDocument.Parse(Current.Info);var info=doc.RootElement;
  var width=new TextBox{Name="TransformWidth",Text=info.TryGetProperty("width",out var w)?w.ToString():"4200"};var height=new TextBox{Name="TransformHeight",Text=info.TryGetProperty("height",out var h)?h.ToString():"1200"};
  var borders=new CheckBox{Content="添加世界边界（左/上41格，右/下42格）"};
  if(mode=="expand"){stack.Children.Add(Label("新宽度"));stack.Children.Add(width);stack.Children.Add(Label("新高度"));stack.Children.Add(height);}else stack.Children.Add(borders);
  stack.Children.Add(Button("生成新世界",async()=>{try{await CoreBridge.Run("transformWorld",JsonSerializer.Serialize(new{mode,width=int.Parse(width.Text!),height=int.Parse(height.Text!),borders=borders.IsChecked==true}));this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}catch(Exception ex){Current.Fail(ex.Message);}}));this.FindControl<Border>("DesktopDialog")!.IsVisible=true;
 }
 void ShowPluginDialog(){
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label("插件"));
  var translated=new Dictionary<string,string>{["Shuffle"]="随机打乱方块",["CleanseWorld"]="净化世界",["Randomize"]="随机替换方块",["RemoveAllChests"]="移除全部箱子",["RemoveAllUnlockedChests"]="移除未上锁箱子",["RemoveTiles"]="移除指定方块与墙",["SettleSand"]="沙块下落",["UnlockAllChests"]="解锁全部箱子",["GenerateOre"]="矿石生成"};
  var options=Current.Operations("plugin").Where(o=>translated.ContainsKey(o.Name)).ToArray();
  var combo=new ComboBox{Name="PluginChoice",ItemsSource=options.Select(o=>translated[o.Name]).ToArray()};var fields=new StackPanel{Spacing=5};JsonArray? values=null;
  combo.SelectionChanged+=(_,_)=>{fields.Children.Clear();if(combo.SelectedIndex<0)return;var operation=options[combo.SelectedIndex];values=new();int i=0;foreach(var parameter in operation.Parameters.EnumerateArray()){
   int index=i++;var initial=parameter.GetProperty("value");string name=parameter.GetProperty("name").GetString()!,type=parameter.GetProperty("type").GetString()!;values.Add(JsonNode.Parse(initial.GetRawText()));
   if(type.EndsWith("[]")){var input=new TextBox{Name="PluginArray_"+name,Tag=name,Text=string.Join(',',initial.EnumerateArray().Select(v=>v.ToString())),Watermark="多个 ID 以逗号分隔"};input.TextChanged+=(_,_)=>{try{values[index]=JsonSerializer.SerializeToNode((input.Text??"").Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(int.Parse).ToArray());input.Classes.Remove("invalidField");input.ClearValue(BorderBrushProperty);}catch{input.Classes.Add("invalidField");input.BorderBrush=Avalonia.Media.Brushes.OrangeRed;}};fields.Children.Add(Label(DesktopLanguage.Field(name)));fields.Children.Add(input);}
   else fields.Children.Add(Field(name,initial,type,v=>values[index]=v));
  }};
  stack.Children.Add(combo);stack.Children.Add(fields);stack.Children.Add(Button("运行插件",async()=>{if(combo.SelectedIndex<0||values==null)return;var operation=options[combo.SelectedIndex];await Current.Run("domain",new{id=operation.Id,args=values,settings=Current.Settings()});}));combo.SelectedIndex=0;
  stack.Children.Add(Button("程序化房屋生成",ShowHouseGenerator));stack.Children.Add(Button("生成家具调试布局",GenerateSpriteDebugger));
  stack.Children.Add(Button("像素画、玩家地图与回放",()=>ShowDesktopDialog("artifacts")));
  var text=new TextBox{AcceptsReturn=true,PlaceholderText="雕像文字"};stack.Children.Add(Label("文字雕像"));stack.Children.Add(text);
  var spacing=new NumericUpDown{Minimum=0,Maximum=100,Value=0};var rowSpacing=new NumericUpDown{Minimum=0,Maximum=100,Value=1};var lineLength=new NumericUpDown{Minimum=1,Maximum=4096,Value=64};var alignment=new ComboBox{ItemsSource=new[]{"左对齐","居中","右对齐"},SelectedIndex=0};
  stack.Children.Add(Label("字间距"));stack.Children.Add(spacing);stack.Children.Add(Label("行间距"));stack.Children.Add(rowSpacing);stack.Children.Add(Label("最大行宽"));stack.Children.Add(lineLength);stack.Children.Add(alignment);
  stack.Children.Add(Button("生成文字模板",async()=>{await Current.CallDomain("plugin","GenerateText",text.Text??"",(int)(spacing.Value??0),(int)(rowSpacing.Value??1),(int)(lineLength.Value??64),new[]{"Left","Center","Right"}[Math.Clamp(alignment.SelectedIndex,0,2)]);Current.SidebarIndex=4;this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}));
  this.FindControl<Border>("DesktopDialog")!.IsVisible=true;
 }
}
