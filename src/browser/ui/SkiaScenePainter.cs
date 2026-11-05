using SkiaSharp;
using TEdit.Port.Rendering;
namespace TEdit.Browser;
// Browser/native share this renderer. It interprets SpriteBatch commands, never world rules.
public sealed class SkiaScenePainter:IDisposable {
 readonly Dictionary<string,SKImage> textures=new(StringComparer.OrdinalIgnoreCase);
 readonly SKRuntimeEffect tintEffect=SKRuntimeEffect.CreateColorFilter("uniform float4 tint; uniform float invert; half4 main(half4 c){half4 v=c*half4(tint);if(invert>0.5)v.rgb=v.a-v.rgb;return v;}",out _)!;
 readonly SKRuntimeEffect glowEffect=SKRuntimeEffect.CreateBlender("half4 main(half4 s,half4 d){return half4(min(s.rgb+d.rgb,half3(1)),d.a);}",out _)!;
 readonly SKRuntimeEffect maxEffect=SKRuntimeEffect.CreateBlender("half4 main(half4 s,half4 d){return max(s,d);}",out _)!;
 readonly SKRuntimeEffect nonPremultEffect=SKRuntimeEffect.CreateBlender("half4 main(half4 s,half4 d){return half4(s.rgb*s.a+d.rgb*(1-s.a),s.a*s.a+d.a*(1-s.a));}",out _)!;
 readonly SKRuntimeEffect darkenEffect=SKRuntimeEffect.CreateColorFilter("uniform float darken;uniform float desaturate;half4 main(half4 c){half lum=dot(c.rgb,half3(0.299,0.587,0.114));return half4(mix(c.rgb,half3(lum),desaturate)*(1-darken),c.a);}",out _)!;
 readonly SKRuntimeEffect copyEffect=SKRuntimeEffect.CreateBlender("half4 main(half4 s,half4 d){return s.a>0?s:d;}",out _)!;
 readonly SKSamplingOptions sampling=new(SKFilterMode.Nearest,SKMipmapMode.None);
 public SkiaScenePainter(){
  Register("@empty",1,1,[0,0,0,0]);Register("@white",1,1,[255,255,255,255]);Register("@selection",1,1,[0,64,128,128]);
  var halo=new byte[64*64*4];float center=63/2f;
  for(int y=0;y<64;y++)for(int x=0;x<64;x++){float dx=(x-center)/center,dy=(y-center)/center;byte a=(byte)(Math.Max(0,1-dx*dx-dy*dy)*255);Array.Fill(halo,a,(y*64+x)*4,4);}
  Register("@halo",64,64,halo);
  var dash=new byte[16*4];for(int i=0;i<16;i++){dash[i*4]=dash[i*4+1]=dash[i*4+2]=(byte)(i<8?255:0);dash[i*4+3]=255;}Register("@pasteH",16,1,dash);Register("@pasteV",1,16,dash);
 }
 HashSet<SKImage>? protectedImages;
 void DisposeTexture(SKImage image){if(protectedImages?.Contains(image)!=true)image.Dispose();}
 public void Release(string key){if(textures.Remove(key,out var image))DisposeTexture(image);}
 public void Register(string key,int width,int height,byte[] premultipliedRgba){
  if(width<1||height<1||width>4096||height>4096||premultipliedRgba.Length!=(long)width*height*4)throw new ArgumentException("Invalid texture RGBA");
  var img=SKImage.FromPixelCopy(new SKImageInfo(width,height,SKColorType.Rgba8888,SKAlphaType.Premul),premultipliedRgba,width*4);if(textures.Remove(key,out var old))DisposeTexture(old);textures[key]=img;
 }
 static SKColor Color(uint c)=>new((byte)c,(byte)(c>>8),(byte)(c>>16),(byte)(c>>24));
 RenderScene? preparedScene;
 static bool IsSceneTexture(string key)=>key.StartsWith("@dynamic/",StringComparison.OrdinalIgnoreCase)||key is "@preview" or "@raster";
 public void PrepareScene(RenderScene scene){
  if(ReferenceEquals(preparedScene,scene))return;
  if(scene.Errors.Length!=0)throw new InvalidOperationException(string.Join("\n",scene.Errors));
  var used=scene.Passes.SelectMany(pass=>pass.Sprites).Select(sprite=>sprite.Texture).ToHashSet(StringComparer.OrdinalIgnoreCase);
  foreach(var key in textures.Keys.Where(key=>IsSceneTexture(key)&&!used.Contains(key)).ToArray())Release(key);
  foreach(var tile in scene.Dynamic??[])Register(tile.Key,tile.Width,tile.Height,tile.Pixels);
  preparedScene=scene;
 }
 public void ClearSceneTextures(){foreach(var key in textures.Keys.Where(IsSceneTexture).ToArray())Release(key);preparedScene=null;}
 // Image export uses another scene without replacing the live viewport images.
 public void PaintTemporary(SKCanvas canvas,RenderScene scene){
  var saved=textures.ToArray();var savedScene=preparedScene;var outerProtected=protectedImages;
  protectedImages=saved.Select(pair=>pair.Value).ToHashSet();if(outerProtected!=null)protectedImages.UnionWith(outerProtected);
  try{Paint(canvas,scene);}
  finally{
   foreach(var image in textures.Values.Distinct().Where(image=>!protectedImages.Contains(image)))image.Dispose();
   textures.Clear();foreach(var pair in saved)textures.Add(pair.Key,pair.Value);preparedScene=savedScene;protectedImages=outerProtected;
  }
 }
 public void Paint(SKCanvas canvas,RenderScene scene){
  if(scene.Errors.Length!=0)throw new InvalidOperationException(string.Join("\n",scene.Errors));
  PrepareScene(scene);
  var screen=canvas;var targets=new Dictionary<string,SKSurface>();
  canvas.Save();canvas.ClipRect(new SKRect(0,0,scene.Width,scene.Height));canvas.Clear(Color(scene.Clear));
  try{foreach(var pass in scene.Passes){
   canvas=screen;
   if(pass.Target!=null){if(!targets.TryGetValue(pass.Target,out var target)){target=SKSurface.Create(new SKImageInfo(pass.Width>0?pass.Width:scene.Width,pass.Height>0?pass.Height:scene.Height,SKColorType.Rgba8888,SKAlphaType.Premul));target.Canvas.Clear(pass.Target=="@world"?Color(scene.Clear):SKColors.Transparent);targets.Add(pass.Target,target);}canvas=target.Canvas;}

   using var blender=pass.Blend=="CopyNonzero"?copyEffect.ToBlender():pass.Blend=="AdditiveGlow"?glowEffect.ToBlender():pass.Blend=="Max"?maxEffect.ToBlender():pass.Blend=="NonPremultiplied"?nonPremultEffect.ToBlender():null;
   using var paint=new SKPaint{IsAntialias=false,BlendMode=pass.Blend=="Opaque"?SKBlendMode.Src:SKBlendMode.SrcOver};if(blender!=null)paint.Blender=blender;
   uint? previous=null;
   foreach(var s in pass.Sprites){
    using var targetImage=targets.TryGetValue(s.Texture,out var sourceTarget)?sourceTarget.Snapshot():null;
    var image=targetImage??textures.GetValueOrDefault(s.Texture);if(image==null)continue;
    if(pass.Effect=="darken"){
     using var opaque=new SKPaint{BlendMode=SKBlendMode.Src,IsAntialias=false};canvas.DrawImage(image,0,0,sampling,opaque);
     using var u=new SKRuntimeEffectUniforms(darkenEffect){["darken"]=scene.Darken,["desaturate"]=scene.Desaturate};using var f=darkenEffect.ToColorFilter(u);opaque.ColorFilter=f;
     foreach(var region in scene.Filter??[]){canvas.Save();canvas.ClipRect(SKRect.Create(region.X,region.Y,region.Width,region.Height),SKClipOperation.Intersect,false);canvas.DrawImage(image,0,0,sampling,opaque);canvas.Restore();}continue;
    }
    if(s.SourceWidth<=0||s.SourceHeight<=0||s.Width==0||s.Height==0)continue;
    if(previous!=s.Color){
     var u=new SKRuntimeEffectUniforms(tintEffect){["tint"]=new[]{(s.Color&255)/255f,((s.Color>>8)&255)/255f,((s.Color>>16)&255)/255f,(s.Color>>24)/255f},["invert"]=pass.Effect=="invert"?1f:0f};
     var filter=tintEffect.ToColorFilter(u);var old=paint.ColorFilter;paint.ColorFilter=filter;old?.Dispose();filter.Dispose();previous=s.Color;
    }
    canvas.Save();canvas.Translate(s.X-(MathF.Abs(s.X-MathF.Floor(s.X)-0.5f)<0.000001f?0.0001f:0),s.Y-(MathF.Abs(s.Y-MathF.Floor(s.Y)-0.5f)<0.000001f?0.0001f:0));if(s.Rotation!=0)canvas.RotateRadians(s.Rotation);
    canvas.Scale(s.Width/s.SourceWidth,s.Height/s.SourceHeight);canvas.Translate(-s.OriginX,-s.OriginY);
    if((s.Effects&1)!=0){canvas.Translate(s.SourceWidth,0);canvas.Scale(-1,1);}if((s.Effects&2)!=0){canvas.Translate(0,s.SourceHeight);canvas.Scale(1,-1);}
    using(var shader=image.ToShader(SKShaderTileMode.Clamp,SKShaderTileMode.Clamp,sampling,SKMatrix.CreateTranslation(-s.SourceX,-s.SourceY))){paint.Shader=shader;canvas.DrawRect(new SKRect(0,0,s.SourceWidth,s.SourceHeight),paint);paint.Shader=null;}canvas.Restore();
   }
  }}finally{foreach(var target in targets.Values)target.Dispose();screen.Restore();}
 }
 public void Dispose(){foreach(var t in textures.Values)t.Dispose();textures.Clear();tintEffect.Dispose();glowEffect.Dispose();maxEffect.Dispose();nonPremultEffect.Dispose();darkenEffect.Dispose();copyEffect.Dispose();}
}
