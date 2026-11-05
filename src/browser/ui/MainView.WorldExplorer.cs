using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
namespace TEditBrowser;
public partial class MainView {
 async void OpenWorldExplorer(object? sender,RoutedEventArgs e){try{BuildWorldExplorer(JsonDocument.Parse(await CoreBridge.DesktopData("explorerList","{}")).RootElement);}catch(Exception ex){Current.Fail(ex.Message);}}
 void BuildWorldExplorer(JsonElement rows){
  var entries=rows.EnumerateArray().Select(e=>e.Clone()).ToArray();var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label("世界浏览器"));
  stack.Children.Add(Label("选择 Terraria 或 tModLoader 的世界目录，浏览世界和 .bak、.TEdit、自动保存及带日期的备份。浏览器只读取你明确选择的文件。"));
  stack.Children.Add(Button("选择世界目录",async()=>{try{using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("explorerChoose","{}"));BuildWorldExplorer(doc.RootElement);}catch(Exception ex){Current.Fail(ex.Message);}}));
  var search=new TextBox{Name="ExplorerSearch",Watermark="搜索世界、路径或备份名称"};var modded=new ComboBox{Name="ExplorerKind",ItemsSource=new[]{"全部世界","原版世界","tModLoader 世界","备份"},SelectedIndex=0};
  var list=new ListBox{Name="ExplorerWorlds",Height=260};var detail=new TextBox{Name="ExplorerDetails",IsReadOnly=true,AcceptsReturn=true,Height=120};var preview=new Image{Name="ExplorerPreview",Width=400,Height=200};JsonElement? chosen=null;JsonElement[] filtered=[];
  void Filter(){filtered=entries.Where(row=>(row.GetProperty("name").GetString()!+row.GetProperty("key").GetString()).Contains(search.Text??"",StringComparison.OrdinalIgnoreCase)&&(modded.SelectedIndex switch{1=>!row.GetProperty("modded").GetBoolean(),2=>row.GetProperty("modded").GetBoolean(),3=>row.GetProperty("backup").GetBoolean(),_=>true})).ToArray();list.ItemsSource=filtered.Select(row=>(row.GetProperty("pinned").GetBoolean()?"★ ":"")+(row.GetProperty("backup").GetBoolean()?"[备份] ":"")+row.GetProperty("name").GetString()+" · "+row.GetProperty("size")+" 字节").ToArray();chosen=null;}
  search.TextChanged+=(_,_)=>Filter();modded.SelectionChanged+=(_,_)=>Filter();list.SelectionChanged+=async(_,_)=>{
   chosen=list.SelectedIndex>=0&&list.SelectedIndex<filtered.Length?filtered[list.SelectedIndex]:null;if(preview.Source is IDisposable old)old.Dispose();preview.Source=null;
   if(chosen is not {} row)return;int id=row.GetProperty("id").GetInt32();detail.Text=row.GetProperty("key").GetString();
   try{
    using var header=JsonDocument.Parse(await CoreBridge.DesktopData("explorerHeader",JsonSerializer.Serialize(new{id})));if(chosen is not {} current||current.GetProperty("id").GetInt32()!=id)return;var h=header.RootElement;
    detail.Text=$"{h.GetProperty("Title")} · {h.GetProperty("TerrariaVersionText")} · {h.GetProperty("TilesWide")}×{h.GetProperty("TilesHigh")}\n{DesktopLanguage.Field(h.GetProperty("GameModeText").GetString()!)} · {DesktopLanguage.Field(h.GetProperty("EvilBiome").GetString()!)}\n{row.GetProperty("key")}\n"+(h.GetProperty("IsCorrupt").GetBoolean()?"原版检查提示："+h.GetProperty("CorruptReason"):"");
    if(h.TryGetProperty("preview",out var png)){using var stream=new MemoryStream(Convert.FromBase64String(png.GetString()!));preview.Source=new Bitmap(stream);}
   }catch(Exception ex){if(chosen is {} current&&current.GetProperty("id").GetInt32()==id)detail.Text+="\n"+ex.Message;}
  };
  stack.Children.Add(search);stack.Children.Add(modded);stack.Children.Add(list);stack.Children.Add(detail);stack.Children.Add(preview);
  stack.Children.Add(Button("固定或取消固定",async()=>{if(chosen is not {} row)return;try{using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("explorerPin",JsonSerializer.Serialize(new{id=row.GetProperty("id").GetInt32()})));BuildWorldExplorer(doc.RootElement);}catch(Exception ex){Current.Fail(ex.Message);}}));
  stack.Children.Add(Button("打开所选世界或备份",async()=>{if(chosen is not {} row)return;try{await CoreBridge.DesktopData("explorerOpen",JsonSerializer.Serialize(new{id=row.GetProperty("id").GetInt32()}));if(Current.Editable){this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}}catch(Exception ex){Current.Fail(ex.Message);}}));Filter();this.FindControl<Border>("DesktopDialog")!.IsVisible=true;
 }
}
