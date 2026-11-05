using TEdit.Geometry;
using TEdit.Terraria;
namespace TEdit.Port;
// Inactive tile IDs are deliberately omitted by the original world codec.
// Retaining them internally also retains the original serializer's RLE grouping.
public static class TileRuntimeTypes {
 const int Magic=0x45505954;
 public static byte[] Capture(World world){using var stream=new MemoryStream();using var writer=new BinaryWriter(stream);writer.Write(Magic);writer.Write(0);int count=0;for(int x=0;x<world.TilesWide;x++)for(int y=0;y<world.TilesHigh;y++){var tile=world.Tiles[x,y];if(tile.IsActive||tile.Type==0)continue;if(stream.Length+10>Session.MaxCheckpointBytes)throw new InvalidOperationException("运行时类型数据超过恢复预算");writer.Write(x);writer.Write(y);writer.Write(tile.Type);count++;}stream.Position=4;writer.Write(count);return count==0?[]:stream.ToArray();}
 public static void Write(BinaryWriter writer,Dictionary<Vector2Int32,ushort> values){if(values.Count==0)return;writer.Write(Magic);writer.Write(values.Count);foreach(var(p,id)in values.OrderBy(v=>v.Key.X).ThenBy(v=>v.Key.Y)){writer.Write(p.X);writer.Write(p.Y);writer.Write(id);}}
 public static void Read(BinaryReader reader,World world,bool apply){if(reader.BaseStream.Position==reader.BaseStream.Length)return;long start=reader.BaseStream.Position;if(reader.ReadInt32()!=Magic){reader.BaseStream.Position=start;return;}int count=reader.ReadInt32();if(count<0||count>(long)world.TilesWide*world.TilesHigh||(long)count*10>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("运行时类型数量无效");long previous=-1;for(int i=0;i<count;i++){int x=reader.ReadInt32(),y=reader.ReadInt32();ushort id=reader.ReadUInt16();long index=(long)x*world.TilesHigh+y;if(!world.ValidTileLocation(x,y)||id==0||index<=previous)throw new InvalidDataException("运行时类型坐标或ID无效");previous=index;if(apply){if(world.Tiles[x,y].IsActive)throw new InvalidDataException("运行时类型只能恢复非活动图格");world.Tiles[x,y].Type=id;}}}
}
