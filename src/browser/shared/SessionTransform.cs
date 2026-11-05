using TEdit.Terraria;
namespace TEdit.Port;
public sealed partial class Session {
 [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
 static WorldFileData CreateStreamedTransformedFile(World source,TEdit.Geometry.RectangleInt32 region,int left,int top,int right,int bottom){
  using var snapshot=new WorldTransformSnapshot(source);
  var transformed=OriginalWorldTransform.Transform(source,region,left,top,right,bottom,snapshot:snapshot);
  return WorldFiles.Save(transformed);
 }
 public async Task TransformWorldAsync(string mode,int width,int height,bool borders){
  var data=await TransformWorldFileAsync(mode,width,height,borders);
  CloseSession();GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
  Open(data);
 }
 public async Task<WorldFileData> TransformWorldFileAsync(string mode,int width,int height,bool borders){
  RequireWorld();if(World!.IsTModLoader)throw new InvalidOperationException("原版裁剪/扩展只复制 .wld；为保留模组配套，本版暂不对模组世界执行此操作");
  var region=new TEdit.Geometry.RectangleInt32(0,0,World.TilesWide,World.TilesHigh);int left,top,right,bottom;
  if(mode=="crop"){if(!vm!.Selection.IsActive)throw new InvalidOperationException("请先框选要保留的区域");region=vm.Selection.SelectionArea;left=top=borders?41:0;right=bottom=borders?42:0;width=region.Width+left+right;height=region.Height+top+bottom;}
  else if(mode=="expand"){if(width<World.TilesWide||height<World.TilesHigh)throw new ArgumentException("扩展尺寸不能小于当前世界");int dx=width-World.TilesWide,dy=height-World.TilesHigh;left=dx/2;right=dx-left;top=dy/2;bottom=dy-top;}
  else throw new ArgumentException("世界变换无效");
  if(width<100||height<100||width>8400||height>2400)throw new ArgumentException("世界尺寸必须介于100×100与8400×2400之间");
  bool streamed=(long)World.TilesWide*World.TilesHigh>1_048_576||(long)width*height>1_048_576;
  WorldFileData data;
  if(streamed){
   data=CreateStreamedTransformedFile(World,region,left,top,right,bottom);
   // The browser host opens the complete output in a fresh Worker.
  }else{
   var transformed=OriginalWorldTransform.Transform(World,region,left,top,right,bottom);
   data=await WorldFiles.SaveAsync(transformed);
  }
  return data;
 }
}
