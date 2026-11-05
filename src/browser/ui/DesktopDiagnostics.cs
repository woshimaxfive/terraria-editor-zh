using Avalonia;
using Avalonia.Controls;
using Avalonia.VisualTree;
using Avalonia.LogicalTree;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
namespace TEditBrowser;
// Read-only diagnostics, matching the existing Info/Settings/RenderState browser hooks.
public static partial class UiHooks {
 [JSExport] public static void ApplyRenderPreferences(string json)=>MainView.Instance?.ApplyRenderPreferences(json);
 [JSExport] public static void ApplyColor(string name,string value){var box=MainView.Instance?.GetVisualDescendants().OfType<TextBox>().FirstOrDefault(c=>c.Name==name&&c.IsEffectivelyVisible);if(box!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,"^#[0-9A-Fa-f]{6}$"))box.Text=value;}
 [JSExport] public static void ApplyHover(string json)=>MainView.Instance?.ApplyHover(json);
 [JSExport] public static string DesktopState(){
  var root=MainView.Instance;if(root==null)return "{}";var editor=root.FindControl<ScriptCodeEditor>("ScriptEditor");
  var controls=root.GetVisualDescendants().OfType<Control>().Where(c=>c.IsEffectivelyVisible&&(c.Name!=null||c is Button or TextBox or ComboBox or Expander or Image or CheckBox or Slider)).Select(c=>{var p=c.TranslatePoint(new Point(),root)??new Point();return new{name=c.Name,tag=c.Tag as string,kind=c.GetType().Name,text=c switch{CheckBox check=>check.Content?.ToString(),Button b=>b.Content?.ToString(),TextBox t=>t.Text,ComboBox combo=>combo.SelectedItem?.ToString(),Expander e=>e.Header?.ToString(),_=>null},enabled=c.IsEffectivelyEnabled,invalid=c.Classes.Contains("invalidField"),isChecked=(c as CheckBox)?.IsChecked,value=(c as Slider)?.Value,selectedIndex=(c as ComboBox)?.SelectedIndex,choices=c is ComboBox choice&&c.Name=="PluginChoice"?choice.Items.Cast<object>().Select(v=>v.ToString()).ToArray():null,x=p.X,y=p.Y,width=c.Bounds.Width,height=c.Bounds.Height,sourceWidth=(c as Image)?.Source?.Size.Width,sourceHeight=(c as Image)?.Source?.Size.Height};});
  var menus=root.GetLogicalDescendants().OfType<MenuItem>().Select(c=>{var p=c.TranslatePoint(new Point(),root)??new Point();return new{text=c.Header is StackPanel panel?panel.Children.OfType<TextBlock>().FirstOrDefault()?.Text:c.Header?.ToString(),action=c.Tag as string,enabled=c.IsEffectivelyEnabled,visible=c.IsEffectivelyVisible,selected=c.IsSelected,open=c.IsSubMenuOpen,isChecked=c.IsChecked,x=p.X,y=p.Y,width=c.Bounds.Width,height=c.Bounds.Height};});
  var menuInputs=root.GetLogicalDescendants().OfType<Slider>().Where(c=>c.Name?.StartsWith("Menu")==true).Select(c=>{var p=c.TranslatePoint(new Point(),root);return new{name=c.Name,value=c.Value,visible=p.HasValue&&c.IsEffectivelyVisible,x=p?.X??0,y=p?.Y??0,width=c.Bounds.Width,height=c.Bounds.Height};});
  return JsonSerializer.Serialize(new{tab=MainView.Current.SidebarIndex,status=MainView.Current.Status,script=editor?.Text,highlight=editor?.SyntaxHighlighting?.Name,completion=editor?.CompletionItems,completionError=editor?.CompletionError,menus,menuInputs,controls});
 }
}
