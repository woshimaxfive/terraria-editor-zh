using Avalonia.Controls;
using Avalonia.Media.Imaging;
using System.Text.Json;
namespace TEditBrowser;
public partial class MainView {
 Image? playerPreviewImage;long playerPreviewTicket;ComboBox? playerPreviewLoadout;CheckBox? playerPreviewArmor;
 void BuildPlayerPreview(StackPanel stack,int loadout){
  playerPreviewTicket++;(playerPreviewImage?.Source as IDisposable)?.Dispose();playerPreviewImage=new Image{Name="PlayerAppearancePreview",Width=160,Height=224};stack.Children.Add(playerPreviewImage);
  playerPreviewArmor=new CheckBox{Name="PlayerPreviewArmor",Content="显示装备",IsChecked=true};playerPreviewLoadout=new ComboBox{Name="PlayerPreviewLoadout",ItemsSource=new[]{"装备栏位 1","装备栏位 2","装备栏位 3"},SelectedIndex=loadout};
  stack.Children.Add(playerPreviewArmor);stack.Children.Add(playerPreviewLoadout);playerPreviewArmor.IsCheckedChanged+=(_,_)=>QueuePlayerPreview();playerPreviewLoadout.SelectionChanged+=(_,_)=>QueuePlayerPreview();
  stack.Children.Add(Button("更新外观预览",async()=>await UpdatePlayerPreview()));if(Current.Editable)_=UpdatePlayerPreview();
 }
 async void QueuePlayerPreview(){long ticket=++playerPreviewTicket;await Task.Delay(200);if(ticket==playerPreviewTicket&&Current.Editable)await UpdatePlayerPreview();}
 async Task UpdatePlayerPreview(){
  if(playerPreviewImage is not {} image)return;long ticket=++playerPreviewTicket;var session=Current.DesktopSessionId;
  try{var result=await CoreBridge.DesktopData("playerPreview",JsonSerializer.Serialize(new{values=playerChanges,research=playerResearch,preview=new{armor=playerPreviewArmor?.IsChecked!=false,loadout=playerPreviewLoadout?.SelectedIndex??0}}));if(ticket!=playerPreviewTicket||image!=playerPreviewImage||session!=Current.DesktopSessionId)return;
   using var doc=JsonDocument.Parse(result);using var stream=new MemoryStream(Convert.FromBase64String(doc.RootElement.GetProperty("png").GetString()!));var bitmap=new Bitmap(stream);var previous=image.Source as IDisposable;image.Source=bitmap;previous?.Dispose();
  }catch(Exception ex){if(ticket==playerPreviewTicket)this.FindControl<TextBlock>("PlayerStatus")!.Text="外观预览未生成："+ex.Message;}
 }
}
