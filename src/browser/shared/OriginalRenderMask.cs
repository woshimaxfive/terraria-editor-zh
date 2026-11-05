using TEdit.Common;
using TEdit.Terraria;
using TEdit.Render;
namespace TEdit.ViewModel;
public sealed partial class WorldViewModel {

    /// <summary>
    /// Returns binary mask: 0 = tile passes filter/find (no darkening), 255 = tile is darkened.
    /// Handles both filter mode (by tile type) and find mode (by position).
    /// DarkenAmount/DesaturateAmount are applied at draw time via shader uniforms.
    /// </summary>
    public static byte ComputeFilterMask(int x, int y, Tile tile)
    {
        // Find overlay: found positions are clear, everything else darkened
        if (FilterManager.FindOverlayActive)
        {
            return FilterManager.FindResultPositions.Contains(FilterManager.PackPosition(x, y))
                ? (byte)0
                : byte.MaxValue;
        }

        // Filter overlay: selected types are clear, everything else darkened
        if (!FilterManager.AnyFilterActive || FilterManager.CurrentFilterMode != FilterManager.FilterMode.Darken)
            return 0;

        bool hasAllowed = false;
        if (tile.Wall > 0 && !FilterManager.WallIsNotAllowed(tile.Wall)) hasAllowed = true;
        if (tile.IsActive && (!FilterManager.TileIsNotAllowed(tile.Type) || !FilterManager.SpriteIsNotAllowed(tile.Type))) hasAllowed = true;
        if (tile.LiquidAmount > 0 && !FilterManager.LiquidIsNotAllowed(tile.LiquidType)) hasAllowed = true;
        if (tile.HasWire)
        {
            if (tile.WireRed && !FilterManager.WireIsNotAllowed(FilterManager.WireType.Red)) hasAllowed = true;
            if (tile.WireBlue && !FilterManager.WireIsNotAllowed(FilterManager.WireType.Blue)) hasAllowed = true;
            if (tile.WireGreen && !FilterManager.WireIsNotAllowed(FilterManager.WireType.Green)) hasAllowed = true;
            if (tile.WireYellow && !FilterManager.WireIsNotAllowed(FilterManager.WireType.Yellow)) hasAllowed = true;
        }

        return hasAllowed ? (byte)0 : byte.MaxValue;
    }

    public TEditColor GetBackgroundColor(int y)
    {
        if (CurrentWorld == null)
            return WorldConfiguration.GlobalColors["Sky"];
        if (y < 80)
            return WorldConfiguration.GlobalColors["Space"];
        else if (y > CurrentWorld.TilesHigh - 192)
            return WorldConfiguration.GlobalColors["Hell"];
        else if (y > CurrentWorld.RockLevel)
            return WorldConfiguration.GlobalColors["Rock"];
        else if (y > CurrentWorld.GroundLevel)
            return WorldConfiguration.GlobalColors["Earth"];
        else
            return WorldConfiguration.GlobalColors["Sky"];
    }

}