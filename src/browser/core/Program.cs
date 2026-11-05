using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using TEdit.Port;
using TEdit.Editor;
using TEdit.Editor.Clipboard;
using TEdit.Terraria;
using TEdit.Port.Files;
using System.Security.Cryptography;

internal static class Program {static void Main(){}}
public static partial class WorkerCore {
 static WorkerCore(){CheckpointHash.Factory=()=>new BrowserCheckpointDigest();}
 [JSImport("report","operationProgress")] static partial void ReportProgress(double updates);
 static Session? session;
 static int revision;
 static byte[]? exported;
 static CheckpointFile? checkpointFile;
 static CheckpointFile? renderSceneFile;
 static RenderSceneTransfer? renderPacket;
 static string exportedWorldHash="";
 static bool exportedPair;
 static string exportedReport="";
 static Session Current=>session??throw new InvalidOperationException("请先打开世界");
 [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
 static void ReleaseSession(){session?.CloseSession();session=null;exported=null;checkpointFile?.Dispose();checkpointFile=null;FinishRenderScene();FinishRenderPacket();GC.Collect();}
 [JSExport] public static string Open(byte[] bytes,byte[] sidecar,bool hasSidecar){ReleaseSession();session=new Session{ThrowOnError=true};session.Open(new WorldFileData(bytes,hasSidecar?sidecar:null));revision=0;return Info();}
 [JSExport] public static string RestoreToolPreferences(string json){
  using var doc=JsonDocument.Parse(json);var state=doc.RootElement;
  var groups=new Dictionary<string,JsonElement>();
  foreach(var group in new[]{"paint","brush","mask","morph"})groups.Add(group,state.GetProperty(group));
  Current.RestoreToolState(JsonSerializer.SerializeToElement(groups));return Info();
 }
 [JSExport] public static string Info()=>JsonSerializer.Serialize(new{title=Current.World!.Title,spawnX=Current.World.SpawnX,spawnY=Current.World.SpawnY,version=Current.World.Version,width=Current.World.TilesWide,height=Current.World.TilesHigh,isV0=Current.World.IsV0,isConsole=Current.World.IsConsole,isTModLoader=Current.World.IsTModLoader,modTiles=Current.World.TwldData?.ModTileGrid.Count??0,modWalls=Current.World.TwldData?.ModWallGrid.Count??0,originX=Current.OriginX,originY=Current.OriginY,undoIndex=Current.UndoIndex,clipboard=Current.ClipboardInfo,clipboardRevision=Current.ClipboardRevision,revision,toolState=Current.CaptureToolState(),interaction=Current.InteractionInfo(),domainResult=Current.DomainResult,recording=Current.RecordingInfo(),replay=Current.ReplayInfo(),floatingPaste=Current.FloatingInfo(),desktopSessionId=Current.DesktopSessionId,desktopResult=Current.DesktopResult,scriptOutcome=Current.ScriptOutcome,managedBytes=GC.GetTotalMemory(false)});
 [JSExport] public static void PaletteTexture(string key,int width,int height,byte[] rgba)=>Current.RegisterPaletteTexture(key,width,height,rgba);
 [JSExport] public static string CatalogPreview(string kind,int id,int style)=>Current.CatalogPreviewJson(kind,id,style);
 [JSExport] public static string OpenTransformedWorld(byte[] bytes,int previousRevision){if(previousRevision<0||previousRevision==int.MaxValue)throw new ArgumentException("世界版本无效");Open(bytes,[],false);revision=previousRevision+1;return Info();}
 [JSExport] public static async Task PrepareTransformedWorld(string json){using var doc=JsonDocument.Parse(json);var p=doc.RootElement;OperationProgress.Begin(ReportProgress);try{exported=(await Current.TransformWorldFileAsync(p.GetProperty("mode").GetString()!,p.GetProperty("width").GetInt32(),p.GetProperty("height").GetInt32(),p.GetProperty("borders").GetBoolean())).World;}finally{OperationProgress.End();}}
 [JSExport] public static async Task TransformWorld(string json){using var doc=System.Text.Json.JsonDocument.Parse(json);var p=doc.RootElement;await Current.TransformWorldAsync(p.GetProperty("mode").GetString()!,p.GetProperty("width").GetInt32(),p.GetProperty("height").GetInt32(),p.GetProperty("borders").GetBoolean());revision++;}
 [JSExport] public static void ImportDesktopData(string page,byte[] bytes){Current.ImportDesktopData(page,bytes);revision++;}
 [JSExport] public static string RenderPlayerPreview(byte[] plain,string json)=>Current.PlayerPreviewJson(plain,json);
 [JSExport] public static void PreviewTexture(string key,int width,int height,byte[] rgba)=>Current.RegisterPreviewTexture(key,width,height,rgba);
 [JSExport] public static void ClearPreviewTextures()=>Current.ClearPreviewTextures();
 [JSExport] public static byte[] ScriptDownload(int index)=>Current.ScriptDeliveries[index].Bytes;
 [JSExport] public static string ScriptDownloadNames()=>JsonSerializer.Serialize(Current.ScriptDeliveries.Select(d=>d.Name));
 [JSExport] public static async Task RunScript(string json){using var doc=JsonDocument.Parse(json);var p=doc.RootElement;await Current.RunScriptAsync(p.GetProperty("language").GetString()!,p.GetProperty("code").GetString()!,p.TryGetProperty("timeoutMs",out var t)?t.GetInt32():10000);revision++;}
 [JSExport] public static string Catalog()=>JsonSerializer.Serialize(new{materials=new[]{new{id=-1,name="空白（清除方块）"}}.Concat(WorldConfiguration.TileBricks.Select(t=>new{id=t.Id,name=t.Name})),domainSchema=Current.DomainSchema(),sprites=Current.SpriteCatalog(),toolSchema=Current.ToolSchema(),tools=Session.ToolNames,maskModes=Enum.GetNames<MaskMode>(),saveVersions=WorldConfiguration.SaveConfiguration.GameVersionToSaveVersion.Keys.ToArray()});
 [JSExport] public static string ImportTemplate(byte[] bytes){Current.ImportTemplate(bytes);return Info();}
 [JSExport] public static void ReleaseClipboardForReplacement()=>Current.ReleaseClipboardForReplacement();
 [JSExport] public static byte[] TransformClipboardIsolated(byte[] bytes,string action,bool allow){OperationProgress.Begin(ReportProgress);try{return Session.TransformClipboardIsolated(bytes,action,allow);}finally{OperationProgress.End();}}
 [JSExport] public static byte[] ExportClipboardState()=>Current.ExportClipboardState();
 [JSExport] public static string ImportClipboardState(byte[] bytes){Current.ImportClipboardState(bytes);return Info();}
 [JSExport] public static byte[] ExportTemplate()=>Current.ExportTemplate();
 [JSExport] public static string RenderHover(string json)=>Current.RenderHoverJson(json);
 [JSExport] public static string RenderScene(string json)=>Current.RenderSceneJson(json);
 [JSExport] public static void PrepareRenderScene(string json){FinishRenderScene();renderSceneFile=Current.StreamRenderScene(json);}
 [JSExport] public static int RenderSceneLength()=>renderSceneFile?.Length??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static byte[] ReadRenderSceneChunk()=>renderSceneFile?.ReadChunk()??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static void FinishRenderScene(){renderSceneFile?.Dispose();renderSceneFile=null;}
 [JSExport] public static void PrepareRenderPacket(string json){FinishRenderPacket();renderPacket=Current.StreamRenderPacket(json);}
 [JSExport] public static int RenderPacketLength()=>renderPacket?.Length??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static byte[] ReadRenderPacketChunk()=>renderPacket?.ReadSceneChunk()??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static string RenderPacketTextures()=>renderPacket?.TextureInfo??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static byte[] ReadRenderTextureChunk(int index,int offset)=>renderPacket?.ReadTextureChunk(index,offset)??throw new InvalidOperationException("预览尚未生成");
 [JSExport] public static void FinishRenderPacket(){renderPacket?.Dispose();renderPacket=null;}


 [JSExport] public static void RenderTextures(string json)=>Current.RegisterRenderTextures(json);
 [JSExport] public static byte[] Minimap()=>Current.RenderMinimap();
 [JSImport("draw","renderExport")] private static partial Task<string> DrawExport(string scene);
 [JSImport("report","renderExport")] private static partial void ReportExport(double overall,double layer,string text);
 [JSExport] public static async Task PrepareRenderExport(string options){exported=await Current.ExportRenderedAsync(options,DrawExport,ReportExport);}
 [JSExport] public static void ApplySpriteConfigurations(string json)=>Current.ApplySpriteConfigurations(json);
 [JSExport] public static string ExplorerHeader(byte[] bytes,bool modded){
  WorldFiles.EnsureInitialized();if(bytes.Length<4||bytes.Length>256*1024*1024)throw new ArgumentException("世界文件大小无效");
  string path=Path.Combine(Path.GetTempPath(),Guid.NewGuid().ToString("N")+".wld");try{File.WriteAllBytes(path,bytes);var h=World.ReadWorldHeader(path)??throw new InvalidDataException("无法读取原版世界头");return JsonSerializer.Serialize(new{h.Title,h.Version,h.TilesWide,h.TilesHigh,h.IsCorrupt,h.CorruptReason,h.Seed,h.GameModeText,h.TerrariaVersionText,h.IsHardMode,h.EvilBiome,IsTModLoader=modded});}finally{File.Delete(path);}
 }
 [JSExport] public static byte[] ExplorerPreview(byte[] bytes){var preview=new Session{ThrowOnError=true};try{preview.Open(bytes);return preview.RenderMinimap();}finally{preview.CloseSession();}}
 [JSExport] public static byte[] Frame()=>Current.Render();
 [JSExport] public static async Task PrepareBaseline(byte[] world,byte[] sidecar,bool hasSidecar)=>await Current.PrepareSaveBaselineAsync(new(world,hasSidecar?sidecar:null));
 [JSExport] public static async Task PrepareVersionExport(string gameVersion,bool preserveAll,string worldName){
  if(!WorldConfiguration.SaveConfiguration.GameVersionToSaveVersion.ContainsKey(gameVersion))throw new ArgumentException("请选择原版支持的游戏版本");
  int target=WorldConfiguration.SaveConfiguration.GetDataForGameVersion(gameVersion).SaveVersion;
  var saved=await WorldFiles.SaveAsync(Current.World!,target,preserveAll);exportedPair=saved.Sidecar!=null;exported=saved.Sidecar==null?saved.World:WorldFilePackage.PackPair(saved.World,saved.Sidecar,worldName);exportedWorldHash=Convert.ToHexString(SHA256.HashData(saved.World)).ToLowerInvariant();
 }
 [JSExport] public static string ExportedReport()=>exportedReport;
 [JSExport] public static async Task PrepareExport(string worldName){var saved=await Current.ExportFilesAsync();exportedWorldHash=Convert.ToHexString(SHA256.HashData(saved.World)).ToLowerInvariant();exportedPair=saved.Sidecar!=null;exported=saved.Sidecar==null?saved.World:WorldFilePackage.PackPair(saved.World,saved.Sidecar,worldName);try{exportedReport=Current.SaveReport(saved,revision);}catch(InvalidOperationException error){exportedReport=JsonSerializer.Serialize(new{unavailable=error.Message},SaveReports.Json);}}
 [JSExport] public static string ExportedWorldHash()=>exportedWorldHash;
 [JSExport] public static bool ExportedPair()=>exportedPair;
 [JSExport] public static byte[] TakeExport(){var bytes=exported??throw new InvalidOperationException("导出尚未准备完成");exported=null;return bytes;}
 [JSExport] public static async Task ValidateRecoveryCapacity()=>await Current.ValidateRecoveryCapacityAsync();
 [JSExport] public static async Task PrepareCheckpoint(){OperationProgress.Begin(ReportProgress);try{checkpointFile?.Dispose();checkpointFile=null;checkpointFile=await Current.CaptureCheckpointFileAsync(revision);}finally{OperationProgress.End();}}
 [JSExport] public static int CheckpointLength()=>checkpointFile?.Length??throw new InvalidOperationException("检查点尚未生成");
 [JSExport] public static byte[] ReadCheckpointChunk()=>checkpointFile?.ReadChunk()??throw new InvalidOperationException("检查点尚未生成");
 [JSExport] public static void FinishCheckpoint(){checkpointFile?.Dispose();checkpointFile=null;}
 [JSExport] public static byte[] TakeCheckpoint(){try{return checkpointFile?.ReadAll()??throw new InvalidOperationException("检查点尚未生成");}finally{FinishCheckpoint();}}
 [JSExport] public static string Restore(byte[] capsule,int savedRevision){if(savedRevision<0)throw new ArgumentException("恢复版本无效");ReleaseSession();session=new Session{ThrowOnError=true};OperationProgress.Begin(ReportProgress);try{session.RestoreCheckpoint(capsule);if(savedRevision!=session.RestoredRevision)throw new InvalidDataException("恢复版本与检查点不一致");revision=savedRevision;return Info();}finally{OperationProgress.End();}}
 [JSExport] public static async Task PrepareNewWorld(string options){_=new Session();OperationProgress.Begin(ReportProgress);try{exported=await NewWorldFiles.Create(options);}finally{OperationProgress.End();}}
 [JSExport] public static async Task<string> OpenReplay(byte[] bytes){ReleaseSession();session=new Session{ThrowOnError=true};await session.OpenReplayAsync(bytes);revision=0;return Info();}
 [JSExport] public static async Task PrepareArtifact(string kind){exported=await Current.ExportArtifact(kind);if(kind=="recordingExport")revision++;}
 [JSExport] public static string Command(string action,string json){
  var current=Current;
  if(current.IsReplayLoaded&&action is not ("collect" or "domain" or "copy"))throw new InvalidOperationException("请先将当前回放帧设为编辑起点");
  OperationProgress.Begin(ReportProgress);try{
  switch(action){
   case "tool":
    using(var doc=JsonDocument.Parse(json))if(current.ExecuteTool(doc.RootElement))revision++;break;
   case "cad":using(var doc=JsonDocument.Parse(json))current.ConfigureCad(doc.RootElement);revision++;break;
   case "sprite":using(var doc=JsonDocument.Parse(json))current.SelectSprite(doc.RootElement.GetProperty("tile").GetInt32(),doc.RootElement.GetProperty("style").GetInt32());revision++;break;
   case "domain":using(var doc=JsonDocument.Parse(json))if(current.ExecuteDomain(doc.RootElement))revision++;break;
   case "point":using(var doc=JsonDocument.Parse(json))current.SelectPoint(doc.RootElement.GetProperty("name").GetString()!);revision++;break;
   case "uvEditor":using(var doc=JsonDocument.Parse(json))if(current.EditUv(doc.RootElement))revision++;break;
   case "spriteEditor":using(var doc=JsonDocument.Parse(json))current.EditSpriteSheet(doc.RootElement);break;
   case "desktopRead":using(var doc=JsonDocument.Parse(json))current.DesktopRead(doc.RootElement.GetProperty("page").GetString()!);break;
   case "desktopEdit":using(var doc=JsonDocument.Parse(json))current.DesktopEdit(doc.RootElement);revision++;break;
   case "pixelArt":using(var doc=JsonDocument.Parse(json))current.GeneratePixelArt(doc.RootElement);break;
   case "floating":using(var doc=JsonDocument.Parse(json))if(current.ConfigureFloating(doc.RootElement))revision++;break;
   case "stroke":
    using(var doc=JsonDocument.Parse(json)){
     var settings=doc.RootElement.GetProperty("settings");var points=doc.RootElement.GetProperty("points").EnumerateArray().ToArray();
     int tile=settings.GetProperty("tile").GetInt32(),width=settings.GetProperty("width").GetInt32(),height=settings.GetProperty("height").GetInt32();
     if(points.Length<2||points.Length>4096||width<1||width>400||height<1||height>400||!WorldConfiguration.TileBricks.Any(t=>t.Id==tile))throw new ArgumentException("笔画或设置无效，未修改世界");
     // Input point count and brush dimensions remain independently validated.
     if(!Enum.TryParse<MaskMode>(settings.GetProperty("mask").GetString(),out var mask)||!Enum.IsDefined(mask))throw new ArgumentException("掩码无效");
     foreach(var point in points)if(!current.World!.ValidTileLocation(point.GetProperty("x").GetInt32(),point.GetProperty("y").GetInt32()))throw new ArgumentException("坐标超出世界");
     current.TilePicker!.Tile=tile;current.TilePicker.TileStyleActive=settings.GetProperty("tileActive").GetBoolean();current.MaskSettings!.TileMaskMode=mask;
     current.Brush!.Width=width;current.Brush.Height=height;
     for(int i=0;i<points.Length;i++){var p=points[i];current.Pointer(i==0?0:i==points.Length-1?2:1,p.GetProperty("x").GetInt32(),p.GetProperty("y").GetInt32(),p.GetProperty("shift").GetBoolean(),p.GetProperty("ctrl").GetBoolean());}
    }revision++;break;
   case "cut":case "delete":
    using(var doc=JsonDocument.Parse(json)){var p=doc.RootElement;var filters=p.TryGetProperty("filters",out var f)?JsonSerializer.Deserialize<CopyFilters>(f.GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true}):null;current.DeleteRegion(p.GetProperty("x").GetInt32(),p.GetProperty("y").GetInt32(),p.GetProperty("width").GetInt32(),p.GetProperty("height").GetInt32(),action=="cut",filters);}revision++;break;
   case "copy":
    using(var doc=JsonDocument.Parse(json)){var p=doc.RootElement;var filters=p.TryGetProperty("filters",out var f)?JsonSerializer.Deserialize<CopyFilters>(f.GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true}):null;current.CopyRegion(p.GetProperty("x").GetInt32(),p.GetProperty("y").GetInt32(),p.GetProperty("width").GetInt32(),p.GetProperty("height").GetInt32(),filters);}break;
   case "flipX":case "flipY":case "rotate":
    using(var doc=JsonDocument.Parse(json))current.TransformClipboard(action,doc.RootElement.ValueKind==JsonValueKind.Object&&doc.RootElement.TryGetProperty("allowSpriteRemoval",out var allow)&&allow.GetBoolean());break;
   case "bindLegacy":current.BindLegacyClipboard();break;
   case "paste":
    using(var doc=JsonDocument.Parse(json)){var p=doc.RootElement;var options=JsonSerializer.Deserialize<PasteOptions>(p.GetProperty("options").GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new ArgumentException("粘贴设置无效");current.PasteClipboard(p.GetProperty("x").GetInt32(),p.GetProperty("y").GetInt32(),options);}revision++;break;
   case "undo":current.Undo();revision++;break;
   case "redo":current.Redo();revision++;break;
   case "collect":GC.Collect();break;
   default:throw new ArgumentException("未知核心命令");
  }current.PollRecorder();return Info();}finally{OperationProgress.End();}
 }
}
