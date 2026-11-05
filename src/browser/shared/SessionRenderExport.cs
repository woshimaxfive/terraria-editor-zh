using System.Text.Json;
using System.IO.Compression;
using TEdit.Common;
using TEdit.Geometry;
using TEdit.Export;
namespace TEdit.Port;
public sealed partial class Session {
 public async Task<byte[]> ExportRenderedAsync(string json,Func<string,Task<string>> draw,Action<double,double,string>? report=null){
  double overall=0,layer=0;string progressText="正在导出";void Report(){report?.Invoke(overall,layer,progressText);}
  var progress=new InlineExportProgress(p=>{overall=p.ProgressPercentage;progressText=p.UserState?.ToString()??progressText;Report();});
  EnsureRenderer();using var doc=JsonDocument.Parse(json);var p=doc.RootElement;var a=p.GetProperty("area");
  int x=a.GetProperty("x").GetInt32(),y=a.GetProperty("y").GetInt32(),w=a.GetProperty("width").GetInt32(),h=a.GetProperty("height").GetInt32();
  if(x<0||y<0||w<1||h<1||(long)x+w>World!.TilesWide||(long)y+h>World.TilesHigh)throw new ArgumentException("导出区域超出世界");
  var area=new RectangleInt32(x,y,w,h);int scale=p.TryGetProperty("scale",out var s)?s.GetInt32():16;
  if(scale is not (1 or 4 or 8 or 16))throw new ArgumentException("原版导出比例为1、4、8或16");
  bool tiles=p.TryGetProperty("tiles",out var t)&&t.GetBoolean();
  // Original streaming exporters bound working strips; encoded output is bounded below.
  RenderSceneJson(JsonSerializer.Serialize(new{width=1,height=1,x,y,zoom=scale,export=true,layers=p.TryGetProperty("layers",out var l)?l:JsonSerializer.SerializeToElement(new{}),filter=p.TryGetProperty("filter",out var f)?f:JsonSerializer.SerializeToElement(new{enabled=false})}));
  var directory=Path.Combine(Path.GetTempPath(),"tedit-render-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
  async Task<TEditColor[]> RenderChunk(int wx,int wy,int pw,int ph,int factor){
   for(int pass=0;pass<8;pass++){
    string scene=RenderSceneJson(JsonSerializer.Serialize(new{width=pw,height=ph,x=wx,y=wy,zoom=factor,export=true}));
    if(tiles){var model=JsonSerializer.Deserialize<TEdit.Port.Rendering.RenderScene>(scene,RenderJson)!;scene=JsonSerializer.Serialize(model with{Clear=0},RenderJson);}
    using var response=JsonDocument.Parse(await draw(scene));var reply=response.RootElement;
    if(reply.TryGetProperty("metadata",out var metadata)){RegisterRenderTextures(metadata.GetRawText());continue;}
    var bytes=Convert.FromBase64String(reply.GetProperty("rgba").GetString()!);if(bytes.Length!=pw*ph*4)throw new InvalidDataException("导出像素长度错误");
    var colors=new TEditColor[pw*ph];for(int i=0;i<colors.Length;i++)colors[i]=new(bytes[i*4],bytes[i*4+1],bytes[i*4+2],bytes[i*4+3]);return colors;
   }throw new InvalidDataException("贴图解析未收敛");
  }
  var bg=new TEditColor(32,32,32,255);
  try{
   if(!tiles){var file=Path.Combine(directory,"map.png");
    if(scale==1)await PngExporter.ExportPixelMapAsync(file,area,World!,bg,vm!.ShowWalls,vm.ShowTiles,vm.ShowLiquid,vm.ShowRedWires,vm.ShowBlueWires,vm.ShowGreenWires,vm.ShowYellowWires,progress);
    else await PngExporter.ExportTexturedAsync(file,area,scale,bg,RenderChunk,progress);
    return File.ReadAllBytes(file);
   }
   var pm=new LeafletTileExporter.PixelMapState(World!,bg,vm!.ShowWalls,vm.ShowTiles,vm.ShowLiquid,vm.ShowRedWires,vm.ShowBlueWires,vm.ShowGreenWires,vm.ShowYellowWires);
   long tileBytes=-1;
   async Task<int> Textured(string dir,RectangleInt32 region,int size,int zoom,int factor,IProgress<System.ComponentModel.ProgressChangedEventArgs>? progress,int done,int total){
    if(tileBytes<0)tileBytes=Directory.EnumerateFiles(dir,"*",SearchOption.AllDirectories).Sum(path=>new FileInfo(path).Length);
    var level=Path.Combine(dir,"tiles",zoom.ToString());Directory.CreateDirectory(level);
    int wide=(region.Width*factor+size-1)/size,high=(region.Height*factor+size-1)/size;
    for(int ty=0;ty<high;ty++)for(int tx=0;tx<wide;tx++){
     var data=await RenderChunk(region.Left+tx*size/factor,region.Top+ty*size/factor,size,size,factor);
     int validWidth=Math.Min(size,region.Width*factor-tx*size),validHeight=Math.Min(size,region.Height*factor-ty*size);
     var rgba=new byte[size*size*4];for(int row=0;row<validHeight;row++)for(int col=0;col<validWidth;col++){int i=row*size+col;rgba[i*4]=data[i].R;rgba[i*4+1]=data[i].G;rgba[i*4+2]=data[i].B;rgba[i*4+3]=data[i].A;}
     using(var stream=File.Create(Path.Combine(level,$"{tx}_{ty}.png")))using(var png=new TEdit.Png.StreamingPngWriter(stream,size,size)){for(int row=0;row<size;row++)png.WriteScanline(rgba.AsSpan(row*size*4,size*4));png.Finish();}tileBytes+=new FileInfo(Path.Combine(level,$"{tx}_{ty}.png")).Length;if(tileBytes>MaxTemplateBytes)throw new IOException("图块数据超过256MiB，请分区导出；世界和历史保留");done++;layer=(ty*wide+tx+1)*100.0/(wide*high);overall=total>0?done*99.0/total:0;Report();
    }return done;
   }
   await LeafletTileExporter.ExportAsync(directory,area,World!.Title,pm,Textured,progress,v=>{layer=v*100;Report();});
   using var output=new MemoryStream();using var bounded=new ExportBudgetStream(output);using(var zip=new ZipArchive(bounded,ZipArchiveMode.Create,true))foreach(var file in Directory.EnumerateFiles(directory,"*",SearchOption.AllDirectories)){var entry=zip.CreateEntry(Path.GetRelativePath(directory,file).Replace('\\','/'));using var target=entry.Open();using var source=File.OpenRead(file);source.CopyTo(target);}return output.ToArray();
  }finally{Directory.Delete(directory,true);}
 }
}

sealed class InlineExportProgress(Action<System.ComponentModel.ProgressChangedEventArgs> report):IProgress<System.ComponentModel.ProgressChangedEventArgs>{public void Report(System.ComponentModel.ProgressChangedEventArgs value)=>report(value);}
