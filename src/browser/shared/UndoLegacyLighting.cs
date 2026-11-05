using TEdit.Geometry;

using TEdit.Terraria;



namespace TEdit.Editor.Undo;

// The original V2 undo tile codec omits Tile.v0_Lit. Preserve that legacy field

// in a trailing section of legacy-only undo records; world formats stay intact.

public static class UndoLegacyLighting {

 static readonly byte[] Magic=[0x56,0x4c,0x49,0x54];

 public static bool Required(World? world)=>world!=null&&(world.IsV0||world.Version<=25);

 public static void Write(BinaryWriter writer,World? world,Dictionary<Vector2Int32,bool> values){

  if(!Required(world))return;

  writer.Write(Magic);writer.Write(values.Count);

  foreach(var (point,value) in values){writer.Write(point.X);writer.Write(point.Y);writer.Write(value);}

 }

 public static void Read(BinaryReader reader,World world,bool apply){

  if(reader.BaseStream.Position==reader.BaseStream.Length)return;

  long start=reader.BaseStream.Position;bool own=reader.ReadBytes(4).SequenceEqual(Magic);reader.BaseStream.Position=start;if(!own)return;

  if(!reader.ReadBytes(4).SequenceEqual(Magic)||!Required(world))throw new InvalidDataException("历史旧版光照区段无效");

  int count=reader.ReadInt32();

  if(count<0||count>(reader.BaseStream.Length-reader.BaseStream.Position)/9||count>(long)world.TilesWide*world.TilesHigh)throw new InvalidDataException("历史旧版光照数量无效");

  var visited=new HashSet<Vector2Int32>();

  for(int i=0;i<count;i++){

   var point=new Vector2Int32(reader.ReadInt32(),reader.ReadInt32());byte value=reader.ReadByte();

   if(!world.ValidTileLocation(point.X,point.Y)||value>1||!visited.Add(point))throw new InvalidDataException("历史旧版光照坐标或值无效");

   if(apply)world.Tiles[point.X,point.Y].v0_Lit=value==1;

  }

 }

}

