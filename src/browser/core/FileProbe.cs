using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using TEdit.Port;
using TEdit.Terraria;

// Isolated file-adapter acceptance entry, used only by formats-worker.js. It is
// not called by the UI Worker; replacing Session's file path follows this proof.
public static partial class FileProbe {
 static World? world;
 static WorldFileData? saved;
 [JSExport] public static string Load(byte[] bytes,byte[] sidecar){
  var reactive=ReactiveUI.Builder.RxAppBuilder.CreateReactiveUIBuilder();reactive.WithCoreServices();reactive.WithPlatformServices();reactive.BuildApp();
  world=WorldFiles.Load(new(bytes,sidecar.Length==0?null:sidecar));saved=null;return Info();
 }
 [JSExport] public static string Info()=>JsonSerializer.Serialize(new{version=world!.Version,width=world.TilesWide,height=world.TilesHigh,isV0=world.IsV0,isConsole=world.IsConsole,isTModLoader=world.IsTModLoader,modTiles=world.TwldData?.ModTileGrid.Count??0,modWalls=world.TwldData?.ModWallGrid.Count??0});
 [JSExport] public static async Task Save(){saved=await WorldFiles.SaveAsync(world!);}
 [JSExport] public static byte[] SavedWorld()=>saved!.World;
 [JSExport] public static byte[] Sidecar()=>saved?.Sidecar??[];
 [JSExport] public static string Reopen(){world=null;GC.Collect();world=WorldFiles.Load(saved!);return Info();}
}
