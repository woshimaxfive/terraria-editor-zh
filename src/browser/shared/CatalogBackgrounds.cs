using TEdit.Terraria;
using TEdit.Terraria.DataModel;
using TEdit.Common;
using TEdit.Geometry;
using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {
 RenderScene BackgroundStylePreview(string category,int id){
  var property=typeof(BackgroundStyleConfiguration).GetProperty(category);if(property?.GetValue(WorldConfiguration.BackgroundStyles) is not List<BackgroundStyle> styles)throw new ArgumentException("背景分类不存在");
  var style=styles.FirstOrDefault(s=>s.Id==id)??throw new ArgumentException("背景样式不存在");
  var indices=new List<int>();
  void Add(int[]? values,int index){if(values!=null&&index<values.Length&&values[index]>=0)indices.Add(values[index]);}
  Add(style.Textures,0);Add(style.SecondaryTextures,0);Add(style.SecondaryTextures,1);Add(style.Textures,1);Add(style.Textures,2);
  if(indices.Count==0)throw new ArgumentException("此样式没有背景贴图");
  bool tree=category=="TreeStyles",underworld=category=="UnderworldBackgrounds";
  Texture2D Texture(int index)=>tree?_textureDictionary.GetTreeTops(index):underworld?_textureDictionary.GetUnderworld(index):_textureDictionary.GetBackground(index);
  RectangleInt32 Region(int index,Texture2D tex){
   if(!tree)return underworld?new(0,0,tex.Width,tex.Height):GetBackgroundSourceRect(index,tex);
   int width=80,height=80;switch(index){case 2:case 11:case 13:width=114;height=96;break;case 3:height=140;break;case >=22 and <=28:case 31:width=116;height=96;break;case 29:case 30:width=118;height=96;break;}
   return new(0,0,Math.Min(width,tex.Width),Math.Min(height,tex.Height));
  }
  var texture=Texture(indices[0]);var rect=Region(indices[0],texture);double scale=Math.Min(1,Math.Min(128.0/rect.Width,128.0/rect.Height));int w=Math.Max(1,(int)(rect.Width*scale)),h=Math.Max(1,(int)(rect.Height*scale));
  _spriteBatch.Begin();foreach(int index in indices){var layer=Texture(index);var source=Region(index,layer);int layerHeight=(int)((float)source.Height/source.Width*rect.Width);int y=rect.Height-layerHeight;_spriteBatch.Draw(layer,new RectangleInt32(0,(int)(y*scale),w,Math.Max(1,(int)(layerHeight*scale))),source,TEditColor.White,0,System.Numerics.Vector2.Zero,SpriteEffects.None,0);}_spriteBatch.End();
  return new(w,h,0,_spriteBatch.Finish(),_textureDictionary.Missing.ToArray(),[]);
 }
}
