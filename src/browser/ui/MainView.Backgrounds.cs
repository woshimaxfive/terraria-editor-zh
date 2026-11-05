using Avalonia.Controls;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace TEditBrowser;
public partial class MainView {
 static readonly Dictionary<string,JsonElement[]> BackgroundOptions=ReadBackgroundOptions();
 static Dictionary<string,JsonElement[]> ReadBackgroundOptions(){using var doc=JsonDocument.Parse(typeof(MainView).Assembly.GetManifestResourceStream("TEdit.Browser.BackgroundStyles")!);return doc.RootElement.EnumerateObject().Where(p=>p.Value.ValueKind==JsonValueKind.Array).ToDictionary(p=>p.Name,p=>p.Value.EnumerateArray().Select(v=>v.Clone()).ToArray());}
 sealed record BackgroundChoice(int Id,string Name){public override string ToString()=>$"{Id} · {DesktopLanguage.Name(Name)}";}
 Control? BackgroundField(string key,JsonElement value){
  string? category=key switch{"BgTree" or "BgTree2" or "BgTree3" or "BgTree4"=>"ForestBackgrounds","TreeStyle0" or "TreeStyle1" or "TreeStyle2" or "TreeStyle3"=>"TreeStyles","BgOcean"=>"OceanBackgrounds","BgDesert"=>"DesertBackgrounds","BgCrimson"=>"CrimsonBackgrounds","BgHallow"=>"HallowBackgrounds","BgSnow"=>"SnowBackgrounds","BgJungle"=>"JungleBackgrounds","BgCorruption"=>"CorruptionBackgrounds","UnderworldBg"=>"UnderworldBackgrounds","MushroomBg"=>"MushroomBackgrounds","CaveBackStyle0" or "CaveBackStyle1" or "CaveBackStyle2" or "CaveBackStyle3"=>"CaveBackgrounds","IceBackStyle"=>"IceBackgrounds","JungleBackStyle"=>"JungleUndergroundBackgrounds","HellBackStyle"=>"HellBackgrounds",_=>null};
  if(category==null)return null;string jsonKey=char.ToLowerInvariant(category[0])+category[1..];if(!BackgroundOptions.TryGetValue(jsonKey,out var entries))return null;
  var choices=entries.Select(e=>new BackgroundChoice(e.GetProperty("id").GetInt32(),e.GetProperty("name").GetString()!)).ToArray();
  var input=new ComboBox{Name="BackgroundStyle_"+key,ItemsSource=choices,SelectedItem=choices.FirstOrDefault(c=>c.Id==value.GetInt32())};
  var image=new Image{Width=128,Height=96};var panel=new StackPanel{Spacing=5};panel.Children.Add(input);panel.Children.Add(image);
  var expander=new Expander{Header=DesktopLanguage.Field(key)+" · "+value,Content=panel};
  async Task Preview(){if(input.SelectedItem is BackgroundChoice choice)await LoadThumbnail(image,"backgroundStyle:"+category,choice.Id);}
  input.SelectionChanged+=async(_,_)=>{if(input.SelectedItem is BackgroundChoice choice){worldChanges[key]=JsonValue.Create(choice.Id);expander.Header=DesktopLanguage.Field(key)+" · "+choice.Id;if(expander.IsExpanded)await Preview();}};
  expander.PropertyChanged+=async(_,e)=>{if(e.Property==Expander.IsExpandedProperty&&expander.IsExpanded)await Preview();};return expander;
 }
}
