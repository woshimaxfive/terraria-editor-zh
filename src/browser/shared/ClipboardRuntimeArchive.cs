using System.IO.Compression;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using TEdit.Editor.Clipboard;
using TEdit.Terraria;

namespace TEdit.Port;
// Temporary, same-runtime storage only. Never used as a portable file format.
// Keep the original buffer and its metadata; only its Tile storage is suspended.
public sealed class ClipboardRuntimeArchive {
 readonly ClipboardBuffer buffer;
 readonly string path;
 bool restored;
 ClipboardRuntimeArchive(ClipboardBuffer buffer,string path){this.buffer=buffer;this.path=path;}
 [MethodImpl(MethodImplOptions.NoInlining)]
 public static ClipboardRuntimeArchive Detach(ClipboardBuffer buffer){
  if(buffer.Tiles.GetLength(0)!=buffer.Size.X||buffer.Tiles.GetLength(1)!=buffer.Size.Y)throw new InvalidOperationException("剪贴板运行时存储不完整");
  string path=Path.Combine(Path.GetTempPath(),"clipboard-runtime-"+Guid.NewGuid().ToString("N")+".deflate");
  try{
   using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write))using(var zip=new DeflateStream(file,CompressionLevel.Fastest)){
    var bytes=MemoryMarshal.AsBytes(MemoryMarshal.CreateReadOnlySpan(ref buffer.Tiles[0,0],buffer.Tiles.Length));
    for(int offset=0;offset<bytes.Length;offset+=65536){int count=Math.Min(65536,bytes.Length-offset);zip.Write(bytes.Slice(offset,count));OperationProgress.Advance(count);}
   }
   buffer.Tiles=new Tile[0,0];return new(buffer,path);
  }catch{if(File.Exists(path))File.Delete(path);throw;}
 }
 public long CompressedBytes=>new FileInfo(path).Length;
 [MethodImpl(MethodImplOptions.NoInlining)]
 public void Restore(){
  if(restored)return;
  GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
  var tiles=new Tile[buffer.Size.X,buffer.Size.Y];
  using(var file=File.OpenRead(path))using(var zip=new DeflateStream(file,CompressionMode.Decompress)){
   var bytes=MemoryMarshal.AsBytes(MemoryMarshal.CreateSpan(ref tiles[0,0],tiles.Length));
   for(int offset=0;offset<bytes.Length;offset+=65536){int count=Math.Min(65536,bytes.Length-offset);zip.ReadExactly(bytes.Slice(offset,count));OperationProgress.Advance(count);}
   if(zip.ReadByte()!=-1)throw new InvalidDataException("剪贴板运行时存储存在多余数据");
  }
  buffer.Tiles=tiles;restored=true;File.Delete(path);
 }
 public void Discard(){if(!restored&&File.Exists(path))File.Delete(path);restored=true;}
}
