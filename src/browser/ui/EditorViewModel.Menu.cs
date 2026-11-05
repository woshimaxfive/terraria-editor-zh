using System.Text.Json;
namespace TEditBrowser;
public partial class EditorViewModel {
 public bool CanExportSelection {
  get {
   if(!Editable)return false;
   using var doc=JsonDocument.Parse(Info);
   return doc.RootElement.TryGetProperty("toolState",out var tools)&&tools.TryGetProperty("selection",out var selection)&&selection.TryGetProperty("active",out var active)&&active.GetBoolean();
  }
 }
}
