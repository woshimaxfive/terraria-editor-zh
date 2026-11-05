namespace TEdit.Editor.Plugins;
public sealed class BlockShuffleOptions {
 public int Seed {get;set;}=1;
 public bool OnlySelection {get;set;}=true;
 public bool IncludeTileEntities {get;set;}
 public bool SensitivePlatform {get;set;}=true;
 public bool EnableUndo {get;set;}=true;
 public int ReplaceEmptyPercentage {get;set;}=100;
 public bool ConsiderWallEmpty {get;set;}
 public bool ConsiderLiquidEmpty {get;set;}
 public bool ConsiderEverything {get;set;}
}
public sealed class RandomizerOptions {
 public int Seed {get;set;}=1;
 public bool OnlySelection {get;set;}=true;
 public bool EnableUndo {get;set;}=true;
 public bool EnableWallRandomize {get;set;}
 public bool NoDisappearingBlocks {get;set;}=true;
 public bool SupportDependentBlocks {get;set;}=true;
 public bool SupportGravityBlocks {get;set;}=true;
}
public sealed class RemoveTilesOptions {
 public string BlockToRemove {get;set;}="";
 public string WallToRemove {get;set;}="";
}
public sealed class OreOptions {
 public int Seed {get;set;}=1;
 public bool OnlySelection {get;set;}=true;
 public bool IncludeAsh {get;set;}=true;
 public bool EnableUndo {get;set;}=true;
 public int[] Ores {get;set;}=[7,6,9,8];
}
