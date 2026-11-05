using TEdit.Terraria;

namespace TEdit.Editor.Undo;
public sealed record UndoPersistentState(int CurrentIndex,int MaxIndex,Dictionary<string,byte[]> Records);
public sealed record UndoPersistentFiles(int CurrentIndex,int MaxIndex,Dictionary<string,string> Records);
public partial class UndoManager {
 public UndoPersistentState CapturePersistentState(){
  var files=CapturePersistentFiles();
  return new(files.CurrentIndex,files.MaxIndex,files.Records.ToDictionary(p=>p.Key,p=>File.ReadAllBytes(p.Value),StringComparer.Ordinal));
 }
 public UndoPersistentFiles CapturePersistentFiles(){
  WaitForPendingClose();
  if(Buffer!=null&&!Buffer.IsEmpty)throw new InvalidOperationException("当前笔画尚未提交，不能保存历史");
  if(_currentIndex>9998||_maxIndex>9998)throw new InvalidOperationException("历史条目超过恢复容量，上一检查点保留");
  var records=new Dictionary<string,string>(StringComparer.Ordinal);
  long total=0;
  string ReadRecord(string path){total+=new FileInfo(path).Length;if(total>TEdit.Port.Session.MaxCheckpointExpandedBytes)throw new InvalidOperationException("历史超过恢复容量，上一检查点保留");return path;}
  for(int i=0;i<_currentIndex;i++){
   string path=string.Format(UndoFile,i);
   if(!File.Exists(path))throw new InvalidDataException("撤销记录缺失，上一检查点保留");
   records.Add(Path.GetFileName(path),ReadRecord(path));
  }
  for(int i=_currentIndex+1;i<=_maxIndex+1;i++){
   string path=string.Format(RedoFile,i);
   if(File.Exists(path))records.Add(Path.GetFileName(path),ReadRecord(path));
  }
  return new(_currentIndex,_maxIndex,records);
 }
 public void RestorePersistentState(UndoPersistentState state){
  var temporary=Path.Combine(Path.GetTempPath(),"undo-stage-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temporary);
  try{
   var paths=new Dictionary<string,string>(StringComparer.Ordinal);
   foreach(var (name,bytes) in state.Records){
    if(!System.Text.RegularExpressions.Regex.IsMatch(name,@"^(undo|redo)_temp_[0-9]+$"))throw new InvalidDataException("历史记录路径无效");
    var path=Path.Combine(temporary,name);File.WriteAllBytes(path,bytes);paths.Add(name,path);
   }
   RestorePersistentFiles(new(state.CurrentIndex,state.MaxIndex,paths),true);
  }finally{if(Directory.Exists(temporary))Directory.Delete(temporary,true);}
 }
 public void RestorePersistentFiles(UndoPersistentFiles state,bool transfer=false){
  if(state.CurrentIndex<0||state.MaxIndex<0||state.CurrentIndex>state.MaxIndex+1||state.CurrentIndex>9998||state.MaxIndex>9998)throw new InvalidDataException("历史索引无效");
  var validatedMetadata=new HashSet<string>(StringComparer.Ordinal);
  for(int i=0;i<state.CurrentIndex;i++)if(!state.Records.ContainsKey($"undo_temp_{i}"))throw new InvalidDataException("撤销链不完整");
  foreach(var (name,path) in state.Records){
   var match=System.Text.RegularExpressions.Regex.Match(name,@"^(undo|redo)_temp_([0-9]+)$");
   if(!match.Success||!int.TryParse(match.Groups[2].Value,out int index)||index<0||index>state.MaxIndex+1||new FileInfo(path).Length<4)throw new InvalidDataException("历史记录无效");
   if(match.Groups[1].Value=="undo"&&index>=state.CurrentIndex||match.Groups[1].Value=="redo"&&index<=state.CurrentIndex)throw new InvalidDataException("历史记录与索引冲突");
   using var reader=new BinaryReader(File.OpenRead(path));
   foreach(var tile in UndoBuffer.ReadUndoTilesFromStream(reader,_world.TileFrameImportant)){TEdit.Port.OperationProgress.Advance();if(!_world.ValidTileLocation(tile.Location.X,tile.Location.Y))throw new InvalidDataException("历史坐标越界");}
   var chests=World.LoadChestData(reader,_world.Version).ToList();_=World.LoadSignData(reader).ToArray();var entities=World.LoadTileEntityData(reader,_world.Version).ToList();
   if(reader.BaseStream.Position<reader.BaseStream.Length){
    long start=reader.BaseStream.Position;
    if(!ModDataSerializer.LoadModPayload(reader,chests,entities,out var tiles,out var walls,_world.TwldData)&&reader.BaseStream.Position!=start)throw new InvalidDataException("历史模组记录无效");
    if((tiles?.Count>0||walls?.Count>0)&&_world.TwldData==null)throw new InvalidDataException("历史模组覆盖缺少世界配套");
    if(tiles?.Any(tile=>!_world.ValidTileLocation(tile.X,tile.Y))==true||walls?.Any(wall=>!_world.ValidTileLocation(wall.X,wall.Y))==true)throw new InvalidDataException("历史模组坐标越界");
   }
   UndoLegacyLighting.Read(reader,_world,false);TEdit.Port.TileRuntimeFrames.Read(reader,_world,false);UndoEntityOrder.Read(reader,_world,false);TEdit.Port.TileRuntimeShapes.Read(reader,_world,false);TEdit.Port.TileRuntimeTypes.Read(reader,_world,false);TEdit.Port.WorldMetadata.Validate(reader,validatedMetadata);
   if(reader.BaseStream.Position!=reader.BaseStream.Length)throw new InvalidDataException("历史存在未读取的数据");
  }
  if(state.Records.Values.Any(path=>Path.GetFullPath(path).StartsWith(Path.GetFullPath(Dir)+Path.DirectorySeparatorChar,StringComparison.Ordinal)))throw new InvalidDataException("恢复历史必须来自独立暂存目录");
  WaitForPendingClose();_buffer?.Dispose();_buffer=null;
  foreach(string path in Directory.EnumerateFiles(Dir))if(Path.GetFileName(path).StartsWith("undo_temp_",StringComparison.Ordinal)||Path.GetFileName(path).StartsWith("redo_temp_",StringComparison.Ordinal))File.Delete(path);
  foreach(var (name,path) in state.Records)if(transfer)File.Move(path,Path.Combine(Dir,name),true);else File.Copy(path,Path.Combine(Dir,name),true);
  _currentIndex=state.CurrentIndex;_maxIndex=state.MaxIndex;CreateBuffer();
 }
}
