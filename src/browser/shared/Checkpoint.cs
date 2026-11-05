using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using TEdit.Editor.Undo;

namespace TEdit.Port;
public sealed record CheckpointEntry(string Name,long Length,string Sha256);
public sealed record CheckpointManifest(int Schema,string SourceCommit,int Revision,uint WorldVersion,int Width,int Height,int OriginX,int OriginY,int CurrentIndex,int MaxIndex,CheckpointEntry[] Entries,bool IsTModLoader=false,bool IsConsole=false,bool IsV0=false);
public sealed partial class Session {
 public const string SourceCommit="84e3fc3466d405675a09da763169774b82c22d4d";
 public const int MaxCheckpointBytes=256*1024*1024;
 public const long MaxCheckpointExpandedBytes=1024L*1024*1024;
 public int RestoredRevision {get;private set;}
 public async Task<byte[]> CaptureCheckpointAsync(int revision=0){using var file=await CaptureCheckpointFileAsync(revision);return file.ReadAll();}
 public async Task<CheckpointFile> CaptureCheckpointFileAsync(int revision=0){
  string checkpointStage="initial";long retainedBytes=0;
  try{
  if(vm==null)throw new InvalidOperationException("请先打开世界");
  if(World!.Tiles.Length>1_048_576)GC.Collect();
  checkpointStage="history index";
  retainedBytes=GC.GetTotalMemory(false);
  var state=vm.UndoManager.CapturePersistentFiles();
  checkpointStage="runtime frames";
  using var runtimeFrames=new RuntimeFrameFile(World!);
  checkpointStage="runtime slopes";
  var runtimeShapes=TileRuntimeShapes.Capture(World!);
  checkpointStage="replay state";
  var replayState=await CaptureReplayState();
  checkpointStage="runtime types";
  var runtimeTypes=TileRuntimeTypes.Capture(World!);
  var floatingState=CaptureFloatingState();
  var aux=CaptureAux();
  using var runtimeMetadata=new MemoryStream();using(var metadataWriter=new BinaryWriter(runtimeMetadata,System.Text.Encoding.UTF8,true))WorldMetadata.Write(metadataWriter,WorldMetadata.Capture(World!));
  checkpointStage="world serialization";
  var saved=await ExportFilesAsync();
  var files=new Dictionary<string,byte[]>(StringComparer.Ordinal);files.Add("world.wld",saved.World);
  if(runtimeShapes.Length>0)files.Add("runtime-shapes.bin",runtimeShapes);
  if(replayState!=null)files.Add("replay.json",replayState);
  if(runtimeTypes.Length>0)files.Add("runtime-types.bin",runtimeTypes);
  if(floatingState!=null)files.Add("floating.json",floatingState);
  if(aux!=null)files.Add("session-aux.json",aux);
  files.Add("world-runtime.bin",runtimeMetadata.ToArray());
  if(saved.Sidecar!=null)files.Add("world.twld",saved.Sidecar);
  if(clipboard!=null)files.Add("clipboard.zip",ExportClipboardState());
  files.Add("interaction.json",JsonSerializer.SerializeToUtf8Bytes(CaptureInteraction()));
  files.Add("tools.json",System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(CaptureToolState()));
  if(saveBaseline!=null)files.Add("normalization.json",JsonSerializer.SerializeToUtf8Bytes(saveBaseline,SaveReports.Json));
  var streamed=state.Records.ToDictionary(pair=>"history/"+pair.Key,pair=>pair.Value,StringComparer.Ordinal);
  long runtimeFrameBytes=runtimeFrames.Length>8?runtimeFrames.Length:0;
  if(runtimeFrameBytes>0)streamed.Add("runtime-frames.bin",runtimeFrames.Path);
  if(files.Count+streamed.Count>=10000||files.Values.Sum(bytes=>(long)bytes.Length)+runtimeFrameBytes>MaxCheckpointBytes||files.Values.Sum(bytes=>(long)bytes.Length)+streamed.Values.Sum(path=>new FileInfo(path).Length)>MaxCheckpointExpandedBytes)throw new InvalidOperationException("恢复记录超过当前容量上限，上一检查点保留；请导出副本");
  checkpointStage="entry checksums";
  var entries=files.Select(pair=>new CheckpointEntry(pair.Key,pair.Value.Length,Convert.ToHexString(CheckpointHash.HashBytes(pair.Value))))
   .Concat(streamed.Select(pair=>{using var input=File.OpenRead(pair.Value);var entry=new CheckpointEntry(pair.Key,input.Length,Convert.ToHexString(CheckpointHash.HashStream(input)));OperationProgress.Advance(input.Length);return entry;})).ToArray();
  var manifest=new CheckpointManifest(13,SourceCommit,revision,World!.Version,World.TilesWide,World.TilesHigh,OriginX,OriginY,state.CurrentIndex,state.MaxIndex,entries,World.IsTModLoader,World.IsConsole,World.IsV0);
  var checkpointPath=Path.Combine(Path.GetTempPath(),"checkpoint-output-"+Guid.NewGuid().ToString("N")+".zip");
  try{
  using(var output=new FileStream(checkpointPath,FileMode.CreateNew,FileAccess.Write)){

  checkpointStage="ZIP output";
  using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true)){
   foreach(var (name,bytes) in files){using var stream=zip.CreateEntry(name,CompressionLevel.Fastest).Open();stream.Write(bytes);OperationProgress.Advance(bytes.Length);}
   var chunk=new byte[65536];
   foreach(var (name,path) in streamed){using var input=File.OpenRead(path);using var stream=zip.CreateEntry(name,CompressionLevel.Fastest).Open();int count;while((count=input.Read(chunk))>0){stream.Write(chunk,0,count);OperationProgress.Advance(count);}}
   using var writer=new StreamWriter(zip.CreateEntry("manifest.json",CompressionLevel.NoCompression).Open(),new UTF8Encoding(false));writer.Write(JsonSerializer.Serialize(manifest));
  }
  }
  if(new FileInfo(checkpointPath).Length>MaxCheckpointBytes)throw new InvalidOperationException("恢复记录过大，上一检查点保留");
  checkpointStage="delivery buffer";
  return new CheckpointFile(checkpointPath);
  }catch{if(File.Exists(checkpointPath))File.Delete(checkpointPath);throw;}
  }catch(Exception error){Console.Error.WriteLine($"Checkpoint memory diagnostic: stage={checkpointStage}; retained={retainedBytes}; current={GC.GetTotalMemory(false)}");Console.Error.WriteLine(error);throw;}
 }
 public void RestoreCheckpoint(byte[] capsule){
  if(vm!=null)throw new InvalidOperationException("恢复必须使用新的暂存会话");
  if(capsule.Length>MaxCheckpointBytes)throw new InvalidDataException("恢复包超过容量上限");
  using var zip=new ZipArchive(new MemoryStream(capsule),ZipArchiveMode.Read);
  if(zip.Entries.Count>10000||zip.Entries.Where(entry=>!entry.FullName.StartsWith("history/",StringComparison.Ordinal)).Sum(entry=>entry.Length)>MaxCheckpointBytes||zip.Entries.Sum(entry=>entry.Length)>MaxCheckpointExpandedBytes)throw new InvalidDataException("恢复包展开超过容量上限");
  var manifestEntry=zip.GetEntry("manifest.json")??throw new InvalidDataException("恢复清单缺失");
  if(manifestEntry.Length>2*1024*1024)throw new InvalidDataException("恢复清单过大");
  CheckpointManifest manifest;
  using(var reader=new StreamReader(manifestEntry.Open(),new UTF8Encoding(false,true)))manifest=JsonSerializer.Deserialize<CheckpointManifest>(reader.ReadToEnd())??throw new InvalidDataException("恢复清单无效");
  if(manifest.Schema is not (1 or 2 or 3 or 4 or 5 or 6 or 7 or 8 or 9 or 10 or 11 or 12 or 13)||manifest.SourceCommit!=SourceCommit||manifest.Revision<0||manifest.Entries==null||zip.Entries.Count!=manifest.Entries.Length+1)throw new InvalidDataException("恢复包版本或条目无效");
  if(zip.Entries.Select(entry=>entry.FullName).Distinct(StringComparer.Ordinal).Count()!=zip.Entries.Count)throw new InvalidDataException("恢复包存在重复路径");
  var files=new Dictionary<string,byte[]>(StringComparer.Ordinal);
  var history=new Dictionary<string,string>(StringComparer.Ordinal);
  string? runtimeFramesPath=null;
  var temporary=Path.Combine(Path.GetTempPath(),"checkpoint-history-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temporary);
  try{
  foreach(var item in manifest.Entries){
   if(!(manifest.Schema>=13&&item.Name=="world-runtime.bin")&&!(manifest.Schema>=12&&item.Name=="session-aux.json")&&!(manifest.Schema>=11&&item.Name=="floating.json")&&!(manifest.Schema>=9&&item.Name=="replay.json")&&!(manifest.Schema>=10&&item.Name=="runtime-types.bin")&&!(manifest.Schema>=8&&item.Name=="runtime-shapes.bin")&&!(manifest.Schema>=7&&item.Name=="interaction.json")&&!(manifest.Schema>=6&&item.Name=="tools.json")&&item.Name!="world.wld"&&!(manifest.Schema>=2&&item.Name=="world.twld")&&!(manifest.Schema>=3&&item.Name=="clipboard.zip")&&!(manifest.Schema>=4&&item.Name=="normalization.json")&&!(manifest.Schema>=5&&item.Name=="runtime-frames.bin")&&!Regex.IsMatch(item.Name,@"^history/(undo|redo)_temp_[0-9]+$"))throw new InvalidDataException("恢复包路径不在白名单");
   var entry=zip.GetEntry(item.Name)??throw new InvalidDataException("恢复记录缺失");
   if(entry.Length!=item.Length)throw new InvalidDataException("恢复记录长度错误");
   using var input=entry.Open();
   bool historyEntry=item.Name.StartsWith("history/",StringComparison.Ordinal);
   if(historyEntry||item.Name=="runtime-frames.bin"){
    string name=historyEntry?item.Name[8..]:item.Name,path=Path.Combine(temporary,name);
    using(var output=File.Create(path))using(var hash=CheckpointHash.Create()){
     var chunk=new byte[65536];int count;long length=0;
     while((count=input.Read(chunk))>0){length+=count;if(length>item.Length)throw new InvalidDataException("恢复历史长度错误");output.Write(chunk,0,count);hash.Append(chunk,count);OperationProgress.Advance(count);}
     if(length!=item.Length||Convert.ToHexString(hash.Finish())!=item.Sha256)throw new InvalidDataException("恢复历史校验失败");
    }
    if(historyEntry)history.Add(name,path);else runtimeFramesPath=path;
   }else{
    if(item.Length>MaxCheckpointBytes)throw new InvalidDataException("恢复辅助区段超过容量上限");
    using var buffer=new MemoryStream();input.CopyTo(buffer);var bytes=buffer.ToArray();
    if(bytes.LongLength!=item.Length||Convert.ToHexString(CheckpointHash.HashBytes(bytes))!=item.Sha256)throw new InvalidDataException("恢复记录校验失败");
    files.Add(item.Name,bytes);OperationProgress.Advance(bytes.Length);
   }
  }
  if(!files.TryGetValue("world.wld",out var world))throw new InvalidDataException("恢复世界缺失");
  Open(new WorldFileData(world,files.GetValueOrDefault("world.twld")));
  if(World!.Version!=manifest.WorldVersion||World.TilesWide!=manifest.Width||World.TilesHigh!=manifest.Height)throw new InvalidDataException("恢复世界元数据不一致");
  if(manifest.Schema>=2&&(World.IsTModLoader!=manifest.IsTModLoader||World.IsConsole!=manifest.IsConsole||World.IsV0!=manifest.IsV0))throw new InvalidDataException("恢复世界类型与配套清单不一致");
  if(manifest.Schema>=13&&!files.ContainsKey("world-runtime.bin"))throw new InvalidDataException("世界运行时恢复记录缺失");
  if(files.TryGetValue("world-runtime.bin",out var metadata)){if(metadata.Length<8)throw new InvalidDataException("世界运行时恢复记录不完整");using var reader=new BinaryReader(new MemoryStream(metadata));WorldMetadata.Read(reader,World);if(reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("世界运行时恢复区段有多余内容");}
  if(runtimeFramesPath!=null){
   using(var reader=new BinaryReader(File.OpenRead(runtimeFramesPath))){TileRuntimeFrames.Read(reader,World,true);if(reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("运行时帧恢复区段有多余内容");}
   // Release the browser's memory-backed file before allocating the clipboard.
   File.Delete(runtimeFramesPath);runtimeFramesPath=null;
   if(World.Tiles.Length>1_048_576)GC.Collect();
  }
  if(files.TryGetValue("runtime-shapes.bin",out var shapes)){using var reader=new BinaryReader(new MemoryStream(shapes));TileRuntimeShapes.Read(reader,World,true);if(reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("运行时坡面区段有多余内容");}
  if(files.TryGetValue("runtime-types.bin",out var types)){using var reader=new BinaryReader(new MemoryStream(types));TileRuntimeTypes.Read(reader,World,true);if(reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("运行时类型区段存在多余数据");}
  if(files.TryGetValue("clipboard.zip",out var restoredClipboard))ImportClipboardState(restoredClipboard);
  if(files.TryGetValue("floating.json",out var floatingForClipboard))PrepareRestoredFloatingClipboard(floatingForClipboard);
  if(files.TryGetValue("normalization.json",out var baseline)){
   if(baseline.Length>32*1024*1024)throw new InvalidDataException("保存变化基线超过预算");
   saveBaseline=JsonSerializer.Deserialize<SaveBaseline>(baseline,SaveReports.Json)??throw new InvalidDataException("保存变化基线无效");
   if(saveBaseline.Schema!=1||saveBaseline.SourceCommit!=SourceCommit||saveBaseline.CanonicalTags==null||saveBaseline.CanonicalTags.Count>100000)throw new InvalidDataException("保存变化基线版本或字段预算无效");
  }
  vm!.UndoManager.RestorePersistentFiles(new(manifest.CurrentIndex,manifest.MaxIndex,history),true);
  OriginX=manifest.OriginX;OriginY=manifest.OriginY;
  if(files.TryGetValue("tools.json",out var toolState)){using var parsed=JsonDocument.Parse(toolState);RestoreToolState(parsed.RootElement);}
  if(manifest.Schema>=6&&!files.ContainsKey("tools.json"))throw new InvalidDataException("工具恢复记录缺失");
  if(manifest.Schema>=7&&!files.ContainsKey("interaction.json"))throw new InvalidDataException("交互恢复记录缺失");
  if(files.TryGetValue("interaction.json",out var interaction)){using var parsed=JsonDocument.Parse(interaction);RestoreInteraction(parsed.RootElement);}
  if(files.TryGetValue("replay.json",out var replayState))RestoreReplayState(replayState);
  if(files.TryGetValue("floating.json",out var floatingState))RestoreFloatingState(floatingState);
  if(files.TryGetValue("session-aux.json",out var aux))RestoreAux(aux);
  RestoredRevision=manifest.Revision;
  }finally{if(Directory.Exists(temporary))Directory.Delete(temporary,true);}
 }
 public void CloseSession(){
  ClearFloatingMemory();
  vm?.UndoManager.Buffer?.Dispose();vm=null;brush=null;tools=null;domainApis=null;
  worldRenderer=null;renderWorld=null;renderTextures=null;lastRender=null;
  clipboard=null;clipboardIdentity=null;spriteFrameSheets.Clear();replayPlayer=null;replayFile=null;recorder=null;
  uvDraft=null;spriteEditor=null;
  DomainResult=null;DesktopResult=null;ScriptOutcome=null;ScriptDeliveries.Clear();saveBaseline=null;
 }
}
