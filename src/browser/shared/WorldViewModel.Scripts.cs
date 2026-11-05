namespace TEdit.ViewModel;
public sealed partial class WorldViewModel {
 public string ScriptFileName {get;set;}="world.wld";
 public Action? ScriptCopySelection {get;set;}
 public List<TEdit.Port.ScriptDownloadSnapshot> ScriptDownloads {get;}=[];
 public void CaptureScriptDownload(string name,int version){
  var files=TEdit.Port.WorldFiles.Save(CurrentWorld,version==0?null:version);
  long bytes=(long)files.World.Length+(files.Sidecar?.Length??0)+ScriptDownloads.Sum(d=>(long)d.Files.World.Length+(d.Files.Sidecar?.Length??0));
  if(bytes>256*1024*1024)throw new InvalidOperationException("一次脚本导出文件合计超过256MiB，请减少导出份数");
  ScriptDownloads.Add(new(name,version,files));
 }
 public void UpdateRenderWorld()=>RegionChanged?.Invoke(0,0,CurrentWorld.TilesWide,CurrentWorld.TilesHigh);
}
