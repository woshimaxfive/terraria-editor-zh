using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Input;
namespace TEditBrowser;
public sealed record DomainOperation(string Id,string Group,string Name,bool ReadOnly,JsonElement Parameters){public override string ToString()=>Name+(ReadOnly?"（查询）":"");}
public sealed class DomainParameter {
 public required string Name {get;init;}
 public required string Type {get;init;}
 public string Label=>$"{Name} ({Type})";
 public string Text {get;set;}="";
 public bool Flag {get;set;}
 public bool IsBool=>Type=="Boolean";
 public bool IsText=>!IsBool;
 public JsonNode? Value()=>IsBool?JsonValue.Create(Flag):Type is "String" or "Int64" or "UInt64"?JsonValue.Create(Text):JsonNode.Parse(Text);
}
public sealed partial class EditorViewModel {
 DomainOperation[] allOperations=[];DomainOperation? selectedOperation;string domainGroup="chest";
 public string[] DomainGroups {get;}=["chest","sign","entity","npc","world","worldExtra","generate","plugin","metadata","selection","objects","spriteFrames"];
 public string DomainGroup {get=>domainGroup;set{domainGroup=value;SelectedOperation=DomainOperations.FirstOrDefault();PropertyChanged?.Invoke(this,new(nameof(DomainOperations)));}}
 public DomainOperation[] DomainOperations=>allOperations.Where(o=>o.Group==domainGroup).ToArray();
 public DomainOperation? SelectedOperation {get=>selectedOperation;set{selectedOperation=value;DomainParameters=value?.Parameters.EnumerateArray().Select(p=>new DomainParameter{Name=p.GetProperty("name").GetString()!,Type=p.GetProperty("type").GetString()!,Text=p.GetProperty("value").ToString(),Flag=p.GetProperty("type").GetString()=="Boolean"&&p.GetProperty("value").GetBoolean()}).ToArray()??[];PropertyChanged?.Invoke(this,new(nameof(SelectedOperation)));PropertyChanged?.Invoke(this,new(nameof(DomainParameters)));}}
 public DomainParameter[] DomainParameters {get;private set;}=[];
 public string DomainOutput {get;private set;}="";
 public ICommand DomainExecuteCommand=>new UiCommand(async()=>{
  if(SelectedOperation is not {} o)return;
  try{await Run("domain",new{id=o.Id,args=DomainParameters.Select(p=>p.Value()).ToArray(),settings=Settings()});}catch(Exception e){Fail(e.Message);}
 });
 void ApplyDomain(JsonElement info){
  if(allOperations.Length==0&&info.TryGetProperty("domainSchema",out var schema)){
   allOperations=schema.EnumerateArray().Select(o=>new DomainOperation(o.GetProperty("id").GetString()!,o.GetProperty("group").GetString()!,o.GetProperty("name").GetString()!,o.GetProperty("readOnly").GetBoolean(),o.GetProperty("parameters").Clone())).ToArray();SelectedOperation=DomainOperations.FirstOrDefault();
  }
  if(info.TryGetProperty("domainResult",out var result)&&result.ValueKind!=JsonValueKind.Null)DomainOutput=result.ValueKind==JsonValueKind.String?result.GetString()!:JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true,Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping});
 }
}
