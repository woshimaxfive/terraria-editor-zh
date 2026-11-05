using TEdit.Editor.Plugins;
using TEdit.ViewModel;
namespace TEdit.Port;

// Options are browser data; the world algorithms remain the original plugins.
public sealed class BrowserPluginApi(WorldViewModel vm,Session session) {
 void Area(bool selection){long cells=(long)vm.CurrentWorld.TilesWide*vm.CurrentWorld.TilesHigh;if(selection){if(!vm.Selection.IsActive)throw new ArgumentException("该插件需要有效选区");cells=(long)vm.Selection.SelectionArea.Width*vm.Selection.SelectionArea.Height;}if(cells>WorldFiles.MaxWorldCells)throw new ArgumentException("插件范围超出已加载世界的容量");}
 public void RemoveAllChests(){Area(false);new RemoveAllChestsPlugin(vm).Execute();}
 public void RemoveAllUnlockedChests(){Area(false);new RemoveAllUnlockedChestsPlugin(vm).Execute();}
 public void UnlockAllChests(){Area(false);new UnlockAllChestsPlugin(vm).Execute();}
 public void SettleSand(){Area(false);new SandSettlePlugin(vm).Execute();}
 public void CleanseWorld(){Area(false);new CleanseWorldPlugin(vm).Execute();}
 public void RemoveTiles(string blockName,string wallName){Area(false);if(string.IsNullOrWhiteSpace(blockName)&&string.IsNullOrWhiteSpace(wallName))throw new ArgumentException("请输入要移除的方块或墙名称");new RemoveTileWithPlugin(vm).Execute(new(){BlockToRemove=blockName,WallToRemove=wallName});}
 public void Shuffle(int seed,bool selection=true,bool includeFramed=false,bool sensitivePlatform=true,int emptyPercentage=100,bool considerWallEmpty=false,bool considerLiquidEmpty=false,bool considerEverything=false){Area(selection);if(emptyPercentage<0||emptyPercentage>100)throw new ArgumentException("空格比例必须为0至100");new BlockShufflePlugin(vm).Execute(new(){Seed=seed,OnlySelection=selection,EnableUndo=true,IncludeTileEntities=includeFramed,SensitivePlatform=sensitivePlatform,ReplaceEmptyPercentage=emptyPercentage,ConsiderWallEmpty=considerWallEmpty,ConsiderLiquidEmpty=considerLiquidEmpty,ConsiderEverything=considerEverything});}
 public void Randomize(int seed,bool selection=true,bool walls=false,bool noDisappearing=true,bool dependentSupports=true,bool gravitySupports=true){Area(selection);new RandomizerPlugin(vm).Execute(new(){Seed=seed,OnlySelection=selection,EnableUndo=true,EnableWallRandomize=walls,NoDisappearingBlocks=noDisappearing,SupportDependentBlocks=dependentSupports,SupportGravityBlocks=gravitySupports});}
 public void GenerateOre(int seed,int[] ores,bool selection=true,bool includeAsh=true){Area(selection);if(ores.Length==0||ores.Length>64||ores.Any(o=>!TEdit.Terraria.WorldConfiguration.TileBricks.Any(t=>t.Id==o)))throw new ArgumentException("矿物列表无效");new SimpleOreGeneratorPlugin(vm).Execute(new(){Seed=seed,Ores=ores,OnlySelection=selection,EnableUndo=true,IncludeAsh=includeAsh});}
 public object Find(int[] items,int[] tiles,int[] walls,int[] sprites,int[] styles,bool distance=false){ClipboardSpriteMetadata.Build();return new OriginalFinder(vm).Search(items,tiles,walls,sprites,styles,distance);}
 public void GenerateText(string text,int letterSpacing=0,int rowSpacing=1,int lineLength=64,string alignment="Left")=>session.GenerateText(text,letterSpacing,rowSpacing,lineLength,alignment);
 public void GenerateHouse(string templateJson,int seed=1)=>session.GenerateHouse(templateJson,seed);
 public object GetReplay()=>session.ReplayInfo();
 public void SeekReplay(int frame=0)=>session.SeekReplay(frame);
 public void ConfigureReplay(string mode="Speed",double rate=1)=>session.ConfigureReplay(mode,rate);
 public void PlayReplay()=>session.PlayReplay();
 public void PauseReplay()=>session.PauseReplay();
 public void TickReplay()=>session.TickReplay();
 public void StepReplay(int direction=1)=>session.StepReplay(direction);
 public void SeekReplayTime(double milliseconds=0)=>session.SeekReplayTime(milliseconds);
 public void AdoptReplayFrame()=>session.AdoptReplayFrame();
 public void GenerateSpriteDebug(string textureSizesJson)=>session.GenerateSpriteDebug(textureSizesJson);
 public void StartRecording()=>session.StartRecording();
 public void StopRecording()=>session.StopRecording();
 public object GetRecording()=>session.RecordingInfo();
}
