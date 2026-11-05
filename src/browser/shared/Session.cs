using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Input;
using TEdit.Editor;
using TEdit.Editor.Tools;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Terraria.Objects;
using TEdit.UI;
using TEdit.ViewModel;

namespace TEdit.Port;
public static class BrowserFiles {
 public static Func<Task<byte[]?>> OpenAsync=()=>Task.FromResult<byte[]?>(null);
 public static Func<byte[],string,Task> SaveAsync=(_,_)=>Task.CompletedTask;
}
public sealed class Command(Action execute) : ICommand {
 public event EventHandler? CanExecuteChanged {add{} remove{}}
 public bool CanExecute(object? p)=>true;
 public void Execute(object? p)=>execute();
}
// UI-independent session used by the browser worker.
public sealed partial class Session : INotifyPropertyChanged {
 static Session(){var b=ReactiveUI.Builder.RxAppBuilder.CreateReactiveUIBuilder();b.WithCoreServices();b.WithPlatformServices();b.BuildApp();WorldFiles.EnsureInitialized();}
 WorldViewModel? vm;
 BrushTool? brush;
 public event PropertyChangedEventHandler? PropertyChanged;
 public event Action? Changed;
 public string Status {get;private set;}="打开世界文件开始编辑；存档在本机处理。";
 public World? World=>vm?.CurrentWorld;
 public TilePicker? TilePicker=>vm?.TilePicker;
 public BrushSettings? Brush=>vm?.Brush;
 public TileMaskSettings? MaskSettings=>vm?.MaskSettings;
 public System.Collections.IEnumerable Materials=>WorldConfiguration.TileBricks;
 public Array MaskModes=>Enum.GetValues(typeof(MaskMode));
 public object? SelectedMaterial {get=>WorldConfiguration.TileBricks.FirstOrDefault(t=>t.Id==(TilePicker?.Tile??0));set{if(value is TileProperty t && vm!=null){vm.TilePicker.Tile=t.Id;Notify();}}}
 public int OriginX {get;set;}
 public int OriginY {get;set;}
 public const int MapWidth=384,MapHeight=256;
 public ICommand OpenCommand {get;}
 public ICommand ExportCommand {get;}
 public ICommand UndoCommand {get;}
 public ICommand RedoCommand {get;}
 public Session(){
  OpenCommand=new Command(async()=>{try{var data=await BrowserFiles.OpenAsync();if(data!=null)Open(data);}catch(Exception e){Fail(e);}});
  ExportCommand=new Command(async()=>{try{var saved=await ExportFilesAsync();await BrowserFiles.SaveAsync(saved.Sidecar==null?saved.World:Files.WorldFilePackage.PackPair(saved.World,saved.Sidecar,"TEdit.wld"),saved.Sidecar==null?"TEdit.wld":"TEdit.zip");}catch(Exception e){Fail(e);}});
  UndoCommand=new Command(Undo);RedoCommand=new Command(Redo);
 }
 void Notify(){PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));Changed?.Invoke();}
 public void Fail(Exception e){if(ThrowOnError)System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(e).Throw();Status=e.GetType().Name+": "+e.Message;Notify();}
 public void Open(byte[] data)=>Open(new WorldFileData(data,null));
 public void Open(WorldFileData data){
  var sw=Stopwatch.StartNew();var world=WorldFiles.Load(data);
  vm?.UndoManager.Buffer?.Dispose();vm=null;brush=null;
  spriteFrameSheets.Clear();saveBaseline=null;clipboard=null;clipboardIdentity=null;ClipboardRevision=0;clipboardMetadataReady=false;tools=null;domainApis=null;DomainResult=null;vm=new WorldViewModel(world);vm.Clipboard=new(this);replayPlayer=null;replayFile=null;recorder=null;recordingStartIndex=0;ItemCommands.ItemClipboard=null;DesktopSessionId=Guid.NewGuid().ToString("N");DesktopResult=null;ScriptOutcome=null;ScriptDeliveries.Clear();brush=new BrushTool(vm);
  vm.TilePicker.Tile=1;vm.TilePicker.TileStyleActive=true;vm.TilePicker.WallStyleActive=false;
  vm.Brush.Width=3;vm.Brush.Height=3;
  OriginX=Math.Max(0,world.SpawnX-MapWidth/2);OriginY=Math.Max(0,world.SpawnY-MapHeight/2);
  Status=$"{world.Title} · v{world.Version} · {world.TilesWide}×{world.TilesHigh} · {sw.ElapsedMilliseconds}ms · 原版 C# 画笔/撤销";
  Notify();
 }
 public void Undo(){if(vm==null)return;try{vm.UndoManager.Undo(collectChangedTiles:false);Notify();}catch(Exception e){Fail(e);}}
 public void Redo(){if(vm==null)return;try{vm.UndoManager.Redo(collectChangedTiles:false);Notify();}catch(Exception e){Fail(e);}}
 public void Pointer(int phase,int x,int y,bool shift=false,bool ctrl=false){
  if(vm==null||brush==null)return;
  var e=new TileMouseState{Location=new Vector2Int32(x,y)};
  if(phase!=2)e.Actions.Add(ctrl?"editor.draw.line":shift?"editor.draw.constrain":"editor.draw");
  try{if(phase==0)brush.MouseDown(e);else if(phase==1)brush.MouseMove(e);else brush.MouseUp(e);Notify();}catch(Exception ex){Fail(ex);}
 }
 public Task<WorldFileData> ExportFilesAsync(){
  if(vm==null)throw new InvalidOperationException("先打开世界");
  return WorldFiles.SaveAsync(vm.CurrentWorld);
 }
 public byte[] Render(){
  var pixels=new byte[MapWidth*MapHeight*4];if(vm==null)return pixels;
  var w=vm.CurrentWorld;
  for(int y=0;y<MapHeight;y++)for(int x=0;x<MapWidth;x++){
   int tx=OriginX+x,ty=OriginY+y;if(!w.ValidTileLocation(tx,ty))continue;
   string bg=ty<80?"Space":ty>w.TilesHigh-192?"Hell":ty>w.RockLevel?"Rock":ty>w.GroundLevel?"Earth":"Sky";
   var c=OriginalPixelMap.GetTileColor(w.Tiles[tx,ty],WorldConfiguration.GlobalColors[bg]);int i=(y*MapWidth+x)*4;
   pixels[i]=c.R;pixels[i+1]=c.G;pixels[i+2]=c.B;pixels[i+3]=255;
  }return pixels;
 }
 public string TileState(int x,int y)=>vm==null?"null":System.Text.Json.JsonSerializer.Serialize(vm.CurrentWorld.Tiles[x,y],new System.Text.Json.JsonSerializerOptions{IncludeFields=true});
 public int UndoIndex=>vm?.UndoManager.CurrentIndex??0;
}
