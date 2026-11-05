using Avalonia.Controls;
using Avalonia.Media.Imaging;
using System.Text.Json;
namespace TEditBrowser;
public partial class MainView {
 async Task LoadThumbnail(Image image,string kind,int id,int style=0){
  string request=Guid.NewGuid().ToString("N");image.Tag=request;string? session=Current.DesktopSessionId;
  try{using var doc=JsonDocument.Parse(await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="preview",kind,id,style})));if(image.Tag as string!=request||session!=Current.DesktopSessionId)return;
   using var stream=new MemoryStream(Convert.FromBase64String(doc.RootElement.GetProperty("png").GetString()!));var next=new Bitmap(stream);var old=image.Source as IDisposable;image.Source=next;old?.Dispose();
  }catch(Exception ex){Current.Fail("预览未生成："+ex.Message);}
 }
 async void SpritePreviewChanged(object? sender,SelectionChangedEventArgs e){if(sender is ListBox list&&list.SelectedItem is SpriteChoice item&&this.FindControl<Image>("SpriteThumbnail") is {} image){var combo=this.FindControl<ComboBox>("SpriteBiomeVariants")!;combo.ItemsSource=new[]{"默认"}.Concat(item.Variants.Select(DesktopLanguage.Name)).ToArray();combo.SelectedIndex=0;await LoadThumbnail(image,"sprite",item.Tile,item.Style);}}
 async void SpriteBiomeChanged(object? sender,SelectionChangedEventArgs e){if(!desktopReady||sender is not ComboBox {SelectedIndex:>=0} combo||Current.SelectedSprite is not {} item)return;await LoadThumbnail(this.FindControl<Image>("SpriteThumbnail")!,combo.SelectedIndex==0?"sprite":"biome:"+(combo.SelectedIndex-1),item.Tile,item.Style);}
}
