using TEdit.Common;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {
 public RenderScene CatalogPreview(string kind,int id,int style){
  _textureDictionary.BeginFrame();_spriteBatch.Reset();uploads.Clear();previewPasses.Clear();_spriteBatch.Target=null;Texture2D texture;RectangleInt32 source;
  if(kind.StartsWith("backgroundStyle:"))return BackgroundStylePreview(kind[16..],id);
  if(kind=="sprite"||kind.StartsWith("biome:")){
   ClipboardSpriteMetadata.Build();var sheet=WorldConfiguration.Sprites2.FirstOrDefault(s=>s.Tile==id);var item=sheet?.Styles.FirstOrDefault(s=>s.Style==style);if(item==null)throw new ArgumentException("家具样式不存在");texture=kind=="sprite"?BuildSpritePreview(item,sheet!):BuildBiomePreview(item,sheet!,int.Parse(kind[6..]));source=texture.Bounds;
  }else if(kind=="npc"){
   if(!WorldConfiguration.NpcById.TryGetValue(id,out var npc))throw new ArgumentException("NPC不存在");
   texture=WorldConfiguration.BestiaryData.NpcById.TryGetValue(id,out var entry)&&entry.IsTownNpc?_textureDictionary.GetTownNPC(entry.BestiaryId,id,variant:style):_textureDictionary.GetNPC(id);
   var rect=npc.SourceRect;int width=rect.Width>0?rect.Width:texture.Width,height=rect.Height>0?rect.Height:Math.Min(texture.Width*2,texture.Height);int x=rect.X,y=rect.Y;if(x+width>texture.Width)width=texture.Width-x;if(y+height>texture.Height)height=texture.Height-y;source=new(x,y,Math.Max(1,width),Math.Max(1,height));
  }else if(kind=="item"){var item=WorldConfiguration.ItemProperties.FirstOrDefault(p=>p.Id==id)??throw new ArgumentException("物品不存在");texture=_textureDictionary.GetItem(item.TextureId??id);source=new(0,0,texture.Width,texture.Height);}
  else if(kind=="background"){texture=_textureDictionary.GetBackground(id);source=GetBackgroundSourceRect(id,texture);}
  else throw new ArgumentException("预览类别无效");
  int size=kind is "item" or "npc"?24:64;double scale=Math.Min(1,Math.Min((double)size/source.Width,(double)size/source.Height));int w=Math.Max(1,(int)(source.Width*scale)),h=Math.Max(1,(int)(source.Height*scale));
  _spriteBatch.Begin();
  if(kind is "item" or "npc"){
   // Original CreateScaledItemPreview samples floor(dx / scale), rather than
   // the pixel centres used by a general nearest-neighbour texture draw.
   for(int dy=0;dy<h;dy++)for(int dx=0;dx<w;dx++){
    int sx=source.X+Math.Min((int)(dx/scale),source.Width-1),sy=source.Y+Math.Min((int)(dy/scale),source.Height-1);
    _spriteBatch.Draw(texture,new RectangleInt32((size-w)/2+dx,(size-h)/2+dy,1,1),new RectangleInt32(sx,sy,1,1),TEditColor.White,0,System.Numerics.Vector2.Zero,SpriteEffects.None,0);
   }
  }else _spriteBatch.Draw(texture,new RectangleInt32((size-w)/2,(size-h)/2,w,h),source,TEditColor.White,0,System.Numerics.Vector2.Zero,SpriteEffects.None,0);
  _spriteBatch.End();
  return new(size,size,0,previewPasses.Concat(_spriteBatch.Finish()).ToArray(),_textureDictionary.Missing.ToArray(),[],uploads.ToArray());
 }
}
public sealed partial class Session {
 public string CatalogPreviewJson(string kind,int id,int style){EnsureRenderer();if(id<0||id>10000||style<0||style>100000)throw new ArgumentException("预览ID无效");if(kind.StartsWith("backgroundStyle:"))return BackgroundPreviewJson(kind[16..],id);return System.Text.Json.JsonSerializer.Serialize(worldRenderer!.CatalogPreview(kind,id,style),RenderJson);}
}
