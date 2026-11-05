using TEdit.Terraria;
using TEdit.Geometry;
namespace TEdit.Port;
// The original reader normalizes slopes on non-sloping tile types (including
// residual slopes left by original track placement). Internal history and
// checkpoints must retain that pre-read value even though world IO stays original.
public static class TileRuntimeShapes {
 const int Magic=0x50414853;
 public static byte[] Capture(World world){var values=new Dictionary<Vector2Int32,BrickStyle>();for(int x=0;x<world.TilesWide;x++)for(int y=0;y<world.TilesHigh;y++)if(world.Tiles[x,y].BrickStyle!=BrickStyle.Full)values.Add(new(x,y),world.Tiles[x,y].BrickStyle);using var stream=new MemoryStream();using var writer=new BinaryWriter(stream);Write(writer,values);return stream.ToArray();}
 public static void Write(BinaryWriter writer,Dictionary<Vector2Int32,BrickStyle> values){if(values.Count==0)return;writer.Write(Magic);writer.Write(values.Count);foreach(var (p,style) in values.OrderBy(v=>v.Key.X).ThenBy(v=>v.Key.Y)){writer.Write(p.X);writer.Write(p.Y);writer.Write((byte)style);}}
 public static void Read(BinaryReader reader,World world,bool apply){if(reader.BaseStream.Position==reader.BaseStream.Length)return;long start=reader.BaseStream.Position;if(reader.ReadInt32()!=Magic){reader.BaseStream.Position=start;return;}int count=reader.ReadInt32();if(count<0||count>(long)world.TilesWide*world.TilesHigh||(long)count*9>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("运行时坡面数量无效");long previous=-1;for(int i=0;i<count;i++){int x=reader.ReadInt32(),y=reader.ReadInt32();byte style=reader.ReadByte();long index=(long)x*world.TilesHigh+y;if(!world.ValidTileLocation(x,y)||style>5||index<=previous)throw new InvalidDataException("运行时坡面坐标或样式无效");previous=index;if(apply)world.Tiles[x,y].BrickStyle=(BrickStyle)style;}}
}
