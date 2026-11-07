using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Markup.Xaml;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Platform.Storage;

namespace TEditBrowser;
public partial class MainView:UserControl {
 public static EditorViewModel Current {get;}=new();
 public static MainView? Instance {get;private set;}
 readonly TextureWorldControl map;
 readonly List<object> points=[];
 bool drawing,overflow,selecting;
 int selectionStartX,selectionStartY,selectionEndX,selectionEndY;
 (int X,int Y) MapLocation(PointerEventArgs e)=>map.TileAt(e.GetPosition(map));
 public MainView(){
  Instance=this;AvaloniaXamlLoader.Load(this);map=this.FindControl<TextureWorldControl>("Map")!;DataContext=Current;InitializeDesktop();
  Current.PickFile=async()=>{
   var files=await TopLevel.GetTopLevel(this)!.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions{Title="选择一个 .wld；模组世界请同时选择同名 .twld",AllowMultiple=true,FileTypeFilter=[new FilePickerFileType("Terraria 世界及配套"){Patterns=["*.wld","*.twld"]}]});
   if(files.Count==0)return null;
   var worlds=files.Where(file=>file.Name.EndsWith(".wld",StringComparison.OrdinalIgnoreCase)).ToArray();var pairs=files.Where(file=>file.Name.EndsWith(".twld",StringComparison.OrdinalIgnoreCase)).ToArray();
   if(worlds.Length!=1||pairs.Length>1||files.Count!=worlds.Length+pairs.Length)throw new InvalidOperationException("请选择一个 .wld，可同时选择一个同名 .twld；原编辑状态保留");
   if(pairs.Length==1&&!string.Equals(Path.GetFileNameWithoutExtension(worlds[0].Name),Path.GetFileNameWithoutExtension(pairs[0].Name),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException(".wld 与 .twld 必须同名，原编辑状态保留");
   long total=0;
   async Task<byte[]> Read(IStorageFile file){using var stream=await file.OpenReadAsync();using var buffer=new MemoryStream();var chunk=new byte[65536];int count;while((count=await stream.ReadAsync(chunk))>0){total+=count;if(total>256*1024*1024)throw new InvalidOperationException("世界与配套文件超过当前256MiB读取预算，原编辑状态保留");buffer.Write(chunk,0,count);}return buffer.ToArray();}
   var world=await Read(worlds[0]);var sidecar=pairs.Length==0?Array.Empty<byte>():await Read(pairs[0]);
   return new PickedWorld(world,worlds[0].Name,sidecar,pairs.FirstOrDefault()?.Name??"");
  };
  Current.PickTemplate=async()=>{
   var files=await TopLevel.GetTopLevel(this)!.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions{Title="导入原版建筑模板",AllowMultiple=false,FileTypeFilter=[new FilePickerFileType("TEdit 建筑模板"){Patterns=["*.TEditSch","*.teditsch"]}]});
   if(files.Count==0)return null;if(files.Count!=1)throw new InvalidOperationException("请选择一个模板");
   using var stream=await files[0].OpenReadAsync();using var buffer=new MemoryStream();var chunk=new byte[65536];int count;
   while((count=await stream.ReadAsync(chunk))>0){if(buffer.Length+count>256*1024*1024)throw new InvalidOperationException("模板文件超过256MiB上限");buffer.Write(chunk,0,count);}
   return (buffer.ToArray(),files[0].Name);
  };
  Current.PickArtifact=async replay=>{
   var files=await TopLevel.GetTopLevel(this)!.StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions{Title=replay?"打开原版图格回放":"导入图片到像素画模板",AllowMultiple=false,FileTypeFilter=[new FilePickerFileType(replay?"TEdit 回放":"图片"){Patterns=replay?["*.terp"]:["*.png","*.jpg","*.jpeg","*.webp","*.bmp"]}]});
   if(files.Count==0)return null;using var stream=await files[0].OpenReadAsync();using var buffer=new MemoryStream();var chunk=new byte[65536];int count;long max=replay?256L*1024*1024:16L*1024*1024;while((count=await stream.ReadAsync(chunk))>0){if(buffer.Length+count>max)throw new InvalidOperationException("文件超过读取预算");buffer.Write(chunk,0,count);}return(buffer.ToArray(),files[0].Name);
  };
  map.SizeChanged+=(_,_)=>{_=CoreBridge.RenderView("{}");};
  _=Current.Run("initialize");
 }
 public void ApplyFrame(byte[] rgba)=>map.Fallback(rgba);
 public void ApplyScene(string json)=>map.ApplyScene(json);
 public void RegisterTexture(string key,int w,int h,byte[] pixels)=>map.Register(key,w,h,pixels);
 public void ReleaseTexture(string key)=>map.Release(key);
 public byte[] Snapshot(bool png)=>map.Snapshot(png);
 long strokeStarted;
 void AddPoint(PointerEventArgs e){
  if(points.Count>=4096){overflow=true;return;}
  PreviewStroke(e);
  points.Add(new{x=MapLocation(e).X,y=MapLocation(e).Y,timeMs=Environment.TickCount64-strokeStarted,shift=e.KeyModifiers.HasFlag(KeyModifiers.Shift),alt=e.KeyModifiers.HasFlag(KeyModifiers.Alt),ctrl=e.KeyModifiers.HasFlag(KeyModifiers.Control),secondary=e.GetCurrentPoint(map).Properties.IsRightButtonPressed,actions=PointerActions(e)});
 }
 void MapDown(object? sender,PointerPressedEventArgs e)
 {
  map.Focus();
  if(panMode||spacePan||PointerActions(e).Contains("editor.pan"))
  {
   panning=true;
   panPoint=e.GetPosition(map);
   e.Pointer.Capture(map);
   RefreshInteractionUi();
   return;
  }
  if(!Current.Editable)return;
  if(Current.SelectMode&&Current.SelectedTool.Id!="Selection")
  {
   selecting=true;
   var p=MapLocation(e);
   selectionStartX=selectionEndX=p.X;
   selectionStartY=selectionEndY=p.Y;
   e.Pointer.Capture(map);
   return;
  }
  ClearStrokePreview();
  points.Clear();
  strokeStarted=Environment.TickCount64;
  overflow=false;
  drawing=true;
  e.Pointer.Capture(map);
  AddPoint(e);
 }
 void MapMove(object? sender,PointerEventArgs e)
 {
  if(panning)
  {
   var current=e.GetPosition(map);
   _=CoreBridge.RenderView(System.Text.Json.JsonSerializer.Serialize(new{operation="pan",dx=panPoint.X-current.X,dy=panPoint.Y-current.Y}));
   panPoint=current;
   return;
  }
  Hover(e);
  if(selecting)
  {
   var p=MapLocation(e);
   selectionEndX=p.X;
   selectionEndY=p.Y;
   Current.SelectRectangle(Math.Min(selectionStartX,selectionEndX),Math.Min(selectionStartY,selectionEndY),Math.Abs(selectionEndX-selectionStartX)+1,Math.Abs(selectionEndY-selectionStartY)+1);
  }
  else if(drawing)AddPoint(e);
 }
 async void MapUp(object? sender,PointerReleasedEventArgs e)
 {
  if(panning)
  {
   panning=false;
   e.Pointer.Capture(null);
   RefreshInteractionUi();
   return;
  }
  if(selecting)
  {
   selecting=false;
   var p=MapLocation(e);
   Current.SelectRectangle(Math.Min(selectionStartX,p.X),Math.Min(selectionStartY,p.Y),Math.Abs(p.X-selectionStartX)+1,Math.Abs(p.Y-selectionStartY)+1);
   e.Pointer.Capture(null);
   return;
  }
  if(!drawing){e.Pointer.Capture(null);return;}
  drawing=false;
  AddPoint(e);
  e.Pointer.Capture(null);
  ClearStrokePreview();
  if(overflow)
  {
   points.Clear();
   Current.Fail("笔画点数超过单次笔画点数上限，未提交；请分段绘制。");
   return;
  }
  await Current.Run("tool",new{tool=Current.SelectedTool.Id,settings=Current.Settings(),points=points.ToArray()});
  points.Clear();
 }
 void MapCaptureLost(object? sender,PointerCaptureLostEventArgs e)
 {
  panning=false;
  selecting=false;
  if(drawing){drawing=false;points.Clear();}
  ClearStrokePreview();
 }
}
