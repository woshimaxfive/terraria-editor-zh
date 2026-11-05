using Avalonia.Controls;
using Avalonia.Platform.Storage;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace TEditBrowser;
public partial class MainView {
 async void ImportDesktopMetadata(string page){try{var files=await TopLevel.GetTopLevel(this)!.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions{Title="选择要导入的世界",FileTypeFilter=[new FilePickerFileType("Terraria 世界"){Patterns=["*.wld"]}]});if(files.Count==0)return;using var stream=await files[0].OpenReadAsync();if(stream.Length>256*1024*1024)throw new ArgumentException("导入世界超过256MiB");using var buffer=new MemoryStream();await stream.CopyToAsync(buffer);await Current.Run("desktopImport",new{page,bytes=buffer.ToArray().Select(b=>(int)b).ToArray()});}catch(Exception ex){Current.Fail(ex.Message);}}
 void ShowHouseGenerator(){
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;stack.Children.Clear();stack.Children.Add(Label("程序化房屋生成"));
  stack.Children.Add(Label("先导入原版分层房屋模板，再导入对应 JSON 区域配置。生成结果放入剪贴板。"));
  stack.Children.Add(Button("导入房屋模板",()=>Current.ImportTemplateCommand.Execute(null)));
  JsonObject? template=null;var fields=new StackPanel{Spacing=4};var count=new TextBox{Text="1"};var seed=new TextBox{Text="1"};
  stack.Children.Add(Button("导入区域配置 JSON",async()=>{try{
   var files=await TopLevel.GetTopLevel(this)!.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions{Title="选择原版房屋 JSON",FileTypeFilter=[new FilePickerFileType("房屋配置"){Patterns=["*.json"]}]});if(files.Count==0)return;
   using var stream=await files[0].OpenReadAsync();if(stream.Length>1024*1024)throw new ArgumentException("配置超过1MiB");using var reader=new StreamReader(stream,System.Text.Encoding.UTF8);template=JsonNode.Parse(await reader.ReadToEndAsync())!.AsObject();
   count.Text=template["Count"]?.ToString()??template["count"]?.ToString()??"1";fields.Children.Clear();
   foreach(string group in new[]{"Rooms","Roofs"})if((template[group]??template[group.ToLowerInvariant()]) is JsonArray array)foreach(var node in array){var row=node!.AsObject();var panel=new StackPanel();foreach(string key in new[]{"Name","X","Y","Width","Height"}){string actual=row.ContainsKey(key)?key:key.ToLowerInvariant();if(row[actual] is {} value)panel.Children.Add(Field(key,JsonSerializer.SerializeToElement(value),key=="Name"?"String":"Int32",v=>row[actual]=v));}fields.Children.Add(new Expander{Header=group=="Rooms"?"房间":"屋顶",Content=panel});}
  }catch(Exception ex){Current.Fail(ex.Message);}}));
  stack.Children.Add(Label("模板层数"));stack.Children.Add(count);stack.Children.Add(Label("随机种子"));stack.Children.Add(seed);stack.Children.Add(fields);
  stack.Children.Add(Button("生成到剪贴板",async()=>{try{if(template==null)throw new ArgumentException("请先导入区域配置");template[template.ContainsKey("Count")?"Count":"count"]=int.Parse(count.Text!);await Current.CallDomain("plugin","GenerateHouse",template.ToJsonString(),int.Parse(seed.Text!));Current.SidebarIndex=4;this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}catch(Exception ex){Current.Fail(ex.Message);}}));
 }
 async void GenerateSpriteDebugger(){try{using var doc=JsonDocument.Parse(await CoreBridge.RenderView("{\"operation\":\"spriteSizes\"}"));await Current.CallDomain("plugin","GenerateSpriteDebug",doc.RootElement.GetRawText());}catch(Exception ex){Current.Fail(ex.Message);}}
}
