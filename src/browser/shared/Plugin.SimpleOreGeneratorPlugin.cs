using System;
using System.Collections.Generic;
using System.Linq;
using TEdit.ViewModel;
using TEdit.Geometry;

namespace TEdit.Editor.Plugins
{
    public sealed class SimpleOreGeneratorPlugin : BasePlugin
    {
        private PerlinNoise _noiseGenerator;
        private Random _random;
        private ushort _currentOreId;
        private bool IncludeAsh = true;
        private bool EnableUndo = true;

        public SimpleOreGeneratorPlugin(WorldViewModel worldViewModel)
            : base(worldViewModel)
        {
            _noiseGenerator = new PerlinNoise(1);
            _random = new Random();
            Name = "Simple Ore Generator";
        }

        public override void Execute()=>Execute(new OreOptions());
    public void Execute(OreOptions options)
        {
            if (_wvm.CurrentWorld == null)
                return;

            bool activeSelection = _wvm.Selection.IsActive;

            // Show the view.
        var view = options;
            _random = new Random(options.Seed);


            // Set local bools.
            IncludeAsh = view.IncludeAsh;
            EnableUndo = view.EnableUndo;

            // Get selected ore IDs from the view
            List<int> selectedOres = GetSelectedOres(view);
            if (selectedOres.Count == 0)
                return;

            // Define random seed from time.
            _noiseGenerator = new PerlinNoise(options.Seed);

            RectangleInt32 randomizationArea;

            if (view.OnlySelection)
            {
                // Set the randomizationArea to the selected area
                randomizationArea = _wvm.Selection.SelectionArea;
            }
            else
            {
                // Set the randomizationArea to the whole world
                randomizationArea = new(0, 0, _wvm.CurrentWorld.Size.X, _wvm.CurrentWorld.Size.Y);
            }

            // Initialize the current ore ID
            _currentOreId = (ushort)selectedOres[_random.Next(selectedOres.Count)];

            // Visited tiles to track veins
            bool[,] visited = new bool[randomizationArea.Width, randomizationArea.Height];

            // Change every tile in the randomizationArea according to the tile mapping
            for (int x = randomizationArea.Left; x < randomizationArea.Right; x++)
            {
                TEdit.Port.OperationProgress.Advance();
                for (int y = randomizationArea.Top; y < randomizationArea.Bottom; y++)
                {
                TEdit.Port.OperationProgress.Advance();
                    if (!visited[x - randomizationArea.Left, y - randomizationArea.Top])
                    {
                        if (ShouldGenerateOre(x, y) && IsValidLocation(x, y))
                        {
                            _currentOreId = (ushort)selectedOres[_random.Next(selectedOres.Count)];

                            try
                            {
                                GenerateVein(x, y, visited, randomizationArea);
                            }
                            catch (Exception ex) { ErrorLogging.LogDebug($"Ore vein error at [{x},{y}]: {ex.Message}"); continue; }
                        }
                    }
                }
            }
            if (EnableUndo)
                _wvm.UndoManager.SaveUndo();
        }

        private bool ShouldGenerateOre(int x, int y)
        {
            var result = OctaveGenerator(x, y);
            return result > 0.6 && result < 0.75;
        }

        private bool IsValidLocation(int x, int y)
        {
            var curTile = _wvm.CurrentWorld.Tiles[x, y];
            return curTile.IsActive                    // Is not Air.
                && curTile.Type == 0                   // Dirt.
                || curTile.Type == 1                   // Stone block.
                || curTile.Type == 25                  // Ebonstone block.
                || curTile.Type == 53                  // Sand block.
                || (curTile.Type == 57 && IncludeAsh)  // Ash block.
                || curTile.Type == 59                  // Mud block.
                || curTile.Type == 112                 // Ebonsand block.
                || curTile.Type == 116                 // Pearlsand block.
                || curTile.Type == 117                 // Pearlstone block.
                || curTile.Type == 161                 // Ice block.
                || curTile.Type == 163                 // Purple ice block.
                || curTile.Type == 164                 // Pink ice block.
                || curTile.Type == 200                 // Red ice block.
                || curTile.Type == 203                 // Crimstone block.
                // || curTile.Type == 224              // Slush block (Questionable).
                || curTile.Type == 234                 // Crimsand block.
                || curTile.Type == 396                 // Sandstone block.
                || curTile.Type == 400                 // Ebonsandstone block.
                || curTile.Type == 401                 // Crimsandstone block.
                || curTile.Type == 403;                // Pearlsandstone block.
        }

        private void GenerateVein(int startX, int startY, bool[,] visited, RectangleInt32 randomizationArea)
        {
            Stack<(int x, int y)> stack = new();
            stack.Push((startX, startY));

            while (stack.Count > 0)
            {
                var (x, y) = stack.Pop();

                if (x < randomizationArea.Left || x >= randomizationArea.Right || y < randomizationArea.Top || y >= randomizationArea.Bottom)
                    continue;

                if (visited[x - randomizationArea.Left, y - randomizationArea.Top])
                    continue;

                visited[x - randomizationArea.Left, y - randomizationArea.Top] = true;

                if (ShouldGenerateOre(x, y) && IsValidLocation(x, y))
                {
                    if (EnableUndo)
                        _wvm.UndoManager.SaveTile(x, y);
                    _wvm.CurrentWorld.Tiles[x, y].IsActive = true;
                    _wvm.CurrentWorld.Tiles[x, y].Type = _currentOreId;
                    _wvm.UpdateRenderPixel(x, y);

                    stack.Push((x + 1, y));
                    stack.Push((x - 1, y));
                    stack.Push((x, y + 1));
                    stack.Push((x, y - 1));
                }
            }
        }

        private float OctaveGenerator(int worldX, int worldY)
        {
            float result = 0f;

            int octaves = 5;
            float amplitude = 1f;
            float persistance = 0.35f;
            float frequency = 0.04f;

            for (int i = 0; i < octaves; i++)
            {
                result += _noiseGenerator.Noise(worldX * frequency, worldY * frequency) * amplitude;
                amplitude *= persistance;
                frequency *= 2.0f;
            }

            if (result < 0) result = 0.0f;
            if (result > 1) result = 1.0f;
            return result;
        }

        private List<int> GetSelectedOres(OreOptions view)=>view.Ores.ToList();
    }
}
