using System.Text.Json;
using TEdit.Editor.Clipboard;
using TEdit.Geometry;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed partial class Session {
 const int FloatingMemoryThreshold=1_048_576;
 sealed record StoredFloatingBuffer(ClipboardBuffer Buffer,FloatingTileSource Runtime,byte[] State,byte[] Template);
 StoredFloatingBuffer? floatingOriginalClipboard,floatingResizeSource;
 FloatingTileSource? floatingReadSource;
 Tile[,]? floatingStorage;
 bool restoringFloatingBuffers;
 byte[] EncodeFloatingBuffer(ClipboardBuffer buffer){var previous=clipboard;try{clipboard=buffer;return ExportClipboardState();}finally{clipboard=previous;}}
 byte[] ExportFloatingBuffer(ClipboardBuffer buffer){var previous=clipboard;try{clipboard=buffer;return SaveTemplate(World!.Version);}finally{clipboard=previous;}}
 StoredFloatingBuffer StoreFloatingBuffer(ClipboardBuffer buffer){
  var state=EncodeFloatingBuffer(buffer);var template=ExportFloatingBuffer(buffer);
  return new(buffer,FloatingTileSource.Detach(buffer),state,template);
 }
 bool TryStoredFloatingState(ClipboardBuffer? buffer,out byte[] bytes){
  var saved=ReferenceEquals(buffer,floatingOriginalClipboard?.Buffer)?floatingOriginalClipboard:ReferenceEquals(buffer,floatingResizeSource?.Buffer)?floatingResizeSource:null;
  bytes=saved?.State??[];return saved!=null;
 }
 bool TryStoredFloatingTemplate(uint version,out byte[] bytes){
  var saved=ReferenceEquals(clipboard,floatingOriginalClipboard?.Buffer)?floatingOriginalClipboard:ReferenceEquals(clipboard,floatingResizeSource?.Buffer)?floatingResizeSource:null;
  if(saved==null){bytes=[];return false;}
  if(version==World!.Version){bytes=saved.Template;return true;}
  if(version!=clipboardIdentity!.Version)throw new InvalidOperationException("浮动编辑期间请先确认或取消，再转换模板版本");
  using var zip=new System.IO.Compression.ZipArchive(new MemoryStream(saved.State),System.IO.Compression.ZipArchiveMode.Read);using var input=zip.GetEntry("template.TEditSch")!.Open();using var output=new MemoryStream();input.CopyTo(output);bytes=output.ToArray();return true;
 }
 void DiscardReplacedFloatingClipboard(){
  if(floatingOriginalClipboard!=null&&!ReferenceEquals(clipboard,floatingOriginalClipboard.Buffer)){floatingOriginalClipboard.Runtime.Discard();floatingOriginalClipboard=null;}
 }
 void SuspendFloatingOriginalClipboard(){
  DiscardReplacedFloatingClipboard();
  if(floatingOriginalClipboard==null&&clipboard!=null&&clipboard.Tiles.Length>FloatingMemoryThreshold)floatingOriginalClipboard=StoreFloatingBuffer(clipboard);
 }
 internal ClipboardBuffer TransformFloatingBuffer(ClipboardBuffer buffer,string action){
  if(action!="flipX"&&action!="flipY"&&action!="rotate")throw new ArgumentException("浮动变换无效");
  if(buffer.Tiles.Length<=FloatingMemoryThreshold)return action switch{"flipX"=>buffer.FlipX(),"flipY"=>buffer.FlipY(),_=>buffer.Rotate()};
  SuspendFloatingOriginalClipboard();
  floatingStorage=buffer.Tiles;
  floatingReadSource=FloatingTileSource.Detach(buffer);
  GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
  return ClipboardBuffer.Flip(buffer,action=="flipX",action=="rotate",floatingReadSource.Read,floatingStorage);
 }
 internal ClipboardBuffer ResizeFloatingBuffer(ClipboardBuffer source,int width,int height){
  if(source.Tiles.Length<=FloatingMemoryThreshold&&(long)width*height<=FloatingMemoryThreshold&&floatingResizeSource==null)return source.Resize(width,height);
  SuspendFloatingOriginalClipboard();
  var live=Floating.FloatingPasteBuffer;floatingStorage=live?.Tiles;
  if(!ReferenceEquals(floatingResizeSource?.Buffer,source)){
   floatingResizeSource?.Runtime.Discard();floatingResizeSource=StoreFloatingBuffer(source);
  }
  if(live!=null&&!ReferenceEquals(live,source)&&live.Tiles.Length>0)floatingReadSource=FloatingTileSource.Detach(live);
  if(floatingStorage!=null&&floatingStorage.Length<(long)width*height)floatingStorage=null;
  GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
  return source.Resize(width,height,floatingResizeSource.Runtime.Read,floatingStorage);
 }
 internal void ReleaseFloatingIntermediate(ClipboardBuffer previous,ClipboardBuffer next){
  if(!ReferenceEquals(previous,next))previous.Tiles=new Tile[0,0];
  if(ReferenceEquals(floatingReadSource?.Buffer,previous)){floatingReadSource.Discard();floatingReadSource=null;}
  GC.Collect();
 }
 void FinishFloatingMemory(ClipboardBuffer? before){
  DiscardReplacedFloatingClipboard();
  var current=Floating.FloatingPasteBuffer;
  var original=(ClipboardBuffer?)PasteField("_originalBuffer").GetValue(Floating);
  if(floatingResizeSource!=null&&!ReferenceEquals(floatingResizeSource.Buffer,original)){floatingResizeSource.Runtime.Discard();floatingResizeSource=null;}
  if(original!=null&&original.Tiles.Length>FloatingMemoryThreshold)floatingResizeSource=StoreFloatingBuffer(original);
  if(floatingReadSource!=null){
   if(ReferenceEquals(current,floatingReadSource.Buffer)&&current!.Tiles.Length==0)floatingReadSource.Restore(floatingStorage);else floatingReadSource.Discard();
   floatingReadSource=null;
  }
  if(!Floating.IsFloatingPaste){
   var restoreStorage=before?.Tiles;
   if(before!=null&&!ReferenceEquals(before,clipboard))before.Tiles=new Tile[0,0];
   if(floatingOriginalClipboard!=null){floatingOriginalClipboard.Runtime.Restore(restoreStorage);floatingOriginalClipboard=null;}
  }
  floatingStorage=null;
 }
 void PrepareRestoredFloatingClipboard(byte[] state){
  using var document=JsonDocument.Parse(state);
  if(document.RootElement.GetProperty("buffer").ValueKind!=JsonValueKind.Null){
   if(clipboard!=null&&clipboard.Tiles.Length>FloatingMemoryThreshold)floatingStorage=clipboard.Tiles;
   SuspendFloatingOriginalClipboard();
  }
 }
 void ImportFloatingClipboardState(byte[] bytes){try{restoringFloatingBuffers=true;ImportClipboardState(bytes);}finally{restoringFloatingBuffers=false;}}
 bool TryReadRestoredFloatingTemplate(byte[] bytes,out ClipboardBuffer buffer){
  buffer=null!;if(!restoringFloatingBuffers)return false;
  // Checkpoint templates are always written by the existing original SaveV5 path.
  using var source=new ClipboardTileStream(bytes,null);buffer=source.Buffer;
  if(floatingStorage==null||floatingStorage.Length<(long)buffer.Size.X*buffer.Size.Y)floatingStorage=new Tile[buffer.Size.X,buffer.Size.Y];
  buffer.Tiles=floatingStorage;
  for(int x=0;x<buffer.Size.X;x++)for(int y=0;y<buffer.Size.Y;y++)buffer.StorageTile(x,y)=source.Read(x,y);
  return true;
 }
 void CompleteRestoredFloatingBuffers(){floatingStorage=null;}
 void StoreRestoredFloatingResize(ClipboardBuffer? buffer){if(buffer!=null&&buffer.Tiles.Length>FloatingMemoryThreshold)floatingResizeSource=StoreFloatingBuffer(buffer);}
 void ClearFloatingMemory(){
  floatingOriginalClipboard?.Runtime.Discard();floatingResizeSource?.Runtime.Discard();floatingReadSource?.Discard();
  floatingOriginalClipboard=null;floatingResizeSource=null;floatingReadSource=null;floatingStorage=null;
 }
}
