using System.Linq;
using TEdit.Terraria;
using TEdit.Geometry;
using TEdit.ViewModel;

namespace TEdit.Editor.Plugins;

public class RemoveAllChestsPlugin : BasePlugin
{
    public RemoveAllChestsPlugin(WorldViewModel worldViewModel)
        : base(worldViewModel)
    {
        Name = "Remove All Chests";
    }

    public override void Execute()
    {
        if (_wvm.CurrentWorld == null) return;


        var chestLocations = _wvm.CurrentWorld.Chests.Select(chest => new Vector2Int32 { X = chest.X, Y = chest.Y }).ToList();

        foreach (var location in chestLocations)
        {
            for (int x = location.X; x < location.X + 2; x++)
            {
                TEdit.Port.OperationProgress.Advance();
                for (int y = location.Y; y < location.Y + 2; y++)
                {
                TEdit.Port.OperationProgress.Advance();

                    if (_wvm.CurrentWorld.ValidTileLocation(x, y) && _wvm.CurrentWorld.Tiles[x, y].Type == (int)TileType.Chest)
                    {
                        _wvm.UndoManager.SaveTile(x, y);
                        _wvm.CurrentWorld.Tiles[x, y].ClearTile();
                        _wvm.UpdateRenderPixel(x, y);
                    }
                }
            }
        }

        _wvm.UndoManager.SaveUndo();

    }
}
