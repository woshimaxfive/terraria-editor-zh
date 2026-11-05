using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
namespace TEditBrowser;
public partial class MainView {
 async void ObjectCommand(string page,string group,string method,params object?[] args){try{await Current.CallDomain(group,method,args);await Current.Run("desktopRead",new{page});}catch(Exception ex){Current.Fail(ex.Message);}}
 Control ObjectEditor(string page,JsonElement item){
  var panel=new StackPanel{Spacing=5};int x=(int)item.GetProperty("x").GetDouble(),y=(int)item.GetProperty("y").GetDouble();
  if(page=="chests"){
   var name=new TextBox{Text=item.GetProperty("name").GetString(),Watermark="箱子名称"};panel.Children.Add(name);panel.Children.Add(Button("保存名称",()=>ObjectCommand(page,"chest","SetName",x,y,name.Text??"")));
   panel.Children.Add(Button("清空箱子",()=>ObjectCommand(page,"objects","ClearChest",x,y)));
   foreach(var slot in item.GetProperty("items").EnumerateArray())panel.Children.Add(ItemEditor(slot,values=>ObjectCommand(page,"chest","SetItem",x,y,slot.GetProperty("slot").GetInt32(),values["id"]!.GetValue<int>(),values["stack"]!.GetValue<int>(),values["prefix"]!.GetValue<int>())));
  }else if(page=="signs"){
   var text=new TextBox{Text=item.GetProperty("text").GetString(),AcceptsReturn=true,TextWrapping=Avalonia.Media.TextWrapping.Wrap,MinHeight=100};panel.Children.Add(text);panel.Children.Add(Button("保存告示牌",()=>ObjectCommand(page,"sign","SetText",x,y,text.Text??"")));
  }else if(page=="npc"){
   var preview=new Image{Width=48,Height=48};panel.Children.Add(preview);
   var values=new JsonObject();foreach(string key in new[]{"displayName","homeX","homeY","isHomeless","variant","shimmered","partying"})values[key]=JsonNode.Parse(item.GetProperty(key).GetRawText());
   foreach(var (key,label,type) in new[]{("displayName","名称","String"),("homeX","住房 X","Int32"),("homeY","住房 Y","Int32"),("isHomeless","无住房","Boolean"),("variant","变体","Int32"),("shimmered","微光形态","Boolean"),("partying","派对","Boolean")}){
    if(key=="shimmered"&&!item.GetProperty("canShimmer").GetBoolean())continue;
    panel.Children.Add(Field(label,item.GetProperty(key),type,v=>{values[key]=v;if(key=="variant"&&v is JsonValue node&&node.TryGetValue<int>(out int variant))_=LoadThumbnail(preview,"npc",item.GetProperty("spriteId").GetInt32(),variant);}));
   }
   _=LoadThumbnail(preview,"npc",item.GetProperty("spriteId").GetInt32(),item.GetProperty("variant").GetInt32());
   int index=item.GetProperty("index").GetInt32();panel.Children.Add(Button("保存 NPC",()=>_=Current.Run("desktopEdit",new{page,index,values})));
   panel.Children.Add(Button("移除此 NPC",()=>ObjectCommand(page,"npc","Remove",item.GetProperty("name").GetString()!)));
  }else if(page=="entity"){
   string type=item.GetProperty("type").GetString()!;
   if(item.TryGetProperty("fields",out var scalar)){var values=new JsonObject();var form=new StackPanel();foreach(var f in scalar.EnumerateArray()){string key=f.GetProperty("name").GetString()!;form.Children.Add(Field(key,f.GetProperty("value"),f.GetProperty("type").GetString()!,v=>values[key]=v));}form.Children.Add(Button("保存实体属性",()=>_=Current.Run("desktopEdit",new{page,x,y,values})));panel.Children.Add(new Expander{Header="实体属性",Content=form});}
   foreach(string section in new[]{"equipment","dyes","items"})if(item.TryGetProperty(section,out var items))foreach(var slot in items.EnumerateArray()){
    var copy=slot.Clone();string method=type=="HatRack"?(section=="dyes"?"SetHatRackDye":"SetHatRackItem"):(section=="dyes"?"SetDye":"SetEquipment");
    panel.Children.Add(ItemEditor(copy,values=>ObjectCommand(page,"entity",method,x,y,copy.GetProperty("slot").GetInt32(),values["id"]!.GetValue<int>(),values["prefix"]!.GetValue<int>()),section));
   }
   if(item.TryGetProperty("weapon",out var weapon)&&weapon.ValueKind==JsonValueKind.Object)panel.Children.Add(ItemEditor(weapon,values=>ObjectCommand(page,"entity","SetWeapon",x,y,values["id"]!.GetValue<int>(),values["prefix"]!.GetValue<int>()),"武器"));
   if(item.TryGetProperty("pose",out var pose)){int value=pose.GetInt32();panel.Children.Add(Field("姿势",pose,"Int32",v=>value=v!.GetValue<int>()));panel.Children.Add(Button("保存姿势",()=>ObjectCommand(page,"entity","SetPose",x,y,value)));}
   if(item.TryGetProperty("itemId",out var id)){
    var row=new JsonObject{["slot"]=0,["id"]=id.GetInt32(),["name"]="物品",["prefix"]=item.TryGetProperty("prefix",out var prefix)?prefix.GetInt32():0,["stack"]=item.TryGetProperty("stack",out var stack)?stack.GetInt32():1};
    panel.Children.Add(ItemEditor(JsonSerializer.SerializeToElement(row),values=>{if(type is "KiteAnchor" or "CritterAnchor")_=Current.Run("desktopEdit",new{page,x,y,values=new{NetId=values["id"]!.GetValue<int>()}});else ObjectCommand(page,"entity","SetItem",x,y,values["id"]!.GetValue<int>(),values["prefix"]!.GetValue<int>(),values["stack"]!.GetValue<int>());}));
   }
   if(item.TryGetProperty("logicCheck",out var logic)){int value=logic.GetInt32();bool on=item.GetProperty("on").GetBoolean();panel.Children.Add(Field("逻辑条件",logic,"Int32",v=>value=v!.GetValue<int>()));panel.Children.Add(Field("开启",item.GetProperty("on"),"Boolean",v=>on=v!.GetValue<bool>()));panel.Children.Add(Button("保存传感器",()=>ObjectCommand(page,"entity","SetLogicSensor",x,y,value,on)));}
   if(item.TryGetProperty("npc",out var npc)){int value=npc.GetInt32();panel.Children.Add(Field("NPC ID",npc,"Int32",v=>value=v!.GetValue<int>()));panel.Children.Add(Button("保存训练假人",()=>ObjectCommand(page,"entity","SetTrainingDummyNpc",x,y,value)));}
  }return panel;
 }
 Control ItemEditor(JsonElement item,Action<JsonObject> save,string section="物品"){
  var values=new JsonObject();foreach(string key in new[]{"id","stack","prefix"})values[key]=item.GetProperty(key).GetInt32();
  var panel=new StackPanel{Spacing=4};if(item.GetProperty("id").GetInt32()>0){var preview=new Image{Width=24,Height=24};panel.Children.Add(preview);_=LoadThumbnail(preview,"item",item.GetProperty("id").GetInt32());}foreach(var (key,label) in new[]{("id","物品 ID"),("stack","数量"),("prefix","前缀")})panel.Children.Add(Field(label,item.GetProperty(key),"Int32",value=>values[key]=value));panel.Children.Add(Button("保存物品",()=>save(values)));
  return new Expander{Header=$"{section} {item.GetProperty("slot")} · {DesktopLanguage.Name(item.GetProperty("name").GetString()??"")}",Content=panel,HorizontalAlignment=HorizontalAlignment.Stretch};
 }
}
