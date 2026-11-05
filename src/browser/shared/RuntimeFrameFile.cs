namespace TEdit.Port;
// Reuse the checkpoint's existing file streaming path for the original FRAM bytes.
public sealed class RuntimeFrameFile : IDisposable {
 public string Path {get;}=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"checkpoint-frames-"+Guid.NewGuid().ToString("N")+".bin");
 public long Length=>new FileInfo(Path).Length;
 public RuntimeFrameFile(TEdit.Terraria.World world){
  try{using var file=new FileStream(Path,FileMode.CreateNew,FileAccess.Write);using var writer=new BinaryWriter(file);TileRuntimeFrames.WriteWorld(writer,world);}
  catch{if(File.Exists(Path))File.Delete(Path);throw;}
 }
 public void Dispose(){if(File.Exists(Path))File.Delete(Path);}
}
