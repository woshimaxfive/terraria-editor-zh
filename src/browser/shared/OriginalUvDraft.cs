using System.Runtime.InteropServices;
using TEdit.Terraria;
using TEdit.Geometry;
namespace TEdit.Port;
[StructLayout(LayoutKind.Sequential,Pack=2)]
public struct UvDraftTile {
 public ushort Type;
 public short U,V;
 public static implicit operator UvDraftTile(Tile tile)=>new(){Type=tile.Type,U=tile.U,V=tile.V};
}
public sealed class OriginalUvDraft {
 readonly IEnumerable<Vector2Int32> _positions;
 public UvDraftTile[,] Tiles {get;}
 public OriginalUvDraft(UvDraftTile[,] tiles){Tiles=tiles;_positions=Positions();}
 IEnumerable<Vector2Int32> Positions(){
  for(int y=0;y<Tiles.GetLength(1);y++){
   for(int x=0;x<Tiles.GetLength(0);x++)yield return new(x,y);
   OperationProgress.Advance(Tiles.GetLength(0));
  }
 }
public void MoveU(int amount)
        {
            foreach (var pos in _positions)
            {
                Tiles[pos.X, pos.Y].U += (short)amount;
            }
            
        }
public void MoveV(int amount)
        {
            foreach (var pos in _positions)
            {
                Tiles[pos.X, pos.Y].V += (short)amount;
            }
            
        }
 public void Set(int uAmount,int vAmount){
            // Set each tile to the manual values.
            foreach (var pos in _positions)
            {
                Tiles[pos.X, pos.Y].U = (short)uAmount;
                Tiles[pos.X, pos.Y].V = (short)vAmount;
            }


 }
}
