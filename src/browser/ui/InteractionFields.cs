using System.Text.Json;
using System.ComponentModel;
using System.Windows.Input;
namespace TEditBrowser;
public sealed record SpriteChoice(int Tile,int Style,string OriginalName,int Width,int Height){public string[] Variants {get;init;}=[];public string Name=>DesktopLanguage.Name(OriginalName);public override string ToString()=>$"{Tile}:{Style} {Name} ({Width}×{Height})";}
public sealed partial class EditorViewModel {
 SpriteChoice[] allSprites=[];string spriteSearch="";string? spriteCatalogIdentity;bool chain;
 public string SpriteSearch {get=>spriteSearch;set{spriteSearch=value??"";PropertyChanged?.Invoke(this,new(nameof(Sprites)));}}
 public SpriteChoice[] Sprites=>allSprites.Where(s=>$"{s.Tile} {s.Name}".Contains(spriteSearch,StringComparison.OrdinalIgnoreCase)).ToArray();
 public SpriteChoice? SelectedSprite {get;set;}
 public string InteractionStatus {get;private set;}="";
 public string[] WorldPoints {get;private set;}=["Spawn","Dungeon"];
 public string SelectedWorldPoint {get;set;}="Spawn";
 public ICommand SelectPointCommand=>new UiCommand(async()=>{await Run("point",new{name=SelectedWorldPoint});SelectedTool=Tools.First(t=>t.Id=="Point");PropertyChanged?.Invoke(this,new(nameof(SelectedTool)));});
 public ICommand CadCycleCommand=>new UiCommand(()=>_=Cad("cycle"));
 public ICommand CadDirectionCommand=>new UiCommand(()=>_=Cad("direction"));
 public ICommand CadCancelCommand=>new UiCommand(()=>_=Cad("cancel"));
 public ICommand CadExitCommand=>new UiCommand(()=>_=Cad("exit"));
 public ICommand CadChainCommand=>new UiCommand(()=>_=Cad("chain"));
 public ICommand SelectSpriteCommand=>new UiCommand(async()=>{if(SelectedSprite is {} s){await Run("sprite",new{tile=s.Tile,style=s.Style});SelectedTool=Tools.First(t=>t.Id=="Sprite");PropertyChanged?.Invoke(this,new(nameof(SelectedTool)));}});
 Task Cad(string operation)=>Run("cad",new{tool=SelectedTool.Id=="Brush"?"Brush":"Pencil",operation,enabled=!chain});
 void ApplyInteraction(JsonElement info){
  if(info.TryGetProperty("sprites",out var catalog)&&catalog.GetRawText()!=spriteCatalogIdentity){spriteCatalogIdentity=catalog.GetRawText();allSprites=catalog.EnumerateArray().Select(s=>new SpriteChoice(s.GetProperty("tile").GetInt32(),s.GetProperty("style").GetInt32(),s.GetProperty("name").GetString()!,s.GetProperty("width").GetInt32(),s.GetProperty("height").GetInt32()){Variants=s.TryGetProperty("variants",out var variants)?variants.EnumerateArray().Select(v=>v.GetString()!).ToArray():[]}).ToArray();}
  if(info.TryGetProperty("interaction",out var state)){
   WorldPoints=state.GetProperty("points").EnumerateArray().Select(p=>p.GetString()!).ToArray();
   var sprite=state.GetProperty("sprite");
   if(sprite.ValueKind==JsonValueKind.Object){
    SelectedSprite=allSprites.FirstOrDefault(s=>s.Tile==sprite.GetProperty("tile").GetInt32()&&s.Style==sprite.GetProperty("style").GetInt32());
    // A restored choice must remain in the filtered list for ComboBox selection.
    if(SelectedSprite is {} selected&&!Sprites.Contains(selected))spriteSearch=selected.Tile.ToString(System.Globalization.CultureInfo.InvariantCulture);
   }else SelectedSprite=null;
   if(state.GetProperty("point").GetString() is {} point&&WorldPoints.Contains(point))SelectedWorldPoint=point;
   chain=state.GetProperty("chain").GetBoolean();InteractionStatus=$"链式：{(chain?"开":"关")}；追踪：{state.GetProperty("traceCount").GetInt32()} 格\n"+string.Join(" / ",state.GetProperty("cad").EnumerateArray().Select(c=>$"{c.GetProperty("tool").GetString()} {(c.GetProperty("enabled").GetBoolean()?c.GetProperty("mode").GetString():"普通")}"));
  }
 }
}
