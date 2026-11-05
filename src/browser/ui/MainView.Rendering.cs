using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using System.Runtime.InteropServices;
using System.Text.Json;
namespace TEditBrowser;
public partial class MainView {
 bool panning;
 Point panPoint;
 int? cursorX,cursorY;
 bool shift;
 public void ClearScene(){map.Clear();var minimap=this.FindControl<Image>("Minimap");if(minimap?.Source is IDisposable image)image.Dispose();if(minimap!=null)minimap.Source=null;}
 public byte[] SnapshotScene(string json,bool png)=>map.SnapshotScene(json,png);
 async void ApplyRenderFilter(object? sender,Avalonia.Interactivity.RoutedEventArgs e){try{using var doc=JsonDocument.Parse(this.FindControl<TextBox>("RenderFilter")?.Text??"{}");await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new{filter=doc.RootElement}}));}catch(Exception ex){RenderStatus(ex.Message);}}
 public string RenderState(){var state=JsonSerializer.SerializeToElement(Current.Settings());return JsonSerializer.Serialize(new{width=Math.Max(1,(int)map.Bounds.Width),height=Math.Max(1,(int)map.Bounds.Height),tool=Current.SelectedTool.Id,toolState=state.TryGetProperty("toolState",out var s)?(object)s:null,cursor=cursorX.HasValue?new{x=cursorX.Value,y=cursorY!.Value}:null,shift,language=DesktopLanguage.Language});}
 public void ApplyHover(string json){using var doc=JsonDocument.Parse(json);foreach(string field in new[]{"Position","Depth","Tile","Wall","Extra","UV","Paint"}){string key=char.ToLowerInvariant(field[0])+field[1..];if(field=="UV")key="uv";if(this.FindControl<TextBox>("Hover"+field) is {} control)control.Text=HoverText(field,doc.RootElement.TryGetProperty(key,out var value)?value.GetString()??"":"");}}
 static string HoverText(string field,string text){
  if(!DesktopLanguage.Language.StartsWith("zh"))return text;
  if(field is "Tile" or "Wall"){int index=text.LastIndexOf(" (");if(index>0)return DesktopLanguage.Name(text[..index])+text[index..];return text.Replace("[empty]","[空]").Replace("INVALID TILE","无效方块").Replace("INVALID WALL","无效墙壁");}
  if(field=="Extra")foreach(var (source,target) in new[]{("Inactive","虚化"),("Actuator","制动器"),("Wire","电线"),("Water","水"),("Lava","熔岩"),("Honey","蜂蜜"),("Shimmer","微光")})text=text.Replace(source,target);
  if(field=="Paint"){if(text=="None")return "无";text=text.Replace("Tile:","方块：").Replace("Wall:","墙壁：");}
  return text;
 }
 void Hover(PointerEventArgs e){var p=map.TileAt(e.GetPosition(map));cursorX=p.X;cursorY=p.Y;shift=e.KeyModifiers.HasFlag(KeyModifiers.Shift);if(Current.Editable)_=CoreBridge.RenderView("{}");}
 async void MapWheel(object? sender,PointerWheelEventArgs e){try{foreach(string action in desktopInput.HandleMouseWheel((int)Math.Sign(e.Delta.Y),e.KeyModifiers,TEdit.Input.InputScope.Application))if(await HandleDesktopInput(action)){e.Handled=true;return;}}catch(Exception ex){Current.Fail(ex.Message);}}
 void MapExited(object? sender,PointerEventArgs e){if(!drawing&&!panning){cursorX=null;cursorY=null;_=CoreBridge.RenderView("{}");}}
 async void PickTextures(object? sender,Avalonia.Interactivity.RoutedEventArgs e)=>await CoreBridge.ChooseTextures();
 async void ExportImage(object? sender,Avalonia.Interactivity.RoutedEventArgs e)=>await CoreBridge.ExportPng();
 async void ExportRegionImage(object? sender,Avalonia.Interactivity.RoutedEventArgs e)=>await ExportRegion(false);
 async void ExportRegionTiles(object? sender,Avalonia.Interactivity.RoutedEventArgs e)=>await ExportRegion(true);
 async void CancelRenderExport(object? sender,Avalonia.Interactivity.RoutedEventArgs e)=>await CoreBridge.RenderView("{\"operation\":\"cancelExport\"}");
 async Task ExportRegion(bool tiles,bool fullWorldWhenNoSelection=false){try{int index=this.FindControl<ComboBox>("ExportScale")?.SelectedIndex??3;int scale=new[]{1,4,8,16}[Math.Clamp(index,0,3)];int x=Current.SelectionX,y=Current.SelectionY,width=Current.SelectionWidth,height=Current.SelectionHeight;
  if(fullWorldWhenNoSelection&&!Current.CanExportSelection){using var doc=JsonDocument.Parse(Current.Info);x=y=0;width=doc.RootElement.GetProperty("width").GetInt32();height=doc.RootElement.GetProperty("height").GetInt32();}
  await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="exportRegion",area=new{x,y,width,height},scale,tiles}));}catch(Exception ex){RenderStatus(ex.Message);}}
 async void RenderLayerChanged(object? sender,Avalonia.Interactivity.RoutedEventArgs e){if(sender is CheckBox check&&check.Tag is string name)await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="setLayer",name,enabled=check.IsChecked==true}));}
 public void ShowExportProgress(bool visible,double overall,double layer,string text){this.FindControl<Border>("ExportProgressOverlay")!.IsVisible=visible;this.FindControl<ProgressBar>("ExportOverallProgress")!.Value=overall;this.FindControl<ProgressBar>("ExportLayerProgress")!.Value=layer;this.FindControl<TextBlock>("ExportProgressText")!.Text=text;}
 public void RenderStatus(string text){var label=this.FindControl<TextBlock>("RenderStatusLabel");if(label!=null)label.Text=text;}
 public void ApplyMinimap(byte[] rgba){var control=this.FindControl<Image>("Minimap");if(control==null)return;var image=new Avalonia.Media.Imaging.WriteableBitmap(new PixelSize(200,100),new Vector(96,96),Avalonia.Platform.PixelFormats.Rgba8888,Avalonia.Platform.AlphaFormat.Premul);using(var frame=image.Lock())for(int y=0;y<100;y++)Marshal.Copy(rgba,y*800,frame.Address+y*frame.RowBytes,800);var old=control.Source as IDisposable;control.Source=image;old?.Dispose();}
 async void MinimapDown(object? sender,PointerPressedEventArgs e){if(sender is not Image image)return;var p=e.GetPosition(image);using var info=JsonDocument.Parse(Current.Info);if(!info.RootElement.TryGetProperty("width",out var w))return;int width=w.GetInt32(),height=info.RootElement.GetProperty("height").GetInt32();await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="center",x=p.X/image.Bounds.Width*width,y=p.Y/image.Bounds.Height*height}));}
}
