using System.Numerics;
using TEdit.Common;
using TEdit.Geometry;
using TEdit.Port.Rendering;
using TEdit.ViewModel;
using TEdit.Render;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {
 readonly WorldViewModel _wvm;
 readonly SpriteBatch _spriteBatch=new();
 readonly Textures _textureDictionary;
 Texture2D _selectionTexture=new("@selection",1,1);
 readonly Viewport xnaViewport=new();
 static readonly BlendState AdditiveGlowBlend=BlendState.AdditiveGlow;
 static readonly BlendState MaxBlend=BlendState.Max;
 sealed class Viewport {public double ActualWidth=384,ActualHeight=256;public GraphicsService GraphicsService {get;}=new();}
 sealed class GraphicsService {public RenderGraphicsDevice GraphicsDevice {get;}=new();}
 sealed class FindPresentation {public bool ShowCrosshair;public int CrosshairTileX,CrosshairTileY;}
 readonly FindPresentation _find=new();
 bool buffInitialized;
 public void SetCrosshair(bool enabled,int x,int y){_find.ShowCrosshair=enabled;_find.CrosshairTileX=x;_find.CrosshairTileY=y;}
 readonly List<TextureUpload> uploads=new();
 Texture2D Upload(string key,int width,int height,byte[] pixels){uploads.Add(new(key,width,height,pixels));return new(key,width,height);}
 public OriginalWorldRenderer(WorldViewModel vm,Textures textures){
  _wvm=vm;_textureDictionary=textures;
  _textures["Grid"]=new("@app/grid",256,256);_textures["Spawn"]=new("@app/spawn_marker",20,34);_textures["Dungeon"]=new("@app/dungeon_marker",20,34);
  _pasteBorderH=new("@pasteH",16,1);_pasteBorderV=new("@pasteV",1,16);_pasteHandleTexture=textures.WhitePixelTexture;
  vm.RegionChanged+=(x,y,w,h)=>{
   TEdit.Render.BlendRules.ResetUVCache(vm,x,y,w,h);
   _surfaceBiomeCache.Clear();
   for(int ty=Math.Max(0,y-1);ty<Math.Min(vm.CurrentWorld.TilesHigh,y+h+1);ty++)for(int tx=Math.Max(0,x-1);tx<Math.Min(vm.CurrentWorld.TilesWide,x+w+1);tx++)vm.BuffTileCache.UpdateTile(tx,ty,vm.CurrentWorld.Tiles[tx,ty]);
  };
 }
 public RenderScene ViewScene(int width,int height,float x,float y,float zoom,bool hover){
  if(width<1||height<1||width>4096||height>4096||!float.IsFinite(x+y+zoom)||zoom<0.01f||zoom>256)throw new ArgumentOutOfRangeException("Render view");
  xnaViewport.ActualWidth=width;xnaViewport.ActualHeight=height;
  _exportViewSize=new(width,height);_scrollPosition=new(-x,-y);_zoom=zoom;
  _selectedChestPosition=_wvm.SelectedChest is {} c?new(c.X,c.Y):new(-1,-1);
  TEdit.ErrorLogging.BeginRender();_textureDictionary.BeginFrame();_spriteBatch.Reset();uploads.Clear();previewPasses.Clear();
  uint clear=_backgroundColor.PackedValue;
  if(FilterManager.AnyFilterActive||FilterManager.FindOverlayActive)clear=FilterManager.CurrentBackgroundMode switch{FilterManager.BackgroundMode.Transparent=>0,FilterManager.BackgroundMode.Custom=>FilterManager.BackgroundModeCustomColor.PackedValue,_=>clear};
  if(_wvm.ShowBuffRadii){
   if(!buffInitialized){_wvm.BuffTileCache.RebuildFromWorld(_wvm.CurrentWorld);buffInitialized=true;}
   _spriteBatch.Target="@buff";_spriteBatch.Begin(SpriteSortMode.Deferred,MaxBlend);DrawBuffRadii();_spriteBatch.End();
  }
  bool filtered=(FilterManager.AnyFilterActive&&FilterManager.CurrentFilterMode==FilterManager.FilterMode.Darken)||FilterManager.FindOverlayActive;
  _spriteBatch.Target=filtered?"@world":null;
  RenderViewportLayers();
  if(_wvm.ShowBuffRadii){_spriteBatch.Begin(SpriteSortMode.Deferred,BlendState.NonPremultiplied);_spriteBatch.Draw(new("@buff",width,height),new RectangleInt32(0,0,width,height),TEditColor.White);_spriteBatch.End();}
  var regions=new List<FilterRegion>();
  if(filtered){
   var visible=GetViewingArea();
   for(int ty=visible.Top;ty<visible.Bottom;ty++){
    int start=-1;
    for(int tx=visible.Left;tx<=visible.Right;tx++){
     bool dark=tx<visible.Right&&WorldViewModel.ComputeFilterMask(tx,ty,_wvm.CurrentWorld.Tiles[tx,ty])!=0;
     if(dark&&start<0)start=tx;
     if(!dark&&start>=0){regions.Add(new((start-x)*zoom,(ty-y)*zoom,(tx-start)*zoom,zoom));start=-1;}
    }
   }
   _spriteBatch.Target=null;_spriteBatch.Begin(SpriteSortMode.Immediate,BlendState.Opaque,effect:new Effect("darken"));_spriteBatch.Draw(new("@world",width,height),new RectangleInt32(0,0,width,height),TEditColor.White);_spriteBatch.End();
  }
  _spriteBatch.Target=null;_spriteBatch.Begin(SpriteSortMode.BackToFront);
  DrawWireTraceHighlight();if(_wvm.ShowGrid)DrawGrid();if(_wvm.ShowWorldBorder)DrawWorldBorder();if(_wvm.ShowPoints)DrawPoints();if(_wvm.ShowNbtOverlay)DrawNbtOverlay();DrawFindCrosshair();
  if(_wvm.Selection.IsActive)DrawSelection();
  if(_wvm.ActiveTool?.IsFloatingPaste==true)DrawPasteLayer();
  if(hover&&_wvm.ActiveTool!=null){UpdateToolTexture();DrawToolPreview();}
  _spriteBatch.End();
  foreach(var t in xnaViewport.GraphicsService.GraphicsDevice.Textures)if(t.Pixels!=null)uploads.Add(new(t.Key,t.Width,t.Height,t.Pixels));
  return new(width,height,clear,previewPasses.Concat(_spriteBatch.Finish()).ToArray(),_textureDictionary.Missing.ToArray(),TEdit.ErrorLogging.RenderErrors(),uploads.ToArray(),x,y,zoom,regions.ToArray(),FilterManager.DarkenAmount,FilterManager.DesaturateAmount);
 }
 void UpdateToolTexture(){
  var tool=_wvm.ActiveTool;
  if(tool.Name=="Sprite2"&&_wvm.SelectedSpriteItem is {} item&&_wvm.SelectedSpriteSheet is {} sheet){_preview=BuildSpritePreview(item,sheet);return;}
  var bitmap=tool.PreviewTool();var pixels=new byte[bitmap.Width*bitmap.Height*4];
  for(int i=0;i<bitmap.Pixels.Length;i++){
   uint packed=bitmap.Pixels[i];byte a=(byte)(packed>>24);pixels[i*4]=(byte)(((packed>>16)&255)*a/255);pixels[i*4+1]=(byte)(((packed>>8)&255)*a/255);pixels[i*4+2]=(byte)((packed&255)*a/255);pixels[i*4+3]=a;
  }
  _preview=Upload("@preview",bitmap.Width,bitmap.Height,pixels);
 }
 public RenderScene ExportScene(int width,int height,float x,float y,float zoom){
  if(width<1||height<1||width>4096||height>4096||!float.IsFinite(x+y+zoom)||zoom<0.01f||zoom>256)throw new ArgumentOutOfRangeException("Render view");
  xnaViewport.ActualWidth=width;xnaViewport.ActualHeight=height;
  _exportViewSize=new(width,height);_scrollPosition=new(-x,-y);_zoom=zoom;
  TEdit.ErrorLogging.BeginRender();_textureDictionary.BeginFrame();_spriteBatch.Reset();_spriteBatch.Target=null;uploads.Clear();previewPasses.Clear();
  RenderExportLayers();
  return new(width,height,_backgroundColor.PackedValue,previewPasses.Concat(_spriteBatch.Finish()).ToArray(),_textureDictionary.Missing.ToArray(),TEdit.ErrorLogging.RenderErrors(),uploads.ToArray(),x,y,zoom);
 }
 // Pixel mode is supplied by the original PixelMap adapter; texture scene never calls it while Valid.
 void DrawPixelTiles(){
  int width=(int)_exportViewSize!.Value.Width,height=(int)_exportViewSize.Value.Height;
  var pixels=new byte[width*height*4];var world=_wvm.CurrentWorld;
  for(int py=0;py<height;py++)for(int px=0;px<width;px++){
   int tx=(int)Math.Floor(-_scrollPosition.X+(px+0.5f)/_zoom),ty=(int)Math.Floor(-_scrollPosition.Y+(py+0.5f)/_zoom);if(!world.ValidTileLocation(tx,ty))continue;
   var c=DesktopPixel.PixelMap.GetTileColor(world.Tiles[tx,ty],_wvm.GetBackgroundColor(ty),_wvm.ShowWalls,_wvm.ShowTiles,_wvm.ShowLiquid,_wvm.ShowRedWires,_wvm.ShowBlueWires,_wvm.ShowGreenWires,_wvm.ShowYellowWires,_wvm.ShowCoatings);
   int i=(py*width+px)*4;pixels[i]=c.R;pixels[i+1]=c.G;pixels[i+2]=c.B;pixels[i+3]=c.A;
  }
  _spriteBatch.Draw(Upload("@raster",width,height,pixels),new RectangleInt32(0,0,width,height),TEditColor.White);
 }
}
