using System.Text;
using System.Text.Json;
using TEdit.Editor.Plugins;
using TEdit.Editor.Undo;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed partial class Session {
 ReplayFile? replayFile;
 ReplayPlayer? replayPlayer;
 ReplayRecorder? recorder;
 int recordingStartIndex;
 public void StartRecording(){RequireWorld();if(World!.IsTModLoader)throw new InvalidOperationException("原版回放不承载模组配套，请导出世界与配套");if(replayPlayer!=null)throw new ArgumentException("请先将回放帧转为编辑起点");vm!.UndoManager.CompletePendingForRecorder();recordingStartIndex=UndoIndex;recorder=new(vm);recorder.Start();}
 public void StopRecording(){if(recorder==null)throw new ArgumentException("尚未开始录制");PollRecorder();recorder.Stop();}
 public object RecordingInfo()=>new{recording=recorder?.IsRecording??false,frames=recorder?.Recording?.Frames.Count??0};
 public void PollRecorder(){if(recorder?.IsRecording==true){vm!.UndoManager.CompletePendingForRecorder();int keep=Math.Max(0,UndoIndex-recordingStartIndex);if(keep<recorder.Recording.Frames.Count){recorder.Recording.Frames.RemoveRange(keep,recorder.Recording.Frames.Count-keep);recorder.ForgetFrom(UndoIndex);}if(UndoIndex<recordingStartIndex){recordingStartIndex=UndoIndex;recorder.MarkExisting();}recorder.Poll();}}
 byte[]? CaptureRecordingState(){if(recorder?.Recording==null)return null;PollRecorder();return JsonSerializer.SerializeToUtf8Bytes(new{active=recorder.IsRecording,startIndex=recordingStartIndex,start=recorder.Recording.StartTime,total=recorder.Recording.TotalTime,frames=recorder.Recording.Frames});}
 void RestoreRecordingState(byte[] bytes){
  using var data=JsonDocument.Parse(bytes);var state=data.RootElement;recordingStartIndex=state.GetProperty("startIndex").GetInt32();if(recordingStartIndex<0||recordingStartIndex>9998)throw new InvalidDataException("录制历史起点无效");
  var frames=state.GetProperty("frames").Deserialize<List<ReplayFrame>>()??throw new InvalidDataException("录制帧缺失");bool active=state.GetProperty("active").GetBoolean();long total=state.GetProperty("total").GetInt64();
  if(frames.Count>9998||total<0||frames.Any(f=>f==null||f.Time<0||f.Data==null||f.Data.Length<4)||frames.Zip(frames.Skip(1)).Any(p=>p.First.Time>p.Second.Time)||(!active&&frames.LastOrDefault()?.Time>total)||(active&&frames.Count!=Math.Max(0,UndoIndex-recordingStartIndex)))throw new InvalidDataException("录制帧、时间或历史分支无效");
  var file=new ReplayFile{BaselineWorld=World!,StartTime=state.GetProperty("start").GetDateTime(),TotalTime=total,Frames=frames};ValidateReplayTiles(file);
  recorder=new(vm!);recorder.Start();var flags=System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance;typeof(ReplayRecorder).GetProperty("Recording")!.SetValue(recorder,file);typeof(ReplayRecorder).GetField("_startTime",flags)!.SetValue(recorder,file.StartTime);typeof(ReplayRecorder).GetProperty("IsRecording")!.SetValue(recorder,active);recorder.MarkExisting();
 }
 public bool IsReplayLoaded=>replayPlayer!=null;
 public object ReplayInfo()=>new{loaded=replayPlayer!=null,index=replayPlayer?.CurrentIndex??0,count=replayPlayer?.FrameCount??0,time=replayPlayer?.CurrentTime??0,total=replayPlayer?.TotalTime??0,playing=replayPlayer?.IsPlaying??false,mode=replayMode.ToString(),speed=replaySpeed,delay=replayDelay};
 static void ValidateReplay(byte[] bytes){
  if(bytes.Length<36||bytes.Length>MaxCheckpointBytes)throw new InvalidDataException("回放大小无效");
  using var reader=new BinaryReader(new MemoryStream(bytes));
  if(Encoding.UTF8.GetString(reader.ReadBytes(4))!="TERP"||reader.ReadInt32()!=1)throw new InvalidDataException("回放格式或版本无效");
  _=DateTimeOffset.FromUnixTimeMilliseconds(reader.ReadInt64());long total=reader.ReadInt64();int count=reader.ReadInt32(),length=reader.ReadInt32();
  if(total<0||count<0||count>9998||length<1||length>reader.BaseStream.Length-reader.BaseStream.Position-4)throw new InvalidDataException("回放头部超出预算");
  string probePath=Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".wld");try{File.WriteAllBytes(probePath,reader.ReadBytes(length));_=WorldFiles.Probe(probePath);}finally{if(File.Exists(probePath))File.Delete(probePath);}long previous=-1;
  for(int i=0;i<count;i++){long time=reader.ReadInt64();int size=reader.ReadInt32();if(time<previous||time>total||size<4||size>reader.BaseStream.Length-reader.BaseStream.Position-4)throw new InvalidDataException("回放帧无效");previous=time;reader.BaseStream.Position+=size;}
  if(reader.BaseStream.Position!=reader.BaseStream.Length-4||Encoding.UTF8.GetString(reader.ReadBytes(4))!="TERP")throw new InvalidDataException("回放结尾无效");
 }
 static ReplayFile LoadReplay(byte[] bytes){ValidateReplay(bytes);string path=Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".terp");try{File.WriteAllBytes(path,bytes);var file=new ReplayFile();file.Load(path);return file;}finally{if(File.Exists(path))File.Delete(path);}}
 static byte[] SaveReplay(ReplayFile file){string path=Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".terp");uint revision=file.BaselineWorld.FileRevision;try{file.Save(path);return File.ReadAllBytes(path);}finally{file.BaselineWorld.FileRevision=revision;if(File.Exists(path))File.Delete(path);}}
 void ValidateReplayTiles(ReplayFile file){long work=0;foreach(var frame in file.Frames){using var reader=new BinaryReader(new MemoryStream(frame.Data));int groups=reader.ReadInt32();if(groups<0||groups>frame.Data.Length/3)throw new InvalidDataException("回放分组无效");foreach(var tile in frame.ReadTiles(World!)){if(!World!.ValidTileLocation(tile.Location.X,tile.Location.Y)||++work>4_194_304)throw new InvalidDataException("回放坐标或图格工作量超出预算");}}}
 public void OpenReplay(byte[] bytes)=>OpenReplayAsync(bytes).GetAwaiter().GetResult();
 public async Task OpenReplayAsync(byte[] bytes){
  var file=LoadReplay(bytes);if(file.BaselineWorld.IsTModLoader)throw new InvalidDataException("原版回放不包含模组配套，请使用世界与配套文件");
  // The loaded baseline becomes the sole world owner; no second editable world.
  byte[] baseline=(await WorldFiles.SaveAsync(file.BaselineWorld)).World;
  Open(baseline);file.BaselineWorld=World!;ValidateReplayTiles(file);replayFile=file;replayPlayer=new(file);ResetReplayControls();DomainResult=ReplayInfo();
 }
 public void SeekReplay(int index){RequireWorld();if(replayPlayer==null)throw new ArgumentException("请先打开 .terp 回放");if(index<0||index>replayPlayer.FrameCount)throw new ArgumentException("回放帧超出范围");replayPlayer.Seek(index);DomainResult=ReplayInfo();}
 public void AdoptReplayFrame(){RequireWorld();replayPlayer=null;replayFile=null;vm!.UndoManager.RestorePersistentState(new(0,0,new()));DomainResult=new{message="已将当前回放帧作为新的编辑起点"};}
 internal async Task<byte[]?> CaptureReplayState()=>replayPlayer==null?null:JsonSerializer.SerializeToUtf8Bytes(new{index=replayPlayer.CurrentIndex,time=replayPlayer.CurrentTime,playing=replayPlayer.IsPlaying,mode=replayMode.ToString(),speed=replaySpeed,delay=replayDelay,bytes=await ExportArtifact("replayExport")});
 void RestoreReplayState(byte[] bytes){using var state=JsonDocument.Parse(bytes);var file=LoadReplay(state.RootElement.GetProperty("bytes").GetBytesFromBase64());if(file.BaselineWorld.TilesWide!=World!.TilesWide||file.BaselineWorld.TilesHigh!=World.TilesHigh)throw new InvalidDataException("回放恢复尺寸不一致");int index=state.RootElement.GetProperty("index").GetInt32();if(index<0||index>file.Frames.Count)throw new InvalidDataException("回放恢复索引无效");World.Tiles=file.BaselineWorld.Tiles;file.BaselineWorld=World;ValidateReplayTiles(file);replayFile=file;replayPlayer=new(file);ResetReplayControls();replayPlayer.Seek(index);RestoreReplayControls(state.RootElement);}
 public async Task<byte[]> ExportArtifact(string kind){
  RequireWorld();if(kind=="playerMap"){
   var data=WorldConfiguration.SaveConfiguration.GetData(World!.Version);if(data.MaxTileId<752||data.MaxWallId<366)throw new InvalidOperationException("原版玩家地图颜色表要求新版本世界，请先导出并重开兼容版本副本");
   string dir=Path.Combine(Path.GetTempPath(),"map-"+Guid.NewGuid());Directory.CreateDirectory(dir);uint revision=World.FileRevision;
   try{await OriginalPlayerMap.MapBuilder.BuildMapAsync(World,dir);var file=Directory.GetFiles(dir,"*.map").Single();return File.ReadAllBytes(file);}finally{World.FileRevision=revision;foreach(string file in Directory.GetFiles(dir))File.Delete(file);Directory.Delete(dir);}
  }
  if(kind=="recordingExport"){if(World!.IsTModLoader)throw new InvalidOperationException("原版回放不承载模组配套，请导出世界与配套");if(recorder==null)throw new ArgumentException("尚未录制");StopRecording();return SaveReplay(recorder.Recording);}
  if(kind!="replayExport")throw new ArgumentException("未知文件导出类型");
  if(World!.IsTModLoader)throw new InvalidOperationException("原版回放不承载模组配套，请导出世界与配套");
  if(replayPlayer!=null){int index=replayPlayer.CurrentIndex;double time=replayPlayer.CurrentTime;try{replayPlayer.Seek(replayPlayer.FrameCount);return SaveReplay(replayFile!);}finally{replayPlayer.Seek(index);typeof(ReplayPlayer).GetField("_playTime",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!.SetValue(replayPlayer,time);}}
  var state=vm!.UndoManager.CapturePersistentState();var replay=new ReplayFile{BaselineWorld=World!,StartTime=DateTime.UnixEpoch,TotalTime=state.CurrentIndex*250L};
  for(int i=0;i<state.CurrentIndex;i++)replay.Frames.Add(new(){Index=i,Time=(i+1)*250L,Data=state.Records[$"undo_temp_{i}"]});
  ValidateReplayTiles(replay);return SaveReplay(replay);
 }
}
