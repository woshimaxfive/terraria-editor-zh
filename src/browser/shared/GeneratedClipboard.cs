using System.Text.Json;
using TEdit.Editor.Clipboard;
namespace TEdit.Port;
public sealed partial class Session {
 internal void GenerateText(string text,int letterSpacing,int rowSpacing,int lineLength,string alignment){
  if(text.Length>1024||lineLength<1||lineLength>400||letterSpacing<0||letterSpacing>20||rowSpacing<0||rowSpacing>20||!Enum.TryParse<TextAlignment>(alignment,out var align)||!Enum.IsDefined(align))throw new ArgumentException("文字、间距、换行或对齐无效");
  RequireWorld();ClipboardSpriteMetadata.Build();var result=new OriginalTextStatues().GenerateTextStatues(text,(byte)letterSpacing,(byte)rowSpacing,lineLength,align);if(result==null)throw new ArgumentException("请输入文字");
  ValidateSize(result.Size.X,result.Size.Y);clipboard=result;clipboardIdentity=ClipboardIdentity.FromWorld(World!);ClipboardRevision++;
 }
 internal void GenerateHouse(string templateJson,int seed){
  RequireWorld();var source=clipboard??throw new ArgumentException("请先导入房屋生成模板到剪贴板");
  var data=JsonSerializer.Deserialize<OriginalHouseGenerator.HouseGenTemplateData>(templateJson,new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new ArgumentException("房屋 JSON 无效");
  if(data.Count<1||data.Count>128||source.Size.Y%data.Count!=0||data.Rooms==null||data.Roofs==null||data.Rooms.Count+data.Roofs.Count>4096)throw new ArgumentException("房屋模板分层或区域数量无效");
  int height=source.Size.Y/data.Count;ValidateSize(source.Size.X,height);
  foreach(var room in data.Rooms.Select(r=>(r.X,r.Y,r.Width,r.Height)).Concat(data.Roofs.Select(r=>(r.X,r.Y,r.Width,r.Height))))if(room.X<0||room.Y<0||room.Width<0||room.Height<0||(long)room.X+room.Width>source.Size.X||(long)room.Y+room.Height>height)throw new ArgumentException("房屋区域超出模板分层");
  clipboard=new OriginalHouseGenerator(seed).GenerateFromTemplate(new("浏览器房屋模板",source,data));ClipboardRevision++;
 }
}
