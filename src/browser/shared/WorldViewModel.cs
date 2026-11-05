using System;
using System.Collections.Generic;
using System.IO;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Editor;
using TEdit.Editor.Undo;
namespace TEdit.ViewModel;
// Platform contract for the reused desktop editing algorithms.
public sealed partial class WorldViewModel {
 public static string TempPath {get;}=Path.Combine(Path.GetTempPath(),"tedit-browser-r4");
 public MorphToolOptions MorphToolOptions {get;}=new();
 public TEdit.Terraria.Objects.SpriteSheet? SelectedSpriteSheet {get;set;}
 public TEdit.Terraria.Objects.SpriteItem? SelectedSpriteItem {get;set;}
 public void UpdateRenderPixel(Vector2Int32 p)=>UpdateRenderPixel(p.X,p.Y);
 public void UpdateRenderPixel(int x,int y){TEdit.Port.OperationProgress.Advance();RegionChanged?.Invoke(x,y,1,1);}
 public string? SelectedPoint {get;set;}
 public Chest? SelectedChest {get;set;}
 public Sign? SelectedSign {get;set;}
 public TileEntity? SelectedTileEntity {get;set;}
 public Vector2Int32? SelectedXmas {get;set;}
 public int SelectedXmasStar {get;set;}
 public int SelectedXmasGarland {get;set;}
 public int SelectedXmasBulb {get;set;}
 public int SelectedXmasLight {get;set;}
 public void UpdateRenderRegion(RectangleInt32 region)=>RegionChanged?.Invoke(region.X,region.Y,region.Width,region.Height);
 public TEdit.Port.BrowserClipboard Clipboard {get;set;}=null!;
 public bool IsPasteFloating {get;set;}
 public int PasteAnchorX {get;set;}
 public int PasteAnchorY {get;set;}
 public int PasteSizeW {get;set;}
 public int PasteSizeH {get;set;}
 public void PreviewChange(){}
 public World CurrentWorld {get;}
 public TilePicker TilePicker {get;}=new();
 public TileMaskSettings MaskSettings {get;}=new();
 public BrushSettings Brush {get;}=new();
 public Selection Selection {get;}=new();
 public UndoManager UndoManager {get;}
 public WorldEditor WorldEditor {get;}
 public int[] CheckTiles;
 public int CheckTileGeneration=1;
 public bool WireChainMode {get;set;}=true;
 public HashSet<Vector2Int32> WireTraceHighlight {get;set;}=new();
 public int WireTraceColor {get;set;}
 public event Action<int,int,int,int>? RegionChanged;
 public WorldViewModel(World world) {
  CurrentWorld=world; Directory.CreateDirectory(TempPath);
  UndoManager=new UndoManager(world,(x,y,h,w)=>QueueUVCacheReset(x,y,w,h),()=>{});
  WorldEditor=new WorldEditor(TilePicker,MaskSettings,world,Selection,UndoManager,(x,y,h,w)=>QueueUVCacheReset(x,y,w,h));
  WorldEditor.Brush=Brush;
  CheckTiles=new int[world.TilesWide*world.TilesHigh];
 }
 public void SetPixel(int x,int y,PaintMode? mode=null,bool? erase=null)=>WorldEditor.SetPixel(x,y,mode,erase);
 public void QueueUVCacheReset(int x,int y,int width,int height){TEdit.Port.OperationProgress.Advance((long)width*height);RegionChanged?.Invoke(x,y,width,height);}
 public void ClearWireTrace(){WireTraceHighlight.Clear();WireTraceColor=0;}
}
