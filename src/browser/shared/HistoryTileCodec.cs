using TEdit.Terraria;
namespace TEdit.Port;
// Internal history retains all editor-supported tiles even when editing an older world.
// The target world's downgrade policy is applied only at world export.
public static class HistoryTileCodec{
 public static bool[] Importance(bool[]? world){var config=WorldConfiguration.SettingsTileFrameImportant;if(world==null)return config;if(world.Length>=config.Length)return world;var merged=new bool[config.Length];Array.Copy(config,merged,config.Length);Array.Copy(world,merged,world.Length);return merged;}
}
