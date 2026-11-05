using System.Text.Json;
using TEdit.Port.Rendering;
using TEdit.ViewModel;
using TEdit.Render;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed partial class Session {
 Textures? renderTextures;
 OriginalWorldRenderer? worldRenderer;
 World? renderWorld;
 RenderScene? lastRender;
 string? renderFilterIdentity;
 static readonly JsonSerializerOptions RenderJson=new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase,PropertyNameCaseInsensitive=true};
 void EnsureRenderer(){
  RequireWorld();if(renderWorld==World)return;
  renderWorld=World;renderTextures=new();worldRenderer=new(vm!,renderTextures);FilterManager.ClearAll();FilterManager.ClearFindResults();renderFilterIdentity=null;
 }
 public void RegisterRenderTextures(string json){EnsureRenderer();using var data=JsonDocument.Parse(json);var root=data.RootElement;renderTextures!.Available=root.ValueKind==JsonValueKind.Object&&root.GetProperty("available").GetBoolean();renderTextures.Register(JsonSerializer.Deserialize<Texture2D[]>(root.ValueKind==JsonValueKind.Array?root:root.GetProperty("metadata"),RenderJson)??throw new ArgumentException("贴图目录无效"));}
 RenderScene CreateRenderScene(string json){
  EnsureRenderer();using var doc=JsonDocument.Parse(json);var p=doc.RootElement;
  ConfigurePalette(p.TryGetProperty("colorMode",out var palette)?palette.GetString()??"Default":"Default");
  int width=p.GetProperty("width").GetInt32(),height=p.GetProperty("height").GetInt32();float x=p.GetProperty("x").GetSingle(),y=p.GetProperty("y").GetSingle(),zoom=p.GetProperty("zoom").GetSingle();
  if(width<1||height<1||width>4096||height>4096||!float.IsFinite(x+y+zoom)||Math.Abs(x)>100000||Math.Abs(y)>100000||zoom<0.01||zoom>256)throw new ArgumentException("视图范围无效");
  if(p.TryGetProperty("layers",out var layers))foreach(var layer in layers.EnumerateObject()){
   if(!RenderLayers.Contains(layer.Name))throw new ArgumentException("未知绘图层");typeof(WorldViewModel).GetProperty(layer.Name)!.SetValue(vm,layer.Value.GetBoolean());
  }
  if(p.TryGetProperty("lightGlowIntensity",out var intensity)){float amount=intensity.GetSingle();if(!float.IsFinite(amount)||amount<0||amount>1)throw new ArgumentException("发光强度必须为0至1");vm!.LightGlowIntensity=amount;}
  if(p.TryGetProperty("backgroundScaleZoom",out var scale)){float amount=scale.GetSingle();if(!float.IsFinite(amount)||amount<7||amount>12)throw new ArgumentException("背景缩放基准必须为7至12");vm!.BackgroundScaleZoom=amount;}
  if(p.TryGetProperty("textureVisibilityZoomLevel",out var threshold)){float amount=threshold.GetSingle();if(!float.IsFinite(amount)||amount<3||amount>10)throw new ArgumentException("贴图显示阈值必须为3至10");vm!.TextureVisibilityZoomLevel=amount;}
  string tool=p.TryGetProperty("tool",out var t)?t.GetString()??"Brush":"Brush";
  if(!Tools.TryGetValue(tool,out var active))throw new ArgumentException("未知预览工具");vm!.ActiveTool=active;
  bool hover=p.TryGetProperty("cursor",out var cursor)&&cursor.ValueKind==JsonValueKind.Object;
  if(hover){int cx=cursor.GetProperty("x").GetInt32(),cy=cursor.GetProperty("y").GetInt32();hover=World!.ValidTileLocation(cx,cy);if(hover)vm.MouseOverTile.MouseState=new(){Location=new(cx,cy)};}
  bool temporary=p.TryGetProperty("toolState",out var state)&&state.ValueKind==JsonValueKind.Object;var savedTools=temporary?JsonSerializer.SerializeToElement(CaptureToolState(),ToolJson):default;
  try{if(temporary)RestoreToolState(state);
  RenderInput.Modifiers=p.TryGetProperty("shift",out var shift)&&shift.GetBoolean()?RenderModifiers.Shift:RenderModifiers.None;
  if(p.TryGetProperty("filter",out var filter)&&renderFilterIdentity!=filter.GetRawText()){
   ConfigureRenderFilter(filter);renderFilterIdentity=filter.GetRawText();BlendRules.ResetUVCache(vm!,0,0,World!.TilesWide,World.TilesHigh);
  }
  if(p.TryGetProperty("crosshair",out var cross))worldRenderer!.SetCrosshair(cross.GetProperty("enabled").GetBoolean(),cross.GetProperty("x").GetInt32(),cross.GetProperty("y").GetInt32());
  bool export=p.TryGetProperty("export",out var e)&&e.GetBoolean();
  var scene=export?worldRenderer!.ExportScene(width,height,x,y,zoom):worldRenderer!.ViewScene(width,height,x,y,zoom,hover);
  if(scene.Errors.Length>0)throw new InvalidOperationException(string.Join("\n",scene.Errors));
  if(!export)lastRender=scene;
  return scene;
  }finally{if(temporary)RestoreToolState(savedTools);}
 }
 public static readonly string[] RenderLayers=["ShowAllWires","MinimapBackground","WorldBorderOverlay","ShowTextures","ShowBackgrounds","ShowWalls","ShowTiles","ShowLiquid","ShowRedWires","ShowBlueWires","ShowGreenWires","ShowYellowWires","ShowActuators","ShowCoatings","ShowGlowMasks","ShowWireTransparency","ShowGrid","ShowWorldBorder","ShowPoints","ShowNbtOverlay","ShowBuffRadii"];
 public byte[] RenderMinimap(){
  RequireWorld();var pixels=new byte[200*100*4];
  for(int y=0;y<100;y++)for(int x=0;x<200;x++){
   int tx=Math.Min(World!.TilesWide-1,(int)((x+0.5)*World.TilesWide/200)),ty=Math.Min(World.TilesHigh-1,(int)((y+0.5)*World.TilesHigh/100));
   var c=DesktopPixel.PixelMap.GetTileColor(World.Tiles[tx,ty],vm!.MinimapBackground?vm.GetBackgroundColor(ty):new TEdit.Common.TEditColor(0,0,0,0),vm.ShowWalls,vm.ShowTiles,vm.ShowLiquid,vm.ShowRedWires,vm.ShowBlueWires,vm.ShowGreenWires,vm.ShowYellowWires,vm.ShowCoatings);int i=(y*200+x)*4;pixels[i]=c.R;pixels[i+1]=c.G;pixels[i+2]=c.B;pixels[i+3]=c.A;
  }
  if(lastRender is {} view){int left=Math.Clamp((int)(view.ViewX/World!.TilesWide*200),0,199),right=Math.Clamp((int)((view.ViewX+view.Width/view.Zoom)/World!.TilesWide*200),0,199),top=Math.Clamp((int)(view.ViewY/World!.TilesHigh*100),0,99),bottom=Math.Clamp((int)((view.ViewY+view.Height/view.Zoom)/World!.TilesHigh*100),0,99);void Mark(int x,int y){int i=(y*200+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=pixels[i+3]=255;}for(int x=left;x<=right;x++){Mark(x,top);Mark(x,bottom);}for(int y=top;y<=bottom;y++){Mark(left,y);Mark(right,y);}}
  return pixels;
 }
 static void ConfigureRenderFilter(JsonElement p){
  int[] Values(string key,int max,int min=0){if(!p.TryGetProperty(key,out var v))return [];var ids=v.EnumerateArray().Select(i=>i.GetInt32()).ToArray();if(ids.Length>4096||ids.Any(i=>i<min||i>max))throw new ArgumentException("过滤编号无效");return ids;}
  var tiles=Values("tiles",WorldConfiguration.TileProperties.Count-1,-1);var walls=Values("walls",WorldConfiguration.WallProperties.Count-1);var liquids=Values("liquids",3);var wires=Values("wires",3);var sprites=Values("sprites",WorldConfiguration.TileProperties.Count-1);
  string mode=p.TryGetProperty("mode",out var m)?m.GetString()??"Darken":"Darken";if(!Enum.TryParse<FilterManager.FilterMode>(mode,out var parsed)||!Enum.IsDefined(parsed))throw new ArgumentException("过滤模式无效");
  FilterManager.ClearAll();FilterManager.ClearFindResults();FilterManager.CurrentFilterMode=parsed;FilterManager.CurrentBackgroundMode=FilterManager.BackgroundMode.Normal;FilterManager.FilterModeCustomColor=TEdit.Common.TEditColor.Transparent;
  if(p.TryGetProperty("background",out var bg)){if(!Enum.TryParse<FilterManager.BackgroundMode>(bg.GetString(),out var background)||!Enum.IsDefined(background))throw new ArgumentException("过滤背景无效");FilterManager.CurrentBackgroundMode=background;}
  if(p.TryGetProperty("backgroundColor",out var color))FilterManager.BackgroundModeCustomColor=new TEdit.Common.TEditColor(color.GetUInt32());
  if(p.TryGetProperty("hideColor",out var hide))FilterManager.FilterModeCustomColor=new TEdit.Common.TEditColor(hide.GetUInt32());
  float Amount(string name,float value){if(!p.TryGetProperty(name,out var v))return value;float n=v.GetSingle();if(!float.IsFinite(n)||n<0||n>1)throw new ArgumentException("滤镜强度应为0至1");return n;}
  FilterManager.DarkenAmount=Amount("darken",0.75f);FilterManager.DesaturateAmount=Amount("desaturate",0.75f);
  if(p.TryGetProperty("find",out var find)){var positions=find.EnumerateArray().Select(v=>(X:v.GetProperty("x").GetInt32(),Y:v.GetProperty("y").GetInt32())).ToArray();if(positions.Length>100000)throw new ArgumentException("查找覆盖超过10万点");FilterManager.SetFindResults(positions);}
  foreach(var i in tiles)FilterManager.AddTileFilter(i);foreach(var i in walls)FilterManager.AddWallFilter(i);foreach(var i in sprites)FilterManager.AddSpriteFilter(i);
  foreach(var i in tiles)FilterManager.SelectedTileNames.Add(i.ToString());foreach(var i in walls)FilterManager.SelectedWallNames.Add(i.ToString());foreach(var i in sprites)FilterManager.SelectedSpriteNames.Add(i.ToString());foreach(var i in liquids)FilterManager.SelectedLiquidNames.Add(i.ToString());foreach(var i in wires)FilterManager.SelectedWireNames.Add(i.ToString());
  FilterManager.IsEnabled=!p.TryGetProperty("enabled",out var enabled)||enabled.GetBoolean();
  foreach(var i in liquids)FilterManager.AddLiquidFilter((LiquidType)i);foreach(var i in wires)FilterManager.AddWireFilter((FilterManager.WireType)i);
 }
}
