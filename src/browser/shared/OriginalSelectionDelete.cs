using TEdit.Editor.Undo;

using TEdit.Geometry;

using TEdit.Terraria;

namespace TEdit.Port;

// Extracted from frozen WorldViewModel.EditDelete; only WPF pixel refresh removed.

internal static class OriginalSelectionDelete {

 public static void Run(World CurrentWorld,UndoManager UndoManager,RectangleInt32 area){



        if (true)

        {

            for (int x = area.Left; x < area.Right; x++)

            {

                for (int y = area.Top; y < area.Bottom; y++)

                {

                    UndoManager.SaveTile(x, y);

                    CurrentWorld.Tiles[x, y].Reset();



                }

            }



            foreach (var te in CurrentWorld.TileEntities.Where(te => area.Contains(te.PosX, te.PosY)).ToList())

            {

                CurrentWorld.TileEntities.Remove(te);

            }

            foreach (var chest in CurrentWorld.Chests.Where(item => area.Contains(item.X, item.Y)).ToList())

            {

                CurrentWorld.Chests.Remove(chest);

            }

            foreach (var sign in CurrentWorld.Signs.Where(item => area.Contains(item.X, item.Y)).ToList())

            {

                CurrentWorld.Signs.Remove(sign);

            }



            UndoManager.SaveUndo();

        }

 }

}

