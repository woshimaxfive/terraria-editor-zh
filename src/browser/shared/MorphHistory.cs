using TEdit.Geometry;
using TEdit.ViewModel;
namespace TEdit.Port;
// Original ApplyMorph may grow moss into four adjacent cells before returning
// their coordinates. Preserve their old values before that original call.
public static class MorphHistory {
 public static void Capture(WorldViewModel vm,Vector2Int32 p){
  if(!vm.MorphToolOptions.EnableMoss)return;
  foreach(var (dx,dy) in new[]{(0,-1),(0,1),(-1,0),(1,0)}){int x=p.X+dx,y=p.Y+dy;if(vm.CurrentWorld.ValidTileLocation(x,y))vm.UndoManager.SaveTile(x,y);}
 }
}
