using System.Text.Json;
using System.Text.Json.Nodes;
using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed partial class Session {
 string BackgroundPreviewJson(string category,int id){
  renderTextures!.BeginFrame();var textures=new PreviewTextures(renderTextures,previewPixels);
  var image=new OriginalBackgroundPreview(textures).Render(category,id);
  int width=image?.PixelWidth??1,height=image?.PixelHeight??1;
  var scene=new RenderScene(width,height,0,[new("Opaque",null,[new("@background-preview",0,0,width,height,0,0,width,height,uint.MaxValue,0,0,0,0,0)])],renderTextures.Missing.ToArray(),[],[new("@background-preview",width,height,image?.PremultipliedRgba()??new byte[4])]);
  var result=JsonNode.Parse(JsonSerializer.Serialize(scene,RenderJson))!.AsObject();result["pixelRequests"]=JsonSerializer.SerializeToNode(textures.PixelRequests);return result.ToJsonString();
 }
}
