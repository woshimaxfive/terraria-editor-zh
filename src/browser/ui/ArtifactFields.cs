using System.Text.Json;
using System.Windows.Input;
namespace TEditBrowser;
public sealed partial class EditorViewModel {
 Avalonia.Threading.DispatcherTimer? replayTimer;
 bool replayPlaying,replayTickPending;
 void ApplyReplay(JsonElement info){
  replayPlaying=info.TryGetProperty("replay",out var replay)&&replay.GetProperty("playing").GetBoolean();
  if(!replayPlaying){replayTimer?.Stop();return;}
  if(replayTimer==null){replayTimer=new(){Interval=TimeSpan.FromMilliseconds(100)};replayTimer.Tick+=async(_,_)=>{
   if(!replayPlaying||Busy||picking||replayTickPending)return;
   var tick=allOperations.FirstOrDefault(o=>o.Group=="plugin"&&o.Name=="TickReplay");if(tick==null)return;
   replayTickPending=true;try{await Run("domain",new{id=tick.Id,args=Array.Empty<object>()});}finally{replayTickPending=false;}
  };}
  replayTimer.Start();
 }
 public Func<bool,Task<(byte[] Bytes,string Name)?>> PickArtifact {get;set;}=_=>Task.FromResult<(byte[],string)?>(null);
 public int PixelSpacing {get;set;}=4;
 public string[] PixelScalings {get;}=["Bilinear","NearestNeighbor","Bicubic","Lanczos","Hermite","Spline","Gaussian"];
 public string PixelScaling {get;set;}="Bilinear";
 public string[] PixelRotations {get;}=["None","Rotate90","Rotate180","Rotate270"];
 public string PixelRotation {get;set;}="None";
 public bool PixelWalls {get;set;}=true;
 public bool PixelTiles {get;set;}=true;
 public bool PixelSafe {get;set;}=true;
 public bool PixelUnique {get;set;}=true;
 public bool PixelBackdrop {get;set;}
 public bool PixelYAxis {get;set;}
 public int PixelLanczosA {get;set;}=3;
 public double PixelSigma {get;set;}=1;
 public ICommand PixelImportCommand=>new UiCommand(()=>_=ImportArtifact(false));
 public ICommand ReplayImportCommand=>new UiCommand(()=>_=ImportArtifact(true));
 public ICommand PlayerMapCommand=>new UiCommand(()=>_=Run("playerMap"));
 public ICommand ReplayExportCommand=>new UiCommand(()=>_=Run("replayExport"));
 public ICommand RecordingExportCommand=>new UiCommand(()=>_=Run("recordingExport"));
 async Task ImportArtifact(bool replay){if(picking||Busy)return;picking=true;bool wasEditable=Editable;Busy=true;Editable=false;PropertyChanged?.Invoke(this,new(null));try{var file=await PickArtifact(replay);if(file==null){Fail("未选择文件，当前状态保留");return;}if(replay)await CoreBridge.ImportReplay(file.Value.Bytes,file.Value.Name);else await CoreBridge.ImportImage(file.Value.Bytes,file.Value.Name,JsonSerializer.Serialize(new{spacing=PixelSpacing,scaling=PixelScaling,rotation=PixelRotation,axis=PixelYAxis?"YAxis":"XAxis",useTiles=PixelTiles,useWalls=PixelWalls,buildSafe=PixelSafe,uniqueColors=PixelUnique,backdrop=PixelBackdrop,lanczosA=PixelLanczosA,gaussianSigma=PixelSigma}));}catch(Exception error){Fail(error.Message);}finally{picking=false;if(Busy){Busy=false;Editable=wasEditable;PropertyChanged?.Invoke(this,new(null));}}}
}
