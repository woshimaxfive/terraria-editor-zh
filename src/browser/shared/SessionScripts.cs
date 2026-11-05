using System.Text.Json;
using TEdit.Scripting.Api;
using TEdit.Scripting.Engine;
namespace TEdit.Port;
public sealed partial class Session {
 public object? ScriptOutcome {get;private set;}
 public List<(string Name,byte[] Bytes)> ScriptDeliveries {get;}=[];
 public async Task RunScriptAsync(string language,string code,int timeoutMs=10000){
  RequireWorld();if(replayPlayer!=null)throw new InvalidOperationException("先将当前回放帧设为编辑起点");
  if(code.Length>262144||timeoutMs<50||timeoutMs>300000)throw new ArgumentException("脚本长度或超时设置无效");
  var logs=new List<object>();var found=new List<object>();object? navigate=null;int logChars=0;
  void Log(string level,string message){if(logs.Count>=1000||logChars>=131072)return;message=message[..Math.Min(message.Length,4096)];logChars+=message.Length;logs.Add(new{level,message});}
  var context=new ScriptExecutionContext{TimeoutMs=timeoutMs,OnLog=s=>Log("info",s),OnWarn=s=>Log("warning",s),OnError=s=>Log("error",s),OnProgress=p=>OperationProgress.Advance(),OnFindClear=()=>found.Clear(),OnFindResult=(name,x,y,type,detail)=>{if(found.Count<1000)found.Add(new{type,x,y,name,detail});},OnFindNavigate=i=>{if(i>=0&&i<found.Count){var p=JsonSerializer.SerializeToElement(found[i]);navigate=found[i];OriginX=Math.Max(0,p.GetProperty("x").GetInt32()-MapWidth/2);OriginY=Math.Max(0,p.GetProperty("y").GetInt32()-MapHeight/2);}}};
  ScriptDeliveries.Clear();vm!.ScriptDownloads.Clear();vm.ScriptCopySelection=()=>{var a=vm.Selection.SelectionArea;if(vm.Selection.IsActive)CopyRegion(a.X,a.Y,a.Width,a.Height);};
  using var api=new ScriptApi(vm,context);api.BeginExecution();
  ScriptResult result=language switch {"js"=>new JintScriptEngine().Execute(code,api,context),"lua"=>await new LuaScriptEngine().ExecuteAsync(code,api,context),_=>throw new ArgumentException("请选择 JavaScript 或 Lua")};
  ScriptOutcome=new{success=result.Success,error=result.Error,elapsedMs=result.ElapsedMs,logs,found,navigate,downloads=vm.ScriptDownloads.Select(d=>new{name=d.Name,version=d.Version}).ToArray()};
  if(!result.Success){vm.ScriptDownloads.Clear();throw new InvalidOperationException(result.Error);}
  // The browser must be able to restore every successful command's state.
  // Original SelectionApi includes its end point and can leave an out-of-world rectangle.
  try{ValidateToolState((JsonElement)CaptureToolState());}
  catch(ArgumentException error){vm.ScriptDownloads.Clear();throw new InvalidOperationException("脚本留下了无效工具状态："+error.Message,error);}
  api.EndExecution();
  if(vm.ScriptDownloads.Count>0){
   foreach(var entry in vm.ScriptDownloads){var saved=entry.Files;ScriptDeliveries.Add((saved.Sidecar==null?entry.Name:Path.ChangeExtension(entry.Name,".zip"),saved.Sidecar==null?saved.World:Files.WorldFilePackage.PackPair(saved.World,saved.Sidecar,entry.Name)));}
   vm.ScriptDownloads.Clear();
  }
  Notify();
 }
}
