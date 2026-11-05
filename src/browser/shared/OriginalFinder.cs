using System.Numerics;
using TEdit.Terraria;
using TEdit.ViewModel;
namespace TEdit.Port;
public record FindResultItem(string Name, int X, int Y, string ResultType, string? ExtraInfo = null)
{
    public string DisplayText => ExtraInfo != null
        ? $"{Name} @ {X}, {Y} ({ResultType}) {ExtraInfo}"
        : $"{Name} @ {X}, {Y} ({ResultType})";
}

internal sealed class FindResultAccumulator(int displayLimit)
{
    public int TotalCount { get; private set; }

    public bool Add()
    {
        TotalCount++;
        return TotalCount <= displayLimit;
    }

    public void Clear() => TotalCount = 0;
}

public sealed class OriginalFinder(WorldViewModel host){
 readonly WorldViewModel _wvm=host;
 readonly FindResultAccumulator _resultAccumulator=new(1000);
 readonly List<(int X,int Y)> _overlayPositions=[];
 readonly List<FindResultItem> Results=[];
 bool CalculateDistance;
 public object Search(int[] items,int[] tiles,int[] walls,int[] spriteTiles,int[] styles,bool distance=false){
  var world=_wvm.CurrentWorld;
  if(spriteTiles.Length!=styles.Length)throw new ArgumentException("家具样式不匹配");
  if(new[]{items.Length,tiles.Length,walls.Length,spriteTiles.Length}.Any(n=>n>256))throw new ArgumentException("一次最多查找256种类型");
  CalculateDistance=distance;_resultAccumulator.Clear();Results.Clear();_overlayPositions.Clear();
  var spawn=new Vector2(world.SpawnX,world.SpawnY);
  var sprites=spriteTiles.Select((tile,i)=>(TileId:tile,UV:styles[i]<0?(TEdit.Geometry.Vector2Short?)null:WorldConfiguration.Sprites2.FirstOrDefault(s=>s.Tile==tile)?.Styles.FirstOrDefault(s=>s.Style==styles[i])?.UV)).ToArray();
  if(items.Length>0)SearchContainers(items,spawn);
  if(tiles.Length>0||walls.Length>0||sprites.Length>0)SearchMap(tiles,walls,sprites,spawn);
  var result=distance?Results.OrderBy(r=>Vector2.Distance(spawn,new(r.X,r.Y))).ToArray():Results.ToArray();
  return new{total=_resultAccumulator.TotalCount,displayed=result.Length,results=result,highlighted=_overlayPositions.Count};
 }
    private void AddSpriteToOverlay(World world, int ax, int ay)
    {
        var tile = world.Tiles[ax, ay];
        if (!tile.IsActive || tile.Type >= WorldConfiguration.TileProperties.Count)
        {
            _overlayPositions.Add((ax, ay));
            return;
        }

        var prop = WorldConfiguration.TileProperties[tile.Type];
        var size = prop.GetFrameSize(tile.V);

        for (int dx = 0; dx < size.X; dx++)
        {
            for (int dy = 0; dy < size.Y; dy++)
            {
                int px = ax + dx, py = ay + dy;
                if (px < world.TilesWide && py < world.TilesHigh)
                    _overlayPositions.Add((px, py));
            }
        }
    }

    private void SearchContainers(IReadOnlyList<int> selectedItemIds, Vector2 spawn)
    {
        var world = _wvm.CurrentWorld;
        var itemIdSet = selectedItemIds.ToHashSet();

        // Search chests
        foreach (var chest in world.Chests)
        {
            foreach (var item in chest.Items)
            {
                if (item.NetId > 0 && itemIdSet.Contains(item.NetId))
                {
                    var extraInfo = CalculateDistance
                        ? string.Format("Distance: {0}", Math.Round(Vector2.Distance(spawn, new Vector2(chest.X, chest.Y))))
                        : null;

                    AddSpriteToOverlay(world, chest.X, chest.Y);
                    AddResult(new FindResultItem(
                        item.GetName(),
                        chest.X,
                        chest.Y,
                        "Chest",
                        extraInfo));
                }
            }
        }

        // Search tile entities that can hold items (item frames, mannequins, etc.)
        foreach (var entity in world.TileEntities)
        {
            // Check if this entity has items
            if (entity.Items != null)
            {
                foreach (var item in entity.Items)
                {
                    if (item.Id > 0 && itemIdSet.Contains(item.Id))
                    {
                        var extraInfo = CalculateDistance
                            ? string.Format("Distance: {0}", Math.Round(Vector2.Distance(spawn, new Vector2(entity.PosX, entity.PosY))))
                            : null;

                        // Get item name from WorldConfiguration
                        var itemProp = WorldConfiguration.ItemProperties.FirstOrDefault(p => p.Id == item.Id);
                        var itemName = itemProp?.Name ?? $"Item {item.Id}";

                        AddSpriteToOverlay(world, entity.PosX, entity.PosY);
                        AddResult(new FindResultItem(
                            itemName,
                            entity.PosX,
                            entity.PosY,
                            "TileEntity",
                            extraInfo));
                    }
                }
            }
        }
    }

    private void SearchMap(
        IReadOnlyList<int> selectedTileIds,
        IReadOnlyList<int> selectedWallIds,
        IReadOnlyList<(int TileId, Geometry.Vector2Short? UV)> selectedSprites,
        Vector2 spawn)
    {
        var world = _wvm.CurrentWorld;
        var tileIdSet = selectedTileIds.ToHashSet();
        var wallIdSet = selectedWallIds.ToHashSet();

        // Track which sprite anchors we've already added to Results (dedup)
        var seenSpriteAnchors = new HashSet<long>();

        for (int x = 0; x < world.TilesWide; x++)
        {
            OperationProgress.Advance(world.TilesHigh);
            for (int y = 0; y < world.TilesHigh; y++)
            {
                var tile = world.Tiles[x, y];

                // Check tiles (non-framed blocks)
                if (tile.IsActive && tileIdSet.Contains(tile.Type))
                {
                    _overlayPositions.Add((x, y));

                    var tileName = GetTileName(tile.Type);
                    var extraInfo = CalculateDistance
                        ? string.Format("Distance: {0}", Math.Round(Vector2.Distance(spawn, new Vector2(x, y))))
                        : null;

                    AddResult(new FindResultItem(tileName, x, y, "Tile", extraInfo));
                }

                // Check walls
                if (tile.Wall > 0 && wallIdSet.Contains(tile.Wall))
                {
                    _overlayPositions.Add((x, y));

                    var wallName = GetWallName(tile.Wall);
                    var extraInfo = CalculateDistance
                        ? string.Format("Distance: {0}", Math.Round(Vector2.Distance(spawn, new Vector2(x, y))))
                        : null;

                    AddResult(new FindResultItem(wallName, x, y, "Wall", extraInfo));
                }

                // Check sprites — highlight ALL matching tiles, but dedupe Results to anchors
                if (tile.IsActive && selectedSprites.Count > 0)
                {
                    foreach (var (spriteId, uv) in selectedSprites)
                    {
                        if (tile.Type != spriteId) continue;

                        // If UV is specified, must match
                        if (uv.HasValue)
                        {
                            var tileUV = tile.GetUV();
                            if (tileUV.X != uv.Value.X || tileUV.Y != uv.Value.Y)
                                continue;
                        }

                        // Add every matching tile to overlay (entire sprite highlights)
                        _overlayPositions.Add((x, y));

                        // Only add one Result entry per sprite instance (anchor)
                        var anchor = world.GetAnchor(x, y);
                        long anchorKey = (long)anchor.Y * 65536L + anchor.X;
                        if (!seenSpriteAnchors.Add(anchorKey)) continue;

                        var spriteName = GetSpriteName(spriteId, uv);
                        var extraInfo = CalculateDistance
                            ? string.Format("Distance: {0}", Math.Round(Vector2.Distance(spawn, new Vector2(anchor.X, anchor.Y))))
                            : null;

                        AddResult(new FindResultItem(spriteName, anchor.X, anchor.Y, "Sprite", extraInfo));
                    }
                }
            }
        }
    }

    private void AddResult(FindResultItem result)
    {
        if (_resultAccumulator.Add())
            Results.Add(result);
    }

    private static string GetTileName(int tileId)
    {
        var prop = WorldConfiguration.TileProperties.FirstOrDefault(t => t.Id == tileId);
        return prop?.Name ?? $"Tile {tileId}";
    }

    private static string GetWallName(int wallId)
    {
        var prop = WorldConfiguration.WallProperties.FirstOrDefault(w => w.Id == wallId);
        return prop?.Name ?? $"Wall {wallId}";
    }

    private string GetSpriteName(int spriteId, Geometry.Vector2Short? uv)
    {
        var prop = WorldConfiguration.TileProperties.FirstOrDefault(t => t.Id == spriteId);
        if (prop == null) return $"Sprite {spriteId}";

        if (uv.HasValue && prop.Frames != null)
        {
            var frame = prop.Frames.FirstOrDefault(f => f.UV.X == uv.Value.X && f.UV.Y == uv.Value.Y);
            if (frame != null) return $"{prop.Name} ({frame})";
        }

        return prop.Name;
    }


}
