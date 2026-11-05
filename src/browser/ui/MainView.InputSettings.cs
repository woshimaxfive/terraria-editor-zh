using Avalonia.Controls;
using System.Text.Json;
using TEdit.Input;
namespace TEditBrowser;
public partial class MainView {
 int PickerHoldThresholdMs=150;
 static readonly JsonSerializerOptions InputJson=new(){Converters={new InputBindingsDictionaryJsonConverter()}};
 async Task RestoreInputBindings(){
  try{using var doc=JsonDocument.Parse(await CoreBridge.DesktopData("readInputBindings",""));if(doc.RootElement.TryGetProperty("bindings",out var bindings)){
    var parsed=JsonSerializer.Deserialize<Dictionary<string,List<InputBinding>>>(bindings,InputJson)??new();
    if(parsed.Count>desktopInput.Registry.Actions.Count||parsed.Any(p=>!desktopInput.Registry.Actions.ContainsKey(p.Key)||p.Value.Count>8||p.Value.Any(b=>!b.IsValid)))throw new ArgumentException("快捷键记录无效");
    desktopInput.Registry.LoadUserCustomizations(parsed);
   }if(doc.RootElement.TryGetProperty("pickerHoldMs",out var hold))PickerHoldThresholdMs=Math.Clamp(hold.GetInt32(),100,500);
  }catch(Exception ex){Current.Fail("快捷键未恢复："+ex.Message);}
 }
 Task<string> SaveInputBindings()=>CoreBridge.DesktopData("saveInputBindings",JsonSerializer.Serialize(new{bindings=JsonSerializer.SerializeToElement(desktopInput.Registry.GetUserCustomizations(),InputJson),pickerHoldMs=PickerHoldThresholdMs}));
 void BuildInputSettings(StackPanel stack){
  stack.Children.Add(Label("快捷键"));var actions=desktopInput.Registry.Actions.Values.ToArray();
  var select=new ComboBox{Name="InputActionChoice",ItemsSource=actions.Select(a=>DesktopLanguage.Field(a.Id)+" · "+a.Id).ToArray()};var binding=new TextBox{Name="InputBindingValue",Watermark="例如 Ctrl+B；多个绑定以分号分隔"};var status=new TextBlock{Name="InputBindingStatus",TextWrapping=Avalonia.Media.TextWrapping.Wrap};
  void Refresh(){if(select.SelectedIndex>=0)binding.Text=string.Join("; ",desktopInput.Registry.GetBindings(actions[select.SelectedIndex].Id));status.Text=string.Join("\n",desktopInput.Registry.DetectConflicts().Select(c=>c.ToString()));}
  select.SelectionChanged+=(_,_)=>Refresh();stack.Children.Add(select);stack.Children.Add(binding);
  stack.Children.Add(Button("应用快捷键",async()=>{try{if(select.SelectedIndex<0)return;var values=(binding.Text??"").Split(';',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(InputBinding.Parse).ToList();if(values.Count>8||values.Any(b=>!b.IsValid))throw new ArgumentException("快捷键格式无效");desktopInput.Registry.SetUserBindings(actions[select.SelectedIndex].Id,values);await SaveInputBindings();Refresh();}catch(Exception ex){status.Text=ex.Message;}}));
  stack.Children.Add(Button("恢复该项默认键位",async()=>{if(select.SelectedIndex<0)return;desktopInput.Registry.ResetToDefaults(actions[select.SelectedIndex].Id);await SaveInputBindings();Refresh();}));
  stack.Children.Add(Button("恢复全部默认键位",async()=>{desktopInput.Registry.ResetAllToDefaults();await SaveInputBindings();Refresh();}));stack.Children.Add(status);select.SelectedIndex=0;
  var hold=new NumericUpDown{Minimum=100,Maximum=500,Increment=50,Value=PickerHoldThresholdMs};hold.ValueChanged+=async(_,_)=>{PickerHoldThresholdMs=(int)(hold.Value??150);await SaveInputBindings();};stack.Children.Add(Label("临时取色器长按阈值（毫秒）"));stack.Children.Add(hold);
 }
}
