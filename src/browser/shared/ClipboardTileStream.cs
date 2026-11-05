using TEdit.Editor.Clipboard;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Terraria.TModLoader;

namespace TEdit.Port {
// An internal SaveV5 result is indexed by column. Tile decoding, mod remapping,
// and overlay application remain in the original Terraria implementation.
public sealed class ClipboardTileStream : IDisposable {
 readonly BinaryReader reader;
 readonly long[] columns;
 readonly Tile[,] column;
 readonly List<ModTileOverlayEntry>?[] tileOverlays;
 readonly List<ModWallOverlayEntry>?[] wallOverlays;
 readonly int version;
 int loadedColumn=-1;
 public ClipboardBuffer Buffer {get;}
 public ClipboardTileStream(byte[] bytes,TwldData? target){
  reader=new BinaryReader(new MemoryStream(bytes,false));
  try {
   string name=reader.ReadString();version=checked(reader.ReadInt32()-20000);
   if(version<1||version>WorldConfiguration.CompatibleVersion)throw new InvalidDataException("粘贴内部模板版本无效");
   var frames=World.ReadBitArray(reader);int width=reader.ReadInt32(),height=reader.ReadInt32();
   if(width<1||height<1||(long)width*height>Session.MaxClipboardCells)throw new InvalidDataException("粘贴内部模板尺寸无效");
   Buffer=ClipboardBuffer.CreateStreamingBuffer(new(width,height),frames,name);
   column=new Tile[1,height];columns=new long[width];
   for(int x=0;x<width;x++){
    OperationProgress.Advance(height);columns[x]=reader.BaseStream.Position;
    for(int y=0;y<height;y++){_=World.DeserializeTileData(reader,frames,version,out int repeat);y+=Math.Min(repeat,height-y-1);}
   }
   Buffer.Chests.AddRange(World.LoadChestData(reader,(uint)version));
   Buffer.Signs.AddRange(World.LoadSignData(reader));
   Buffer.TileEntities.AddRange(World.LoadTileEntityData(reader,(uint)version));
   Buffer.CapturedIdentity=ClipboardIdentity.Capture(reader,(uint)version);
   ModDataSerializer.LoadModPayload(reader,Buffer.Chests,Buffer.TileEntities,out var tiles,out var walls,target);
   tileOverlays=new List<ModTileOverlayEntry>?[width];wallOverlays=new List<ModWallOverlayEntry>?[width];
   if(tiles!=null)foreach(var item in tiles){if(item.X<0||item.X>=width)continue;var entry=item;int x=entry.X;entry.X=0;(tileOverlays[x]??=[]).Add(entry);}
   if(walls!=null)foreach(var item in walls){if(item.X<0||item.X>=width)continue;var entry=item;int x=entry.X;entry.X=0;(wallOverlays[x]??=[]).Add(entry);}
   if(reader.ReadString()!=name||reader.ReadInt32()<version||reader.ReadInt32()!=width||reader.ReadInt32()!=height||reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("粘贴内部模板校验失败");
  }catch{reader.Dispose();throw;}
 }
 public Tile Read(int x,int y){
  if((uint)x>=(uint)Buffer.Size.X||(uint)y>=(uint)Buffer.Size.Y)throw new ArgumentOutOfRangeException();
  if(loadedColumn!=x){
   reader.BaseStream.Position=columns[x];
   for(int row=0;row<Buffer.Size.Y;row++){
    var tile=World.DeserializeTileData(reader,Buffer.TileFrameImportant,version,out int repeat);column[0,row]=tile;
    while(repeat-->0&&row+1<Buffer.Size.Y)column[0,++row]=tile;
   }
   ModDataSerializer.ApplyOverlays(column,1,Buffer.Size.Y,tileOverlays[x],wallOverlays[x]);loadedColumn=x;
  }
  return column[0,y];
 }
 public void Dispose()=>reader.Dispose();
}
}
namespace TEdit.Editor.Clipboard {
public partial class ClipboardBuffer {
 public static ClipboardBuffer CreateStreamingBuffer(Vector2Int32 size,bool[] frames,string name){
  var buffer=new ClipboardBuffer(new(0,0),tileFrameImportant:frames);buffer._size=size;buffer.Name=name;return buffer;
 }
}
}
