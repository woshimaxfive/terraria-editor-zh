using TEdit.ViewModel;
using TEdit.Geometry;
namespace TEdit.Port;
public sealed class SelectionApi(WorldViewModel _vm,Session session){
 public void Apply(string actionId){
  if(actionId=="selection.all"){_vm.Selection.SetRectangle(new(0,0),new(_vm.CurrentWorld.TilesWide-1,_vm.CurrentWorld.TilesHigh-1));return;}
  if(actionId=="selection.none"){_vm.Selection.IsActive=false;return;}
  if(actionId=="selection.delete"){if(_vm.Selection.IsActive){var selected=_vm.Selection.SelectionArea;session.DeleteRegion(selected.X,selected.Y,selected.Width,selected.Height);}return;}
  string[] valid=["up","down","left","right"];
  var validActions=from kind in new[]{"move","resize"} from direction in valid from suffix in new[]{"",".fast"} select "selection."+kind+"."+direction+suffix;
  if(!validActions.Contains(actionId))throw new ArgumentException("选区动作无效");
  if(!_vm.Selection.IsActive)return;
                    var area = _vm.Selection.SelectionArea;
                    bool fast = actionId.EndsWith(".fast");
                    int step = fast ? 5 : 1;
                    // Strip ".fast" suffix for direction parsing
                    string baseAction = fast ? actionId[..^5] : actionId;

                    if (baseAction.StartsWith("selection.move."))
                    {
                        int dx = baseAction == "selection.move.left" ? -step : baseAction == "selection.move.right" ? step : 0;
                        int dy = baseAction == "selection.move.up" ? -step : baseAction == "selection.move.down" ? step : 0;
                        area.Offset(dx, dy);
                        area.X = Math.Max(0, Math.Min(area.X, _vm.CurrentWorld.TilesWide - area.Width));
                        area.Y = Math.Max(0, Math.Min(area.Y, _vm.CurrentWorld.TilesHigh - area.Height));
                    }
                    else
                    {
                        int dw = baseAction == "selection.resize.right" ? step : baseAction == "selection.resize.left" ? -step : 0;
                        int dh = baseAction == "selection.resize.down" ? step : baseAction == "selection.resize.up" ? -step : 0;
                        area.Width = Math.Max(1, Math.Min(area.Width + dw, _vm.CurrentWorld.TilesWide - area.X));
                        area.Height = Math.Max(1, Math.Min(area.Height + dh, _vm.CurrentWorld.TilesHigh - area.Y));
                    }
                    _vm.Selection.SelectionArea = area;

 }
}
