// MS-PL: browser clone-storage adaptation of TEdit world transformation.
using System.ComponentModel;
using System.Runtime.InteropServices;
using TEdit.Geometry;
using TEdit.Terraria;
namespace TEdit.Port;
// Same-runtime clone input; original file readers and Tile decoder remain authoritative.
public sealed partial class WorldTransformSnapshot:IDisposable {
 readonly string path=Path.Combine(Path.GetTempPath(),"world-transform-source-"+Guid.NewGuid().ToString("N")+".wld");
 BinaryReader? tileReader;
 long[] columns=[];
 Tile[,]? column;
 int width,height,loadedColumn=-1;
 bool[] important=[];
 int version;
 public World Metadata {get;private set;}=null!;
 public WorldTransformSnapshot(World source){
  try{
   using(var output=new BinaryWriter(File.Create(path)))World.SaveV2(source,output);
   tileReader=new BinaryReader(File.OpenRead(path));Metadata=new World{Version=source.Version};
   using var metadataReader=new BinaryReader(File.OpenRead(path));LoadMetadata(metadataReader,Metadata);
  }catch{Dispose();throw;}
 }
 void IndexColumns(BinaryReader reader,World world){
  width=world.TilesWide;height=world.TilesHigh;version=(int)world.Version;important=world.TileFrameImportant;
  columns=new long[width];column=new Tile[1,height];
  for(int x=0;x<width;x++){
   columns[x]=reader.BaseStream.Position;
   for(int y=0;y<height;y++){_=World.DeserializeTileData(reader,important,version,out int repeat);y+=Math.Min(repeat,height-y-1);}
   OperationProgress.Advance(height);
  }
 }
 void ReadColumn(int x){
  if(tileReader==null)throw new ObjectDisposedException(nameof(WorldTransformSnapshot));
  if(x<0||x>=width)throw new IndexOutOfRangeException();
  if(loadedColumn==x)return;
  tileReader.BaseStream.Position=columns[x];
  for(int y=0;y<height;y++){
   var tile=World.DeserializeTileData(tileReader,important,version,out int repeat);
   int last=Math.Min(height-1,y+repeat);for(;y<=last;y++)column![0,y]=tile;y--;
  }
  loadedColumn=x;
 }
 Tile ReadTile(int x,int y){if(y<0||y>=height)throw new IndexOutOfRangeException();ReadColumn(x);return column![0,y];}
 public Tile[,] CopyTiles(RectangleInt32 selection,int left,int top,int right,int bottom,IProgress<ProgressChangedEventArgs>? progress){
  if(selection.X<0||selection.Y<0||selection.Right>width||selection.Bottom>height)throw new IndexOutOfRangeException();
  int targetWidth=checked(selection.Width+left+right),targetHeight=checked(selection.Height+top+bottom);
  var result=new Tile[targetWidth,targetHeight];
  if(left>0||top>0||right>0||bottom>0)MemoryMarshal.CreateSpan(ref result[0,0],result.Length).Fill(new Tile());
  for(int x=0;x<selection.Width;x++){
   ReadColumn(selection.X+x);
   Array.Copy(column!,selection.Y,result,checked((x+left)*targetHeight+top),selection.Height);
   OperationProgress.Advance(selection.Height);progress?.Report(new ProgressChangedEventArgs((x+1)*100/selection.Width,"Cloning World..."));
  }
  return result;
 }
 public void Dispose(){tileReader?.Dispose();tileReader=null;column=null;columns=[];Metadata=null!;if(File.Exists(path))File.Delete(path);}
}
