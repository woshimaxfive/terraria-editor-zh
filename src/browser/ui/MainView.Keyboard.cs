using Avalonia.Controls;
using Avalonia.Input;
using System.Text.Json;
using TEdit.Input;
namespace TEditBrowser;
public partial class MainView {
 readonly InputService desktopInput=CreateDesktopInput();
 static InputService CreateDesktopInput(){var input=new InputService();input.Initialize();return input;}
 bool spacePan;string? pickerPrevious;long pickerStarted;
 string[] PointerActions(PointerEventArgs e){
  var p=e.GetCurrentPoint(map).Properties;
  var button=p.IsRightButtonPressed?TEditMouseButton.Right:p.IsMiddleButtonPressed?TEditMouseButton.Middle:TEditMouseButton.Left;
  var actions=desktopInput.HandleMouseButton(button,e.KeyModifiers,InputScope.Editor);
  if(Current.SelectedTool.Id=="Selection"&&actions.Any(a=>a.StartsWith("selection.adjust.")))actions.RemoveAll(a=>a.StartsWith("editor.draw"));
  else if(Current.SelectedTool.Id!="Selection")actions.RemoveAll(a=>a.StartsWith("selection."));
  return actions.ToArray();
 }
 async void DesktopKeyDown(object? sender,KeyEventArgs e){
  if(this.FindControl<Border>("DesktopDialog") is {IsVisible:true} dialog){if(e.Key==Key.Escape){dialog.IsVisible=false;map.Focus();e.Handled=true;}return;}
  var focused=TopLevel.GetTopLevel(this)?.FocusManager?.GetFocusedElement();if((focused is Control {IsEffectivelyVisible:true}&&focused is TextBox or ComboBox or ComboBoxItem or MenuItem or Slider or Avalonia.Controls.Button or NumericUpDown or AvaloniaEdit.Editing.TextArea)||e.Handled)return;
  try{foreach(string action in desktopInput.HandleKeyboard(e.Key,e.KeyModifiers,InputScope.Application))if(await HandleDesktopInput(action)){e.Handled=true;return;}}
  catch(Exception ex){Current.Fail(ex.Message);}
 }
 async Task<bool> HandleDesktopInput(string action){
  string? menu=action switch{"file.new"=>"new","file.open"=>"open","file.save" or "file.saveas"=>"export","file.saveasversion"=>"version","file.reload"=>"reload","edit.copy"=>"copy","edit.cut"=>"cut","edit.paste"=>"paste","edit.undo"=>"undo","edit.redo"=>"redo","selection.delete"=>"delete","edit.crop"=>"crop","edit.expand"=>"expand","app.settings"=>"settings","help.wiki"=>"wiki",_=>null};
  if(menu!=null){await DesktopAction(menu);return true;}
  if(action=="nav.pan"){spacePan=true;return true;}
  if(action=="nav.reset"){
   if(Current.Busy)CoreBridge.Cancel();
   else if(this.FindControl<Border>("DesktopDialog")!.IsVisible)this.FindControl<Border>("DesktopDialog")!.IsVisible=false;
   else{Current.FloatingCancelCommand.Execute(null);Current.CadCancelCommand.Execute(null);if(Current.SelectedTool.Id=="Paste")SelectDesktopTool("Arrow");else await Current.CallDomain("selection","Apply","selection.none");}
   return true;
  }
  if(action.StartsWith("paste.")){
   if(Current.SelectedTool.Id!="Paste")return false;
   switch(action){case "paste.accept":Current.FloatingAcceptCommand.Execute(null);break;case "paste.rotate.cw":case "paste.rotate.ccw":await Current.Run("floating",new{operation=action.EndsWith("ccw")?"rotateCCW":"rotate",allowSpriteRemoval=Current.AllowSpriteRemoval});break;case "paste.flip.h":Current.FloatingFlipXCommand.Execute(null);break;case "paste.flip.v":Current.FloatingFlipYCommand.Execute(null);break;}
   return true;
  }
  if(action is "selection.all" or "selection.none"){await Current.CallDomain("selection","Apply",action);return true;}
  if(action.StartsWith("selection.move.")||action.StartsWith("selection.resize.")){
   using var info=JsonDocument.Parse(Current.Info);if(!info.RootElement.TryGetProperty("toolState",out var state)||!state.GetProperty("selection").GetProperty("active").GetBoolean())return false;
   await Current.CallDomain("selection","Apply",action);return true;
  }
  if(action.StartsWith("nav.scroll.")){
   var words=action.Split('.');string direction=words[2];int distance=action.EndsWith(".fast")?100:20;
   await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="pan",dx=(direction=="left"?-1:direction=="right"?1:0)*distance,dy=(direction=="up"?-1:direction=="down"?1:0)*distance}));return true;
  }
  if(action is "nav.zoom.in" or "nav.zoom.out"){await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="zoom",factor=action.EndsWith("in")?1.2:1/1.2}));return true;}
  if(action.StartsWith("tool.")){
   string id=action[5..];id=char.ToUpperInvariant(id[0])+id[1..];
   if(id=="Picker"&&pickerPrevious==null){pickerPrevious=Current.SelectedTool.Id;pickerStarted=Environment.TickCount64;}
   SelectDesktopTool(id);return true;
  }
  if(action=="editor.wire.modecycle"){Current.CadCycleCommand.Execute(null);return true;}
  if(action=="editor.wire.togglehv"){Current.CadDirectionCommand.Execute(null);return true;}
  if(action=="toggle.swap"){
   var wall=Current.ToolFields.First(f=>f.Group=="paint"&&f.Name=="Wall");int tile=Current.SelectedMaterial?.Id??0;Current.SelectedMaterial=Current.Materials.FirstOrDefault(m=>m.Id==int.Parse(wall.TextValue));wall.TextValue=tile.ToString();Current.NotifyDesktop();return true;
  }
  if(action=="toggle.tile"){Current.TileActive=!Current.TileActive;Current.NotifyDesktop();return true;}
  string? field=action switch{"toggle.eraser"=>"IsEraser","toggle.wall"=>"WallStyleActive","editor.wire.color1"=>"RedWireActive","editor.wire.color2"=>"BlueWireActive","editor.wire.color3"=>"GreenWireActive","editor.wire.color4"=>"YellowWireActive",_=>null};
  if(field!=null){var f=Current.ToolFields.First(f=>f.Group=="paint"&&f.Name==field);f.BoolValue=!f.BoolValue;return true;}
  return false;
 }
 void SelectDesktopTool(string id){Current.SelectedTool=Current.Tools.First(t=>t.Id==id);Current.NotifyDesktop();}
 void DesktopKeyUp(object? sender,KeyEventArgs e){
  foreach(string action in desktopInput.HandleKeyboard(e.Key,e.KeyModifiers,InputScope.Application)){
   if(action=="nav.pan")spacePan=false;
   if(action=="tool.picker"&&pickerPrevious is {} previous){if(Environment.TickCount64-pickerStarted>PickerHoldThresholdMs)SelectDesktopTool(previous);pickerPrevious=null;}
  }
  if(e.Key==Key.Space)spacePan=false;
 }
}
