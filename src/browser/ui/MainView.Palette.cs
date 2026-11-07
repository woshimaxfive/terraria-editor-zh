using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Layout;
using System.Text.Json;
namespace TEditBrowser;
public partial class MainView {
 static readonly Avalonia.Controls.Templates.FuncDataTemplate<string> ChoiceTemplate=new((value,_)=>new TextBlock{Text=DesktopLanguage.Field(value??"")});
 ToolField[]? builtToolFields;
 void BuildPalette(){
  if(Current.ToolFields.Length==0||ReferenceEquals(builtToolFields,Current.ToolFields))return;builtToolFields=Current.ToolFields;
  var stack=this.FindControl<StackPanel>("PaletteFields")!;stack.Children.Clear();
  foreach(var (title,group,fields) in new[]{
   ("方块与墙壁","paint",new[]{"PaintMode","WallStyleActive","Wall","IsEraser","BrickStyleActive","BrickStyle"}),
   ("油漆与涂层","paint",new[]{"TilePaintActive","TileColor","WallPaintActive","WallColor","EnableTileCoating","EnableWallCoating","TileCoatingEcho","TileCoatingIlluminant","WallCoatingEcho","WallCoatingIlluminant"}),
   ("电路、液体与铁轨","paint",Array.Empty<string>()),("笔刷","brush",Array.Empty<string>()),("掩码","mask",Array.Empty<string>()),("生态转换","morph",Array.Empty<string>())}){
   var panel=new StackPanel{Spacing=4};foreach(var f in Current.ToolFields.Where(f=>f.Group==group&&(fields.Length==0||fields.Contains(f.Name)))){
    if(title=="电路、液体与铁轨"&&new[]{"PaintMode","WallStyleActive","Wall","IsEraser","BrickStyleActive","BrickStyle","TilePaintActive","TileColor","WallPaintActive","WallColor","EnableTileCoating","EnableWallCoating","TileCoatingEcho","TileCoatingIlluminant","WallCoatingEcho","WallCoatingIlluminant"}.Contains(f.Name))continue;
    var row=new Grid{ColumnDefinitions=new("*,128")};row.Children.Add(Label(f.Label.Split(" · ").Last()));Control input;
    if(f.IsBool){var c=new CheckBox();c.Bind(CheckBox.IsCheckedProperty,new Binding(nameof(ToolField.BoolValue)){Source=f,Mode=BindingMode.TwoWay});input=c;}
    else if(f.IsEnum){var c=new ComboBox{ItemsSource=f.Choices,ItemTemplate=ChoiceTemplate,HorizontalAlignment=HorizontalAlignment.Stretch};c.Bind(ComboBox.SelectedItemProperty,new Binding(nameof(ToolField.TextValue)){Source=f,Mode=BindingMode.TwoWay});input=c;}
    else{var c=new TextBox();c.Bind(TextBox.TextProperty,new Binding(nameof(ToolField.TextValue)){Source=f,Mode=BindingMode.TwoWay});input=c;}
    Grid.SetColumn(input,1);row.Children.Add(input);panel.Children.Add(row);
   }stack.Children.Add(new Expander{Header=title,Tag=group,Content=panel,HorizontalAlignment=HorizontalAlignment.Stretch,IsExpanded=title=="方块与墙壁"});
  }
  BuildFilterPanel();
 }
 void BuildFilterPanel(){
  var stack=this.FindControl<StackPanel>("FilterFields")!;stack.Children.Clear();
  var groups=new Dictionary<string,TextBox>();foreach(var (key,label) in new[]{("tiles","方块 ID"),("walls","墙壁 ID"),("sprites","家具 ID"),("liquids","液体（0–3）"),("wires","线路（0–3）")}){stack.Children.Add(Label(label));var box=new TextBox{PlaceholderText="逗号分隔；留空表示不筛选"};groups[key]=box;stack.Children.Add(box);}
  var mode=new ComboBox{ItemsSource=new[]{"Darken","Hide"},ItemTemplate=ChoiceTemplate,SelectedIndex=0};
  var background=new ComboBox{ItemsSource=new[]{"Normal","Transparent","Custom"},ItemTemplate=ChoiceTemplate,SelectedIndex=0};
  var darken=new Slider{Minimum=0,Maximum=1,Value=.75};var desaturate=new Slider{Minimum=0,Maximum=1,Value=.75};
  var hideColor=new TextBox{Text="#FF000000"};var backgroundColor=new TextBox{Text="#FF000000"};
  stack.Children.Add(Label("筛选效果"));stack.Children.Add(mode);stack.Children.Add(Label("背景"));stack.Children.Add(background);stack.Children.Add(Label("变暗程度"));stack.Children.Add(darken);stack.Children.Add(Label("去色程度"));stack.Children.Add(desaturate);stack.Children.Add(Label("筛选颜色 #AARRGGBB"));stack.Children.Add(hideColor);stack.Children.Add(Label("背景颜色 #AARRGGBB"));stack.Children.Add(backgroundColor);
  stack.Children.Add(Button("应用筛选",async()=>{try{var filter=groups.ToDictionary(p=>p.Key,p=>(object)(p.Value.Text??"").Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(int.Parse).ToArray());filter["mode"]=mode.SelectedItem!;filter["background"]=background.SelectedItem!;filter["darken"]=darken.Value;filter["desaturate"]=desaturate.Value;filter["hideColor"]=Convert.ToUInt32(hideColor.Text!.TrimStart('#'),16);filter["backgroundColor"]=Convert.ToUInt32(backgroundColor.Text!.TrimStart('#'),16);await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new{filter}}));}catch(Exception ex){Current.Fail(ex.Message);}}));
  stack.Children.Add(Button("清除筛选",async()=>{foreach(var box in groups.Values)box.Text="";await CoreBridge.RenderView("{\"operation\":\"set\",\"view\":{\"filter\":{}}}");}));
 }
 async Task RestoreDesktopPreferences(){try{using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("readPreference",""));ApplyGeneralPreferences(doc.RootElement);Current.PropertyChanged+=async(_,e)=>{if(e.PropertyName==nameof(EditorViewModel.SidebarIndex))await SaveDesktopPreferences();};}catch(Exception ex){Current.Fail("界面设置未恢复："+ex.Message);}}
 Task<string> SaveDesktopPreferences()=>loadingGeneralPreferences?Task.FromResult("{}"):CoreBridge.DesktopData("preference",JsonSerializer.Serialize(new{language=DesktopLanguage.Language,tab=Current.SidebarIndex,spriteThumbnailSize,enablePlayerEditor,scriptTimeoutSeconds,maxBackups}));
}
