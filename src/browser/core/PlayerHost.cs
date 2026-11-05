using System.Collections;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using TEdit.Common;
using TEdit.Terraria.Player;
public static partial class WorkerCore {
 static PlayerCharacter? player;
 static string playerName="player.plr";
 static readonly Dictionary<string,(object Owner,PropertyInfo? Property,int Index)> playerFields=[];
 [JSExport] public static string OpenPlayer(byte[] plain,string name){
  if(plain.Length<8||plain.Length>8*1024*1024)throw new InvalidDataException("玩家文件长度无效");
  using var input=new MemoryStream(plain);var candidate=PlayerFile.Load(input);
  if(candidate.Version<1||candidate.Version>PlayerConstants.CurrentVersion)throw new InvalidDataException("玩家版本尚不支持");
  player=candidate;playerName=Path.GetFileName(name);return PlayerInfo();
 }
 [JSExport] public static string PlayerInfo(){
  if(player==null)return "{}";playerFields.Clear();var fields=new List<object>();
  static bool Scalar(Type t)=>t==typeof(string)||t==typeof(bool)||t==typeof(byte)||t==typeof(short)||t==typeof(int)||t==typeof(uint)||t==typeof(long)||t==typeof(ulong)||t==typeof(float)||t==typeof(double)||t==typeof(TEditColor);
  void Add(string path,object owner,PropertyInfo? property,int index,Type type,object? value){
   if(path is "Version" or "FileRevision" or "LastSaveTime")return;
   if(property!=null&&property.SetMethod?.IsPublic!=true)return;
   playerFields[path]=(owner,property,index);
   object? text=value is TEditColor c?$"#{c.R:X2}{c.G:X2}{c.B:X2}":value is long or ulong?value.ToString():value;
   fields.Add(new{path,type=type==typeof(TEditColor)?"Color":type.Name,value=text});
  }
  void Walk(string path,object node,int depth){if(depth>5||fields.Count>12000)return;
   foreach(var p in node.GetType().GetProperties(BindingFlags.Instance|BindingFlags.Public).Where(p=>p.CanRead&&p.GetIndexParameters().Length==0)){
    string key=path.Length==0?p.Name:path+"."+p.Name;var value=p.GetValue(node);if(Scalar(p.PropertyType)){Add(key,node,p,-1,p.PropertyType,value);continue;}
    if(value is IList list){for(int i=0;i<list.Count;i++){var item=list[i];if(item==null)continue;string itemKey=key+"["+i+"]";if(Scalar(item.GetType()))Add(itemKey,list,null,i,item.GetType(),item);else Walk(itemKey,item,depth+1);}}
    else if(value!=null&&value.GetType().Namespace==typeof(PlayerCharacter).Namespace)Walk(key,value,depth+1);
   }
  }
  Walk("",player,0);
  foreach(var id in new[]{TEdit.Terraria.CreativePowerId.godmode,TEdit.Terraria.CreativePowerId.increaseplacementrange})fields.Add(new{path="JourneyPowers."+id,type="Boolean",value=(object)(player.JourneyPowers.GetPowerBool(id)??false)});
  return JsonSerializer.Serialize(new{name=player.Name,file=playerName,version=player.Version,fields,research=player.CreativeSacrifices});
 }
 [JSExport] public static string EditPlayer(string json){
  if(player==null)throw new InvalidOperationException("请先打开玩家文件");var revision=player.FileRevision;var backup=SavePlayer();
  try{using var doc=JsonDocument.Parse(json);foreach(var entry in doc.RootElement.GetProperty("values").EnumerateObject()){
   if(entry.Name.StartsWith("JourneyPowers.")){if(!Enum.TryParse<TEdit.Terraria.CreativePowerId>(entry.Name[14..],out var power)||power is not (TEdit.Terraria.CreativePowerId.godmode or TEdit.Terraria.CreativePowerId.increaseplacementrange))throw new ArgumentException("玩家旅途能力无效");player.JourneyPowers.SetPowerState(new TEdit.Terraria.CreativePowerArgs{Id=power,IsActive=entry.Value.GetBoolean()});continue;}
   if(!playerFields.TryGetValue(entry.Name,out var field))throw new ArgumentException("玩家字段不存在");
   Type t=field.Property?.PropertyType??((IList)field.Owner)[field.Index]!.GetType();object? value;
   if(t==typeof(TEditColor)){string hex=entry.Value.GetString()!;if(hex.Length!=7||hex[0]!='#')throw new ArgumentException("颜色格式为 #RRGGBB");value=new TEditColor(Convert.ToByte(hex[1..3],16),Convert.ToByte(hex[3..5],16),Convert.ToByte(hex[5..7],16));}
   else if(t==typeof(long))value=long.Parse(entry.Value.GetString()!);else if(t==typeof(ulong))value=ulong.Parse(entry.Value.GetString()!);else value=JsonSerializer.Deserialize(entry.Value.GetRawText(),t);
   if(value is double d&&!double.IsFinite(d)||value is float f&&!float.IsFinite(f))throw new ArgumentException("数值无效");
   if(field.Property!=null)field.Property.SetValue(field.Owner,value);else ((IList)field.Owner)[field.Index]=value;
  }
  if(doc.RootElement.TryGetProperty("research",out var research)){var next=JsonSerializer.Deserialize<Dictionary<string,int>>(research)!;if(next.Count>20000||next.Any(e=>e.Value<0))throw new ArgumentException("研究数据无效");player.CreativeSacrifices=next;}
  return PlayerInfo();
  }catch{using var ms=new MemoryStream(backup);player=PlayerFile.Load(ms);player.FileRevision=revision;PlayerInfo();throw;}
 }
 [JSExport] public static byte[] SavePlayer(){if(player==null)throw new InvalidOperationException("请先打开玩家文件");using var output=new MemoryStream();PlayerFile.Save(output,player);return output.ToArray();}
 [JSExport] public static byte[] PreviewPlayer(string json){
  if(player==null)throw new InvalidOperationException("请先打开玩家文件");var original=player;var backup=SavePlayer();
  try{using var input=new MemoryStream(backup);player=PlayerFile.Load(input);player.FileRevision=original.FileRevision;PlayerInfo();EditPlayer(json);return SavePlayer();}
  finally{player=original;PlayerInfo();}
 }
}
