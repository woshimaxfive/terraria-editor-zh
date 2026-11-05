using System;
using System.Collections.Generic;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.UI;
using TEdit.ViewModel;
namespace TEdit.Editor.Tools;
public record PreviewBitmap(int Width,int Height) { public uint[] Pixels {get;}=new uint[Width*Height]; }
public abstract class BaseTool {
 protected WorldViewModel _wvm;
 protected PreviewBitmap _preview = new(1,1);
 protected BaseTool(WorldViewModel vm){_wvm=vm;}
 public double PreviewScale {get;protected set;}=1;
 public ToolType ToolType {get;protected set;}
 public string Name {get;protected set;}="Brush";
 public int PreviewOffsetX {get;protected set;}
 public int PreviewOffsetY {get;protected set;}
 public virtual bool PreviewIsTexture=>false;
 public virtual bool IsFloatingPaste=>false;
 public virtual Vector2Int32 FloatingPasteAnchor=>default;
 public virtual Vector2Int32 FloatingPasteSize=>default;
 public virtual TEdit.Editor.Clipboard.ClipboardBuffer? FloatingPasteBuffer=>null;
 public virtual bool IsPasteInteracting=>false;
 public virtual void AcceptPaste(){}
 public virtual void CancelPaste(){}
 public virtual CursorHint GetCursorHint(Vector2Int32 position)=>CursorHint.Default;
 public virtual PreviewBitmap PreviewTool()=>_preview;
 public virtual IReadOnlyList<Vector2Int32> CadPreviewPath=>Array.Empty<Vector2Int32>();
 public virtual IReadOnlyList<Vector2Int32> CadPreviewTunnelPath=>Array.Empty<Vector2Int32>();
 public virtual bool HasCadPreview=>false;
 public virtual Vector2Int32 LinePreviewAnchor=>default;
 public virtual bool HasLinePreviewAnchor=>false;
 public virtual void MouseDown(TileMouseState e){}
 public virtual void MouseMove(TileMouseState e){}
 public virtual void MouseUp(TileMouseState e){}
 protected List<string> GetActiveActions(TileMouseState e)=>e.Actions;
protected void PerformWireTrace(Vector2Int32 location)
    {
        var world = _wvm.CurrentWorld;
        if (world == null) { _wvm.ClearWireTrace(); return; }

        if (location.X < 0 || location.Y < 0 ||
            location.X >= world.TilesWide || location.Y >= world.TilesHigh)
        {
            _wvm.ClearWireTrace();
            return;
        }

        var tile = world.Tiles[location.X, location.Y];
        if (!tile.HasWire) { _wvm.ClearWireTrace(); return; }

        // Determine which wire color to trace
        int color = 0;
        var picker = _wvm.TilePicker;

        // Prefer active TilePicker color if it exists on this tile
        if (picker.RedWireActive && tile.WireRed) color = 1;
        else if (picker.BlueWireActive && tile.WireBlue) color = 2;
        else if (picker.GreenWireActive && tile.WireGreen) color = 3;
        else if (picker.YellowWireActive && tile.WireYellow) color = 4;
        // Fallback: first wire found on tile
        else if (tile.WireRed) color = 1;
        else if (tile.WireBlue) color = 2;
        else if (tile.WireGreen) color = 3;
        else if (tile.WireYellow) color = 4;

        if (color == 0) { _wvm.ClearWireTrace(); return; }

        Func<int, int, bool> hasWireAt = color switch
        {
            1 => (x, y) => world.Tiles[x, y].WireRed,
            2 => (x, y) => world.Tiles[x, y].WireBlue,
            3 => (x, y) => world.Tiles[x, y].WireGreen,
            4 => (x, y) => world.Tiles[x, y].WireYellow,
            _ => (_, _) => false
        };

        // Junction box detector: returns junction type (0=Normal, 1=Left, 2=Right)
        // or -1 if the tile is not a junction box.
        WireTracer.JunctionDetector getJunction = (x, y) =>
        {
            var t = world.Tiles[x, y];
            if (t.Type != (int)TileType.JunctionBox) return -1;
            return t.U / 18; // frameX 0→Normal(0), 18→Left(1), 36→Right(2)
        };

        var network = WireTracer.Trace(hasWireAt, world.TilesWide, world.TilesHigh,
            location.X, location.Y, getJunction);

        _wvm.WireTraceHighlight = network;
        _wvm.WireTraceColor = color;
    }
}
public enum CursorHint
{
    Default,
    Move,
    SizeNS,
    SizeWE,
    SizeNWSE,
    SizeNESW,
}
