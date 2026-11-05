using System.ComponentModel;
using System.Text.Json;
namespace TEditBrowser;
public sealed partial class EditorViewModel {
 int sidebarIndex=1;string materialSearch="";
 public int SidebarIndex {get=>sidebarIndex;set{sidebarIndex=Math.Clamp(value,0,15);PropertyChanged?.Invoke(this,new(nameof(SidebarIndex)));}}
 public string MaterialSearch {get=>materialSearch;set{materialSearch=value??"";PropertyChanged?.Invoke(this,new(nameof(FilteredMaterials)));}}
 public Material[] FilteredMaterials=>Materials.Where(m=>$"{m.Id} {m.Name}".Contains(materialSearch,StringComparison.OrdinalIgnoreCase)).ToArray();
 public string DesktopTitle {get;private set;}="TEdit · 泰拉瑞亚地图编辑器";
 public string DesktopSelection=>$"{SelectedTool.Label}\n选区 {SelectionX}, {SelectionY}\n{SelectionWidth} × {SelectionHeight}";
 public JsonElement? DesktopData {get;private set;}
 public JsonElement? ScriptData {get;private set;}
 public string? DesktopSessionId {get;private set;}
 internal async Task<JsonElement> CallDomain(string group,string name,params object?[] args){
  var method=allOperations.FirstOrDefault(o=>o.Group==group&&o.Name==name&&o.Parameters.GetArrayLength()==args.Length)??throw new InvalidOperationException("当前操作不可用："+name);
  string json=await CoreBridge.Run("domain",JsonSerializer.Serialize(new{id=method.Id,args,settings=Settings()}));using var doc=JsonDocument.Parse(json);return doc.RootElement.GetProperty("domainResult").Clone();
 }
 internal DomainOperation[] Operations(string group)=>allOperations.Where(o=>o.Group==group).ToArray();
 internal void NotifyDesktop()=>PropertyChanged?.Invoke(this,new(null));
 string? toolFeedback;
 void SyncToolFeedback(JsonElement info){if(Materials.Length==0||!info.TryGetProperty("toolState",out var state)||state.ValueKind!=JsonValueKind.Object)return;string raw=state.GetRawText();if(raw==toolFeedback)return;toolFeedback=raw;var selection=state.GetProperty("selection");SelectRectangle(selection.GetProperty("x").GetInt32(),selection.GetProperty("y").GetInt32(),selection.GetProperty("width").GetInt32(),selection.GetProperty("height").GetInt32());LimitToSelection=selection.GetProperty("active").GetBoolean();}
 void ApplyDesktop(JsonElement info){
  if(info.TryGetProperty("title",out var title))DesktopTitle=title.GetString()+" · TEdit";
  DesktopSessionId=info.TryGetProperty("desktopSessionId",out var key)?key.GetString():null;
  DesktopData=info.TryGetProperty("desktopResult",out var data)&&data.ValueKind==JsonValueKind.Object?data.Clone():null;
  ScriptData=info.TryGetProperty("scriptOutcome",out var result)&&result.ValueKind==JsonValueKind.Object?result.Clone():null;
 }
}
