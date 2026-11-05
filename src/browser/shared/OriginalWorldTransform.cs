using System.ComponentModel;
using TEdit.Terraria;
using TEdit.Geometry;
using TEdit.Utility;
using Rectangle=TEdit.Geometry.RectangleInt32;
namespace TEdit.Port;
public static class OriginalWorldTransform {
    public static World Transform(
        World sourceWorld,
        RectangleInt32 selectionArea, // The region you want to keep.
        int borderLeft,
        int borderTop,
        int borderRight,
        int borderBottom,
        IProgress<ProgressChangedEventArgs> progress = null, WorldTransformSnapshot? snapshot = null)
    {

            World w = snapshot?.Metadata ?? new World();

            // TODO: Header data needs to be copied.
            if(snapshot == null) {
            using (var memStream = new MemoryStream())
            {
                var writer = new BinaryWriter(memStream);
                World.SaveV2(sourceWorld, writer);
                memStream.Flush();
                var reader = new BinaryReader(memStream);
                w.Version = sourceWorld.Version;
                World.LoadV2(reader, w);
            }

            }

            var tileArea = new Rectangle(borderLeft, borderTop, (int)selectionArea.Width, selectionArea.Height);

            int worldWidth = selectionArea.Width + borderLeft + borderRight;
            int worldHeight = selectionArea.Height + borderTop + borderBottom;

            // w.ResetTime();
            w.CreationTime = System.DateTime.Now.ToBinary();
            w.LastPlayed = System.DateTime.Now.ToBinary();
            w.TilesHigh = worldHeight;
            w.TilesWide = worldWidth;

            // Calc new ground heights.
            int topOffset = selectionArea.Top - borderTop;
            int leftOffset = selectionArea.Left - borderLeft;

            double groundLevel = w.GroundLevel - topOffset;
            double rockLevel = w.RockLevel - topOffset;

            if (groundLevel < 0 || groundLevel >= worldHeight) { groundLevel = Math.Min(350, worldHeight); }
            if (rockLevel < 0 || rockLevel >= worldHeight) { rockLevel = Math.Min(480, worldHeight); }

            w.GroundLevel = groundLevel;
            w.RockLevel = rockLevel;


            // Shift spawn point.
            int spawnX = w.SpawnX - leftOffset;
            int spawnY = w.SpawnY - topOffset;

            // Check out of bounds, and move.
            if (spawnX < tileArea.Left || spawnX > tileArea.Right) { spawnX = worldWidth / 2; };
            if (spawnY < tileArea.Top || spawnY > tileArea.Bottom) { spawnY = (int)groundLevel / 2; };

            w.SpawnX = spawnX;
            w.SpawnY = spawnY;

            // Shift dungeon point.
            int dungeonX = w.DungeonX - leftOffset;
            int dungeonY = w.DungeonY - topOffset;

            // Check out of bounds, and move.
            if (dungeonX < tileArea.Left || dungeonX > tileArea.Right) { dungeonX = worldWidth / 2; };
            if (dungeonY < tileArea.Top || dungeonY > tileArea.Bottom) { dungeonY = (int)groundLevel / 4; };

            w.DungeonX = dungeonX;
            w.DungeonY = dungeonY;

            // Calc size.
            w.BottomWorld = w.TilesHigh * 16;
            w.RightWorld = w.TilesWide * 16;

            if(snapshot != null) w.Tiles = snapshot.CopyTiles(selectionArea,borderLeft,borderTop,borderRight,borderBottom,progress);
            else {
            // Generate empty tiles.
            var tiles = new Tile[w.TilesWide, w.TilesHigh];
            var tile = new Tile(); // Empty tile.
            for (int y = 0; y < w.TilesHigh; y++)
            {
                int percent = Calc.ProgressPercentage(y, w.TilesHigh);
                progress?.Report(new ProgressChangedEventArgs(percent, "Cloning World..."));

                // Generate no extra tiles.
                for (int x = 0; x < w.TilesWide; x++)
                {
                    if (tileArea.Contains(x, y))
                    {
                        tiles[x, y] = w.Tiles[x + leftOffset, y + topOffset];
                    }
                    else
                    {
                        tiles[x, y] = tile;
                    }
                }
            }

            w.Tiles = tiles;

            }

            // Move NPCs.
            foreach (var npc in w.NPCs.ToList()) // To list since we are removing out of bounds NPCs below.
            {
                npc.Home -= new Vector2Int32(leftOffset, topOffset);
                if (!tileArea.Contains(npc.Home.X, npc.Home.Y))
                {
                    if (npc.Name == "Old Man")
                    {
                        npc.Home = new Vector2Int32(w.DungeonX, w.DungeonY); // Move homeless old man to dungeon.
                    }
                    else
                    {
                        npc.Home = new Vector2Int32(w.SpawnX, w.SpawnY); // Move homeless npc to spawn.
                        npc.IsHomeless = true;
                    }
                }
            }

            // Move mobs.
            foreach (var mob in w.Mobs.ToList()) // To list since we are removing out of bounds NPCs below.
            {
                mob.Home -= new Vector2Int32(leftOffset, topOffset);
                if (!tileArea.Contains(mob.Home.X, mob.Home.Y))
                {
                    w.Mobs.Remove(mob); // Remove out of bounds.
                }
            }

            // Move chests.
            foreach (var chest in w.Chests.ToList())
            {
                chest.X -= leftOffset;
                chest.Y -= topOffset;
                if (!tileArea.Contains(chest.X, chest.Y))
                {
                    w.Chests.Remove(chest); // Remove out of bounds.
                }
            }

            // Move signs.
            foreach (var sign in w.Signs.ToList())
            {
                sign.X -= leftOffset;
                sign.Y -= topOffset;
                if (!tileArea.Contains(sign.X, sign.Y))
                {
                    w.Signs.Remove(sign); // Remove out of bounds.
                }
            }

            // Move tile entities.
            foreach (var te in w.TileEntities.ToList())
            {
                te.PosX -= (short)leftOffset;
                te.PosY -= (short)topOffset;
                if (!tileArea.Contains(te.PosX, te.PosY))
                {
                    w.TileEntities.Remove(te); // Remove out of bounds.
                }
            }

            // Move pressure plates.
            foreach (var item in w.PressurePlates.ToList()) // To list since we are removing out of bounds NPCs below.
            {
                item.PosX -= leftOffset;
                item.PosY -= topOffset;
                if (!tileArea.Contains(item.PosX, item.PosY))
                {
                    w.PressurePlates.Remove(item); // Remove out of bounds.
                }
            }


            // Move Town manager items.
            foreach (var room in w.PlayerRooms.ToList())
            {
                room.Home -= new Vector2Int32(leftOffset, topOffset);
                if (!tileArea.Contains(room.Home.X, room.Home.Y))
                {
                    w.PlayerRooms.Remove(room); // Remove out of bounds.
                }
            }

            return w;
    }
}
