using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
namespace TEditBrowser;
public static class DesktopLanguage {
 static readonly Dictionary<string,Dictionary<string,string>> resources=JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string>>>(typeof(DesktopLanguage).Assembly.GetManifestResourceStream("TEdit.Browser.Languages")!)!;
 static DesktopLanguage(){foreach(var key in resources.Keys.ToArray())if(key.Contains('-')&&!key.StartsWith("zh-"))resources.TryAdd(key.Split('-')[0],resources[key]);}
 public static string Language {get;private set;}="zh-Hans";
 static ResourceDictionary? appliedResources;
 static readonly Dictionary<string,string> labels=JsonSerializer.Deserialize<Dictionary<string,string>>(typeof(DesktopLanguage).Assembly.GetManifestResourceStream("TEdit.Browser.FieldLabels")!)!;
 static readonly Dictionary<string,string> chineseNames=JsonSerializer.Deserialize<Dictionary<string,string>>(typeof(DesktopLanguage).Assembly.GetManifestResourceStream("TEdit.Browser.ChineseNames")!)!;
 static readonly Dictionary<string,string> chineseFields=JsonSerializer.Deserialize<Dictionary<string,string>>(typeof(DesktopLanguage).Assembly.GetManifestResourceStream("TEdit.Browser.ChineseFields")!)!;
 static readonly Dictionary<string,string> editorLabels=new(){["TextureGridX"]="网格宽度",["TextureGridY"]="网格高度",["FrameGapX"]="水平间隔",["FrameGapY"]="垂直间隔",["FrameSizeX"]="每帧格数（横）",["FrameSizeY"]="每帧格数（纵）",["IsAnimated"]="动画图格",["CoordinateHeightsText"]="各行像素高度",["UvX"]="帧 U 坐标",["UvY"]="帧 V 坐标",["SizeX"]="帧宽度（格）",["SizeY"]="帧高度（格）",["Classic"]="经典",["Expert"]="专家",["Master"]="大师",["Journey"]="旅途",["Corruption"]="腐化",["Crimson"]="猩红"};
 public static string Name(string text)=>Language.StartsWith("zh")?string.Join(" · ",text.Split(" · ").Select(p=>chineseNames.GetValueOrDefault(p,p))):text;
 public static string Field(string path){if(Language.StartsWith("zh")){if(editorLabels.TryGetValue(path,out var editorLabel))return editorLabel;if(chineseFields.TryGetValue(path,out var translated))return translated;if(path.Contains('.')||path.Contains('['))return string.Join(" / ",path.Split('.').Select(p=>{int index=p.IndexOf('[');string key=index<0?p:p[..index];return chineseFields.GetValueOrDefault(key,Name(OriginalField(key)))+(index<0?"":p[index..]);}));}return Name(OriginalField(path));}
 static string OriginalField(string path)=>labels.TryGetValue(path,out var key)||labels.TryGetValue(path.Split('.').Last(),out key)?Text(key):path;
 public static string Text(string key)=>resources.GetValueOrDefault(Language)?.GetValueOrDefault(key)??resources["en"].GetValueOrDefault(key)??key;
 public static void Apply(string language){Language=resources.ContainsKey(language)?language:"zh-Hans";var next=new ResourceDictionary();foreach(var (key,value) in resources["en"])next[key]=resources[Language].GetValueOrDefault(key)??value;var merged=Application.Current!.Resources.MergedDictionaries;if(appliedResources is null)merged.Add(next);else merged[merged.IndexOf(appliedResources)]=next;appliedResources=next;MainView.Instance?.SyncLanguageMenus();}
}
