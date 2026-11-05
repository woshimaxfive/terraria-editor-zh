using TEdit.ViewModel;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed class WorldAuxApi(WorldViewModel vm) {
 public object GetTeamSpawns()=>vm.CurrentWorld.TeamSpawns.Select((p,i)=>new{team=i,name=World.TeamNames[i],x=p.X,y=p.Y}).ToArray();
 public void SetTeamSpawn(int team,int x,int y){if(team<0||team>=vm.CurrentWorld.TeamSpawns.Count)throw new ArgumentException("队伍不存在");vm.SelectedPoint="Team "+World.TeamNames[team];new TEdit.Editor.Tools.PointTool(vm).MouseDown(new(){Location=new(x,y),Actions={"editor.draw"}});}
 public void SetTeamBasedSeed(bool enabled)=>vm.CurrentWorld.TeamBasedSpawnsSeed=enabled;
 public void SetWorldGuid(string guid){if(!Guid.TryParse(guid,out var value))throw new ArgumentException("世界GUID无效");vm.CurrentWorld.WorldGUID=value;}
 public void FixLayerGap()=>((System.Windows.Input.ICommand)vm.CurrentWorld.FixLayerGapCommand).Execute(null);
 public void SetChristmasTree(int x,int y,int star,int garland,int bulb,int light){
  if(vm.CurrentWorld.Tiles[x,y].Type!=(ushort)TileType.ChristmasTree||star<0||star>7||garland<0||garland>7||bulb<0||bulb>15||light<0||light>15)throw new ArgumentException("圣诞树或装饰值无效");
  var tree=vm.CurrentWorld.GetXmas(x,y);vm.UndoManager.SaveTile(tree.X,tree.Y);vm.CurrentWorld.Tiles[tree.X,tree.Y].V=(short)(star+(garland<<3)+(bulb<<6)+(light<<10));
 }
}
public sealed partial class Session {
 public void SelectPoint(string name){if(name is not ("Spawn" or "Dungeon")&&!World!.NPCs.Any(n=>n.Name==name)&&!World.TeamNames.Any(team=>name=="Team "+team))throw new ArgumentException("点位或NPC不存在");vm!.SelectedPoint=name;}
}
