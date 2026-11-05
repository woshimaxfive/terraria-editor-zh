using System.Reflection;
using System.Text.Json;
using TEdit.Editor;
using TEdit.Scripting.Api;
namespace TEdit.Port;

public sealed partial class Session {
 public object? DomainResult {get;private set;}
 Dictionary<string,object>? domainApis;
 Dictionary<string,object> DomainApis=>domainApis??=new(){["selection"]=new SelectionApi(vm!,this),["spriteFrames"]=new SpriteFramesApi(this),["objects"]=new ObjectCommandsApi(vm!,this),["worldExtra"]=new WorldAuxApi(vm!),["plugin"]=new BrowserPluginApi(vm!,this),["chest"]=new ChestApi(World!),["sign"]=new SignApi(World!),["entity"]=new TileEntityApi(World!),["npc"]=new NpcApi(World!),["world"]=new WorldInfoApi(World!),["metadata"]=new MetadataApi(),["generate"]=new GenerateApi(World!,vm!.UndoManager,vm.Selection)};
 static bool ParameterSupported(Type t)=>t==typeof(string)||t==typeof(bool)||t==typeof(byte)||t==typeof(short)||t==typeof(int)||t==typeof(uint)||t==typeof(long)||t==typeof(ulong)||t==typeof(float)||t==typeof(double)||(t.IsArray&&ParameterSupported(t.GetElementType()!));
 static MethodInfo[] ApiMethods(Type type)=>type.GetMethods(BindingFlags.Instance|BindingFlags.Public|BindingFlags.DeclaredOnly).Where(m=>!m.IsSpecialName&&m.GetParameters().All(p=>ParameterSupported(p.ParameterType))).OrderBy(m=>m.Name).ThenBy(m=>m.GetParameters().Length).ToArray();
 static readonly Dictionary<string,Type> ApiTypes=new(){["selection"]=typeof(SelectionApi),["spriteFrames"]=typeof(SpriteFramesApi),["objects"]=typeof(ObjectCommandsApi),["worldExtra"]=typeof(WorldAuxApi),["plugin"]=typeof(BrowserPluginApi),["chest"]=typeof(ChestApi),["sign"]=typeof(SignApi),["entity"]=typeof(TileEntityApi),["npc"]=typeof(NpcApi),["world"]=typeof(WorldInfoApi),["metadata"]=typeof(MetadataApi),["generate"]=typeof(GenerateApi)};
 static bool ReadOnlyMethod(string group,string method)=>group=="metadata"||method.StartsWith("Get")||method.StartsWith("Find")||method.StartsWith("List");
 static bool ReplayControl(string name)=>name is "SeekReplay" or "AdoptReplayFrame" or "ConfigureReplay" or "PlayReplay" or "PauseReplay" or "TickReplay" or "StepReplay" or "SeekReplayTime";
 static bool EditableWorldProperty(PropertyInfo p)=>p.CanRead&&p.SetMethod?.IsPublic==true&&ParameterSupported(p.PropertyType)&&p.Name is not ("IsConsole" or "FileRevision");
 public object DomainSchema(){
  var schema=new List<object>();
  foreach(var (group,type) in ApiTypes){
   var methods=ApiMethods(type);
   for(int index=0;index<methods.Length;index++){
    var m=methods[index];schema.Add(new{id=$"{group}.{index}",group,name=m.Name,readOnly=ReadOnlyMethod(group,m.Name),parameters=m.GetParameters().Select(p=>new{name=p.Name,type=p.ParameterType.Name,value=p.HasDefaultValue?p.DefaultValue:p.ParameterType==typeof(string)?"":p.ParameterType==typeof(bool)?(object)false:p.ParameterType.IsArray?Array.CreateInstance(p.ParameterType.GetElementType()!,0):(object)0}).ToArray()});
   }
   foreach(var p in type.GetProperties().Where(EditableWorldProperty))schema.Add(new{id=$"{group}.set.{p.Name}",group,name="设置 "+p.Name,readOnly=false,parameters=new[]{new{name="value",type=p.PropertyType.Name,value=p.PropertyType==typeof(string)?(object)"":p.PropertyType==typeof(bool)?(object)false:(object)0}}});
  }
  foreach(var (id,name,readOnly) in new[]{("world.inspect","读取世界全部属性",true),("world.analysis","原版完整世界统计",true),("world.replace","按当前工具与掩码替换选区",false),("world.replaceAll","按当前工具与掩码替换全世界",false)})schema.Add(new{id,group="world",name,readOnly,parameters=Array.Empty<object>()});
  return schema.ToArray();
 }

 static object? ParseArgument(JsonElement input,Type type){
  if(input.ValueKind==JsonValueKind.String&&type==typeof(ulong))return ulong.Parse(input.GetString()!,System.Globalization.CultureInfo.InvariantCulture);
  if(input.ValueKind==JsonValueKind.String&&type==typeof(long))return long.Parse(input.GetString()!,System.Globalization.CultureInfo.InvariantCulture);
  object? value=JsonSerializer.Deserialize(input.GetRawText(),type);
  if(value is string s&&s.Length>16000)throw new ArgumentException("文字超过16000字符");
  if(value is Array array&&array.Length>4096)throw new ArgumentException("数组超过4096项");
  if(value is double d&&(!double.IsFinite(d)||Math.Abs(d)>1000000)||value is float f&&(!float.IsFinite(f)||Math.Abs(f)>1000000))throw new ArgumentException("数值无效或超出工作预算");
  return value;
 }
 public bool ExecuteDomain(JsonElement request){
  RequireWorld();if(request.TryGetProperty("settings",out var uiSettings)&&uiSettings.TryGetProperty("toolState",out var uiTools))RestoreToolState(uiTools);string id=request.GetProperty("id").GetString()??"";int before=UndoIndex;bool stateChanged=false;
  if(replayPlayer!=null&&(id.StartsWith("world.set.")||id=="world.replace"||id=="world.replaceAll"))throw new InvalidOperationException("先将当前回放帧设为编辑起点");
  if(id=="world.inspect"){var api=DomainApis["world"];DomainResult=api.GetType().GetProperties().Where(p=>p.CanRead).ToDictionary(p=>p.Name,p=>p.GetValue(api));return false;}
  if(id=="world.analysis"){DomainResult=WorldAnalysis.AnalyzeWorld(World!);return false;}
  if(id is "world.replace" or "world.replaceAll"){
   if(request.TryGetProperty("settings",out var settings))RestoreToolState(settings.GetProperty("toolState"));
   bool selectionOnly=id=="world.replace";var area=vm!.Selection.SelectionArea;if(selectionOnly&&!vm.Selection.IsActive)throw new ArgumentException("请先选择替换区域");
   DomainResult=vm.WorldEditor.ReplaceAll(selectionOnly);vm.UndoManager.SaveUndo();return before!=UndoIndex;
  }
  var pieces=id.Split('.');if(pieces.Length<2||!ApiTypes.TryGetValue(pieces[0],out var type))throw new ArgumentException("领域操作无效");
  var args=request.GetProperty("args").EnumerateArray().ToArray();object apiObject=DomainApis[pieces[0]];
  if(pieces.Length==3&&pieces[1]=="set"){
   var p=type.GetProperty(pieces[2]);if(p==null||!EditableWorldProperty(p)||args.Length!=1)throw new ArgumentException("世界属性不可编辑");
   var value=ParseArgument(args[0],p.PropertyType);
   if(p.Name is "SpawnX" or "DungeonX"&&value is int x&&(x<0||x>=World!.TilesWide)||p.Name is "SpawnY" or "DungeonY"&&value is int y&&(y<0||y>=World!.TilesHigh))throw new ArgumentException("世界点位超出边界");
   p.SetValue(apiObject,value);DomainResult=new{property=p.Name,value=p.GetValue(apiObject)};
  }else{
   var methods=ApiMethods(type);if(pieces.Length!=2||!int.TryParse(pieces[1],out int index)||index<0||index>=methods.Length)throw new ArgumentException("领域操作不存在");
   var method=methods[index];var parameters=method.GetParameters();if(args.Length!=parameters.Length)throw new ArgumentException("参数数量无效");
   stateChanged=!ReadOnlyMethod(pieces[0],method.Name);
   if(replayPlayer!=null&&!ReadOnlyMethod(pieces[0],method.Name)&&!ReplayControl(method.Name))throw new InvalidOperationException("先将当前回放帧设为编辑起点");
   var values=parameters.Select((p,i)=>ParseArgument(args[i],p.ParameterType)).ToArray();
   if(pieces[0]=="generate")ValidateGeneration(method.Name,parameters,values);
   foreach(var parameter in parameters.Select((p,i)=>(Name:p.Name,Value:values[i])))if(parameter.Value is int number){
    if(parameter.Name is "x" or "homeX"&&(number<0||number>=World!.TilesWide)||parameter.Name is "y" or "homeY"&&(number<0||number>=World!.TilesHigh))throw new ArgumentException("对象坐标超出世界");
    if(parameter.Name is "prefix"&&(number<0||number>255)||parameter.Name is "stack"&&(number<0||number>32767)||parameter.Name is "slot"&&(number<0||number>39)||parameter.Name is "itemId" or "dyeId"&&(number<0||number>65535))throw new ArgumentException("物品参数超出范围");
   }
   try{DomainResult=method.Invoke(apiObject,values)??new{message="操作完成"};}catch(TargetInvocationException e)when(e.InnerException!=null){System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(e.InnerException).Throw();}
  }
  vm!.UndoManager.SaveUndo();return before!=UndoIndex||stateChanged;
 }
 void ValidateGeneration(string method,ParameterInfo[] parameters,object?[] args){
  long work=1;var numbers=parameters.Select((p,i)=>(p.Name,args[i])).Where(p=>p.Item2 is int or double).ToDictionary(p=>p.Name!,p=>Convert.ToDouble(p.Item2));
  foreach(var (name,value) in numbers)if(name is "w" or "h" or "width" or "height" or "size" or "strength" or "steps" or "count" or "maxDepth" or "oceanWidth"&&(value<0||value>4096))throw new ArgumentException("生成尺寸或次数超过工作预算");
  if(numbers.TryGetValue("w",out double w)&&numbers.TryGetValue("h",out double h))work=(long)w*(long)h;
  if(numbers.TryGetValue("strength",out double strength)&&numbers.TryGetValue("steps",out double steps))work=(long)(strength*strength*Math.Max(1,steps));
  if(work>WorldFiles.MaxWorldCells)throw new ArgumentException("生成参数超过20160000步预算");
 }
}
