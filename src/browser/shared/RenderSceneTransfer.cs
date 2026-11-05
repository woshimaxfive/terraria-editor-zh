using System.Text.Json;
using TEdit.Port.Rendering;
namespace TEdit.Port;

// Only the browser transport differs: the original scene and RGBA bytes remain intact.
public sealed class RenderSceneTransfer:IDisposable {
 readonly TextureUpload[] textures;
 CheckpointFile? metadata;
 public string TextureInfo {get;}
 public int Length=>RequireMetadata().Length;
 public RenderSceneTransfer(RenderScene scene,JsonSerializerOptions options){
  textures=scene.Dynamic??[];
  TextureInfo=JsonSerializer.Serialize(textures.Select(t=>new{t.Key,t.Width,t.Height,length=t.Pixels.Length}),options);
  string path=Path.Combine(Path.GetTempPath(),"render-packet-"+Guid.NewGuid().ToString("N")+".json");
  try{using(var output=File.Create(path))JsonSerializer.Serialize(output,scene with{Dynamic=[]},options);metadata=new CheckpointFile(path);}
  catch{if(File.Exists(path))File.Delete(path);throw;}
 }
 CheckpointFile RequireMetadata()=>metadata??throw new ObjectDisposedException(nameof(RenderSceneTransfer));
 public byte[] ReadSceneChunk()=>RequireMetadata().ReadChunk();
 public byte[] ReadTextureChunk(int index,int offset){
  _=RequireMetadata();
  if(index<0||index>=textures.Length)throw new ArgumentOutOfRangeException(nameof(index));
  var pixels=textures[index].Pixels;
  if(offset<0||offset>pixels.Length)throw new ArgumentOutOfRangeException(nameof(offset));
  return pixels.AsSpan(offset,Math.Min(65536,pixels.Length-offset)).ToArray();
 }
 public void Dispose(){metadata?.Dispose();metadata=null;}
}
