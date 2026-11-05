using System.IO.Compression;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using TEdit.Editor.Clipboard;
using TEdit.Terraria;

namespace TEdit.Port;

// Lossless temporary storage for this runtime only; never a portable save format.
public sealed class FloatingTileSource : IDisposable {
 readonly string path;
 readonly long[] offsets;
 readonly FileStream file;
 readonly Tile[,] column;
 int cachedColumn=-1;
 bool disposed;
 public ClipboardBuffer Buffer {get;}
 FloatingTileSource(ClipboardBuffer buffer,string path,long[] offsets){
  Buffer=buffer;this.path=path;this.offsets=offsets;
  file=File.OpenRead(path);column=new Tile[1,buffer.Size.Y];
 }
 [MethodImpl(MethodImplOptions.NoInlining)]
 public static FloatingTileSource Detach(ClipboardBuffer buffer){
  if(buffer.Size.X<1||buffer.Size.Y<1||(long)buffer.Size.X*buffer.Size.Y>buffer.Tiles.Length)throw new InvalidOperationException("浮动选区的图格存储不完整");
  string path=Path.Combine(Path.GetTempPath(),"floating-columns-"+Guid.NewGuid().ToString("N")+".deflate");
  try{
   var offsets=new long[buffer.Size.X+1];
   using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write)){
    for(int x=0;x<buffer.Size.X;x++){
     offsets[x]=file.Position;
     using(var zip=new DeflateStream(file,CompressionLevel.Fastest,true)){
      var bytes=MemoryMarshal.AsBytes(MemoryMarshal.CreateReadOnlySpan(ref buffer.StorageTile(x,0),buffer.Size.Y));
      zip.Write(bytes);OperationProgress.Advance(buffer.Size.Y);
     }
    }
    offsets[buffer.Size.X]=file.Position;
   }
   var source=new FloatingTileSource(buffer,path,offsets);
   buffer.Tiles=new Tile[0,0];return source;
  }catch{if(File.Exists(path))File.Delete(path);throw;}
 }
 public Tile Read(int x,int y){
  ObjectDisposedException.ThrowIf(disposed,this);
  if((uint)x>=(uint)Buffer.Size.X||(uint)y>=(uint)Buffer.Size.Y)throw new ArgumentOutOfRangeException();
  if(cachedColumn!=x){
   file.Position=offsets[x];
   using var zip=new DeflateStream(file,CompressionMode.Decompress,true);
   zip.ReadExactly(MemoryMarshal.AsBytes(MemoryMarshal.CreateSpan(ref column[0,0],Buffer.Size.Y)));
   if(zip.ReadByte()!=-1)throw new InvalidDataException("浮动选区压缩列长度无效");
   cachedColumn=x;
  }
  return column[0,y];
 }
 [MethodImpl(MethodImplOptions.NoInlining)]
 public void Restore(Tile[,]? storage=null){
  if(disposed)return;
  GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
  var tiles=storage!=null&&storage.Length>=(long)Buffer.Size.X*Buffer.Size.Y?storage:new Tile[Buffer.Size.X,Buffer.Size.Y];
  int stride=tiles.GetLength(1),offset=0;
  for(int x=0;x<Buffer.Size.X;x++)for(int y=0;y<Buffer.Size.Y;y++,offset++)tiles[offset/stride,offset%stride]=Read(x,y);
  Buffer.Tiles=tiles;Dispose();
 }
 public void Discard()=>Dispose();
 public void Dispose(){if(disposed)return;file.Dispose();File.Delete(path);disposed=true;}
}
