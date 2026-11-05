using TEdit.Terraria;
namespace TEdit.Editor.Undo;
// Container order is absent from the original per-tile undo records. Preserve
// only ordering metadata; actual containers/items still use original codecs.
public sealed class UndoEntityOrder {
 static readonly byte[] Magic=[0x45,0x4f,0x52,0x44];
 readonly (int X,int Y)[][] order;
 public UndoEntityOrder(World world){order=[world.Chests.Select(c=>(c.X,c.Y)).ToArray(),world.Signs.Select(c=>(c.X,c.Y)).ToArray(),world.TileEntities.Select(c=>((int)c.PosX,(int)c.PosY)).ToArray()];}
 public void Write(BinaryWriter writer){
  if(order.All(o=>o.Length==0))return;writer.Write(Magic);
  foreach(var list in order){writer.Write(list.Length);foreach(var p in list){writer.Write(p.X);writer.Write(p.Y);}}
 }
 public static void Read(BinaryReader reader,World world,bool apply){
  if(reader.BaseStream.Position==reader.BaseStream.Length)return;
  long start=reader.BaseStream.Position;bool own=reader.ReadBytes(4).SequenceEqual(Magic);reader.BaseStream.Position=start;if(!own)return;
  if(!reader.ReadBytes(4).SequenceEqual(Magic))throw new InvalidDataException("历史实体顺序区段无效");
  var orders=new (int X,int Y)[3][];
  for(int i=0;i<3;i++){
   int count=reader.ReadInt32();if(count<0||count>100000||(long)count*8>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("历史实体顺序数量无效");
   orders[i]=new (int X,int Y)[count];for(int j=0;j<count;j++){int x=reader.ReadInt32(),y=reader.ReadInt32();if(!world.ValidTileLocation(x,y))throw new InvalidDataException("历史实体顺序坐标无效");orders[i][j]=(x,y);}
  }
  if(apply){Reorder(world.Chests,c=>(c.X,c.Y),orders[0]);Reorder(world.Signs,c=>(c.X,c.Y),orders[1]);Reorder(world.TileEntities,c=>((int)c.PosX,(int)c.PosY),orders[2]);}
 }
 static void Reorder<T>(IList<T> list,Func<T,(int,int)> position,(int,int)[] order){
  var indexes=new Dictionary<(int,int),int>();for(int i=0;i<order.Length;i++)indexes.TryAdd(order[i],i);
  var items=list.OrderBy(item=>indexes.GetValueOrDefault(position(item),int.MaxValue)).ToArray();list.Clear();foreach(var item in items)list.Add(item);
 }
}
