using System.Text.Json;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Terraria.Objects;
namespace TEdit.Port;
public sealed partial class Session {
 OriginalUvDraft? uvDraft;RectangleInt32 uvArea;
 public bool EditUv(JsonElement p){
  RequireWorld();string action=p.GetProperty("action").GetString()!;
  if(action=="open"){
   if(p.TryGetProperty("settings",out var settings)&&settings.TryGetProperty("toolState",out var state))RestoreToolState(state);
   if(!vm!.Selection.IsActive)throw new ArgumentException("先框选要编辑 UV 的图格");
   uvArea=vm.Selection.SelectionArea;if(uvArea.Width<1||uvArea.Height<1||(long)uvArea.Width*uvArea.Height>WorldFiles.MaxWorldCells||!World!.ValidTileLocation(uvArea.X,uvArea.Y)||!World.ValidTileLocation(uvArea.Right-1,uvArea.Bottom-1))throw new ArgumentException("UV 选区超出已加载世界范围");
   var tiles=new UvDraftTile[uvArea.Width,uvArea.Height];
   for(int y=0;y<uvArea.Height;y++){
    for(int x=0;x<uvArea.Width;x++)tiles[x,y]=World.Tiles[uvArea.X+x,uvArea.Y+y];
    OperationProgress.Advance(uvArea.Width);
   }
   uvDraft=new(tiles);
  }else if(action=="cancel"){uvDraft=null;DesktopResult=null;Notify();return false;}
  else{
   if(uvDraft==null)throw new ArgumentException("先打开 UV 编辑器");
   short u=p.TryGetProperty("u",out var pu)?pu.GetInt16():(short)0,v=p.TryGetProperty("v",out var pv)?pv.GetInt16():(short)0;
   if(action=="set")uvDraft.Set(u,v);else if(action=="move"){uvDraft.MoveU(u);uvDraft.MoveV(v);}
   else if(action=="restore"){
    for(int y=0;y<uvArea.Height;y++){
     for(int x=0;x<uvArea.Width;x++)uvDraft.Tiles[x,y]=World!.Tiles[uvArea.X+x,uvArea.Y+y];
     OperationProgress.Advance(uvArea.Width);
    }
   }
   else if(action=="commit"){
    if(replayPlayer!=null)throw new ArgumentException("先将回放设为编辑起点");
    for(int y=0;y<uvArea.Height;y++)for(int x=0;x<uvArea.Width;x++){int tx=uvArea.X+x,ty=uvArea.Y+y;vm!.UndoManager.SaveTile(tx,ty);World!.Tiles[tx,ty].U=uvDraft.Tiles[x,y].U;World.Tiles[tx,ty].V=uvDraft.Tiles[x,y].V;}
    vm!.UndoManager.SaveUndo();uvDraft=null;DesktopResult=null;Notify();return true;
   }else throw new ArgumentException("UV 操作无效");
  }
  var rows=new List<object>();
  for(int y=0;y<uvArea.Height&&rows.Count<512;y++){
   for(int x=0;x<uvArea.Width&&rows.Count<512;x++){var t=uvDraft!.Tiles[x,y];if(t.Type>0)rows.Add(new{x=x+uvArea.X,y=y+uvArea.Y,type=t.Type,u=t.U,v=t.V});}
   OperationProgress.Advance(uvArea.Width);
  }
  DesktopResult=new{page="uvEditor",data=new{count=uvArea.Width*uvArea.Height,rows}};Notify();return false;
 }
 readonly BrowserSpriteConfigStore spriteConfigStore=new();
 OriginalSpriteSheetEditor? spriteEditor;
 public void ApplySpriteConfigurations(string json){
  if(System.Text.Encoding.UTF8.GetByteCount(json)>4*1024*1024)throw new ArgumentException("精灵表配置超过4MiB");using var doc=JsonDocument.Parse(json);if(doc.RootElement.EnumerateObject().Count()>256)throw new ArgumentException("精灵表配置超过256种");
  foreach(var entry in doc.RootElement.EnumerateObject()){
   var row=entry.Value;int tile=row.GetProperty("tile").GetInt32();if(tile<0||tile>=WorldConfiguration.TileProperties.Count)throw new ArgumentException("配置图格不存在");var check=new OriginalSpriteSheetEditor(WorldConfiguration.TileProperties[tile],null,spriteConfigStore);SpriteApplySettings(check,row.GetProperty("settings"));var frames=SpriteParseFrames(row.GetProperty("frames"));check.Frames.Clear();foreach(var f in frames)check.Frames.Add(f);check.SaveCommand.Execute(null);
  }spriteEditor=null;DesktopResult=null;
 }
 static readonly string[] SpriteSettingNames=["TextureGridX","TextureGridY","FrameGapX","FrameGapY","FrameSizeX","FrameSizeY","IsAnimated","CoordinateHeightsText"];
 static readonly string[] SpriteFrameNames=["Name","Variety","UvX","UvY","SizeX","SizeY","Anchor"];
 static JsonElement SpriteJson(object? value)=>JsonSerializer.SerializeToElement(value);
 static void SpriteApplySettings(OriginalSpriteSheetEditor editor,JsonElement settings){
  var changes=new List<(System.Reflection.PropertyInfo,object?)>();foreach(var item in settings.EnumerateObject()){
   if(!SpriteSettingNames.Contains(item.Name))throw new ArgumentException("精灵表设置不存在");var prop=typeof(OriginalSpriteSheetEditor).GetProperty(item.Name)!;object? value=JsonSerializer.Deserialize(item.Value,prop.PropertyType);
   if(value is short n&&(n<0||n>256||n==0&&!item.Name.StartsWith("FrameGap")))throw new ArgumentException("网格或帧尺寸超出范围");
   if(value is string text&&(text.Length>4096||text.Length>0&&text.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Any(v=>!short.TryParse(v,out var h)||h<1||h>4096)))throw new ArgumentException("每行高度必须为逗号分隔的正整数");changes.Add((prop,value));
  }foreach(var (prop,value) in changes)prop.SetValue(editor,value);
 }
 static List<EditableFrame> SpriteParseFrames(JsonElement input){
  if(input.ValueKind!=JsonValueKind.Array||input.GetArrayLength()>4096)throw new ArgumentException("精灵表最多4096帧");var result=new List<EditableFrame>();
  foreach(var row in input.EnumerateArray()){
   var frame=new EditableFrame();foreach(var item in row.EnumerateObject()){
    if(!SpriteFrameNames.Contains(item.Name))throw new ArgumentException("帧字段不存在");var prop=typeof(EditableFrame).GetProperty(item.Name)!;object? value=prop.PropertyType==typeof(FrameAnchor)?Enum.Parse<FrameAnchor>(item.Value.GetString()!):JsonSerializer.Deserialize(item.Value,prop.PropertyType);
    if(value is string text&&text.Length>16000||value is short n&&(n<0||n==0&&item.Name.StartsWith("Size"))||value is FrameAnchor anchor&&!Enum.IsDefined(anchor))throw new ArgumentException("帧值超出范围");prop.SetValue(frame,value);
   }result.Add(frame);
  }return result;
 }
 public void EditSpriteSheet(JsonElement p){
  RequireWorld();string action=p.GetProperty("action").GetString()!;
  if(action=="open"){
   int tile=p.GetProperty("tile").GetInt32();if(tile<0||tile>=WorldConfiguration.TileProperties.Count)throw new ArgumentException("图格不存在");
   SpriteEditorBitmap? image=previewPixels.TryGetValue("tiles_"+tile,out var texture)?new(texture.Width,texture.Height,texture.Rgba):null;
   spriteEditor=new(WorldConfiguration.TileProperties[tile],image,spriteConfigStore);
   if(p.TryGetProperty("stored",out var stored)&&stored.ValueKind==JsonValueKind.Object){SpriteApplySettings(spriteEditor,stored.GetProperty("settings"));var frames=SpriteParseFrames(stored.GetProperty("frames"));spriteEditor.Frames.Clear();foreach(var f in frames)spriteEditor.Frames.Add(EditableFrame.FromFrameProperty(f.ToFrameProperty(),new(spriteEditor.TextureGridX,spriteEditor.TextureGridY),new(spriteEditor.FrameGapX,spriteEditor.FrameGapY),new(spriteEditor.FrameSizeX,spriteEditor.FrameSizeY)));}
  }
  var editor=spriteEditor??throw new ArgumentException("先打开精灵表编辑器");
  if(p.TryGetProperty("settings",out var settings))SpriteApplySettings(editor,settings);
  if(p.TryGetProperty("frames",out var input)){var frames=SpriteParseFrames(input);editor.Frames.Clear();foreach(var f in frames)editor.Frames.Add(EditableFrame.FromFrameProperty(f.ToFrameProperty(),new(editor.TextureGridX,editor.TextureGridY),new(editor.FrameGapX,editor.FrameGapY),new(editor.FrameSizeX,editor.FrameSizeY)));}
  if(p.TryGetProperty("selected",out var selected))editor.SelectedFrame=selected.GetInt32()>=0&&selected.GetInt32()<editor.Frames.Count?editor.Frames[selected.GetInt32()]:null;
  if(editor.Frames.Count>=4096&&action is "add" or "selection")throw new ArgumentException("精灵表最多4096帧");
  if(action is "auto" or "grid"){
   // Reject excessive grids before entering the unchanged original loops.
   if(editor.TileTexture==null)throw new ArgumentException("先选择 Terraria 贴图目录");
   if((long)editor.TileTexture.PixelWidth*editor.TileTexture.PixelHeight/(editor.TextureGridX+editor.FrameGapX)/(editor.TextureGridY+editor.FrameGapY)>4096)throw new ArgumentException("生成网格超过4096帧预算，请增大网格尺寸");
  }
  switch(action){
   case "open":case "edit":break;
   case "auto":editor.AutoDetectCommand.Execute(null);break;
   case "grid":editor.RegenerateFramesFromGrid();break;
   case "single":editor.SetSingleFrame();break;
   case "add":editor.AddFrameCommand.Execute(null);break;
   case "remove":editor.RemoveFrameCommand.Execute(null);break;
   case "save":editor.SaveCommand.Execute(null);spriteFrameSheets.Remove(editor.TileId);ClipboardSpriteMetadata.Build();if(vm!.SelectedSpriteItem?.Tile==editor.TileId&&editor.Frames.Count>0)SelectSprite(editor.TileId,0);break;
   case "reset":editor.ResetCommand.Execute(null);break;
   case "selection":{
    int x=p.GetProperty("startCol").GetInt32(),y=p.GetProperty("startRow").GetInt32(),xx=p.GetProperty("endCol").GetInt32(),yy=p.GetProperty("endRow").GetInt32();
    int gx=editor.TextureGridX+editor.FrameGapX,gy=editor.TextureGridY+editor.FrameGapY;
    if(new[]{x,y,xx,yy}.Any(n=>n<0)||((long)Math.Max(x,xx)+1)*gx>32767||((long)Math.Max(y,yy)+1)*gy>32767)throw new ArgumentException("选框超出帧范围");int w=Math.Abs(xx-x)+1,h=Math.Abs(yy-y)+1;
    editor.AddFrameFromSelection((short)(Math.Min(x,xx)*gx),(short)(Math.Min(y,yy)*gy),(short)w,(short)h,w*editor.TextureGridX+(w-1)*editor.FrameGapX,h*editor.TextureGridY+(h-1)*editor.FrameGapY);break;
   }
   default:throw new ArgumentException("精灵表操作无效");
  }
  DesktopResult=new{page="spriteEditor",data=new{tile=editor.TileId,name=editor.TileName,selected=editor.SelectedFrame==null?-1:editor.Frames.IndexOf(editor.SelectedFrame),hasTexture=editor.TileTexture!=null,width=editor.TileTexture?.PixelWidth,height=editor.TileTexture?.PixelHeight,status=editor.StatusText,settings=SpriteSettingNames.ToDictionary(n=>n,n=>typeof(OriginalSpriteSheetEditor).GetProperty(n)!.GetValue(editor)),frames=editor.Frames.Select(f=>SpriteFrameNames.ToDictionary(n=>n,n=>n=="Anchor"?(object)f.Anchor.ToString():typeof(EditableFrame).GetProperty(n)!.GetValue(f))).ToArray()}};Notify();
 }
}
