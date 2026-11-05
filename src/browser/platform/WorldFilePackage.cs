using System.IO.Compression;
using System.Text;

namespace TEdit.Port.Files;
// Framework ZIP implementation; shared by the Worker export and UI raw-copy path.
// It packages opaque file bytes and never parses domain objects.
public static class WorldFilePackage {
 public static byte[] PackPair(byte[] world,byte[] sidecar,string worldName,string? sidecarName=null){
  if(string.IsNullOrWhiteSpace(worldName)||worldName.Contains('/')||worldName.Contains('\\')||!worldName.EndsWith(".wld",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("世界文件名称无效");
  sidecarName??=Path.ChangeExtension(worldName,".twld");
  if(sidecarName.Contains('/')||sidecarName.Contains('\\')||!sidecarName.EndsWith(".twld",StringComparison.OrdinalIgnoreCase)||!string.Equals(Path.GetFileNameWithoutExtension(worldName),Path.GetFileNameWithoutExtension(sidecarName),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("配套文件名称无效");
  if((long)world.Length+sidecar.Length>256*1024*1024)throw new InvalidOperationException("配套文件超过打包容量");
  using var output=new MemoryStream();
  using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true,Encoding.UTF8)){
   void Add(string name,byte[] bytes){var entry=zip.CreateEntry(name,CompressionLevel.NoCompression);entry.LastWriteTime=new DateTimeOffset(2000,1,1,0,0,0,TimeSpan.Zero);using var stream=entry.Open();stream.Write(bytes);}
   Add(worldName,world);Add(sidecarName,sidecar);
  }
  return output.ToArray();
 }
}
