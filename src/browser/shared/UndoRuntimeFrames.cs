using System.Numerics;
using TEdit.Geometry;
namespace TEdit.Port;

// UV-only undo state. Standard collection pages keep sparse brush edits small
// and store dense full-world frames as packed shorts without sorting all tiles.
public sealed class UndoRuntimeFrames(int width,int height) {
 const int PageBits=12,PageSize=1<<PageBits,SparseLimit=128;
 readonly SortedDictionary<int,Page> pages=new();
 public int Count {get;private set;}
 sealed class Page {
  public Dictionary<ushort,uint>? Sparse=new();
  public uint[]? Values;
  public ulong[]? Present;
  public int Count;
  public bool TryAdd(ushort offset,uint value){
   if(Sparse is {} sparse){
    if(!sparse.TryAdd(offset,value))return false;
    Count++;
    if(Count>SparseLimit){Values=new uint[PageSize];Present=new ulong[PageSize/64];foreach(var p in sparse){Values[p.Key]=p.Value;Present[p.Key>>6]|=1UL<<(p.Key&63);}Sparse=null;}
    return true;
   }
   ulong bit=1UL<<(offset&63);int word=offset>>6;
   if((Present![word]&bit)!=0)return false;
   Values![offset]=value;Present[word]|=bit;Count++;return true;
  }
  public bool Remove(ushort offset){
   if(Sparse is {} sparse){if(!sparse.Remove(offset))return false;Count--;return true;}
   ulong bit=1UL<<(offset&63);int word=offset>>6;if((Present![word]&bit)==0)return false;
   Present[word]&=~bit;Count--;return true;
  }
  public IEnumerable<KeyValuePair<ushort,uint>> Entries(){
   if(Sparse is {} sparse){foreach(var p in sparse.OrderBy(p=>p.Key))yield return p;yield break;}
   for(int word=0;word<Present!.Length;word++){
    ulong remaining=Present[word];
    while(remaining!=0){int bit=BitOperations.TrailingZeroCount(remaining);ushort offset=checked((ushort)(word*64+bit));yield return new(offset,Values![offset]);remaining&=remaining-1;}
   }
  }
 }
 int Index(Vector2Int32 point){if(point.X<0||point.X>=width||point.Y<0||point.Y>=height)throw new ArgumentOutOfRangeException(nameof(point));return checked(point.X*height+point.Y);}
 public bool TryAdd(Vector2Int32 point,(short U,short V) frame){
  int index=Index(point),number=index>>PageBits;ushort offset=(ushort)(index&(PageSize-1));
  if(!pages.TryGetValue(number,out var page))pages.Add(number,page=new Page());
  uint packed=(uint)(ushort)frame.U|((uint)(ushort)frame.V<<16);
  if(!page.TryAdd(offset,packed))return false;Count++;return true;
 }
 public bool Remove(Vector2Int32 point){int index=Index(point),number=index>>PageBits;if(!pages.TryGetValue(number,out var page)||!page.Remove((ushort)(index&(PageSize-1))))return false;Count--;if(page.Count==0)pages.Remove(number);return true;}
 public void Clear(){pages.Clear();Count=0;}
 public IEnumerable<(Vector2Int32 Key,(short U,short V) Value)> Ordered(){
  foreach(var page in pages)foreach(var entry in page.Value.Entries()){
   int index=(page.Key<<PageBits)+entry.Key;yield return(new(index/height,index%height),(unchecked((short)entry.Value),unchecked((short)(entry.Value>>16))));
  }
 }
 public void Write(BinaryWriter writer){
  if(Count==0)return;
  writer.Write(new byte[]{0x46,0x52,0x41,0x4d});writer.Write(Count);
  foreach(var pair in Ordered()){writer.Write(pair.Key.X);writer.Write(pair.Key.Y);writer.Write(pair.Value.U);writer.Write(pair.Value.V);OperationProgress.Advance();}
 }
}
