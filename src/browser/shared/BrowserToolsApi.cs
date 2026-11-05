using TEdit.Port;
using TEdit.ViewModel;
namespace TEdit.Scripting.Api;
// Desktop directory discovery and arbitrary disk paths have no browser equivalent.
// Saves are staged as downloads and released only after the transaction succeeds.
public sealed class ToolsApi(WorldViewModel vm) {
 public List<string> ListTools()=>Session.ToolNames.ToList();
 public void CopySelection()=>vm.ScriptCopySelection?.Invoke();
 public int GetTilePickerTile()=>vm.TilePicker.Tile;
 public int GetTilePickerWall()=>vm.TilePicker.Wall;
 public string GetFilePath()=>vm.ScriptFileName;
 public void SetFilePath(string path)=>vm.ScriptFileName=SafeName(path);
 public string GetWorldsFolder()=>"";
 public string GetSteamWorldsFolder()=>"";
 public List<Dictionary<string,string>> GetCloudWorldsFolders()=>[];
 public bool Save()=>SaveAs(vm.ScriptFileName);
 public bool SaveAs(string filename)=>SaveAs(filename,0);
 public bool SaveAs(string filename,int version){
  var name=SafeName(filename);
  if(vm.ScriptDownloads.Count>=16)throw new InvalidOperationException("一次脚本最多导出16份文件");
  if(version<0)throw new ArgumentException("存档版本无效");
  vm.CaptureScriptDownload(name,version);vm.ScriptFileName=name;return true;
 }
 public bool Load(string filename)=>throw new NotSupportedException("请先通过打开世界选择文件，再运行脚本；脚本不能访问本机路径");
 static string SafeName(string name){
  if(string.IsNullOrWhiteSpace(name)||name.Contains('/')||name.Contains('\\')||name.Contains(':')||name.Any(char.IsControl))throw new ArgumentException("请输入下载文件名，不能使用本机路径");
  return name.EndsWith(".wld",StringComparison.OrdinalIgnoreCase)?name:name+".wld";
 }
}
