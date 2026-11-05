using System.Reflection;
using System.Text.Json;
using TEdit.Scripting.Api;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed partial class Session {
 public object? DesktopResult {get;private set;}
 public string DesktopSessionId {get;private set;}=Guid.NewGuid().ToString("N");
 static object Fields(object target)=>target.GetType().GetProperties().Where(p=>p.CanRead&&p.SetMethod?.IsPublic==true&&ParameterSupported(p.PropertyType)&&!p.PropertyType.IsArray&&(target is not WorldInfoApi||EditableWorldProperty(p))).Select(p=>{var value=p.GetValue(target);return new{name=p.Name,type=p.PropertyType.Name,value=value is long or ulong?value.ToString():value};}).ToArray();
 public void ImportDesktopData(string page,byte[] bytes){RequireWorld();if(replayPlayer!=null)throw new InvalidOperationException("先将回放设为编辑起点");if(bytes.Length>256*1024*1024)throw new ArgumentException("导入世界超过256MiB");if(page=="bestiary")OriginalMetadataImport.ImportKillsAndBestiaryBytes(World!,bytes);else if(page=="banners")OriginalMetadataImport.ImportBannersBytes(World!,bytes);else throw new ArgumentException("导入类型无效");vm!.UndoManager.SaveUndo();DesktopRead(page);Notify();}
 public void DesktopRead(string page){
  RequireWorld();var w=World!;
  DesktopResult=new{page,data=page switch {
   "world"=>Fields(new WorldInfoApi(w)),
   "chests"=>new ChestApi(w).GetAll(),
   "signs"=>new SignApi(w).GetAll(),
   "npc"=>NpcRows(),
   "entity"=>EntityRows(),
   "analysis"=>(object)TEdit.Editor.WorldAnalysis.AnalyzeWorld(w),
   "bestiary"=>BestiaryRows(),
   "banners"=>w.ClaimableBanners.Select((count,index)=>new{index,count,name=WorldConfiguration.TallyNames.GetValueOrDefault(index,"旗帜 "+index),kills=index<w.KilledMobs.Count?w.KilledMobs[index]:0}).ToArray(),
   "creative"=>Enum.GetValues<CreativePowerId>().Where(p=>p is not (CreativePowerId.godmode or CreativePowerId.increaseplacementrange)).Select(p=>new{name=p.ToString(),type=p is CreativePowerId.time_setspeed or CreativePowerId.setdifficulty or CreativePowerId.setspawnrate?"float":"bool",value=p is CreativePowerId.time_setspeed or CreativePowerId.setdifficulty or CreativePowerId.setspawnrate?(object?)w.CreativePowers.GetPowerFloat(p):w.CreativePowers.GetPowerBool(p)}).ToArray(),
   "nbt"=>NbtRows(w.TwldData?.RawTag),
   _=>throw new ArgumentException("侧栏不存在")}};
 }
 object[] EntityRows(){var rows=new TileEntityApi(World!).GetAll();foreach(var row in rows){var entity=World!.GetTileEntityAtTile((int)row["x"],(int)row["y"]);row["fields"]=Fields(entity);}return rows.Cast<object>().ToArray();}
 object[] BestiaryRows(){var b=World!.Bestiary;return WorldConfiguration.BestiaryData.BestiaryKilledIDs.Union(WorldConfiguration.BestiaryData.BestiaryNearIDs).Union(WorldConfiguration.BestiaryData.BestiaryTalkedIDs).Distinct().OrderBy(e=>e).Select(name=>(object)new{name,kills=b.NPCKills.GetValueOrDefault(name),near=b.NPCNear.Contains(name),talked=b.NPCChat.Contains(name),canKill=WorldConfiguration.BestiaryData.BestiaryKilledIDs.Contains(name),canNear=WorldConfiguration.BestiaryData.BestiaryNearIDs.Contains(name),canTalk=WorldConfiguration.BestiaryData.BestiaryTalkedIDs.Contains(name)}).ToArray();}
 object[] NpcRows()=>World!.NPCs.Select((n,index)=>{WorldConfiguration.NpcById.TryGetValue(n.SpriteId,out var data);var row=new TEdit.ViewModel.NpcListItem(n.SpriteId,n.Name,data?.Variants,data?.CanShimmer??false){World=World,WorldNpc=n};return (object)new{index,name=n.Name,displayName=n.DisplayName,spriteId=n.SpriteId,x=n.Position.X,y=n.Position.Y,homeX=n.Home.X,homeY=n.Home.Y,isHomeless=n.IsHomeless,variant=row.VariantIndex,variants=row.AvailableVariants??[],canShimmer=row.CanShimmer,shimmered=row.IsShimmered,partying=row.IsPartying};}).ToArray();
 static object[] NbtRows(object? value){
  int count=0;object Node(string name,object? item,int depth){count++;var children=new List<object>();string text=item?.ToString()??"";
   if(count<10000&&depth<32&&item is System.Collections.IDictionary dict){foreach(System.Collections.DictionaryEntry p in dict){if(count>=10000)break;children.Add(Node(p.Key.ToString()!,p.Value,depth+1));}text=$"{dict.Count} 项";}
   else if(count<10000&&depth<32&&item is System.Collections.IList list){for(int i=0;i<list.Count&&count<10000;i++)children.Add(Node(i.ToString(),list[i],depth+1));text=$"{list.Count} 项";}
   return new{name,type=item?.GetType().Name??"空",value=text.Length>2048?text[..2048]+"…":text,children};
  }return value==null?[]:[Node("root",value,0)];
 }
 public void DesktopEdit(JsonElement p){
  RequireWorld();if(replayPlayer!=null)throw new InvalidOperationException("先将当前回放帧设为编辑起点");string page=p.GetProperty("page").GetString()!;
  if(p.TryGetProperty("operation",out var operation)){
   string action=operation.GetString()!;
   if(page=="banners"&&action is "max" or "reset"){for(int i=0;i<World!.ClaimableBanners.Count;i++)World.ClaimableBanners[i]=(ushort)(action=="max"?9999:0);}
   else if(page=="bestiary"&&action=="complete"){var edits=new Bestiary();foreach(string id in WorldConfiguration.BestiaryData.BestiaryKilledIDs)edits.NPCKills[id]=Math.Max(150,World!.Bestiary.NPCKills.GetValueOrDefault(id));foreach(string id in WorldConfiguration.BestiaryData.BestiaryTalkedIDs)edits.NPCChat.Add(id);foreach(string id in WorldConfiguration.BestiaryData.BestiaryNearIDs)edits.NPCNear.Add(id);World!.Bestiary=edits;}
   else if(page=="bestiary"&&action=="reset"){World!.Bestiary=new Bestiary();World.KilledMobs.Clear();}
   else if(page=="bestiary"&&action=="tally"){for(int i=0;i<World!.KilledMobs.Count;i++)World.KilledMobs[i]=0;foreach(var item in World.Bestiary.NPCKills)if(WorldConfiguration.BestiaryData.NpcData.TryGetValue(item.Key,out var npc)&&npc.BannerId>=0&&npc.BannerId<World.KilledMobs.Count)World.KilledMobs[npc.BannerId]+=item.Value;}
   else throw new ArgumentException("侧栏操作无效");
   vm!.UndoManager.SaveUndo();DesktopRead(page);Notify();return;
  }
  if(page=="world"){
   var api=new WorldInfoApi(World!);var parsed=new List<(PropertyInfo,object?)>();
   foreach(var entry in p.GetProperty("values").EnumerateObject()){
    var property=api.GetType().GetProperty(entry.Name);if(property==null||!EditableWorldProperty(property))throw new ArgumentException("世界属性不可编辑");
    var value=ParseArgument(entry.Value,property.PropertyType);
    if(property.Name is "SpawnX" or "DungeonX"&&value is int x&&(x<0||x>=World!.TilesWide)||property.Name is "SpawnY" or "DungeonY"&&value is int y&&(y<0||y>=World!.TilesHigh))throw new ArgumentException("世界点位超出范围");
    parsed.Add((property,value));
   }
   foreach(var (property,value) in parsed)property.SetValue(api,value);
  }else if(page=="entity"){
   int x=p.GetProperty("x").GetInt32(),y=p.GetProperty("y").GetInt32();var target=World!.GetTileEntityAtTile(x,y)??throw new ArgumentException("实体不存在");var changes=new List<(PropertyInfo,object?)>();
   foreach(var entry in p.GetProperty("values").EnumerateObject()){var property=target.GetType().GetProperty(entry.Name);if(property==null||!property.CanRead||property.SetMethod?.IsPublic!=true||!ParameterSupported(property.PropertyType)||property.PropertyType.IsArray)throw new ArgumentException("实体属性不可编辑");var value=ParseArgument(entry.Value,property.PropertyType);if(property.Name is "PosX" or "PosY"){int coordinate=Convert.ToInt32(value);if(coordinate<0||coordinate>=(property.Name=="PosX"?World.TilesWide:World.TilesHigh))throw new ArgumentException("实体坐标越界");}changes.Add((property,value));}
   foreach(var (property,value) in changes)property.SetValue(target,value);
  }else if(page=="npc"){
   int index=p.GetProperty("index").GetInt32();if(index<0||index>=World!.NPCs.Count)throw new ArgumentException("NPC不存在");var npc=World.NPCs[index];var values=p.GetProperty("values");
   int hx=values.GetProperty("homeX").GetInt32(),hy=values.GetProperty("homeY").GetInt32();if(hx<0||hy<0||hx>=World.TilesWide||hy>=World.TilesHigh)throw new ArgumentException("NPC住房点位无效");
   WorldConfiguration.NpcById.TryGetValue(npc.SpriteId,out var data);var row=new TEdit.ViewModel.NpcListItem(npc.SpriteId,npc.Name,data?.Variants,data?.CanShimmer??false){World=World,WorldNpc=npc};
   npc.DisplayName=values.GetProperty("displayName").GetString()!;npc.Home.X=hx;npc.Home.Y=hy;npc.IsHomeless=values.GetProperty("isHomeless").GetBoolean();
   row.VariantIndex=values.GetProperty("variant").GetInt32();if(row.CanShimmer)row.IsShimmered=values.GetProperty("shimmered").GetBoolean();row.IsPartying=values.GetProperty("partying").GetBoolean();
  }else if(page=="bestiary"){
   var rows=p.GetProperty("values").EnumerateArray().ToArray();var b=World!.Bestiary;
   foreach(var row in rows){string name=row.GetProperty("name").GetString()!;int kills=row.GetProperty("kills").GetInt32();if(kills<0||kills>int.MaxValue/1000)throw new ArgumentException("击杀数超出范围");
    if(WorldConfiguration.BestiaryData.BestiaryKilledIDs.Contains(name))b.NPCKills[name]=kills;
    if(WorldConfiguration.BestiaryData.BestiaryNearIDs.Contains(name)){if(row.GetProperty("near").GetBoolean())b.NPCNear.Add(name);else b.NPCNear.Remove(name);}
    if(WorldConfiguration.BestiaryData.BestiaryTalkedIDs.Contains(name)){if(row.GetProperty("talked").GetBoolean())b.NPCChat.Add(name);else b.NPCChat.Remove(name);}
   }
  }else if(page=="banners"){
   foreach(var row in p.GetProperty("values").EnumerateArray()){int i=row.GetProperty("index").GetInt32(),value=row.GetProperty("count").GetInt32();if(i<0||i>=World!.ClaimableBanners.Count||value<0||value>9999)throw new ArgumentException("旗帜数无效");World.ClaimableBanners[i]=(ushort)value;}
  }else if(page=="creative"){
   foreach(var row in p.GetProperty("values").EnumerateArray()){
    if(!Enum.TryParse<CreativePowerId>(row.GetProperty("name").GetString(),out var id)||!Enum.IsDefined(id)||id is CreativePowerId.godmode or CreativePowerId.increaseplacementrange)throw new ArgumentException("旅途能力无效");
    var value=row.GetProperty("value");if(id is CreativePowerId.time_setspeed or CreativePowerId.setdifficulty or CreativePowerId.setspawnrate){float? number=value.ValueKind==JsonValueKind.Null?null:value.GetSingle();if(number.HasValue&&(!float.IsFinite(number.Value)||number<0||number>1))throw new ArgumentException("旅途能力必须为0至1");if(number.HasValue)World!.CreativePowers.SetPowerState(new CreativePowerArgs{Id=id,Value=number.Value});}
    else World!.CreativePowers.SetPowerState(new CreativePowerArgs{Id=id,IsActive=value.ValueKind!=JsonValueKind.Null&&value.GetBoolean()});
   }
  }else throw new ArgumentException("侧栏写入无效");
  vm!.UndoManager.SaveUndo();DesktopRead(page);Notify();
 }
}
