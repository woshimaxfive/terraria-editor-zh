namespace TEdit.Port;

// Own the existing ZIP output until its bytes have crossed the browser boundary.
public sealed class CheckpointFile : IDisposable {
 readonly string path;
 readonly FileStream input;
 readonly byte[] chunk=new byte[65536];
 public int Length {get;}
 internal CheckpointFile(string path){
  this.path=path;
  input=File.OpenRead(path);
  Length=checked((int)input.Length);
 }
 public byte[] ReadChunk(){
  int count=(int)Math.Min(chunk.Length,input.Length-input.Position);
  if(count==0)return [];
  var bytes=count==chunk.Length?chunk:new byte[count];
  input.ReadExactly(bytes,0,count);
  return bytes;
 }
 public byte[] ReadAll()=>File.ReadAllBytes(path);
 public void Dispose(){input.Dispose();if(File.Exists(path))File.Delete(path);}
}
