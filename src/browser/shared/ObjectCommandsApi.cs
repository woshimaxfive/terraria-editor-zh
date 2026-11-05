using TEdit.Terraria;
using TEdit.ViewModel;
namespace TEdit.Port;
public sealed class ObjectCommandsApi(WorldViewModel vm,Session session){
 OriginalObjectCommands commands=>session.ItemCommands;
 Item ItemAt(int x,int y,int slot){var chest=vm.CurrentWorld.GetChestAtTile(x,y)??throw new ArgumentException("箱子不存在");if(slot<0||slot>=chest.Items.Count)throw new ArgumentException("物品槽超出范围");return chest.Items[slot];}
 public void CopyChestItem(int x,int y,int slot)=>commands.CopyChestItems(ItemAt(x,y,slot));
 public void ClearChest(int x,int y)=>commands.ClearChest(vm.CurrentWorld.GetChestAtTile(x,y)??throw new ArgumentException("箱子不存在"));
 public void ClearSpriteSelection()=>session.ClearSpriteSelection();
 public void RemoveNpc(string name,int index=0){var npc=vm.CurrentWorld.NPCs.Where(n=>n.Name==name).ElementAtOrDefault(index)??throw new ArgumentException("NPC不存在");vm.CurrentWorld.NPCs.Remove(npc);}
 public void PasteChestItem(int x,int y,int slot)=>commands.PasteChestItems(ItemAt(x,y,slot));
 public void SetChestItemMaxStack(int x,int y,int slot)=>commands.ChestItemMaxStack(ItemAt(x,y,slot));
 public void SetEntityItemMaxStack(int x,int y)=>commands.ChestItemMaxStack(vm.CurrentWorld.GetTileEntityAtTile(x,y)??throw new ArgumentException("实体不存在"));
 public void CopyEntityItem(int x,int y)=>commands.CopyChestItems(vm.CurrentWorld.GetTileEntityAtTile(x,y)??throw new ArgumentException("实体不存在"));
 public void PasteEntityItem(int x,int y)=>commands.PasteChestItems(vm.CurrentWorld.GetTileEntityAtTile(x,y)??throw new ArgumentException("实体不存在"));
 public void GoToNpc(string name,int index=0){var npc=vm.CurrentWorld.NPCs.Where(n=>n.Name==name).ElementAtOrDefault(index)??throw new ArgumentException("NPC不存在");session.OriginX=Math.Clamp((int)(npc.Position.X/16)-Session.MapWidth/2,0,Math.Max(0,vm.CurrentWorld.TilesWide-Session.MapWidth));session.OriginY=Math.Clamp((int)(npc.Position.Y/16)-Session.MapHeight/2,0,Math.Max(0,vm.CurrentWorld.TilesHigh-Session.MapHeight));}
 public void GoTo(int x,int y){session.OriginX=Math.Clamp(x-Session.MapWidth/2,0,Math.Max(0,vm.CurrentWorld.TilesWide-Session.MapWidth));session.OriginY=Math.Clamp(y-Session.MapHeight/2,0,Math.Max(0,vm.CurrentWorld.TilesHigh-Session.MapHeight));}
}
