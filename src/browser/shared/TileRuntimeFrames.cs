using TEdit.Geometry;

using TEdit.Terraria;



namespace TEdit.Port;

// Original world/undo codecs omit non-framed UV values. The original brush

// invalidates those values with -1; retain them only in internal recovery data.

public static class TileRuntimeFrames {

 static readonly byte[] Magic=[0x46,0x52,0x41,0x4d];

 public static bool Needed(World world,Tile tile){

  if(tile.U==0&&tile.V==0)return false;

  // The original decoder resets timer V to zero; history retains the placed frame.
  if(tile.Type==(ushort)TileType.Timer&&tile.V!=0)return true;

  bool framed=tile.IsActive&&tile.Type<world.TileFrameImportant.Length&&world.TileFrameImportant[tile.Type];

  if(tile.IsActive&&world.TwldData is {} data&&data.VirtualTileIdToMapIndex.TryGetValue(tile.Type,out int index))framed=data.TileMap[index].FrameImportant;

  return !framed;

 }

 public static byte[] Capture(World world){
  int count=0;
  for(int x=0;x<world.TilesWide;x++){
   for(int y=0;y<world.TilesHigh;y++)if(Needed(world,world.Tiles[x,y]))count++;
   OperationProgress.Advance(world.TilesHigh);
  }
  long length=8L+12L*count;
  if(length>Session.MaxCheckpointBytes)throw new InvalidOperationException("运行时帧恢复数据超过检查点预算，上一记录保留");
  var bytes=new byte[checked((int)length)];
  using var stream=new MemoryStream(bytes,true);using var writer=new BinaryWriter(stream);
  writer.Write(Magic);writer.Write(count);
  for(int x=0;x<world.TilesWide;x++){
   for(int y=0;y<world.TilesHigh;y++){
    var tile=world.Tiles[x,y];if(Needed(world,tile))WritePoint(writer,x,y,tile.U,tile.V);
   }
   OperationProgress.Advance(world.TilesHigh);
  }
  return bytes;
 }

 public static void WriteWorld(BinaryWriter writer,World world){
  int count=0;
  for(int x=0;x<world.TilesWide;x++){
   for(int y=0;y<world.TilesHigh;y++)if(Needed(world,world.Tiles[x,y]))count++;
   OperationProgress.Advance(world.TilesHigh);
  }
  long length=8L+12L*count;
  if(length>Session.MaxCheckpointBytes)throw new InvalidOperationException("运行时帧恢复数据超过检查点预算，上一记录保留");
  writer.Write(Magic);writer.Write(count);
  for(int x=0;x<world.TilesWide;x++){
   for(int y=0;y<world.TilesHigh;y++){
    var tile=world.Tiles[x,y];if(Needed(world,tile))WritePoint(writer,x,y,tile.U,tile.V);
   }
   OperationProgress.Advance(world.TilesHigh);
  }
 }

 public static void Write(BinaryWriter writer,World world,UndoRuntimeFrames values){values.Write(writer);}

 static void WritePoint(BinaryWriter writer,int x,int y,short u,short v){writer.Write(x);writer.Write(y);writer.Write(u);writer.Write(v);}

 public static void Read(BinaryReader reader,World world,bool apply){

  if(reader.BaseStream.Position==reader.BaseStream.Length)return;

  long start=reader.BaseStream.Position;bool own=reader.ReadBytes(4).SequenceEqual(Magic);reader.BaseStream.Position=start;if(!own)return;

  _=reader.ReadBytes(4);int count=reader.ReadInt32();

  if(count<0||count>(long)world.TilesWide*world.TilesHigh||(long)count*12>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("运行时帧恢复数量无效");

  long last=-1;

  for(int i=0;i<count;i++){

   int x=reader.ReadInt32(),y=reader.ReadInt32();short u=reader.ReadInt16(),v=reader.ReadInt16();long key=(long)x*world.TilesHigh+y;

   if(!world.ValidTileLocation(x,y)||key<=last)throw new InvalidDataException("运行时帧恢复坐标无效");last=key;

   if(apply){world.Tiles[x,y].U=u;world.Tiles[x,y].V=v;}

  }

 }

}

