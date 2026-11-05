using System.ComponentModel;
using TEdit.Terraria;
using TEdit.Common;
using TEdit.Utility;
namespace TEdit.Port;
public sealed class OriginalWorldGenerator {
 static void OnProgressChanged(object sender,ProgressChangedEventArgs args)=>OperationProgress.Advance();
 public World Generate(World w,int? seedHash=null){
                // Generate a new seed if not provided
                w.Seed = w.Seed;
                if (string.IsNullOrEmpty(w.Seed))
                {
                    w.Seed = (new Random()).Next(0, int.MaxValue).ToString(); // Generate a random seed
                }

                // Initialize random number generator with the seed's hash code
                Random rand = new(seedHash ?? w.Seed.GetHashCode());
                PerlinNoise perlinNoise = new(rand.Next()); // Initialize Perlin noise with a random value

                // Set world properties
                w.SpawnX = (int)(w.TilesWide / 2); // Center spawn position horizontally
                w.SpawnY = (int)Math.Max(0, w.GroundLevel - 10); // Set spawn position vertically with a slight offset
                w.GroundLevel = (int)w.GroundLevel; // Ensure ground level is an integer
                w.RockLevel = (int)w.RockLevel; // Ensure rock level is an integer
                w.BottomWorld = w.TilesHigh * 16; // Calculate the bottom of the world
                w.RightWorld = w.TilesWide * 16; // Calculate the right edge of the world
                w.Tiles = new Tile[w.TilesWide, w.TilesHigh]; // Initialize the world tile array

                // Extract custom settings for world generation
                int hillSize = (int)w.HillSize;
                bool generateGrass = w.GenerateGrass;
                bool generateWalls = w.GenerateWalls;
                bool generateCaves = w.GenerateCaves;
                int cavePreset = w.CavePresetIndex;
                bool surfaceCaves = w.SurfaceCaves;
                double caveNoise = w.CaveNoise;
                double caveMultiplier = w.CaveMultiplier;
                double caveDensity = w.CaveDensity;
                bool generateUnderworld = w.GenerateUnderworld;
                bool generateAsh = w.GenerateAsh;
                bool generateLava = w.GenerateLava;
                double underworldRoofNoise = w.UnderworldRoofNoise;
                double underworldFloorNoise = w.UnderworldFloorNoise;
                double underworldLavaNoise = w.UnderworldLavaNoise;
                

                // Generate hills in the world
                GenerateHills(w, perlinNoise, generateUnderworld, generateWalls);

                // Cleanup generation: Add grass to the top layers and remove exposed surface walls
                // if (generateGrass || generateWalls)
                CleanupGeneration(w, generateGrass, generateWalls);

                // Generate caves in the world
                if (generateCaves)
                    GenerateCaves(w, rand, caveNoise, caveMultiplier, caveDensity, surfaceCaves, generateUnderworld, generateGrass, generateWalls);

                // Generate underworld features if specified
                if (generateUnderworld && generateAsh)
                    GenerateUnderworld(w, rand, generateLava, underworldRoofNoise, underworldFloorNoise, underworldLavaNoise);


 return w;
 }
    #region Hill Generation

    private void GenerateHills(World w, PerlinNoise perlinNoise, bool generateUnderworld, bool generateWalls)
    {
        // Hill generation
        for (int y = 0; y < w.TilesHigh; y++) // Iterate through all y levels
        {
            OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(y, w.TilesHigh), "Generating Hills..."));

            for (int x = 0; x < w.TilesWide; x++)
            {
                double hillHeight = w.GroundLevel - perlinNoise.Noise(x * 0.01, 0) * w.HillSize;

                // Flip y-axis calculation
                int flippedY = w.TilesHigh - 1 - y;

                if (flippedY >= hillHeight)
                {
                    if (generateUnderworld && flippedY >= w.TilesHigh - 200)
                    {
                        // Set the tile to inactive (air) in the underworld area
                        w.Tiles[x, flippedY] = new Tile
                        {
                            IsActive = false
                        };
                    }
                    else
                    {
                        // Determine tile type based on depth
                        Tile.TileType tileType = (flippedY < w.RockLevel) ? Tile.TileType.DirtBlock : Tile.TileType.StoneBlock;
                        w.Tiles[x, flippedY] = new Tile
                        {
                            IsActive = true,
                            Type = (ushort)tileType // Encapsulated tile types
                        };

                        // Check to skip walls
                        if (generateWalls)
                        {
                            // Add walls based on depth, skipping the topmost layer of dirt
                            if (flippedY < w.RockLevel && flippedY != (int)hillHeight)
                            {
                                w.Tiles[x, flippedY].Wall = (ushort)Tile.WallType.DirtWall;
                            }
                            else if (flippedY >= w.RockLevel)
                            {
                                w.Tiles[x, flippedY].Wall = (ushort)Tile.WallType.StoneWall;
                            }
                        }
                    }
                }
                else
                {
                    w.Tiles[x, flippedY] = new Tile { IsActive = false }; // Air
                }
            }
        }
    }
    #endregion

    #region Cleanup Generation

    private void CleanupGeneration(World w, bool generateGrass, bool generateWalls)
    {
        // Variable to store the lowest topmost layer across all columns
        int minHillY = -1;

        // Iterate through each column to find the lowest topmost layer
        for (int x = 0; x < w.TilesWide; x++)
        {
            int topmostLayer = -1; // Reset for each column

            // Determine the topmost active layer for each column
            for (int y = 0; y < w.TilesHigh; y++)
            {
                if (w.Tiles[x, y].IsActive)
                {
                    topmostLayer = y;
                    break; // Stop at the first active tile found from the top
                }
            }

            // Continue only if a valid topmost layer is found
            if (topmostLayer >= 0 && topmostLayer < w.TilesHigh)
            {
                // Update the minimum hill Y value if the topmost layer is above the current minHillY and below the rock level
                if (topmostLayer > minHillY && topmostLayer < w.RockLevel)
                {
                    minHillY = topmostLayer;
                }

                // Place grass on the topmost dirt layer and continue down
                if (generateGrass)
                {
                    for (int y = topmostLayer; y < w.TilesHigh; y++)
                    {
                        // Place grass function
                        if (w.Tiles[x, y].Type == (ushort)Tile.TileType.DirtBlock) // Ensure not to place grass on stone
                        {
                            w.Tiles[x, y] = new Tile
                            {
                                IsActive = true,
                                Type = (ushort)Tile.TileType.GrassBlock
                            };

                            // Check surrounding tiles for air
                            bool leftIsAir = (x - 1 >= 0) && !w.Tiles[x - 1, y].IsActive;
                            bool rightIsAir = (x + 1 < w.TilesWide) && !w.Tiles[x + 1, y].IsActive;

                            // Continue placing grass only if either side has air
                            if (!leftIsAir && !rightIsAir)
                            {
                                break; // Stop if both sides are not air
                            }
                        }
                    }
                }

                // Remove top exposed walls function
                if (generateWalls)
                {
                    for (int y = topmostLayer; y < w.TilesHigh; y++)
                    {
                        w.Tiles[x, y].Wall = (ushort)Tile.WallType.Sky; // Remove wall by setting it to a default state

                        // Check surrounding tiles for air
                        bool leftIsAir = (x - 1 >= 0) && !w.Tiles[x - 1, y].IsActive;
                        bool rightIsAir = (x + 1 < w.TilesWide) && !w.Tiles[x + 1, y].IsActive;

                        // Further remove walls on adjacent tiles
                        if (x - 1 >= 0)
                            w.Tiles[x - 1, y].Wall = (ushort)Tile.WallType.Sky;
                        if (x + 1 < w.TilesWide)
                            w.Tiles[x + 1, y].Wall = (ushort)Tile.WallType.Sky;

                        // Continue removing walls only if either side has air
                        if (!leftIsAir && !rightIsAir)
                        {
                            break; // Stop if both sides are not air
                        }
                    }
                }
            }
        }

        // Set the ground level of the world to the lowest topmost layer found
        w.GroundLevel = minHillY;
    }
    #endregion

    #region Cave Generation

    private void GenerateCaves(World w, Random rand, double caveNoise, double caveMultiplier, double caveDensity, bool surfaceCaves, bool skipUnderworld, bool generateGrass, bool generateWalls)
    {
        OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(0, w.TilesHigh), "Generating Caves..."));

        int width = w.TilesWide;
        int height = w.TilesHigh;

        // Generate initial cave map based on Perlin noise
        double[,] caveMap = new double[width, height];
        double noiseScale = caveNoise; // Keep noise scale independent of density
        double noiseThreshold = caveMultiplier * caveDensity; // Adjust threshold based on caveDensity

        // Initialize PerlinNoise object
        PerlinNoise perlinNoise = new(rand.Next()); // Use a random seed

        for (int y = 0; y < height; y++)
        {
            OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(y, w.TilesHigh), "Generating Cave Noise..."));

            for (int x = 0; x < width; x++)
            {
                double nx = x * noiseScale;
                double ny = y * noiseScale;
                caveMap[x, y] = perlinNoise.Noise(nx, ny); // Use Perlin noise
            }
        }

        // Cellular automata for cave refinement
        for (int iteration = 0; iteration < 5; iteration++) // Number of iterations
        {
            double[,] newCaveMap = new double[width, height];

            for (int y = 1; y < height - 1; y++)
            {
                OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(y, w.TilesHigh), "Refining Caves..."));

                for (int x = 1; x < width - 1; x++)
                {
                    int activeNeighbors = CountActiveNeighbors(caveMap, x, y);
                    if (caveMap[x, y] > noiseThreshold)
                    {
                        newCaveMap[x, y] = 1.0; // Cave
                    }
                    else
                    {
                        newCaveMap[x, y] = activeNeighbors >= 4 ? 1.0 : 0.0; // Cave or wall
                    }
                }
            }

            caveMap = newCaveMap;
        }

        // Determine the topmost layer of dirt
        double topDirtLayer = w.GroundLevel + perlinNoise.Noise(0, 0) * w.HillSize;

        // Apply cave map to world with adjustable cave size
        for (int y = 0; y < height; y++)
        {
            OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(y, w.TilesHigh), "Placing Caves..."));

            if (!surfaceCaves && y < w.RockLevel) continue; // Skip tiles above ground level
            if (skipUnderworld && y > height - 200) continue; // Skip tiles in underworld

            for (int x = 0; x < width; x++)
            {
                if (caveMap[x, y] > 0.5)
                {
                    for (int dy = (int)-caveMultiplier; dy <= (int)caveMultiplier; dy++)
                    {
                        for (int dx = (int)-caveMultiplier; dx <= (int)caveMultiplier; dx++)
                        {
                            int nx = x + dx;
                            int ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height)
                            {
                                w.Tiles[nx, ny].IsActive = false; // Hollow out the tile

                                // Add grass.
                                if (generateGrass && w.Tiles[nx, ny].Type != (ulong)Tile.TileType.GrassBlock)
                                {
                                    w.Tiles[nx, ny].Type = (ushort)Tile.TileType.DirtBlock;
                                }

                                // Check to skip walls
                                if (generateWalls && w.Tiles[nx, ny].IsActive)
                                {
                                    // Skip walls on the very top layer of dirt
                                    if (y < w.RockLevel && y != topDirtLayer)
                                    {
                                        w.Tiles[nx, ny].Wall = (ushort)Tile.WallType.DirtWall;
                                    }
                                    // Rock level
                                    else if (y >= w.RockLevel)
                                    {
                                        w.Tiles[nx, ny].Wall = (ushort)Tile.WallType.StoneWall;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private int CountActiveNeighbors(double[,] caveMap, int x, int y)
    {
        int count = 0;

        for (int dy = -1; dy <= 1; dy++)
        {
            for (int dx = -1; dx <= 1; dx++)
            {
                if (dx == 0 && dy == 0) continue;
                if (x + dx >= 0 && x + dx < caveMap.GetLength(0) && y + dy >= 0 && y + dy < caveMap.GetLength(1))
                {
                    if (caveMap[x + dx, y + dy] > 0.5)
                    {
                        count++;
                    }
                }
            }
        }

        return count;
    }
    #endregion

    #region Underworld Generation

    private void GenerateUnderworld(World w, Random rand, bool generateLava, double underworldRoofNoise, double underworldFloorNoise, double underworldLavaNoise)
    {
        int width = w.TilesWide;
        int height = w.TilesHigh;
        int underworldHeight = 200; // Define the height of the underworld
        int underworldStart = height - underworldHeight; // Starting y-coordinate for the underworld

        double groundNoiseScale = underworldFloorNoise; // Scale for ground Perlin noise
        double roofNoiseScale = underworldRoofNoise; // Scale for roof Perlin noise
        double lavaNoiseScale = underworldLavaNoise; // Scale for lava patches

        // Manually set the base levels for the ground and roof
        int roofBaseLevel = underworldStart + 20;   // 20 tiles up from the bottom
        int groundBaseLevel = height - 80; // 80 tiles up from the bottom

        PerlinNoise groundNoise = new(rand.Next());
        PerlinNoise roofNoise = new(rand.Next());
        PerlinNoise lavaNoise = new(rand.Next());

        // Iterate through the bottom 200 tiles to generate the underworld
        for (int y = underworldStart; y < height; y++)
        {
            OnProgressChanged(w, new ProgressChangedEventArgs(Calc.ProgressPercentage(y, height), "Generating Underworld..."));

            for (int x = 0; x < width; x++)
            {
                // Calculate ground height with a rugged, mostly flat surface
                double groundHeight = groundBaseLevel - groundNoise.Noise(x * groundNoiseScale, 0) * 10; // Adjust '10' for ruggedness

                // Calculate roof height with a more spiked appearance
                double roofHeight = roofBaseLevel - roofNoise.Noise(x * roofNoiseScale, 0) * 15; // Adjust '15' for spike sharpness

                // Determine tile type based on position and Perlin noise
                if (y >= groundHeight && y < height)
                {
                    // Ground layer
                    w.Tiles[x, y] = new Tile
                    {
                        IsActive = true,
                        Type = (ushort)Tile.TileType.AshBlock // Use StoneBlock for underworld ground
                    };

                    // Add lava in patches based on Perlin noise
                    double lavaValue = lavaNoise.Noise(x * lavaNoiseScale, y * lavaNoiseScale);
                    if (generateLava && y >= groundBaseLevel + 2 && lavaValue > 0.1) // Adjust threshold for lava patch size
                    {
                        w.Tiles[x, y].LiquidType = LiquidType.Lava; // Lava type
                        w.Tiles[x, y].LiquidAmount = 255; // Full lava amount
                    }
                }
                else if (y < groundHeight && y >= roofHeight)
                {
                    // Air layer between ground and roof
                    w.Tiles[x, y] = new Tile { IsActive = false };
                }
                else if (y < roofHeight)
                {
                    // Roof layer
                    w.Tiles[x, y] = new Tile
                    {
                        IsActive = true,
                        Type = (ushort)Tile.TileType.AshBlock // Use StoneBlock for underworld roof
                    };
                }
            }
        }
    }
    #endregion

    #region Worldgen Perlin Noise

    // This class implements Perlin noise for procedural generation of terrain or textures.
    public class PerlinNoise
    {
        private readonly int[] _permutation;

        // Default permutation table used in the generation of noise.
        private static readonly int[] _defaultPermutation = {
                151,160,137,91,90,15,
                131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
                8,99,37,240,21,10,23,190, 6,148,247,120,234,75,0,26,197,62,94,252,
                219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,
                168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
                60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54, 65,25,63,161,
                1,216,80,73,209,76,132,187,208, 89,18,169,200,196,135,130,116,188,159,
                86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,5,202,38,147,
                118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,
                170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,
                129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,
                97,228,251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,
                249,14,239,107,49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,
                50,45,127, 4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,
                195,78,66,215,61,156,180
            };

        // Constructor initializes the permutation table with a seed.
        public PerlinNoise(int seed)
        {
            _permutation = new int[512];
            Random rand = new(seed);

            // Copy default permutation to the start of the permutation array.
            for (int i = 0; i < 256; i++)
                _permutation[i] = _defaultPermutation[i];

            // Shuffle the permutation table with the given seed.
            for (int i = 0; i < 256; i++)
            {
                int j = rand.Next(256);
                int swap = _permutation[i];
                _permutation[i] = _permutation[j];
                _permutation[j] = swap;
            }

            // Duplicate the permutation array to handle wrap-around at edges.
            for (int i = 0; i < 256; i++)
                _permutation[256 + i] = _permutation[i];
        }

        // Computes the Perlin noise value for the given coordinates (x, y).
        public double Noise(double x, double y)
        {
            // Determine grid cell coordinates.
            int X = (int)Math.Floor(x) & 255;
            int Y = (int)Math.Floor(y) & 255;

            // Relative coordinates within the grid cell.
            x -= Math.Floor(x);
            y -= Math.Floor(y);

            // Fade functions to smooth the coordinate values.
            double u = Fade(x);
            double v = Fade(y);

            // Hash coordinates to determine which gradient vectors to use.
            int A = (_permutation[X] + Y) & 255;
            int B = (_permutation[X + 1] + Y) & 255;

            // Perform bilinear interpolation between gradient vectors.
            return Lerp(v, Lerp(u, Grad(_permutation[A], x, y),
                                   Grad(_permutation[B], x - 1, y)),
                           Lerp(u, Grad(_permutation[A + 1], x, y - 1),
                                   Grad(_permutation[B + 1], x - 1, y - 1)));
        }

        // Fade function to smooth the coordinate values.
        private static double Fade(double t)
        {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        // Linear interpolation function.
        private static double Lerp(double t, double a, double b)
        {
            return a + t * (b - a);
        }

        // Gradient function that calculates the dot product between a gradient vector and the coordinate.
        private static double Grad(int hash, double x, double y)
        {
            int h = hash & 15;
            double u = h < 8 ? x : y;
            double v = h < 4 ? y : h == 12 || h == 14 ? x : 0;
            return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
        }
    }
    #endregion


}
