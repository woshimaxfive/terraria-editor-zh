using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Rendering.SceneGraph;
using Avalonia.Skia;
using SkiaSharp;
using System.Text.Json;
using TEdit.Port.Rendering;
namespace TEditBrowser;
public sealed class TextureWorldControl:Control {
 readonly TEdit.Browser.SkiaScenePainter painter=new();
 RenderScene? scene;
 public float CameraX {get;private set;}
 public float CameraY {get;private set;}
 public float Zoom {get;private set;}=1;
 public void Release(string key)=>painter.Release(key);
 public void Register(string key,int width,int height,byte[] bytes){painter.Register(key,width,height,bytes);InvalidateVisual();}
 public void ApplyScene(string json){var next=JsonSerializer.Deserialize<RenderScene>(json,new JsonSerializerOptions{PropertyNameCaseInsensitive=true})!;if(next.Errors.Length>0)throw new InvalidOperationException(string.Join("\n",next.Errors));painter.PrepareScene(next);scene=next;CameraX=next.ViewX;CameraY=next.ViewY;Zoom=next.Zoom;InvalidateVisual();}
 public void Clear(){scene=null;painter.ClearSceneTextures();InvalidateVisual();}
 public byte[] SnapshotScene(string json,bool png)=>Snapshot(JsonSerializer.Deserialize<RenderScene>(json,new JsonSerializerOptions{PropertyNameCaseInsensitive=true})!,png);
 public byte[] Snapshot(bool png)=>Snapshot(scene??throw new InvalidOperationException("请先打开世界"),png);
 byte[] Snapshot(RenderScene scene,bool png){
 using var surface=SKSurface.Create(new SKImageInfo(scene.Width,scene.Height,SKColorType.Rgba8888,SKAlphaType.Premul));if(ReferenceEquals(scene,this.scene))painter.Paint(surface.Canvas,scene);else painter.PaintTemporary(surface.Canvas,scene);using var image=surface.Snapshot();
  if(png){using var data=image.Encode(SKEncodedImageFormat.Png,100);return data.ToArray();}using var pix=image.PeekPixels();return pix.GetPixelSpan().ToArray();
 }
 public void Fallback(byte[] rgba){if(scene!=null)return;var s=new RenderScene(384,256,0,[],[],[]);scene=s;InvalidateVisual();}
 public override void Render(DrawingContext context){base.Render(context);if(scene is {} s)context.Custom(new Draw(new Rect(Bounds.Size),painter,s));}
 sealed class Draw(Rect bounds,TEdit.Browser.SkiaScenePainter painter,RenderScene scene):ICustomDrawOperation {
  public Rect Bounds=>bounds;
  public bool HitTest(Point p)=>Bounds.Contains(p);
  public bool Equals(ICustomDrawOperation? other)=>false;
  public void Dispose(){}
  public void Render(ImmediateDrawingContext context){var feature=context.TryGetFeature<ISkiaSharpApiLeaseFeature>();if(feature==null)return;using var lease=feature.Lease();var canvas=lease.SkCanvas;canvas.Save();canvas.Scale((float)(bounds.Width/scene.Width),(float)(bounds.Height/scene.Height));painter.Paint(canvas,scene);canvas.Restore();}
 }
 public (int X,int Y) TileAt(Point p)=>( (int)Math.Floor(CameraX+p.X/Math.Max(1,Bounds.Width)*(scene?.Width??384)/Zoom),(int)Math.Floor(CameraY+p.Y/Math.Max(1,Bounds.Height)*(scene?.Height??256)/Zoom));
}
