using TEdit.Render;
namespace TEdit.ViewModel;
public sealed partial class WorldViewModel {
 public TEdit.Editor.Tools.BaseTool ActiveTool {get;set;}=null!;
 public TileHover MouseOverTile {get;}=new();
 public sealed class TileHover {public TEdit.UI.TileMouseState MouseState {get;set;}=new();}
 public bool MinimapBackground {get;set;}
 public bool ShowAllWires {get=>ShowRedWires&&ShowBlueWires&&ShowGreenWires&&ShowYellowWires;set{ShowRedWires=ShowBlueWires=ShowGreenWires=ShowYellowWires=value;}}
 public bool ShowTextures {get;set;}=true;
 public bool ShowGrid {get;set;}
 public bool ShowPoints {get;set;}=true;
 public bool ShowWorldBorder {get;set;}=true;
 public bool ShowNbtOverlay {get;set;}
 public bool ShowBuffRadii {get;set;}
 public bool ShowActuators {get;set;}=true;
 public bool ShowBackgrounds {get;set;}=true;
 public bool ShowBlueWires {get;set;}=true;
 public bool ShowCoatings {get;set;}=true;
 public bool ShowGlowMasks {get;set;}=true;
 public bool ShowGreenWires {get;set;}=true;
 public bool ShowLiquid {get;set;}=true;
 public bool ShowRedWires {get;set;}=true;
 public bool ShowTiles {get;set;}=true;
 public bool ShowWalls {get;set;}=true;
 public bool ShowWireTransparency {get;set;}
 public bool ShowYellowWires {get;set;}=true;
 public bool WorldBorderOverlay {get;set;}
 public float BackgroundScaleZoom {get;set;}=9;
 public float LightGlowIntensity {get;set;}=0.5f;
 public float TextureVisibilityZoomLevel {get;set;}=6;
 public BuffTileCache BuffTileCache {get;}=new();
}
