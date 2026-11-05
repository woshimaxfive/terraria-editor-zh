using System.Text.Json;
using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed partial class Session {
 // Keep the original JSON API for existing native callers. The browser reads UTF-8 chunks.
 public string RenderSceneJson(string json)=>JsonSerializer.Serialize(CreateRenderScene(json),RenderJson);
 public RenderSceneTransfer StreamRenderPacket(string json)=>new(CreateRenderScene(json),RenderJson);
 public CheckpointFile StreamRenderScene(string json){
  var scene=CreateRenderScene(json);
  string path=Path.Combine(Path.GetTempPath(),"render-scene-"+Guid.NewGuid().ToString("N")+".json");
  try{using(var output=File.Create(path))JsonSerializer.Serialize(output,scene,RenderJson);return new CheckpointFile(path);}
  catch{if(File.Exists(path))File.Delete(path);throw;}
 }
}
