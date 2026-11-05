using System.Numerics;
using TEdit.Common;
using TEdit.Geometry;
namespace TEdit.Port.Rendering;
public readonly record struct ViewSize(double Width,double Height);
[method:System.Text.Json.Serialization.JsonConstructor]
public sealed record Texture2D(string Key,int Width,int Height) {
 public RectangleInt32 Bounds=>new(0,0,Width,Height);
 RenderGraphicsDevice? owner;
 public byte[]? Pixels {get;private set;}
 public Texture2D(RenderGraphicsDevice device,int width,int height):this(device.NextKey(),width,height){owner=device;device.Textures.Add(this);}
 public void SetData(TEditColor[] colors){Pixels=new byte[colors.Length*4];for(int i=0;i<colors.Length;i++){var c=colors[i];Pixels[i*4]=c.R;Pixels[i*4+1]=c.G;Pixels[i*4+2]=c.B;Pixels[i*4+3]=c.A;}}
 public void Dispose()=>owner?.Textures.Remove(this);
}
public sealed class RenderGraphicsDevice {int sequence;public List<Texture2D> Textures {get;}=new();public string NextKey()=>"@dynamic/"+(++sequence);}
public enum RenderModifiers {None=0,Shift=1,Control=2,Alt=4}
public static class RenderInput {public static RenderModifiers Modifiers;}
[Flags] public enum SpriteEffects {None=0,FlipHorizontally=1,FlipVertically=2}
public enum SpriteSortMode {Immediate,Deferred,BackToFront,FrontToBack}
public enum BlendState {AlphaBlend,AdditiveGlow,Max,NonPremultiplied,Opaque}
public enum SamplerState {PointClamp}
public enum DepthStencilState {Default}
public enum RasterizerState {CullNone}
public sealed record Effect(string Name);
// All positions are normalized from original SpriteBatch overloads. No tile rules live here.
public sealed class SpriteBatch {
 readonly List<RenderPass> passes=new();
 List<SpriteCommand>? sprites;
 SpriteSortMode sort;
 BlendState blend;
 Effect? effect;
 public string? Target {get;set;}
 public void Reset(){passes.Clear();sprites=null;}
 public void Begin(SpriteSortMode sort=SpriteSortMode.Deferred,BlendState blend=BlendState.AlphaBlend,SamplerState sampler=SamplerState.PointClamp,DepthStencilState depth=DepthStencilState.Default,RasterizerState raster=RasterizerState.CullNone,Effect? effect=null){
  if(sprites!=null)throw new InvalidOperationException("Nested sprite batch");
  sprites=new();this.sort=sort;this.blend=blend;this.effect=effect;
 }
 public void End(){
  var list=sprites??throw new InvalidOperationException("No sprite batch");
  var ordered=list.ToArray();
  // MonoGame uses Array.Sort on SortKey; equal-depth items must retain its tie behavior.
  if(sort is SpriteSortMode.BackToFront or SpriteSortMode.FrontToBack)Array.Sort(ordered,Comparer<SpriteCommand>.Create((a,b)=>sort==SpriteSortMode.BackToFront?(-a.Depth).CompareTo(-b.Depth):a.Depth.CompareTo(b.Depth)));
  passes.Add(new(blend.ToString(),effect?.Name,ordered,Target));sprites=null;
 }
 public RenderPass[] Finish(){if(sprites!=null)throw new InvalidOperationException("Unfinished sprite batch");return passes.ToArray();}
 public void Draw(Texture2D tex,RectangleInt32 destination,RectangleInt32? source,TEditColor color,float rotation,Vector2 origin,SpriteEffects effects,float depth){
  var src=source??tex.Bounds;
  Add(tex,destination.X,destination.Y,destination.Width,destination.Height,src,color,rotation,origin,effects,depth);
 }
 public void Draw(Texture2D tex,Vector2 position,RectangleInt32? source,TEditColor color,float rotation,Vector2 origin,float scale,SpriteEffects effects,float depth)=>Draw(tex,position,source,color,rotation,origin,new Vector2(scale),effects,depth);
 public void Draw(Texture2D tex,Vector2 position,RectangleInt32? source,TEditColor color,float rotation,Vector2 origin,Vector2 scale,SpriteEffects effects,float depth){var src=source??tex.Bounds;Add(tex,position.X,position.Y,src.Width*scale.X,src.Height*scale.Y,src,color,rotation,origin,effects,depth);}
 public void Draw(Texture2D tex,RectangleInt32 destination,TEditColor color)=>Draw(tex,destination,null,color,0,Vector2.Zero,SpriteEffects.None,0);
 void Add(Texture2D tex,float x,float y,float width,float height,RectangleInt32 src,TEditColor color,float rotation,Vector2 origin,SpriteEffects effects,float depth){
  if(!float.IsFinite(x+y+width+height+rotation+origin.X+origin.Y+depth))throw new InvalidOperationException("Nonfinite sprite geometry");
  (sprites??throw new InvalidOperationException("Sprite outside batch")).Add(new(tex.Key,x,y,width,height,src.X,src.Y,src.Width,src.Height,color.PackedValue,rotation,origin.X,origin.Y,(int)effects,depth));
 }
}
