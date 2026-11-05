using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Terraria.TModLoader;

namespace TEdit.Editor.Clipboard;

// Logical clipboard coordinates over an existing, row-major rectangular allocation.
// World.Tile storage and the original domain algorithms retain their original types.
public partial class ClipboardBuffer {
 public ref Tile StorageTile(int x,int y){
  if((uint)x>=(uint)Size.X||(uint)y>=(uint)Size.Y)throw new IndexOutOfRangeException();
  int offset=checked(x*Size.Y+y),stride=Tiles.GetLength(1);
  return ref Tiles[offset/stride,offset%stride];
 }
 public IEnumerable<Tile> EnumerateStorageTiles(){for(int x=0;x<Size.X;x++)for(int y=0;y<Size.Y;y++)yield return StorageTile(x,y);}
 public static ClipboardBuffer CreateStorageBuffer(Vector2Int32 size,Tile[,]? storage=null){
  if(storage==null)return new(size);
  if(size.X<1||size.Y<1||(long)size.X*size.Y>storage.Length)throw new ArgumentException("浮动选区的目标存储容量不足");
  var buffer=new ClipboardBuffer(new(0,0));buffer._size=size;buffer.Tiles=storage;return buffer;
 }
 bool HasCanonicalStorage=>Tiles.GetLength(0)==Size.X&&Tiles.GetLength(1)==Size.Y;
 void SaveStorageTiles(int version,BinaryWriter writer,bool[] frames){
  if(HasCanonicalStorage){World.SaveTiles(Tiles,version,Size.X,Size.Y,writer,frames);return;}
  var column=new Tile[1,Size.Y];
  for(int x=0;x<Size.X;x++){
   for(int y=0;y<Size.Y;y++)column[0,y]=StorageTile(x,y);
   World.SaveTiles(column,version,1,Size.Y,writer,frames);
  }
 }
 void CollectStorageOverlays(out List<ModTileOverlayEntry> tiles,out List<ModWallOverlayEntry> walls){
  if(HasCanonicalStorage){ModDataSerializer.CollectOverlays(Tiles,Size.X,Size.Y,out tiles,out walls);return;}
  tiles=[];walls=[];var column=new Tile[1,Size.Y];
  for(int x=0;x<Size.X;x++){
   for(int y=0;y<Size.Y;y++)column[0,y]=StorageTile(x,y);
   ModDataSerializer.CollectOverlays(column,1,Size.Y,out var columnTiles,out var columnWalls);
   foreach(var item in columnTiles){var entry=item;entry.X=x;tiles.Add(entry);}
   foreach(var item in columnWalls){var entry=item;entry.X=x;walls.Add(entry);}
  }
 }
}
