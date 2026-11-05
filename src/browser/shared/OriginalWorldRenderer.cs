// Original TEdit MS-PL source; generated from pinned source-reader data. Platform aliases only.
using TEdit.Terraria;
using TEdit.Terraria.Objects;
using TEdit.Terraria.DataModel;
using TEdit.Terraria.Render;
using TEdit.Geometry;
using TEdit.Common;
using TEdit.Render;
using TEdit.ViewModel;
using TEdit.Editor;
using TEdit.Editor.Tools;
using TEdit.Editor.Clipboard;
using TEdit.Port.Rendering;
using Color=TEdit.Common.TEditColor;
using Rectangle=TEdit.Geometry.RectangleInt32;
using Vector2=System.Numerics.Vector2;
using Texture=TEdit.Port.Rendering.Texture2D;
using Size=TEdit.Port.Rendering.ViewSize;
namespace TEdit.Port;
public sealed partial class OriginalWorldRenderer {

    private static Color Translucent = new Color(255, 255, 255, 92);


    private const float LayerTilePixels = 1 - 0;

    private const float LayerBackgroundGradient = 1 - 0.005f;  // Depth zone colors (panning)

    private const float LayerTileBackgroundTextures = 1 - 0.01f;

    private const float LayerTileWallTextures = 1 - 0.02f;

    private const float LayerTileTrackBack = 1 - 0.03f;

    private const float LayerTileSlopeLiquid = 1 - 0.035f;

    private const float LayerTileTextures = 1 - 0.04f;

    private const float LayerTileGlowMask = 1 - 0.045f;

    private const float LayerTileTrack = 1 - 0.05f;

    private const float LayerDollBody = 1 - 0.048f; // Body behind armor (higher depth = further back in BackToFront)

    private const float LayerTileActuator = 1 - 0.06f;

    private const float LayerLiquid = 1 - 0.07f;

    private const float LayerRedWires = 1 - 0.08f;

    private const float LayerBlueWires = 1 - 0.09f;

    private const float LayerGreenWires = 1 - 0.10f;

    private const float LayerYellowWires = 1 - 0.11f;

    private const float LayerBuffRadii = 1 - 0.12f;

    private const float LayerWireTraceHighlight = 1 - 0.13f;


    private const float LayerGrid = 1 - 0.15f;

    private const float LayerWorldBorder = 1 - 0.17f;

    private const float LayerNbtOverlay = 1 - 0.19f;

    private const float LayerLocations = 1 - 0.20f;

    private const float LayerSelection = 1 - 0.25f;

    private const float LayerPastePreview = 1 - 0.27f;

    private const float LayerPasteBorder = 1 - 0.28f;

    private const float LayerTools = 1 - 0.30f;

    private const float LayerFindCrosshair = 1 - 0.35f;


    private Color _backgroundColor = Color.FromNonPremultiplied(32, 32, 32, 255);

    private Vector2 _scrollPosition = new Vector2(0, 0);

    private Texture2D _preview;

    private Dictionary<string, Texture2D> _textures = new Dictionary<string, Texture2D>();

    private Texture2D _pasteBorderH;   // horizontal dashed line (Nx1)

    private Texture2D _pasteBorderV;   // vertical dashed line   (1xN)

    private Texture2D _pasteHandleTexture;

    private ClipboardTiledPreview _pasteTiledPreview;

    private ClipboardBuffer _pasteTiledBuffer; // tracks which buffer the tiles were generated from

    private float _zoom = 1;

    private Size? _exportViewSize;

    private float _minNpcScale = 0.75f;


    // Vine tile IDs that need -2px Y offset and horizontal flip on alternating X
    private static readonly HashSet<int> _vineTileIds = new HashSet<int> { 52, 62, 115, 205, 382, 528, 636, 638 };


    // Grass/plant tiles that need horizontal flip on alternating X (includes vines)
    // Reference: docs/custom-rendered-tiles.md Section 5
    private static readonly HashSet<int> _spriteFlipTileIds = new HashSet<int>
    {
        3, 20, 24, 52, 61, 62, 71, 73, 74, 81, 82, 83, 84, 110, 113, 115, 127,
        201, 205, 227, 270, 271, 382, 528, 572, 581, 590, 595, 636, 637, 638, 703
    };


    // Selected chest position cache - used to render the selected chest as "open"
    // Set to (-1, -1) when no chest is selected
    private Vector2Int32 _selectedChestPosition = new Vector2Int32(-1, -1);


    // Gem tree tile IDs (583-589): Topaz, Amethyst, Sapphire, Emerald, Ruby, Diamond, Amber
    // These render like normal trees but with fixed texture indices 22-28
    private static readonly HashSet<int> _gemTreeTileIds = new HashSet<int> { 583, 584, 585, 586, 587, 588, 589 };


    // Vanity tree tile IDs (596 Sakura, 616 Willow)
    private static readonly HashSet<int> _vanityTreeTileIds = new HashSet<int> { 596, 616 };


    // Ash tree tile ID (634) - has glow mask overlay
    private const int AshTreeTileId = 634;


    // Cache for surface biome detection per X column
    private Dictionary<int, SurfaceBiome> _surfaceBiomeCache = new();

    private World _biomeCacheWorld = null;

    private const int DollFrameWidth = 40;

    private const int DollFrameHeight = 56;


    static int[,] backstyle = new int[10, 7]
    {
        {66, 67, 68, 69, 128, 125, 185},       // 0: Stone
        {70, 71, 68, 72, 128, 125, 185},       // 1: Gray
        {73, 74, 75, 76, 131, 125, 185},       // 2: Brown (hell transition: 131)
        {77, 78, 79, 80, 134, 125, 185},       // 3: Blue
        {77, 81, 79, 82, 134, 125, 185},       // 4: Blue Alt
        {83, 84, 85, 86, 137, 125, 185},       // 5: Green
        {83, 87, 88, 89, 137, 125, 185},       // 6: Green Alt
        {121, 122, 123, 124, 140, 125, 185},   // 7: Purple
        {153, 147, 148, 149, 150, 125, 185},   // 8: Jungle 0
        {146, 154, 155, 156, 157, 125, 185}    // 9: Jungle 1
    };


    // Underworld texture indices that are 2x2 sprite sheets (stable since 1.3)
    private static readonly HashSet<int> _underworldSpriteSheets = new() { 1, 6, 7, 8, 13 };


    private Tile?[] neighborTile = new Tile?[8];

    const int e = 0, n = 1, w = 2, s = 3, ne = 4, nw = 5, sw = 6, se = 7;


    Texture2D wallTex;

    Texture2D tileTex;


    /// <summary>
    /// Surface biome types for background selection.
    /// </summary>
    private enum SurfaceBiome
    {
        Forest,
        Ocean,
        Desert,
        Snow,
        Jungle,
        Mushroom,
        Corruption,
        Crimson,
        Hallow
    }


    public bool AreTexturesVisible() => _zoom > _wvm.TextureVisibilityZoomLevel;

    /// <summary>
    /// Checks if a tile type is a tree that renders foliage (top/branches).
    /// Includes normal trees (5), gem trees (583-589), vanity trees (596, 616), and ash trees (634).
    /// </summary>
    private static bool IsTreeWithFoliage(int tileType)
    {
        return tileType == (int)TileType.Tree ||
               _gemTreeTileIds.Contains(tileType) ||
               _vanityTreeTileIds.Contains(tileType) ||
               tileType == AshTreeTileId;
    }

    /// <summary>
    /// Gets the tree top/branch texture index for gem trees.
    /// Gem trees use texture indices 22-28 (type - 583 + 22).
    /// </summary>
    private static int GetGemTreeStyle(int tileType)
    {
        return tileType - 583 + 22;
    }

    /// <summary>
    /// Gets the tree top/branch texture index for vanity trees.
    /// 596 (Sakura) = 29, 616 (Willow) = 30
    /// </summary>
    private static int GetVanityTreeStyle(int tileType)
    {
        return tileType == 596 ? 29 : 30;
    }

    /// <summary>
    /// Gets the tree top/branch texture index for ash trees.
    /// Ash tree (634) = 31
    /// </summary>
    private static int GetAshTreeStyle()
    {
        return 31;
    }

    /// <summary>
    /// Gets cached surface biome for an X position, detecting if not cached.
    /// </summary>
    private SurfaceBiome GetCachedSurfaceBiome(int x, int y)
    {
        // Clear cache if world changed
        if (_biomeCacheWorld != _wvm.CurrentWorld)
        {
            _surfaceBiomeCache.Clear();
            _biomeCacheWorld = _wvm.CurrentWorld;
        }

        if (!_surfaceBiomeCache.TryGetValue(x, out var biome))
        {
            // Use a single-column bounds centered on x, scanning from y to ground level
            var bounds = new Rectangle(x, y, 1, Math.Max(1, (int)_wvm.CurrentWorld.GroundLevel - y + 10));
            biome = DetectSurfaceBiomeAtColumn(x, bounds);
            _surfaceBiomeCache[x] = biome;
        }

        return biome;
    }

    /// <summary>
    /// Detects the surface biome across the visible area by sampling multiple columns
    /// and picking the majority biome. Avoids flickering when a single column lands
    /// on an atypical tile.
    /// </summary>
    private SurfaceBiome DetectSurfaceBiome(Rectangle visibleBounds)
    {
        var world = _wvm.CurrentWorld;

        int left = Math.Clamp(visibleBounds.Left, 0, world.TilesWide - 1);
        int right = Math.Clamp(visibleBounds.Right, 0, world.TilesWide - 1);
        int width = right - left;

        // Sample up to 7 columns spread across the visible area
        int sampleCount = Math.Min(7, Math.Max(1, width));
        int step = Math.Max(1, width / sampleCount);

        // Tally votes per biome
        var votes = new Dictionary<SurfaceBiome, int>();

        for (int i = 0; i < sampleCount; i++)
        {
            int sampleX = left + i * step;
            var biome = DetectSurfaceBiomeAtColumn(sampleX, visibleBounds);
            votes.TryGetValue(biome, out int count);
            votes[biome] = count + 1;
        }

        // Return biome with the most votes
        SurfaceBiome best = SurfaceBiome.Forest;
        int bestCount = 0;
        foreach (var kv in votes)
        {
            if (kv.Value > bestCount)
            {
                bestCount = kv.Value;
                best = kv.Key;
            }
        }
        return best;
    }

    /// <summary>
    /// Detects the surface biome at a single column by checking tile types below the surface.
    /// </summary>
    private SurfaceBiome DetectSurfaceBiomeAtColumn(int x, Rectangle visibleBounds)
    {
        var world = _wvm.CurrentWorld;

        // Ocean: at world edges (within ~380 tiles)
        int oceanDistance = 380;
        if (x < oceanDistance || x > world.TilesWide - oceanDistance)
        {
            return SurfaceBiome.Ocean;
        }

        // Sample tiles vertically from visible top down to ground level
        int startY = Math.Max(0, visibleBounds.Top);
        int endY = Math.Min(world.TilesHigh - 1, (int)world.GroundLevel + 10);

        for (int checkY = startY; checkY <= endY; checkY++)
        {
            if (x < 0 || x >= world.TilesWide) continue;
            var tile = world.Tiles[x, checkY];
            if (!tile.IsActive) continue;

            switch (tile.Type)
            {
                // Snow biome tiles (check first - ice variants overlap with evil biomes)
                case 147: // Ice
                case 161: // Snow Block
                    return SurfaceBiome.Snow;

                // Jungle biome tiles
                case 60:  // Jungle Grass
                case 226: // Lihzahrd Brick
                    return SurfaceBiome.Jungle;

                // Desert biome tiles
                case 53:  // Sand
                    return SurfaceBiome.Desert;

                // Corruption biome tiles
                case 23:  // Corrupt Grass
                case 25:  // Ebonstone
                case 112: // Ebonsand
                case 163: // Purple Ice
                    return SurfaceBiome.Corruption;

                // Crimson biome tiles
                case 199: // Crimson Grass
                case 203: // Crimson Grass (alternate ID)
                case 200: // Red Ice
                case 208: // Crimstone
                case 234: // Crimsand
                    return SurfaceBiome.Crimson;

                // Hallow biome tiles
                case 109: // Hallowed Grass
                case 117: // Pearlstone
                case 116: // Pearlsand
                case 164: // Pink Ice
                    return SurfaceBiome.Hallow;

                // Mushroom biome tiles
                case 70:  // Mushroom Grass
                case 190: // Glowing Mushroom Block
                    return SurfaceBiome.Mushroom;
            }
        }

        // Default: Forest
        return SurfaceBiome.Forest;
    }

    /// <summary>
    /// Gets the full background style for a detected biome and X position.
    /// </summary>
    private BackgroundStyle GetBiomeBackgroundStyle(SurfaceBiome biome, int x)
    {
        var world = _wvm.CurrentWorld;
        var bgConfig = WorldConfiguration.BackgroundStyles;
        if (bgConfig == null) return null;

        BackgroundStyle style = null;

        switch (biome)
        {
            case SurfaceBiome.Ocean:
                bgConfig.OceanBackgroundById.TryGetValue(world.BgOcean, out style);
                break;
            case SurfaceBiome.Desert:
                bgConfig.DesertBackgroundById.TryGetValue(world.BgDesert, out style);
                break;
            case SurfaceBiome.Snow:
                bgConfig.SnowBackgroundById.TryGetValue(world.BgSnow, out style);
                break;
            case SurfaceBiome.Jungle:
                bgConfig.JungleBackgroundById.TryGetValue(world.BgJungle, out style);
                break;
            case SurfaceBiome.Mushroom:
                bgConfig.MushroomBackgroundById.TryGetValue(world.MushroomBg, out style);
                break;
            case SurfaceBiome.Corruption:
                bgConfig.CorruptionBackgroundById.TryGetValue(world.BgCorruption, out style);
                break;
            case SurfaceBiome.Crimson:
                bgConfig.CrimsonBackgroundById.TryGetValue(world.BgCrimson, out style);
                break;
            case SurfaceBiome.Hallow:
                bgConfig.HallowBackgroundById.TryGetValue(world.BgHallow, out style);
                break;
            case SurfaceBiome.Forest:
            default:
                // Use regional forest backgrounds
                byte bgValue = (x <= world.TreeX0) ? world.BgTree :
                               (x <= world.TreeX1) ? world.BgTree2 :
                               (x <= world.TreeX2) ? world.BgTree3 :
                               world.BgTree4;
                bgConfig.ForestBackgroundById.TryGetValue(bgValue, out style);
                break;
        }

        return style;
    }

    /// <summary>
    /// Draws the depth zone gradient background (Space, Sky, Earth, Rock, Hell).
    /// This layer pans with the world and is behind the fixed surface background texture.
    /// </summary>
    private void DrawBackgroundGradient()
    {
        if (_wvm.CurrentWorld == null) return;

        Rectangle visibleBounds = GetViewingArea();
        var world = _wvm.CurrentWorld;

        // Get the depth zone boundaries
        int spaceBottom = 80;
        int skyBottom = (int)world.GroundLevel;
        int earthBottom = (int)world.RockLevel;
        int hellTop = world.TilesHigh - 192;

        // Get colors for each zone (with fallbacks)
        var globalColors = WorldConfiguration.GlobalColors;
        var spaceColor = globalColors.TryGetValue("Space", out var c1) ? ToXnaColor(c1) : new Color(51, 102, 153);
        var skyColor = globalColors.TryGetValue("Sky", out var c2) ? ToXnaColor(c2) : new Color(155, 209, 255);
        var earthColor = globalColors.TryGetValue("Earth", out var c3) ? ToXnaColor(c3) : new Color(84, 57, 42);
        var rockColor = globalColors.TryGetValue("Rock", out var c4) ? ToXnaColor(c4) : new Color(72, 64, 57);
        var hellColor = globalColors.TryGetValue("Hell", out var c5) ? ToXnaColor(c5) : new Color(51, 0, 0);

        // Use a 1x1 white texture for solid color rectangles
        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        // Helper to draw a depth zone
        void DrawZone(int worldTop, int worldBottom, Color color)
        {
            // Clamp to visible bounds
            int top = Math.Max(worldTop, visibleBounds.Top);
            int bottom = Math.Min(worldBottom, visibleBounds.Bottom);
            if (top >= bottom) return;

            // Convert to screen coordinates (panning with world)
            float fLeft = (_scrollPosition.X + visibleBounds.Left) * _zoom;
            float fRight = (_scrollPosition.X + visibleBounds.Right) * _zoom;
            float fTop = (_scrollPosition.Y + top) * _zoom;
            float fBottom = (_scrollPosition.Y + bottom) * _zoom;

            var dest = new Rectangle(
                (int)Math.Round(fLeft),
                (int)Math.Round(fTop),
                (int)Math.Round(fRight - fLeft),
                (int)Math.Round(fBottom - fTop));
            _spriteBatch.Draw(whiteTex, dest, null, color, 0f, default, SpriteEffects.None, LayerBackgroundGradient);
        }

        // Draw each depth zone (from top to bottom)
        DrawZone(0, spaceBottom, spaceColor);
        DrawZone(spaceBottom, skyBottom, skyColor);
        DrawZone(skyBottom, earthBottom, earthColor);
        DrawZone(earthBottom, hellTop, rockColor);
        DrawZone(hellTop, world.TilesHigh, hellColor);
    }

    /// <summary>
    /// Converts TEditColor to XNA Color.
    /// </summary>
    private static Color ToXnaColor(TEditColor c)
    {
        return new Color(c.R, c.G, c.B, c.A);
    }

    /// <summary>
    /// Applies render position offsets for special tiles (vines, position offset tiles).
    /// Reference: docs/custom-rendered-tiles.md and TileDrawing.cs
    /// </summary>
    private static void ApplyTileRenderOffset(ref Rectangle dest, int tileType, short frameX, short frameY, float zoom)
    {
        float scale = zoom / 16f;

        // Vine tiles: -2px Y offset
        if (_vineTileIds.Contains(tileType))
            dest.Y -= (int)(2 * scale);

        // Position offset tiles
        switch (tileType)
        {
            case 114: // Tiki Torch - height +2px when frameY > 0
                if (frameY > 0)
                    dest.Y += (int)(2 * scale);
                break;
            case 136: // Switch - X offset based on frameX
                dest.X += (int)((frameX / 18 == 0 ? -2 : 2) * scale);
                break;
            case 442: // Item Pedestal - X +2px when frameX/22 == 3
                if (frameX / 22 == 3)
                    dest.X += (int)(2 * scale);
                break;
            case 723: // Echo Block variant 1
                if (frameX == 0)
                    dest.Y += (int)(2 * scale);
                else if (frameX == 18)
                    dest.Y -= (int)(2 * scale);
                break;
            case 724: // Echo Block variant 2
                if (frameY == 0)
                    dest.X += (int)(2 * scale);
                else if (frameY == 18)
                    dest.X -= (int)(2 * scale);
                break;
            case 733: // Radio Thing - tileTop = 2
                dest.Y -= (int)(2 * scale);
                break;
            // Note: Tiles 751 (Sleeping Digtoise) and 752 (Chillet Egg) are handled
            // by custom rendering code in DrawTileTextures and PreviewConfig
        }
    }

    /// <summary>
    /// Applies render position offsets for preview (uses Vector2 ref).
    /// </summary>
    private static void ApplyTileRenderOffset(ref Vector2 position, int tileType, short frameX, short frameY, float zoom)
    {
        float scale = zoom / 16f;

        // Vine tiles: -2px Y offset
        if (_vineTileIds.Contains(tileType))
            position.Y -= 2 * scale;

        // Position offset tiles
        switch (tileType)
        {
            case 114: // Tiki Torch - height +2px when frameY > 0
                if (frameY > 0)
                    position.Y += 2 * scale;
                break;
            case 136: // Switch - X offset based on frameX
                position.X += (frameX / 18 == 0 ? -2 : 2) * scale;
                break;
            case 442: // Item Pedestal - X +2px when frameX/22 == 3
                if (frameX / 22 == 3)
                    position.X += 2 * scale;
                break;
            case 723: // Echo Block variant 1
                if (frameX == 0)
                    position.Y += 2 * scale;
                else if (frameX == 18)
                    position.Y -= 2 * scale;
                break;
            case 724: // Echo Block variant 2
                if (frameY == 0)
                    position.X += 2 * scale;
                else if (frameY == 18)
                    position.X -= 2 * scale;
                break;
            case 733: // Radio Thing - tileTop = 2
                position.Y -= 2 * scale;
                break;
            // Note: Tiles 751 (Sleeping Digtoise) and 752 (Chillet Egg) are handled
            // by custom rendering code in DrawTileTextures and PreviewConfig
        }
    }

    /// <summary>
    /// Gets the rarity color for an item based on its rarity name.
    /// Uses global colors from configuration, falls back to blue.
    /// </summary>
    private Color GetRarityColor(string rarityName)
    {
        if (string.IsNullOrEmpty(rarityName))
            rarityName = "Blue";

        // Global colors use "Rarity_" prefix
        string colorName = "Rarity_" + rarityName;

        if (WorldConfiguration.GlobalColors.TryGetValue(colorName, out var teditColor))
        {
            return new Color(teditColor.R, teditColor.G, teditColor.B, teditColor.A);
        }

        // Fallback to default blue
        return new Color(150, 150, 255);
    }

    private void DrawTileEntities()
    {
        Texture2D tileTex;
        Tile curtile;
        int x;
        int y;
        Rectangle source;
        Rectangle visibleBounds = GetViewingArea();

        foreach (var te in _wvm.CurrentWorld.TileEntities.ToArray())
        {
            if (!visibleBounds.Contains(te.PosX, te.PosY)) continue;

            curtile = _wvm.CurrentWorld.Tiles[te.PosX, te.PosY];
            x = te.PosX;
            y = te.PosY;
            switch (te.EntityType)
            {
                case TileEntityType.TrainingDummy:
                    break;
                case TileEntityType.DeadCellsDisplayJar:
                    // Handled in DrawTileTextures
                    break;
                case TileEntityType.ItemFrame:
                    {
                        int weapon = te.NetId;
                        if (weapon == 0) continue;
                        tileTex = (Texture2D)_textureDictionary.GetItem(weapon);
                        SpriteEffects effect = curtile.U == 0 ? SpriteEffects.FlipHorizontally : SpriteEffects.None;
                        WorldConfiguration.ItemLookupTable.TryGetValue(weapon, out var itemProps);
                        float scale = itemProps?.Scale ?? 1.0f;
                        source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                        _spriteBatch.Draw(
                            tileTex,
                            new Vector2(1 + (int)((_scrollPosition.X + x + 1) * _zoom), 1 + (int)((_scrollPosition.Y + y + 1) * _zoom)),
                            source,
                            Color.White,
                            0f,
                            new Vector2((float)(tileTex.Width / 2), (float)(tileTex.Height / 2)),
                            scale * _zoom / 16f, effect, LayerTileTrack);
                    }
                    break;
                case TileEntityType.LogicSensor:
                    break;
                case TileEntityType.DisplayDoll:
                    {
                        if (te.Items == null || te.Items.Count == 0) break;

                        Rectangle dest;
                        // Origin tile U: 0=male-left, 36=male-right, 72=female-left, 108=female-right
                        bool isWomannequin = curtile.U / 72 == 1;
                        bool facingRight = curtile.U % 72 == 36;
                        SpriteEffects dollEffect = facingRight ? SpriteEffects.None : SpriteEffects.FlipHorizontally;

                        // Draw body skin under armor
                        int skinVariant = isWomannequin ? 11 : 10;
                        bool isFemale = isWomannequin;
                        DrawDollBody(x, y, skinVariant, isFemale, te.Pose, dollEffect);

                        // Get pose-adjusted frame offsets for armor textures
                        var (bodyFrameY, legFrameY, yPixelOffset) = GetDollPoseFrames(te.Pose);
                        float poseYOff = yPixelOffset * _zoom / 16f;

                        // Render head (Items[0])
                        var headItem = te.Items.Count > 0 ? te.Items[0] : null;
                        if (headItem != null && headItem.Id > 0 && headItem.StackSize > 0)
                        {
                            WorldConfiguration.ItemLookupTable.TryGetValue(headItem.Id, out var headProps);
                            int? headSlot = headProps?.Head;
                            if (headSlot != null)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetArmorHead(headSlot.Value);
                                if (tileTex != null && tileTex != _textureDictionary.DefaultTexture)
                                {
                                    source = new Rectangle(2, bodyFrameY, 36, 36);
                                    if (source.Bottom <= tileTex.Height)
                                    {
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom),
                                            (int)_zoom, (int)_zoom);
                                        dest.Width = (int)(_zoom * source.Width / 16f);
                                        dest.Height = (int)(_zoom * source.Height / 16f);
                                        dest.Y += (int)(((16 - source.Height - 4) / 2F) * _zoom / 16 + poseYOff);
                                        dest.X -= (int)(2 * _zoom / 16);
                                        _spriteBatch.Draw(tileTex, dest, source, Color.White, 0f, default, dollEffect, LayerTileTrack);
                                    }
                                }
                            }
                        }

                        // Render body (Items[1])
                        var bodyItem = te.Items.Count > 1 ? te.Items[1] : null;
                        if (bodyItem != null && bodyItem.Id > 0 && bodyItem.StackSize > 0)
                        {
                            WorldConfiguration.ItemLookupTable.TryGetValue(bodyItem.Id, out var bodyProps);
                            int? bodySlot = bodyProps?.Body;
                            if (bodySlot != null)
                            {
                                // Try female body first for womannequin, fall back to male body
                                tileTex = isWomannequin
                                    ? (Texture2D)_textureDictionary.GetArmorFemale(bodySlot.Value)
                                    : null;
                                if (tileTex == null || tileTex == _textureDictionary.DefaultTexture)
                                    tileTex = (Texture2D)_textureDictionary.GetArmorBody(bodySlot.Value);
                                if (tileTex != null && tileTex != _textureDictionary.DefaultTexture)
                                {
                                    source = new Rectangle(2, bodyFrameY, 36, 54);
                                    if (source.Bottom <= tileTex.Height)
                                    {
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom),
                                            1 + (int)((_scrollPosition.Y + y + 1) * _zoom),
                                            (int)_zoom, (int)_zoom);
                                        dest.Width = (int)(_zoom * source.Width / 16f);
                                        dest.Height = (int)(_zoom * source.Height / 16f);
                                        dest.Y += (int)(((16 - source.Height - 18) / 2F) * _zoom / 16 + poseYOff);
                                        dest.X -= (int)(2 * _zoom / 16);
                                        _spriteBatch.Draw(tileTex, dest, source, Color.White, 0f, default, dollEffect, LayerTileTrack);
                                    }
                                }
                            }
                        }

                        // Render legs (Items[2]) — skip when sitting (legs hidden behind seat)
                        bool isSittingPose = (DisplayDollPoseID)te.Pose == DisplayDollPoseID.Sitting;
                        if (!isSittingPose)
                        {
                            var legsItem = te.Items.Count > 2 ? te.Items[2] : null;
                            if (legsItem != null && legsItem.Id > 0 && legsItem.StackSize > 0)
                            {
                                WorldConfiguration.ItemLookupTable.TryGetValue(legsItem.Id, out var legsProps);
                                int? legsSlot = legsProps?.Legs;
                                if (legsSlot != null)
                                {
                                    tileTex = (Texture2D)_textureDictionary.GetArmorLegs(legsSlot.Value);
                                    if (tileTex != null && tileTex != _textureDictionary.DefaultTexture)
                                    {
                                        source = new Rectangle(2, legFrameY + 42, 36, 12);
                                        if (source.Bottom <= tileTex.Height)
                                        {
                                            dest = new Rectangle(
                                                1 + (int)((_scrollPosition.X + x) * _zoom),
                                                1 + (int)((_scrollPosition.Y + y + 2) * _zoom),
                                                (int)_zoom, (int)_zoom);
                                            dest.Width = (int)(_zoom * source.Width / 16f);
                                            dest.Height = (int)(_zoom * source.Height / 16f);
                                            dest.Y -= (int)(2 * _zoom / 16 - poseYOff);
                                            dest.X -= (int)(2 * _zoom / 16);
                                            _spriteBatch.Draw(tileTex, dest, source, Color.White, 0f, default, dollEffect, LayerTileTrack);
                                        }
                                    }
                                }
                            }
                        }

                        // TODO: Accessory rendering disabled — needs frame offset work
                        // for (int accIdx = 3; accIdx <= 7 && accIdx < te.Items.Count; accIdx++)
                        // {
                        //     var accItem = te.Items[accIdx];
                        //     if (accItem == null || accItem.Id <= 0 || accItem.StackSize <= 0) continue;
                        //     if (!WorldConfiguration.ItemLookupTable.TryGetValue(accItem.Id, out var accProps)) continue;
                        //     DrawDollAccessory(x, y, accProps, dollEffect);
                        // }

                        // Render weapon from Misc[0] if present
                        if (te.Misc != null && te.Misc.Count > 0)
                        {
                            var weapon = te.Misc[0];
                            if (weapon != null && weapon.Id > 0 && weapon.StackSize > 0)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetItem(weapon.Id);
                                if (tileTex != null)
                                {
                                    WorldConfiguration.ItemLookupTable.TryGetValue(weapon.Id, out var weaponProps);
                                    float weaponScale = weaponProps?.Scale ?? 1.0f;

                                    float maxDim = Math.Max(tileTex.Width, tileTex.Height) * weaponScale;
                                    if (maxDim > 32)
                                        weaponScale *= 32f / maxDim;

                                    // Position weapon on the front-hand side of the doll
                                    // Doll center is at x+1 (2-tile wide entity)
                                    float weaponX = facingRight ? (x + 1.5f) : (x + 0.5f);
                                    float weaponY = y + 1.5f;

                                    // Adjust Y for pose: sitting shifts down, Use poses shift up
                                    var poseId = (DisplayDollPoseID)te.Pose;
                                    if (poseId == DisplayDollPoseID.Sitting)
                                        weaponY += 14f / 16f;
                                    else if (poseId >= DisplayDollPoseID.Use1 && poseId <= DisplayDollPoseID.Use5)
                                        weaponY -= 0.25f; // weapon raised slightly during use animations

                                    Vector2 weaponPos = new Vector2(
                                        1 + (int)((_scrollPosition.X + weaponX) * _zoom),
                                        1 + (int)((_scrollPosition.Y + weaponY) * _zoom));

                                    source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                                    _spriteBatch.Draw(tileTex, weaponPos, source, Color.White, 0f,
                                        new Vector2(tileTex.Width / 2f, tileTex.Height / 2f),
                                        weaponScale * _zoom / 16f, dollEffect, LayerTileTrack);
                                }
                            }
                        }
                    }
                    break;
                case TileEntityType.WeaponRack:
                    {
                        int weapon = te.NetId;
                        if (weapon == 0) continue;

                        tileTex = (Texture2D)_textureDictionary.GetItem(weapon);
                        int flip = curtile.U / 54;
                        float scale = 1f;
                        y++;
                        if (tileTex.Width > 40 || tileTex.Height > 40)
                        {
                            if (tileTex.Width > tileTex.Height)
                                scale = 40f / (float)tileTex.Width;
                            else
                                scale = 40f / (float)tileTex.Height;
                        }
                        if (WorldConfiguration.ItemLookupTable.TryGetValue(weapon, out var itemProps))
                        {
                            scale *= itemProps?.Scale ?? 1.0f;
                        }
                        source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                        SpriteEffects effect = SpriteEffects.None;
                        if (flip >= 3)
                        {
                            effect = SpriteEffects.FlipHorizontally;
                        }
                        _spriteBatch.Draw(tileTex, new Vector2(1 + (int)((_scrollPosition.X + x + 1.5) * _zoom), 1 + (int)((_scrollPosition.Y + y + .5) * _zoom)), source, Color.White, 0f, new Vector2((float)(tileTex.Width / 2), (float)(tileTex.Height / 2)), scale * _zoom / 16f, effect, LayerTileTrack);
                    }
                    break;
                case TileEntityType.HatRack:
                    {
                        if (te.Items == null || te.Items.Count == 0) break;

                        Rectangle dest;
                        // Hat rack is 3 tiles wide x 4 tiles tall
                        // U=0 normal (pegs on right side), U=54 flipped (pegs on left side)
                        bool isFlipped = curtile.U >= 54;
                        SpriteEffects rackEffect = isFlipped ? SpriteEffects.FlipHorizontally : SpriteEffects.None;

                        // Items[0] = upper peg hat, Items[1] = lower peg hat
                        // Upper peg: ~1 tile from top, Lower peg: ~2.5 tiles from top
                        // X position: pegs are on one side of the 3-wide rack, mirrored when flipped
                        float upperPegX = isFlipped ? 0.75f : 1.75f;
                        float lowerPegX = isFlipped ? 1.25f : 1.25f;
                        float upperPegY = 0.75f;
                        float lowerPegY = 2.25f;

                        float[] pegX = { upperPegX, lowerPegX };
                        float[] pegY = { upperPegY, lowerPegY };

                        for (int i = 0; i < 2 && i < te.Items.Count; i++)
                        {
                            var hatItem = te.Items[i];
                            if (hatItem == null || hatItem.Id <= 0 || hatItem.StackSize <= 0) continue;

                            WorldConfiguration.ItemLookupTable.TryGetValue(hatItem.Id, out var hatProps);
                            int? hatSlot = hatProps?.Head;
                            if (hatSlot != null)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetArmorHead(hatSlot.Value);
                                if (tileTex != null && tileTex != _textureDictionary.DefaultTexture)
                                {
                                    source = new Rectangle(2, 0, 36, 36);
                                    dest = new Rectangle(
                                        1 + (int)((_scrollPosition.X + x + pegX[i]) * _zoom),
                                        1 + (int)((_scrollPosition.Y + y + pegY[i]) * _zoom),
                                        (int)_zoom, (int)_zoom);
                                    dest.Width = (int)(_zoom * source.Width / 16f);
                                    dest.Height = (int)(_zoom * source.Height / 16f);
                                    dest.X -= (int)(source.Width / 2f * _zoom / 16f);
                                    dest.Y += (int)(((16 - source.Height - 4) / 2F) * _zoom / 16);
                                    _spriteBatch.Draw(tileTex, dest, source, Color.White, 0f, default, rackEffect, LayerTileTrack);
                                }
                            }
                            else
                            {
                                // Non-hat item: fall back to item icon
                                tileTex = (Texture2D)_textureDictionary.GetItem(hatItem.Id);
                                if (tileTex != null)
                                {
                                    float scale = hatProps?.Scale ?? 1.0f;
                                    float maxDim = Math.Max(tileTex.Width, tileTex.Height) * scale;
                                    if (maxDim > 24)
                                        scale *= 24f / maxDim;

                                    Vector2 pos = new Vector2(
                                        1 + (int)((_scrollPosition.X + x + pegX[i]) * _zoom),
                                        1 + (int)((_scrollPosition.Y + y + pegY[i]) * _zoom));

                                    source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                                    _spriteBatch.Draw(tileTex, pos, source, Color.White, 0f,
                                        new Vector2(tileTex.Width / 2f, tileTex.Height / 2f),
                                        scale * _zoom / 16f, rackEffect, LayerTileTrack);
                                }
                            }
                        }
                    }
                    break;
                case TileEntityType.FoodPlatter:
                    break;
                case TileEntityType.TeleportationPylon:
                    break;
                case TileEntityType.KiteAnchor:
                    {
                        if (te.NetId <= 0) break;

                        var kiteTile = _wvm.CurrentWorld.Tiles[te.PosX, te.PosY];
                        if (!kiteTile.IsActive || kiteTile.Type != (int)TileType.KiteAnchor)
                            break;

                        var itemTex = (Texture2D)_textureDictionary.GetItem(te.NetId);
                        if (itemTex == null || itemTex == _textureDictionary.DefaultTexture)
                            break;

                        // Get item scale from lookup table
                        float scale = 1f;
                        if (WorldConfiguration.ItemLookupTable.TryGetValue(te.NetId, out var itemProps) && itemProps.Scale > 0)
                            scale = itemProps.Scale;

                        // For animated items (height > width * 3), only show first frame
                        int sourceHeight = itemTex.Height;
                        if (itemTex.Height > itemTex.Width * 3)
                            sourceHeight = itemTex.Width; // First frame height = width (common pattern)

                        // Calculate position - center item 1 tile above anchor so kite doesn't overlap
                        int drawX = (int)((_scrollPosition.X + te.PosX + 0.5f) * _zoom);
                        int drawY = (int)((_scrollPosition.Y + te.PosY - 0.5f) * _zoom);

                        // Scale texture to fit, maintaining aspect ratio
                        float texScale = scale * _zoom / 16f;
                        int drawWidth = (int)(itemTex.Width * texScale);
                        int drawHeight = (int)(sourceHeight * texScale);

                        var sourceRect = new Rectangle(0, 0, itemTex.Width, sourceHeight);
                        var dest = new Rectangle(
                            1 + drawX - drawWidth / 2,
                            1 + drawY - drawHeight / 2,
                            drawWidth,
                            drawHeight);

                        _spriteBatch.Draw(itemTex, dest, sourceRect, Color.White, 0f, Vector2.Zero, SpriteEffects.None, LayerTileTrack);
                    }
                    break;
                case TileEntityType.CritterAnchor:
                    {
                        if (te.NetId <= 0) break;

                        var critterTile = _wvm.CurrentWorld.Tiles[te.PosX, te.PosY];
                        if (!critterTile.IsActive || critterTile.Type != (int)TileType.CritterAnchor)
                            break;

                        var itemTex = (Texture2D)_textureDictionary.GetItem(te.NetId);
                        if (itemTex == null || itemTex == _textureDictionary.DefaultTexture)
                            break;

                        // Get orientation offset based on frameX
                        int orientation = critterTile.U / 18;
                        float offsetX = 0, offsetY = 0;
                        switch (orientation)
                        {
                            case 0: offsetY = 2f; break;   // Bottom
                            case 1: offsetY = -2f; break;  // Top
                            case 2: offsetX = -2f; break;  // Left
                            case 3: offsetX = 2f; break;   // Right
                        }

                        // Get item scale from lookup table
                        float scale = 1f;
                        if (WorldConfiguration.ItemLookupTable.TryGetValue(te.NetId, out var itemProps) && itemProps.Scale > 0)
                            scale = itemProps.Scale;

                        // For animated items (height > width * 1.5), only show first frame
                        // Many critter sprites have multiple animation frames stacked vertically
                        int sourceHeight = itemTex.Height;
                        if (itemTex.Height > itemTex.Width * 3)
                            sourceHeight = itemTex.Width; // First frame height = width (common pattern)

                        // Calculate position - center item on tile
                        int drawX = (int)((_scrollPosition.X + te.PosX + 0.5f) * _zoom + offsetX * _zoom / 16f);
                        int drawY = (int)((_scrollPosition.Y + te.PosY + 0.5f) * _zoom + offsetY * _zoom / 16f);

                        // Scale texture to fit, maintaining aspect ratio
                        float texScale = scale * _zoom / 16f;
                        int drawWidth = (int)(itemTex.Width * texScale);
                        int drawHeight = (int)(sourceHeight * texScale);

                        var sourceRect = new Rectangle(0, 0, itemTex.Width, sourceHeight);
                        var dest = new Rectangle(
                            1 + drawX - drawWidth / 2,
                            1 + drawY - drawHeight / 2,
                            drawWidth,
                            drawHeight);

                        _spriteBatch.Draw(itemTex, dest, sourceRect, Color.White, 0f, Vector2.Zero, SpriteEffects.None, LayerTileTrack);
                    }
                    break;
            }
        }
    }

    /// <summary>
    /// Gets body and leg frame Y offsets for a display doll pose.
    /// </summary>
    private static (int bodyFrameY, int legFrameY, int yPixelOffset) GetDollPoseFrames(byte pose)
    {
        return (DisplayDollPoseID)pose switch
        {
            DisplayDollPoseID.Standing => (0, 0, 0),
            DisplayDollPoseID.Sitting  => (0, 0, 10),
            DisplayDollPoseID.Jumping  => (5 * DollFrameHeight, 5 * DollFrameHeight, 0),
            DisplayDollPoseID.Walking  => (9 * DollFrameHeight, 9 * DollFrameHeight, 0),
            _                          => (0, 0, 0), // Use1-5 fall back to standing
        };
    }

    /// <summary>
    /// Draws the wooden body for a display doll (mannequin/womannequin) behind armor.
    /// Only draws the 6 parts that have mannequin-specific textures (Player_10/11_*).
    /// Parts 1,2,4,6,8,11,12,13,14,15 are aliased to the eyes texture in-game and
    /// would fall back to Player_0_* (human skin) in TEdit, so they are skipped.
    /// </summary>
    private void DrawDollBody(int tileX, int tileY, int skinVariant, bool isFemale, byte pose, SpriteEffects effect)
    {
        var (bodyFrameY, legFrameY, yPixelOffset) = GetDollPoseFrames(pose);
        bool isSitting = (DisplayDollPoseID)pose == DisplayDollPoseID.Sitting;
        int femaleRowOffset = isFemale ? 2 : 0;

        // Composite frame positions for torso/hands
        int torsoFrameX = 0;
        int torsoFrameY = (0 + femaleRowOffset) * DollFrameHeight;

        int step = 0;

        // Draw order: back to front. Only mannequin-unique parts (0,3,5,7,9,10).
        // Back arm skin (part 7)
        DrawDollBodyPart(tileX, tileY, skinVariant, 7, bodyFrameY, yPixelOffset, effect, step++);

        // Leg skin (part 10) — skip when sitting (legs hidden behind seat in-game)
        if (!isSitting)
            DrawDollBodyPart(tileX, tileY, skinVariant, 10, legFrameY, yPixelOffset, effect, step++);

        // Torso skin (part 3, composite frame)
        DrawDollBodyPart(tileX, tileY, skinVariant, 3, torsoFrameX, torsoFrameY, yPixelOffset, effect, step++);

        // Hands (part 5, composite frame)
        DrawDollBodyPart(tileX, tileY, skinVariant, 5, torsoFrameX, torsoFrameY, yPixelOffset, effect, step++);

        // Head (part 0 — includes carved eye/face details)
        DrawDollBodyPart(tileX, tileY, skinVariant, 0, bodyFrameY, yPixelOffset, effect, step++);

        // Hair (style 15 = Terraria default for display dolls)
        DrawDollHair(tileX, tileY, 15, bodyFrameY, yPixelOffset, effect, step++);

        // Front arm skin (part 9)
        DrawDollBodyPart(tileX, tileY, skinVariant, 9, bodyFrameY, yPixelOffset, effect, step++);
    }

    /// <summary>
    /// Draws a single body part using traditional (non-composite) frame indexing.
    /// frameY is the Y pixel offset into the sprite sheet.
    /// </summary>
    private void DrawDollBodyPart(int tileX, int tileY, int skinVariant, int partIndex, int frameY, int yPixelOffset, SpriteEffects effect, int drawOrder)
    {
        var texture = _textureDictionary.GetPlayerBody(skinVariant, partIndex);
        if (texture == null || texture == _textureDictionary.DefaultTexture) return;

        int frameX = 0;
        int srcW = Math.Min(texture.Width - frameX, DollFrameWidth);
        int srcH = Math.Min(texture.Height - frameY, DollFrameHeight);
        if (srcW <= 0 || srcH <= 0) return;

        var source = new Rectangle(frameX, frameY, srcW, srcH);
        var dest = GetDollBodyDest(tileX, tileY, srcW, srcH, yPixelOffset);
        float depth = LayerDollBody - drawOrder * 0.00001f;

        _spriteBatch.Draw(texture, dest, source, Color.White, 0f, default, effect, depth);
    }

    /// <summary>
    /// Draws a single body part using composite frame coordinates (explicit frameX + frameY).
    /// </summary>
    private void DrawDollBodyPart(int tileX, int tileY, int skinVariant, int partIndex, int frameX, int frameY, int yPixelOffset, SpriteEffects effect, int drawOrder)
    {
        var texture = _textureDictionary.GetPlayerBody(skinVariant, partIndex);
        if (texture == null || texture == _textureDictionary.DefaultTexture) return;

        int srcW = Math.Min(texture.Width - frameX, DollFrameWidth);
        int srcH = Math.Min(texture.Height - frameY, DollFrameHeight);
        if (srcW <= 0 || srcH <= 0) return;

        var source = new Rectangle(frameX, frameY, srcW, srcH);
        var dest = GetDollBodyDest(tileX, tileY, srcW, srcH, yPixelOffset);
        float depth = LayerDollBody - drawOrder * 0.00001f;

        _spriteBatch.Draw(texture, dest, source, Color.White, 0f, default, effect, depth);
    }

    /// <summary>
    /// Draws hair for a display doll.
    /// </summary>
    private void DrawDollHair(int tileX, int tileY, int hairIndex, int frameY, int yPixelOffset, SpriteEffects effect, int drawOrder)
    {
        var texture = _textureDictionary.GetPlayerHair(hairIndex);
        if (texture == null || texture == _textureDictionary.DefaultTexture) return;

        int srcW = Math.Min(texture.Width, DollFrameWidth);
        int srcH = Math.Min(texture.Height - frameY, DollFrameHeight);
        if (srcW <= 0 || srcH <= 0) return;

        var source = new Rectangle(0, frameY, srcW, srcH);
        var dest = GetDollBodyDest(tileX, tileY, srcW, srcH, yPixelOffset);
        float depth = LayerDollBody - drawOrder * 0.00001f;

        _spriteBatch.Draw(texture, dest, source, Color.White, 0f, default, effect, depth);
    }

    /// <summary>
    /// Computes the destination rectangle for a doll body part, centering the 40px frame
    /// within the 32px (2-tile) footprint.
    /// </summary>
    private Rectangle GetDollBodyDest(int tileX, int tileY, int srcW, int srcH, int yPixelOffset)
    {
        var dest = new Rectangle(
            1 + (int)((_scrollPosition.X + tileX) * _zoom),
            1 + (int)((_scrollPosition.Y + tileY) * _zoom),
            (int)(_zoom * srcW / 16f),
            (int)(_zoom * srcH / 16f));

        // Center 40px body frame within 32px (2-tile) footprint: shift left 4px
        dest.X -= (int)(4 * _zoom / 16f);
        // Align body with armor pieces (which use -12 game-px offset from tile origin)
        dest.Y -= (int)(12 * _zoom / 16f);
        // Apply pose Y offset (e.g. sitting)
        dest.Y += (int)(yPixelOffset * _zoom / 16f);

        return dest;
    }

    /// <summary>
    /// Draws an accessory texture on a display doll, checking which slot type the item fills.
    /// </summary>
    private void DrawDollAccessory(int tileX, int tileY, ItemProperty props, SpriteEffects effect)
    {
        Texture2D tex = null;

        // Try each slot type, render the first one found
        if (props.WingSlot.HasValue)
            tex = _textureDictionary.GetAccWings(props.WingSlot.Value);
        else if (props.BackSlot.HasValue)
            tex = _textureDictionary.GetAccBack(props.BackSlot.Value);
        else if (props.BalloonSlot.HasValue)
            tex = _textureDictionary.GetAccBalloon(props.BalloonSlot.Value);
        else if (props.ShoeSlot.HasValue)
            tex = _textureDictionary.GetAccShoes(props.ShoeSlot.Value);
        else if (props.WaistSlot.HasValue)
            tex = _textureDictionary.GetAccWaist(props.WaistSlot.Value);
        else if (props.NeckSlot.HasValue)
            tex = _textureDictionary.GetAccNeck(props.NeckSlot.Value);
        else if (props.FaceSlot.HasValue)
            tex = _textureDictionary.GetAccFace(props.FaceSlot.Value);
        else if (props.ShieldSlot.HasValue)
            tex = _textureDictionary.GetAccShield(props.ShieldSlot.Value);
        else if (props.HandOnSlot.HasValue)
            tex = _textureDictionary.GetAccHandsOn(props.HandOnSlot.Value);
        else if (props.HandOffSlot.HasValue)
            tex = _textureDictionary.GetAccHandsOff(props.HandOffSlot.Value);
        else if (props.FrontSlot.HasValue)
            tex = _textureDictionary.GetAccFront(props.FrontSlot.Value);

        if (tex == null || tex == _textureDictionary.DefaultTexture) return;

        // Draw using same source rect / positioning as armor overlays
        var source = new Rectangle(0, 0, Math.Min(tex.Width, DollFrameWidth), Math.Min(tex.Height, DollFrameHeight));
        var dest = GetDollBodyDest(tileX, tileY, source.Width, source.Height, 0);
        _spriteBatch.Draw(tex, dest, source, Color.White, 0f, default, effect, LayerTileTrack);
    }

    private void DrawGrid()
    {
        if (!AreTexturesVisible()) return;

        Rectangle visibleBounds = GetViewingArea();
        var gridTex = _textures["Grid"];
        Rectangle src = new Rectangle(0, 0, gridTex.Width, gridTex.Height);

        for (int x = 0; x < visibleBounds.Right; x += 16)
        {
            for (int y = 0; y < visibleBounds.Bottom; y += 16)
            {
                if ((x + 16 >= visibleBounds.Left || x <= visibleBounds.Right) &&
                    (y + 16 >= visibleBounds.Top || y <= visibleBounds.Bottom))
                {

                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)(_zoom * 256 / 16), (int)(_zoom * 256 / 16));

                    _spriteBatch.Draw(gridTex, dest, src, Color.White, 0, Vector2.Zero, SpriteEffects.None, LayerGrid);
                }
            }
        }
    }

    /// <summary>
    /// Draws the surface biome background with multi-layer parallax.
    /// Layers are drawn back-to-front (painter's algorithm) with increasing parallax.
    /// Visible at all zoom levels (backgrounds are screen-space, not world-space).
    /// </summary>
    private void DrawSurfaceBackground()
    {
        if (FilterManager.CurrentBackgroundMode != FilterManager.BackgroundMode.Normal) return;

        Rectangle visibleBounds = GetViewingArea();
        var world = _wvm.CurrentWorld;

        // Only draw if we're viewing surface area (y < GroundLevel)
        if (visibleBounds.Top >= world.GroundLevel) return;

        // Detect biome by majority vote across visible columns
        var biome = DetectSurfaceBiome(visibleBounds);
        int centerX = Math.Clamp((visibleBounds.Left + visibleBounds.Right) / 2, 0, world.TilesWide - 1);
        var style = GetBiomeBackgroundStyle(biome, centerX);
        if (style == null) return;

        int screenW = (int)xnaViewport.ActualWidth;
        int screenH = (int)xnaViewport.ActualHeight;
        if (screenW <= 0 || screenH <= 0) return;

        // Background bottom anchor: above ground level to avoid being hidden by tiles.
        // In Terraria, surface backgrounds sit well above the actual ground tile line.
        // Offset by ~40 tiles (roughly matching Terraria's ~600px/16 offset).
        int bgAnchorY = (int)((_scrollPosition.Y + world.GroundLevel - 40) * _zoom);
        if (bgAnchorY <= 0) return;

        // Compute base scale without zoom (use ground level in tiles as reference height)
        // This gives a stable base that doesn't shift with zoom
        int refHeight = (int)(world.GroundLevel);
        float bgScale = ComputeBackgroundScale(style, refHeight);
        // Zoom-relative factor: at BackgroundScaleZoom the texture is at base scale
        float zoomFactor = _zoom / _wvm.BackgroundScaleZoom;

        // Draw layers back-to-front matching Terraria's draw order and parallax values:
        // BackMountainsStep1: treeMntBGSet[0] — parallax 0.15, scale 1.0
        // BackMountainsStep2: treeMntBGSet[1] — parallax 0.2, scale 1.15
        // DrawSurfaceBG_*:    treeBGSet[0]    — parallax 0.4, scale 1.25
        // DrawSurfaceBG_*:    treeBGSet[1]    — parallax 0.43, scale 1.31
        // DrawSurfaceBG_*:    treeBGSet[2]    — parallax 0.49, scale 1.34
        DrawBackgroundLayer(style.SecondaryTextures, 0, 0.15f, bgAnchorY, screenW, bgScale, zoomFactor);
        DrawBackgroundLayer(style.SecondaryTextures, 1, 0.2f, bgAnchorY, screenW, bgScale, zoomFactor);
        DrawBackgroundLayer(style.Textures, 0, 0.4f, bgAnchorY, screenW, bgScale, zoomFactor);
        DrawBackgroundLayer(style.Textures, 1, 0.43f, bgAnchorY, screenW, bgScale, zoomFactor);
        DrawBackgroundLayer(style.Textures, 2, 0.49f, bgAnchorY, screenW, bgScale, zoomFactor);
    }

    private void DrawUnderworldBackground()
    {
        if (FilterManager.CurrentBackgroundMode != FilterManager.BackgroundMode.Normal) return;

        Rectangle visibleBounds = GetViewingArea();
        var world = _wvm.CurrentWorld;

        // Only draw if viewing underworld area
        int underworldTop = world.TilesHigh - 200;
        if (visibleBounds.Bottom <= underworldTop) return;

        // Look up underworld style
        var bgStyles = WorldConfiguration.BackgroundStyles;
        if (bgStyles == null) return;
        if (!bgStyles.UnderworldBackgroundById.TryGetValue(world.UnderworldBg, out var style)) return;
        if (style.Textures == null || style.Textures.Length < 5) return;

        int screenW = (int)xnaViewport.ActualWidth;
        int screenH = (int)xnaViewport.ActualHeight;
        if (screenW <= 0 || screenH <= 0) return;

        // Underworld anchor in screen coordinates (UnderworldLayer = TilesHigh - 200)
        float underworldAnchorY = (_scrollPosition.Y + underworldTop) * _zoom;

        // Draw 5 layers back-to-front (index 4 → 0) matching Terraria's draw order
        for (int layerIndex = 4; layerIndex >= 0; layerIndex--)
        {
            int texIndex = style.Textures[layerIndex];
            var tex = _textureDictionary.GetUnderworld(texIndex);
            if (tex == null || tex == _textureDictionary.DefaultTexture) continue;

            // Get source rect — first frame only for sprite sheets
            Rectangle srcRect;
            if (_underworldSpriteSheets.Contains(texIndex))
            {
                srcRect = new Rectangle(0, 0, tex.Width / 2, tex.Height / 2);
            }
            else
            {
                srcRect = new Rectangle(0, 0, tex.Width, tex.Height);
            }

            // Per-texture Y offset and scale from Terraria source (DrawUnderworldBackgroudLayer)
            float scale = 1.3f;
            float offsetY = 0f;
            switch (texIndex)
            {
                case 1: offsetY = 175f; break;
                case 2: offsetY = 100f; break;
                case 3: offsetY = 75f; break;
                case 4: scale = 0.5f; break;
                case 6: offsetY = -60f; break;
                case 7: offsetY = 90f; break;
                case 8: offsetY = 90f; break;
                case 9: offsetY = -30f; break;
                case 10: offsetY = 250f * (layerIndex * 2 + 3); break;
                case 11: offsetY = 100f * (layerIndex * 2 + 3); break;
                case 12: offsetY = 20f * (layerIndex * 2 + 3); break;
                case 13: offsetY = 20f * (layerIndex * 2 + 3); break;
            }

            // Convert pixel offset to tile offset, then to screen coords
            float bgTopY = underworldAnchorY + (offsetY / 16f) * _zoom;
            float parallax = 1f / (layerIndex * 2 + 3);

            // Scale texture with zoom relative to the background scale setting —
            // at that zoom level the texture is drawn at its base scale,
            // zooming in further scales proportionally from there.
            float drawScale = scale * (_zoom / _wvm.BackgroundScaleZoom);
            int bgWidthScaled = (int)(srcRect.Width * drawScale);
            if (bgWidthScaled <= 0) bgWidthScaled = 1;

            // Horizontal tiling with parallax offset
            float offsetX = _scrollPosition.X * _zoom * parallax;
            int bgStartX = (int)(-Math.IEEERemainder(offsetX, bgWidthScaled) - (bgWidthScaled / 2));
            int bgLoops = screenW / bgWidthScaled + 2;

            for (int i = 0; i < bgLoops; i++)
            {
                _spriteBatch.Draw(tex,
                    new Vector2(bgStartX + bgWidthScaled * i, bgTopY),
                    srcRect, Color.White, 0f, default,
                    drawScale, SpriteEffects.None, LayerTileBackgroundTextures);
            }
        }
    }

    /// <summary>
    /// Computes the maximum source texture height across all background layers,
    /// then returns a uniform scale so the tallest texture fills clipBottom.
    /// Never shrinks below 1.0 (native resolution).
    /// </summary>
    private float ComputeBackgroundScale(BackgroundStyle style, int clipBottom)
    {
        int maxSrcH = 0;

        void CheckTexture(int[] textures, int index)
        {
            if (textures == null || index >= textures.Length || textures[index] < 0) return;
            int texIndex = textures[index];
            var tex = _textureDictionary.GetBackground(texIndex);
            if (tex == null || tex == _textureDictionary.DefaultTexture) return;
            var srcRect = GetBackgroundSourceRect(texIndex, tex);
            if (srcRect.Height > maxSrcH) maxSrcH = srcRect.Height;
        }

        CheckTexture(style.Textures, 0);
        CheckTexture(style.Textures, 1);
        CheckTexture(style.Textures, 2);
        CheckTexture(style.SecondaryTextures, 0);
        CheckTexture(style.SecondaryTextures, 1);

        if (maxSrcH <= 0) return 1f;
        return Math.Max(1f, (float)clipBottom / maxSrcH);
    }

    /// <summary>
    /// Draws a single background layer following Terraria's draw pattern:
    /// uniform scale (aspect ratio preserved), horizontal tiling with parallax,
    /// positioned from bottom of clipBottom upward.
    /// </summary>
    private void DrawBackgroundLayer(int[] textures, int index, float parallax,
                                     int clipBottom, int screenW, float bgScale, float zoomFactor)
    {
        if (textures == null || index >= textures.Length || textures[index] < 0) return;

        int texIndex = textures[index];
        var tex = _textureDictionary.GetBackground(texIndex);
        if (tex == null || tex == _textureDictionary.DefaultTexture) return;

        var srcRect = GetBackgroundSourceRect(texIndex, tex);
        int srcW = srcRect.Width;
        int srcH = srcRect.Height;

        // Draw scale includes zoom factor; position scale uses base bgScale to keep anchor stable
        float drawScale = bgScale * zoomFactor;
        int bgWidthScaled = (int)(srcW * drawScale);
        if (bgWidthScaled <= 0) bgWidthScaled = 1;

        // Horizontal tiling with parallax offset — matches Terraria's IEEERemainder pattern
        float offsetX = _scrollPosition.X * _zoom * parallax;
        int bgStartX = (int)(-Math.IEEERemainder(offsetX, bgWidthScaled) - (bgWidthScaled / 2));

        // Number of horizontal tiles needed to cover the screen
        int bgLoops = screenW / bgWidthScaled + 2;

        // Position: anchor bottom edge at clipBottom (ground level), draw upward using base scale
        float bgTopY = clipBottom - (srcH * drawScale);

        // Source is the full frame (first frame for sprite sheets)
        var source = new Rectangle(srcRect.X, srcRect.Y, srcW, srcH);

        // Draw tiled copies — Terraria uses Vector2 position + scalar scale
        for (int i = 0; i < bgLoops; i++)
        {
            _spriteBatch.Draw(tex,
                new Vector2(bgStartX + bgWidthScaled * i, bgTopY),
                source, Color.White, 0f, default,
                drawScale, SpriteEffects.None, LayerTileBackgroundTextures);
        }
    }

    /// <summary>
    /// Gets the source rectangle for the first frame of a background texture.
    /// Sprite sheet textures (2x2 grids, 1x3 strips) return only the top-left frame.
    /// Non-sprite-sheet textures return the full texture dimensions.
    /// </summary>
    private static Rectangle GetBackgroundSourceRect(int texIndex, Texture2D tex)
    {
        var spriteSheets = WorldConfiguration.BackgroundStyles?.SpriteSheetById;
        if (spriteSheets != null && spriteSheets.TryGetValue(texIndex, out var sheet))
        {
            int frameW = tex.Width / sheet.Columns;
            int frameH = tex.Height / sheet.Rows;
            return new Rectangle(0, 0, frameW, frameH);
        }

        return new Rectangle(0, 0, tex.Width, tex.Height);
    }

    private void DrawTileBackgrounds()
    {
        if (!AreTexturesVisible()) return;
        if (!_wvm.ShowBackgrounds) return;

        // Surface background (screen-space parallax layers)
        DrawSurfaceBackground();

        // Underworld background (screen-space parallax layers)
        DrawUnderworldBackground();

        // Check if the background mode is normal. If not, return.
        if (FilterManager.CurrentBackgroundMode != FilterManager.BackgroundMode.Normal) return;

        Rectangle visibleBounds = GetViewingArea();

        //Extended the viewing space to give tiles time to cache their UV's
        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                if (x < 0 ||
                    y < 0 ||
                    x >= _wvm.CurrentWorld.TilesWide ||
                    y >= _wvm.CurrentWorld.TilesHigh)
                {
                    continue;
                }

                // Skip surface area - handled by DrawSurfaceBackground()
                if (y < _wvm.CurrentWorld.GroundLevel) continue;

                //draw underground background textures
                if (y >= 80)
                {
                    int hellback = _wvm.CurrentWorld.HellBackStyle;
                    int backX = 0;
                    if (x <= _wvm.CurrentWorld.CaveBackX0)
                        backX = _wvm.CurrentWorld.CaveBackStyle0;
                    else if (x > _wvm.CurrentWorld.CaveBackX0 && x <= _wvm.CurrentWorld.CaveBackX1)
                        backX = _wvm.CurrentWorld.CaveBackStyle1;
                    else if (x > _wvm.CurrentWorld.CaveBackX1 && x <= _wvm.CurrentWorld.CaveBackX2)
                        backX = _wvm.CurrentWorld.CaveBackStyle2;
                    else if (x > _wvm.CurrentWorld.CaveBackX2)
                        backX = _wvm.CurrentWorld.CaveBackStyle3;
                    backX = Math.Clamp(backX, 0, 7);
                    var source = new Rectangle(0, 0, 16, 16);
                    var backTex = _textureDictionary.GetBackground(0);

                    if (y == _wvm.CurrentWorld.GroundLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 0]);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > _wvm.CurrentWorld.GroundLevel && y < _wvm.CurrentWorld.RockLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 1]);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.GroundLevel) % 6) * 16;
                    }
                    else if (y == _wvm.CurrentWorld.RockLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 2]);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > _wvm.CurrentWorld.RockLevel && y < (_wvm.CurrentWorld.TilesHigh - 327))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 3]);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.RockLevel) % 6) * 16;
                    }
                    else if (y == (_wvm.CurrentWorld.TilesHigh - 327))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 4] + hellback);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > (_wvm.CurrentWorld.TilesHigh - 327) && y < (_wvm.CurrentWorld.TilesHigh - 200))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 5] + hellback);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.TilesHigh + 327) % 18) * 16;
                    }
                    else if (y == (_wvm.CurrentWorld.TilesHigh - 200))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 6] + hellback);
                        source.X += (x % 8) * 16;
                    }
                    else
                    {
                        continue; // Underworld drawn by DrawUnderworldBackground()
                    }

                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                    _spriteBatch.Draw(backTex, dest, source, Color.White, 0f, default, SpriteEffects.None, LayerTileBackgroundTextures);
                }
            }
        }
    }
    public void DrawTileWalls(bool drawInverted = false)
    {
        Rectangle visibleBounds = GetViewingArea();
        BlendRules blendRules = BlendRules.Instance;
        var width = _wvm.CurrentWorld.TilesWide;
        var height = _wvm.CurrentWorld.TilesHigh;
        bool anyFilter = FilterManager.AnyFilterActive;

        //Extended the viewing space to give tiles time to cache their UV's
        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                try
                {
                    if (x < 0 ||
                        y < 0 ||
                        x >= _wvm.CurrentWorld.TilesWide ||
                        y >= _wvm.CurrentWorld.TilesHigh)
                    {
                        continue;
                    }

                    ref var curtile = ref _wvm.CurrentWorld.Tiles[x, y];
                    if ((curtile.WallColor == 30) != drawInverted) continue;

                    // Filter check: hide walls not allowed by the filter
                    if (anyFilter && FilterManager.WallIsNotAllowed(curtile.Wall))
                    {
                        if (FilterManager.CurrentFilterMode == FilterManager.FilterMode.Hide) continue;
                    }

                    //Neighbor tiles are often used when dynamically determining which UV position to render
                    neighborTile[e] = (x + 1) < width ? _wvm.CurrentWorld.Tiles[x + 1, y] : null;
                    neighborTile[n] = (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x, y - 1] : null;
                    neighborTile[w] = (x - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x - 1, y] : null;
                    neighborTile[s] = (y + 1) < height ? _wvm.CurrentWorld.Tiles[x, y + 1] : null;
                    neighborTile[ne] = (x + 1) < width && (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x + 1, y - 1] : null;
                    neighborTile[nw] = (x - 1) >= 0 && (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x - 1, y - 1] : null;
                    neighborTile[sw] = (x - 1) >= 0 && (y + 1) < height ? _wvm.CurrentWorld.Tiles[x - 1, y + 1] : null;
                    neighborTile[se] = (x + 1) < width && (y + 1) < height ? _wvm.CurrentWorld.Tiles[x + 1, y + 1] : null;

                    if (_wvm.ShowWalls)
                    {
                        // white for inverted
                        var wallPaintColor = Color.White;

                        if (_wvm.ShowCoatings)
                        {
                            wallPaintColor = Color.LightGray;

                            if (curtile.InvisibleWall)
                            {
                                wallPaintColor = Color.DarkGray;
                            }

                            if (curtile.FullBrightWall || curtile.WallColor == 30)
                            {
                                wallPaintColor = Color.White;
                            }
                        }

                        if (curtile.WallColor > 0 && curtile.WallColor != 30 && curtile.WallColor < WorldConfiguration.PaintProperties.Count)
                        {
                            var paint = WorldConfiguration.PaintProperties[curtile.WallColor].Color;
                            switch (curtile.WallColor)
                            {
                                case 29:
                                    float light = wallPaintColor.B * 0.3f;
                                    wallPaintColor.R = (byte)(wallPaintColor.R * light);
                                    wallPaintColor.G = (byte)(wallPaintColor.G * light);
                                    wallPaintColor.B = (byte)(wallPaintColor.B * light);
                                    break;
                                case 30:
                                    wallPaintColor.R = (byte)((byte.MaxValue - wallPaintColor.R) * 0.5);
                                    wallPaintColor.G = (byte)((byte.MaxValue - wallPaintColor.G) * 0.5);
                                    wallPaintColor.B = (byte)((byte.MaxValue - wallPaintColor.B) * 0.5);
                                    break;
                                default:
                                    paint.A = (byte)wallPaintColor.R;
                                    wallPaintColor = wallPaintColor.AlphaBlend(paint);
                                    break;
                            }
                        }

                        if (curtile.Wall > 0)
                        {
                            wallTex = _textureDictionary.GetWall(curtile.Wall);

                            if (wallTex != null && wallTex != _textureDictionary.DefaultTexture)
                            {
                                if (curtile.uvWallCache == 0xFFFF)
                                {
                                    var uv = WallFraming.CalculateWallFrame(_wvm.CurrentWorld, x, y, curtile.Wall);
                                    curtile.uvWallCache = (ushort)((uv.Y << 8) + uv.X);
                                }

                                var texsize = new Vector2Int32(32, 32);
                                var source = new Rectangle((curtile.uvWallCache & 0x00FF) * (texsize.X + 4), (curtile.uvWallCache >> 8) * (texsize.Y + 4), texsize.X, texsize.Y);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x - 0.5) * _zoom), 1 + (int)((_scrollPosition.Y + y - 0.5) * _zoom), (int)_zoom * 2, (int)_zoom * 2);

                                _spriteBatch.Draw(wallTex, dest, source, wallPaintColor, 0f, default, SpriteEffects.None, LayerTileWallTextures);

                            }
                            else if (curtile.Wall < WorldConfiguration.WallProperties.Count)
                            {
                                // No texture loaded (mod wall) — draw a colored square at the wall layer depth
                                var wallProp = WorldConfiguration.WallProperties[curtile.Wall];
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                var modColor = new Color(wallProp.Color.R, wallProp.Color.G, wallProp.Color.B, wallProp.Color.A);
                                _spriteBatch.Draw(_textureDictionary.WhitePixelTexture, dest, null, modColor, 0f, default, SpriteEffects.None, LayerTileWallTextures);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogging.LogDebug($"Render tile error: {ex.Message}");
                }
            }
        }
    }
    public void DrawTileTextures(bool drawInverted = false)
    {
        Rectangle visibleBounds = GetViewingArea();
        BlendRules blendRules = BlendRules.Instance;
        var width = _wvm.CurrentWorld.TilesWide;
        var height = _wvm.CurrentWorld.TilesHigh;
        bool anyFilter = FilterManager.AnyFilterActive;
        bool filterHide = anyFilter && FilterManager.CurrentFilterMode == FilterManager.FilterMode.Hide;

        //Extended the viewing space to give tiles time to cache their UV's
        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                try
                {
                    if (x < 0 ||
                        y < 0 ||
                        x >= _wvm.CurrentWorld.TilesWide ||
                        y >= _wvm.CurrentWorld.TilesHigh)
                    {
                        continue;
                    }


                    ref var curtile = ref _wvm.CurrentWorld.Tiles[x, y];

                    if ((curtile.TileColor == 30) != drawInverted) continue;

                    if (curtile.Type >= WorldConfiguration.TileProperties.Count) { continue; }
                    var tileprop = WorldConfiguration.GetTileProperties(curtile.Type);

                    // If no texture exists for this tile type (e.g. mod tiles), draw a colored square fallback
                    if (curtile.IsActive)
                    {
                        var tileTex = _textureDictionary.GetTile(curtile.Type);
                        if (tileTex == null || tileTex == _textureDictionary.DefaultTexture)
                        {
                            var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                            var modColor = new Color(tileprop.Color.R, tileprop.Color.G, tileprop.Color.B, tileprop.Color.A);
                            _spriteBatch.Draw(_textureDictionary.WhitePixelTexture, dest, null, modColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                            continue;
                        }
                    }

                    // Filter check: hide tiles/sprites not allowed by the filter
                    if (anyFilter && FilterManager.TileIsNotAllowed(curtile.Type) && FilterManager.SpriteIsNotAllowed(curtile.Type))
                    {
                        if (FilterManager.CurrentFilterMode == FilterManager.FilterMode.Hide) continue;
                    }

                    //Neighbor tiles are often used when dynamically determining which UV position to render
                    //Tile[] neighborTile = new Tile[8];
                    if (filterHide)
                    {
                        neighborTile[e] = (x + 1) < width ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x + 1, y].Type)) ? _wvm.CurrentWorld.Tiles[x + 1, y] : null) : null;
                        neighborTile[n] = (y - 1) >= 0 ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x, y - 1].Type)) ? _wvm.CurrentWorld.Tiles[x, y - 1] : null) : null;
                        neighborTile[w] = (x - 1) >= 0 ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x - 1, y].Type)) ? _wvm.CurrentWorld.Tiles[x - 1, y] : null) : null;
                        neighborTile[s] = (y + 1) < height ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x, y + 1].Type)) ? _wvm.CurrentWorld.Tiles[x, y + 1] : null) : null;
                        neighborTile[ne] = (x + 1) < width && (y - 1) >= 0 ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x + 1, y - 1].Type)) ? _wvm.CurrentWorld.Tiles[x + 1, y - 1] : null) : null;
                        neighborTile[nw] = (x - 1) >= 0 && (y - 1) >= 0 ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x - 1, y - 1].Type)) ? _wvm.CurrentWorld.Tiles[x - 1, y - 1] : null) : null;
                        neighborTile[sw] = (x - 1) >= 0 && (y + 1) < height ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x - 1, y + 1].Type)) ? _wvm.CurrentWorld.Tiles[x - 1, y + 1] : null) : null;
                        neighborTile[se] = (x + 1) < width && (y + 1) < height ? ((!FilterManager.TileIsNotAllowed(_wvm.CurrentWorld.Tiles[x + 1, y + 1].Type)) ? _wvm.CurrentWorld.Tiles[x + 1, y + 1] : null) : null;
                    }
                    else
                    {
                        neighborTile[e] = (x + 1) < width ? _wvm.CurrentWorld.Tiles[x + 1, y] : null;
                        neighborTile[n] = (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x, y - 1] : null;
                        neighborTile[w] = (x - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x - 1, y] : null;
                        neighborTile[s] = (y + 1) < height ? _wvm.CurrentWorld.Tiles[x, y + 1] : null;
                        neighborTile[ne] = (x + 1) < width && (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x + 1, y - 1] : null;
                        neighborTile[nw] = (x - 1) >= 0 && (y - 1) >= 0 ? _wvm.CurrentWorld.Tiles[x - 1, y - 1] : null;
                        neighborTile[sw] = (x - 1) >= 0 && (y + 1) < height ? _wvm.CurrentWorld.Tiles[x - 1, y + 1] : null;
                        neighborTile[se] = (x + 1) < width && (y + 1) < height ? _wvm.CurrentWorld.Tiles[x + 1, y + 1] : null;
                    }

                    if (_wvm.ShowTiles)
                    {
                        if (curtile.IsActive)
                        {
                            // white for inverted
                            var tilePaintColor = Color.White;

                            if (_wvm.ShowCoatings)
                            {
                                tilePaintColor = Color.LightGray;

                                if (curtile.InvisibleBlock)
                                {
                                    tilePaintColor = Color.DarkGray;
                                }

                                if (curtile.FullBrightBlock || curtile.TileColor == 30)
                                {
                                    tilePaintColor = Color.White;
                                }
                            }

                            if (curtile.TileColor > 0 && curtile.TileColor != 30 && curtile.TileColor < WorldConfiguration.PaintProperties.Count)
                            {
                                var paint = WorldConfiguration.PaintProperties[curtile.TileColor].Color;
                                switch (curtile.TileColor)
                                {
                                    case 29:
                                        float light = tilePaintColor.B * 0.3f;
                                        tilePaintColor.R = (byte)(tilePaintColor.R * light);
                                        tilePaintColor.G = (byte)(tilePaintColor.G * light);
                                        tilePaintColor.B = (byte)(tilePaintColor.B * light);
                                        break;
                                    case 30:
                                        tilePaintColor.R = (byte)((byte.MaxValue - tilePaintColor.R) * 0.5);
                                        tilePaintColor.G = (byte)((byte.MaxValue - tilePaintColor.G) * 0.5);
                                        tilePaintColor.B = (byte)((byte.MaxValue - tilePaintColor.B) * 0.5);
                                        break;
                                    default:
                                        paint.A = (byte)tilePaintColor.R;
                                        tilePaintColor = tilePaintColor.AlphaBlend(paint);
                                        break;
                                }
                            }

                            if (tileprop.IsFramed)
                            {
                                Rectangle source = new Rectangle(), dest = new Rectangle();
                                tileTex = _textureDictionary.GetTile(curtile.Type);

                                bool isTreeSpecial = false, isMushroom = false;
                                bool isLeft = false, isBase = false, isRight = false;
                                if (curtile.Type == (int)TileType.Tree)
                                {
                                    int baseX = 0;
                                    if (curtile.U == 66 && curtile.V <= 45)
                                        ++baseX;
                                    if (curtile.U == 88 && curtile.V >= 66 && curtile.V <= 110)
                                        --baseX;
                                    if (curtile.U == 22 && curtile.V >= 132 && curtile.V < 198)
                                        --baseX;
                                    if (curtile.U == 44 && curtile.V >= 132 && curtile.V < 198)
                                        ++baseX;
                                    if (curtile.U >= 22 && curtile.V >= 198)
                                    {
                                        isTreeSpecial = true;
                                        switch (curtile.U)
                                        {
                                            case 22:
                                                isBase = true;
                                                break;
                                            case 44:
                                                isLeft = true;
                                                ++baseX;
                                                break;
                                            case 66:
                                                isRight = true;
                                                --baseX;
                                                break;
                                        }
                                    }

                                    //Check tree type
                                    int treeType = -1; //Default to normal in case no grass grows beneath the tree
                                    for (int i = 0; i < 100; i++)
                                    {
                                        Tile? checkTile = (y + i) < _wvm.CurrentWorld.TilesHigh ? _wvm.CurrentWorld.Tiles[x + baseX, y + i] : null;
                                        if (checkTile != null && checkTile.Value.IsActive)
                                        {
                                            bool found = true;
                                            switch (checkTile.Value.Type)
                                            {
                                                case 2:
                                                    treeType = -1;
                                                    break; //Normal
                                                case 23:
                                                    treeType = 0;
                                                    break; //Corruption
                                                case 60:
                                                    if (y <= _wvm.CurrentWorld.GroundLevel)
                                                    {
                                                        treeType = 1;
                                                        break; // Jungle
                                                    }
                                                    treeType = 5;
                                                    break; // Underground Jungle
                                                case 70:
                                                    treeType = 6;
                                                    break; // Surface Mushroom
                                                case 109:
                                                    treeType = 2;
                                                    break; // Hallow
                                                case 147:
                                                    treeType = 3;
                                                    break; // Snow
                                                case 199:
                                                    treeType = 4;
                                                    break; // Crimson
                                                default:
                                                    found = false;
                                                    break;
                                            }
                                            if (found)
                                                break;
                                        }
                                    }
                                    if (isTreeSpecial)
                                    {
                                        int treeStyle = _wvm.CurrentWorld.GetTreeStyleAtPosition(x + baseX, y);
                                        //Abuse uvTileCache to remember what type of tree it is, since potentially scanning a hundred of blocks PER tree tile sounds slow
                                        curtile.uvTileCache = (ushort)((0x00 << 8) + 0x01 * treeStyle);
                                        if (isBase)
                                        {
                                            tileTex = (Texture2D)_textureDictionary.GetTreeTops(treeStyle);
                                        }
                                        else
                                        {
                                            tileTex = (Texture2D)_textureDictionary.GetTreeBranches(treeStyle);
                                        }
                                    }
                                    else
                                    {
                                        tileTex = _textureDictionary.GetTree(treeType);
                                    }
                                }
                                // Gem Trees (583-589), Vanity Trees (596, 616), Ash Trees (634)
                                // These use the same foliage detection as normal trees but with fixed texture indices
                                else if (_gemTreeTileIds.Contains(curtile.Type) || _vanityTreeTileIds.Contains(curtile.Type) || curtile.Type == AshTreeTileId)
                                {
                                    // Foliage detection: same as normal trees (frameY >= 198 && frameX >= 22)
                                    if (curtile.U >= 22 && curtile.V >= 198)
                                    {
                                        isTreeSpecial = true;
                                        switch (curtile.U)
                                        {
                                            case 22:
                                                isBase = true;
                                                break;
                                            case 44:
                                                isLeft = true;
                                                break;
                                            case 66:
                                                isRight = true;
                                                break;
                                        }

                                        // Determine tree style based on tile type
                                        int treeStyle;
                                        if (_gemTreeTileIds.Contains(curtile.Type))
                                            treeStyle = GetGemTreeStyle(curtile.Type);
                                        else if (_vanityTreeTileIds.Contains(curtile.Type))
                                            treeStyle = GetVanityTreeStyle(curtile.Type);
                                        else
                                            treeStyle = GetAshTreeStyle();

                                        // Cache tree style in uvTileCache
                                        curtile.uvTileCache = (ushort)((0x00 << 8) + 0x01 * treeStyle);

                                        if (isBase)
                                            tileTex = (Texture2D)_textureDictionary.GetTreeTops(treeStyle);
                                        else
                                            tileTex = (Texture2D)_textureDictionary.GetTreeBranches(treeStyle);
                                    }
                                }
                                if (curtile.Type == (int)TileType.MushroomTree && curtile.U >= 36)
                                {
                                    isMushroom = true;
                                    tileTex = (Texture2D)_textureDictionary.GetShroomTop(0);
                                }
                                if (curtile.Type == 323)
                                {
                                    if (curtile.U >= 88 && curtile.U <= 132)
                                    {
                                        isTreeSpecial = true;
                                        isBase = true;
                                        tileTex = (Texture2D)_textureDictionary.GetTreeTops(15);
                                    }
                                    int treeType = 0;
                                    for (int i = 0; i < 100; i++)
                                    {
                                        Tile? checkTile = (y + i) < _wvm.CurrentWorld.TilesHigh ? _wvm.CurrentWorld.Tiles[x, y + i] : null;
                                        if (checkTile != null && checkTile.Value.IsActive)
                                        {
                                            bool found = true;
                                            switch (checkTile.Value.Type)
                                            {
                                                case 53:
                                                    treeType = 0;
                                                    break; //Palm
                                                case 112:
                                                    treeType = 3;
                                                    break; //Ebonsand Palm
                                                case 116:
                                                    treeType = 2;
                                                    break; //Pearlsand Palm
                                                case 234:
                                                    treeType = 1;
                                                    break; //Crimsand Palm
                                                default:
                                                    found = false;
                                                    break;
                                            }
                                            if (found)
                                                break;
                                        }
                                    }
                                    curtile.uvTileCache = (ushort)((0x00 << 8) + 0x01 * treeType);
                                }

                                if (tileTex != null)
                                {
                                    if ((curtile.Type == (int)TileType.MannequinLegacy || curtile.Type == (int)TileType.WomannequinLegacy) && curtile.U >= 100)
                                    {
                                        int armor = curtile.U / 100;
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        switch (curtile.V / 18)
                                        {
                                            case 0:
                                                tileTex = (Texture2D)_textureDictionary.GetArmorHead(armor);
                                                source = new Rectangle(2, 0, 36, 36);
                                                dest.Width = (int)(_zoom * source.Width / 16f);
                                                dest.Height = (int)(_zoom * source.Height / 16f);
                                                dest.Y += (int)(((16 - source.Height - 4) / 2F) * _zoom / 16);
                                                dest.X -= (int)((2 * _zoom / 16));
                                                break;
                                            case 1:
                                                if (curtile.Type == (int)TileType.MannequinLegacy)
                                                    tileTex = (Texture2D)_textureDictionary.GetArmorBody(armor);
                                                else
                                                    tileTex = (Texture2D)_textureDictionary.GetArmorFemale(armor);
                                                source = new Rectangle(2, 0, 36, 54);
                                                dest.Width = (int)(_zoom * source.Width / 16f);
                                                dest.Height = (int)(_zoom * source.Height / 16f);
                                                dest.Y += (int)(((16 - source.Height - 18) / 2F) * _zoom / 16);
                                                dest.X -= (int)((2 * _zoom / 16));
                                                break;
                                            case 2:
                                                tileTex = (Texture2D)_textureDictionary.GetArmorLegs(armor);
                                                source = new Rectangle(2, 42, 36, 12);
                                                dest.Width = (int)(_zoom * source.Width / 16f);
                                                dest.Height = (int)(_zoom * source.Height / 16f);
                                                dest.Y -= (int)((2 * _zoom / 16));
                                                dest.X -= (int)((2 * _zoom / 16));
                                                break;
                                        }
                                        if (curtile.U % 100 < 36)
                                            _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.FlipHorizontally, LayerTileTrack);
                                        else
                                            _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                        tileTex = _textureDictionary.GetTile(curtile.Type);
                                        source = new Rectangle((curtile.U % 100), curtile.V, tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                    }
                                    else if ((curtile.Type == (int)TileType.WeaponRackLegacy) && curtile.U >= 5000)
                                    {
                                        if (_wvm.CurrentWorld.Tiles[x + 1, y].U >= 5000)
                                        {
                                            int weapon = (curtile.U % 5000) - 100;
                                            tileTex = (Texture2D)_textureDictionary.GetItem(weapon);
                                            int flip = curtile.U / 5000;
                                            float scale = 1f;
                                            if (tileTex.Width > 40 || tileTex.Height > 40)
                                            {
                                                if (tileTex.Width > tileTex.Height)
                                                    scale = 40f / (float)tileTex.Width;
                                                else
                                                    scale = 40f / (float)tileTex.Height;
                                            }
                                            if (WorldConfiguration.ItemLookupTable.TryGetValue(weapon, out var itemProps))
                                            {
                                                scale *= itemProps?.Scale ?? 1.0f;
                                            }
                                            source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                                            SpriteEffects effect = SpriteEffects.None;
                                            if (flip >= 3)
                                            {
                                                effect = SpriteEffects.FlipHorizontally;
                                            }
                                            _spriteBatch.Draw(tileTex, new Vector2(1 + (int)((_scrollPosition.X + x + 1.5) * _zoom), 1 + (int)((_scrollPosition.Y + y + .5) * _zoom)), source, tilePaintColor, 0f, new Vector2((float)(tileTex.Width / 2), (float)(tileTex.Height / 2)), scale * _zoom / 16f, effect, LayerTileTrack);
                                        }
                                        source = new Rectangle(((curtile.U / 5000) - 1) * 18, curtile.V, tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                        tileTex = _textureDictionary.GetTile(curtile.Type);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                    }
                                    else if (curtile.Type == (int)TileType.ItemFrame && curtile.V == 0 && curtile.U % 36 == 0)
                                    {
                                        TileEntity entity = _wvm.CurrentWorld.GetTileEntityAtTile(x, y);
                                        if (entity != null)
                                        {
                                            int item = entity.NetId;
                                            if (item > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetItem(item);
                                                float scale = 1f;
                                                if (tileTex.Width > 20 || tileTex.Height > 20)
                                                {
                                                    if (tileTex.Width > tileTex.Height)
                                                        scale = 20f / (float)tileTex.Width;
                                                    else
                                                        scale = 20f / (float)tileTex.Height;
                                                }
                                                if (WorldConfiguration.ItemLookupTable.TryGetValue(item, out var itemProps))
                                                {
                                                    scale *= itemProps?.Scale ?? 1.0f;
                                                }
                                                source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);
                                                _spriteBatch.Draw(
                                                    tileTex,
                                                    new Vector2(
                                                        1 + (int)((_scrollPosition.X + x + 1) * _zoom),
                                                        1 + (int)((_scrollPosition.Y + y + 1) * _zoom)),
                                                    source,
                                                    Color.White,
                                                    0f,
                                                    new Vector2((float)(tileTex.Width / 2),
                                                    (float)(tileTex.Height / 2)),
                                                    scale * _zoom / 16f,
                                                    SpriteEffects.None,
                                                    LayerTileTrack);
                                            }
                                        }
                                        source = new Rectangle(curtile.U, curtile.V, tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                        tileTex = _textureDictionary.GetTile(curtile.Type);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                    }
                                    else if (curtile.Type == (int)TileType.FoodPlatter)
                                    {
                                        SpriteEffects effect = SpriteEffects.None;
                                        if (curtile.U == 0)
                                        {
                                            effect = SpriteEffects.FlipHorizontally;
                                        }


                                        TileEntity entity = _wvm.CurrentWorld.GetTileEntityAtTile(x, y);
                                        if (entity != null)
                                        {
                                            int item = entity.NetId;
                                            if (item > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetItem(item);
                                                bool isFood = false;
                                                if (WorldConfiguration.ItemLookupTable.TryGetValue(item, out var itemData))
                                                {
                                                    isFood = itemData?.IsFood ?? false;

                                                }
                                                source = !isFood ? tileTex.Frame(1, 1, 0, 0, 0, 0) : tileTex.Frame(1, 3, 0, 2, 0, 0);

                                                float scale = 1f;

                                                _spriteBatch.Draw(tileTex,
                                                    new Vector2(
                                                        1 + (int)((_scrollPosition.X + x + 0.5) * _zoom),
                                                        1 + (int)((_scrollPosition.Y + y + 1) * _zoom)),
                                                    source,
                                                    tilePaintColor,
                                                    0f,
                                                    new Vector2((float)(source.Width / 2),
                                                    (float)(source.Height)),
                                                    scale * _zoom / 16f,
                                                    effect,
                                                    LayerTileTrack);
                                            }
                                            //else
                                            {
                                                tileTex = _textureDictionary.GetTile(curtile.Type);
                                                source = (curtile.U == 0) ? tileTex.Frame(2, 1, 0, 0, 0, 0) : tileTex.Frame(2, 1, 1, 0, 0, 0);
                                                _spriteBatch.Draw(tileTex,
                                                     new Vector2(
                                                         1 + (int)((_scrollPosition.X + x + 1) * _zoom),
                                                         1 + (int)((_scrollPosition.Y + y + 0.5) * _zoom)),
                                                     source,
                                                     tilePaintColor,
                                                     0f,
                                                     new Vector2((float)(tileTex.Width / 2),
                                                     (float)(tileTex.Height / 2)),
                                                     1f * _zoom / 16f,
                                                     effect,
                                                     LayerTileTextures);
                                            }
                                        }
                                    }
                                    else if (curtile.Type == (int)TileType.DeadCellsDisplayJar && curtile.V == 0)
                                    {
                                        // DisplayJar: 1x2 tiles, visual 36x44px
                                        // Only render from anchor (top) tile (V == 0)
                                        // Texture layers: Y=0 main jar, Y=46 foreground border, Y=92 background glow
                                        // Draw order: main -> background (if item) -> item -> foreground

                                        // Variant based on U: 0=variant0, 18=variant1, 36=variant2
                                        int variant = curtile.U / 18;
                                        int jarSourceX = variant * 38;

                                        // Source rectangles for the 3 layers
                                        Rectangle jarMain = new Rectangle(jarSourceX, 0, 36, 44);
                                        Rectangle jarForeground = new Rectangle(jarSourceX, 46, 36, 44);
                                        Rectangle jarBackground = new Rectangle(jarSourceX, 92, 36, 44);

                                        // Dest rectangle - jar is 36px wide, centered on 16px tile (offset -10px)
                                        int jarDestX = 1 + (int)((_scrollPosition.X + x) * _zoom) - (int)(10 * _zoom / 16f);
                                        int jarDestY = 1 + (int)((_scrollPosition.Y + y) * _zoom);
                                        int jarDestW = (int)(36 * _zoom / 16f);
                                        int jarDestH = (int)(44 * _zoom / 16f);
                                        Rectangle jarDest = new Rectangle(jarDestX, jarDestY, jarDestW, jarDestH);

                                        Texture2D jarTex = _textureDictionary.GetTile(curtile.Type);

                                        // 1. Draw main jar (Y=0) with tile lighting
                                        _spriteBatch.Draw(jarTex, jarDest, jarMain, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);

                                        // Check for item in jar
                                        TileEntity entity = _wvm.CurrentWorld.GetTileEntityAtTile(x, y);
                                        int itemId = entity?.NetId ?? 0;

                                        if (itemId > 0)
                                        {
                                            // Get item rarity for color
                                            string rarity = "Blue"; // Default
                                            float scale = 1f;
                                            if (WorldConfiguration.ItemLookupTable.TryGetValue(itemId, out var itemProps))
                                            {
                                                scale = itemProps?.Scale ?? 1.0f;
                                                rarity = itemProps?.Rarity ?? "Blue";
                                            }

                                            // Get rarity color from global colors
                                            Color rarityColor = GetRarityColor(rarity);

                                            // 2. Draw background glow (Y=92) - dimmed rarity color (0.25x)
                                            Color bgColor = rarityColor * 0.25f;
                                            _spriteBatch.Draw(jarTex, jarDest, jarBackground, bgColor, 0f, default, SpriteEffects.None, LayerTileTextures);

                                            // 3. Draw item inside jar
                                            tileTex = (Texture2D)_textureDictionary.GetItem(itemId);

                                            // Size limits and Y offset per variant (from reference)
                                            int sizeLimit;
                                            float extraYPixels;
                                            switch (variant)
                                            {
                                                case 1: sizeLimit = 18; extraYPixels = 4f; break;
                                                case 2: sizeLimit = 20; extraYPixels = 6f; break;
                                                default: sizeLimit = 22; extraYPixels = -1f; break;
                                            }

                                            float maxDim = Math.Max(tileTex.Width, tileTex.Height) * scale;
                                            if (maxDim > sizeLimit)
                                            {
                                                scale *= sizeLimit / maxDim;
                                            }

                                            source = new Rectangle(0, 0, tileTex.Width, tileTex.Height);

                                            // Item position: centered in jar, Y = 24 + variant offset from jar top
                                            float itemOffsetX = 0.5f;
                                            float itemOffsetY = (24f + extraYPixels) / 16f;

                                            // Blend item with lighting
                                            Color itemColor = Color.Lerp(tilePaintColor, Color.White, 0.5f);

                                            _spriteBatch.Draw(tileTex,
                                                new Vector2(
                                                    1 + (int)((_scrollPosition.X + x + itemOffsetX) * _zoom),
                                                    1 + (int)((_scrollPosition.Y + y + itemOffsetY) * _zoom)),
                                                source,
                                                itemColor,
                                                0f,
                                                new Vector2(tileTex.Width / 2f, tileTex.Height / 2f),
                                                scale * _zoom / 16f,
                                                SpriteEffects.None,
                                                LayerTileTextures);

                                            // 4. Draw foreground border (Y=46) with rarity color and alpha
                                            Color fgColor = new Color(rarityColor.R, rarityColor.G, rarityColor.B, (byte)127);
                                            _spriteBatch.Draw(jarTex, jarDest, jarForeground, fgColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        }
                                        else
                                        {
                                            // Empty jar - draw default blue foreground border
                                            Color fgColor = new Color(150, 150, 255, 127);
                                            _spriteBatch.Draw(jarTex, jarDest, jarForeground, fgColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        }

                                        // Skip normal tile rendering for this tile
                                        continue;
                                    }
                                    else if (curtile.Type == (int)TileType.DeadCellsDisplayJar && curtile.V != 0)
                                    {
                                        // Bottom tile of DisplayJar - skip if anchor exists and is same type
                                        int tileOffsetY = curtile.V / 18;
                                        int anchorY = y - tileOffsetY;
                                        if (anchorY >= 0 && anchorY < _wvm.CurrentWorld.TilesHigh)
                                        {
                                            var anchorTile = _wvm.CurrentWorld.Tiles[x, anchorY];
                                            if (anchorTile.IsActive && anchorTile.Type == (int)TileType.DeadCellsDisplayJar && anchorTile.V == 0)
                                                continue;
                                        }
                                        // Anchor missing/different - render 16x16 portion from sprite
                                        // Jar variants at X=0,38,76 based on U. Offset is (-10, 0).
                                        int variant = curtile.U / 18;
                                        int sourceX = variant * 38 + 10; // 10 = abs(offset)
                                        int sourceY = tileOffsetY * 16;
                                        tileTex = _textureDictionary.GetTile(curtile.Type);
                                        source = new Rectangle(sourceX, sourceY, 16, 16);
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom),
                                            (int)_zoom,
                                            (int)_zoom);
                                        _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        continue;
                                    }
                                    else if (curtile.Type == 751 && curtile.U == 0 && curtile.V == 0)
                                    {
                                        // Sleeping Digtoise: 2x2 tiles (32x32px), visual 56x46px
                                        // Only render from anchor (top-left) tile
                                        // Sleeping Digtoise: 7 animation frames based on position
                                        // Frame = (x + y * 2) % 7, each frame is 46px tall
                                        int digtFrame = (x + y * 2) % 7;
                                        tileTex = _textureDictionary.GetTile(751);
                                        source = new Rectangle(0, digtFrame * 46, 56, 46);
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom) - (int)(12 * _zoom / 16f),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom) - (int)(7 * _zoom / 16f),
                                            (int)(56 * _zoom / 16f),
                                            (int)(46 * _zoom / 16f));
                                        _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        continue;
                                    }
                                    else if (curtile.Type == 751 && (curtile.U != 0 || curtile.V != 0))
                                    {
                                        // Non-anchor tile of Sleeping Digtoise - skip if anchor exists and is same type
                                        int tileOffsetX = curtile.U / 18;
                                        int tileOffsetY = curtile.V / 18;
                                        int anchorX = x - tileOffsetX;
                                        int anchorY = y - tileOffsetY;
                                        if (anchorX >= 0 && anchorY >= 0 && anchorX < _wvm.CurrentWorld.TilesWide && anchorY < _wvm.CurrentWorld.TilesHigh)
                                        {
                                            var anchorTile = _wvm.CurrentWorld.Tiles[anchorX, anchorY];
                                            if (anchorTile.IsActive && anchorTile.Type == 751 && anchorTile.U == 0 && anchorTile.V == 0)
                                                continue;
                                        }
                                        // Anchor missing/different - render 16x16 portion from sprite
                                        // Sprite offset is (-12, -7), so source starts at (12 + tileOffsetX*16, 7 + tileOffsetY*16)
                                        tileTex = _textureDictionary.GetTile(751);
                                        source = new Rectangle(12 + tileOffsetX * 16, 7 + tileOffsetY * 16, 16, 16);
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom),
                                            (int)_zoom,
                                            (int)_zoom);
                                        _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        continue;
                                    }
                                    else if (curtile.Type == 752 && curtile.U == 0 && curtile.V == 0)
                                    {
                                        // Chillet Egg: 2x2 tiles (32x32px), visual 36x38px
                                        // Only render from anchor (top-left) tile
                                        // Offset: -2px X, +2px Y
                                        tileTex = _textureDictionary.GetTile(752);
                                        source = new Rectangle(0, 0, 36, 38);
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom) - (int)(2 * _zoom / 16f),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom) + (int)(2 * _zoom / 16f),
                                            (int)(36 * _zoom / 16f),
                                            (int)(38 * _zoom / 16f));
                                        _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        continue;
                                    }
                                    else if (curtile.Type == 752 && (curtile.U != 0 || curtile.V != 0))
                                    {
                                        // Non-anchor tile of Chillet Egg - skip if anchor exists and is same type
                                        int tileOffsetX = curtile.U / 18;
                                        int tileOffsetY = curtile.V / 18;
                                        int anchorX = x - tileOffsetX;
                                        int anchorY = y - tileOffsetY;
                                        if (anchorX >= 0 && anchorY >= 0 && anchorX < _wvm.CurrentWorld.TilesWide && anchorY < _wvm.CurrentWorld.TilesHigh)
                                        {
                                            var anchorTile = _wvm.CurrentWorld.Tiles[anchorX, anchorY];
                                            if (anchorTile.IsActive && anchorTile.Type == 752 && anchorTile.U == 0 && anchorTile.V == 0)
                                                continue;
                                        }
                                        // Anchor missing/different - render 16x16 portion from sprite
                                        // Sprite offset is (-2, -3), so source starts at (2 + tileOffsetX*16, 3 + tileOffsetY*16)
                                        tileTex = _textureDictionary.GetTile(752);
                                        source = new Rectangle(2 + tileOffsetX * 16, 3 + tileOffsetY * 16, 16, 16);
                                        dest = new Rectangle(
                                            1 + (int)((_scrollPosition.X + x) * _zoom),
                                            1 + (int)((_scrollPosition.Y + y) * _zoom),
                                            (int)_zoom,
                                            (int)_zoom);
                                        _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                        continue;
                                    }
                                    else if (curtile.Type == (int)TileType.ChristmasTree) // Christmas Tree
                                    {
                                        if (curtile.U >= 10)
                                        {
                                            int star = curtile.V & 7;
                                            int garland = (curtile.V >> 3) & 7;
                                            int bulb = (curtile.V >> 6) & 0xf;
                                            int light = (curtile.V >> 10) & 0xf;
                                            source = new Rectangle(0, 0, 64, 128);
                                            dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom * 4, (int)_zoom * 8);
                                            if (star > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetMisc("Xmas_3");
                                                source.X = 66 * (star - 1);
                                                _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                            }
                                            if (garland > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetMisc("Xmas_1");
                                                source.X = 66 * (garland - 1);
                                                _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                            }
                                            if (bulb > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetMisc("Xmas_2");
                                                source.X = 66 * (bulb - 1);
                                                _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                            }
                                            if (light > 0)
                                            {
                                                tileTex = (Texture2D)_textureDictionary.GetMisc("Xmas_4");
                                                source.X = 66 * (light - 1);
                                                _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                            }
                                            source.X = 0;
                                            tileTex = (Texture2D)_textureDictionary.GetMisc("Xmas_0");
                                        }
                                    }
                                    else if (curtile.Type == (int)TileType.MinecartTrack)
                                    {
                                        source = new Rectangle(0, 0, 16, 16);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        if (curtile.V >= 0) // Switch Track, Y is back tile if not -1
                                        {
                                            Vector2Int32 uvback = TrackUV(curtile.V);
                                            source.X = uvback.X * (source.Width + 2);
                                            source.Y = uvback.Y * (source.Height + 2);
                                            _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrackBack);
                                        }
                                        if ((curtile.U >= 2 && curtile.U <= 3) || (curtile.U >= 10 && curtile.U <= 13))
                                        { // Adding regular endcap
                                            dest.Y = 1 + (int)((_scrollPosition.Y + y - 1) * _zoom);
                                            source.X = 0;
                                            source.Y = 126;
                                            _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                        }
                                        if (curtile.U >= 24 && curtile.U <= 29)
                                        { // Adding bumper endcap
                                            dest.Y = 1 + (int)((_scrollPosition.Y + y - 1) * _zoom);
                                            source.X = 18;
                                            source.Y = 126;
                                            _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTrack);
                                        }
                                        if (curtile.U == 4 || curtile.U == 9 || curtile.U == 10 || curtile.U == 16 || curtile.U == 26 || curtile.U == 33 || curtile.U == 35 || curtile.V == 4)
                                        { // Adding angle track bottom right
                                            dest.Y = 1 + (int)((_scrollPosition.Y + y + 1) * _zoom);
                                            source.X = 0;
                                            source.Y = 108;
                                            for (int slice = 0; slice < 6; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, 12 - slice * 2);
                                                Vector2 destSlice = new Vector2((int)(dest.X + slice * _zoom / 8.0f), dest.Y);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTrack);
                                            }
                                        }
                                        if (curtile.U == 5 || curtile.U == 8 || curtile.U == 11 || curtile.U == 17 || curtile.U == 27 || curtile.U == 32 || curtile.U == 34 || curtile.V == 5)
                                        { // Adding angle track bottom left
                                            dest.Y = 1 + (int)((_scrollPosition.Y + y + 1) * _zoom);
                                            source.X = 18;
                                            source.Y = 108;
                                            for (int slice = 2; slice < 8; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, slice * 2 - 2);
                                                Vector2 destSlice = new Vector2((int)(dest.X + slice * _zoom / 8.0f), dest.Y);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTrack);
                                            }
                                        }
                                        dest.Y = 1 + (int)((_scrollPosition.Y + y) * _zoom);
                                        Vector2Int32 uv = TrackUV(curtile.U);
                                        source.X = uv.X * (source.Width + 2);
                                        source.Y = uv.Y * (source.Height + 2);

                                    }
                                    else if (isTreeSpecial)
                                    {
                                        source = new Rectangle(0, 0, 40, 40);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        FrameAnchor frameAnchor = FrameAnchor.None;

                                        int treeStyle = (curtile.uvTileCache & 0x00FF);
                                        // Tree frame determines which variant to show (0, 1, or 2)
                                        // This is position-based to give visual variety, matching Terraria's GetTreeFrame
                                        int treeFrame = x % 3;
                                        if (isBase)
                                        {
                                            source.Width = 80;
                                            source.Height = 80;
                                            if (curtile.Type == 323)
                                            {
                                                source.Y = treeStyle * (source.Height + 2);
                                                source.X = ((curtile.U - 88) / 22) * (source.Width + 2);
                                                dest.X += (int)(curtile.V * _zoom / 16);
                                            }
                                            else
                                            {
                                                switch (treeStyle)
                                                {
                                                    case 2:
                                                    case 11:
                                                    case 13:
                                                        source.Width = 114;
                                                        source.Height = 96;
                                                        break;
                                                    case 3:
                                                        source.X = (x % 3) * (82 * 3);
                                                        source.Height = 140;
                                                        break;
                                                    // Gem trees (styles 22-28): 116x96
                                                    case 22:
                                                    case 23:
                                                    case 24:
                                                    case 25:
                                                    case 26:
                                                    case 27:
                                                    case 28:
                                                    // Ash tree (style 31): 116x96
                                                    case 31:
                                                        source.Width = 116;
                                                        source.Height = 96;
                                                        break;
                                                    // Vanity trees (styles 29-30): 118x96
                                                    case 29:
                                                    case 30:
                                                        source.Width = 118;
                                                        source.Height = 96;
                                                        break;
                                                }
                                                // Use position-based frame for visual variety
                                                source.X += treeFrame * (source.Width + 2);
                                            }
                                            frameAnchor = FrameAnchor.Bottom;
                                        }
                                        else if (isLeft)
                                        {
                                            source.X = 0;
                                            switch (treeStyle)
                                            {
                                                case 3:
                                                    source.Y = (x % 3) * (42 * 3);
                                                    break;
                                            }
                                            frameAnchor = FrameAnchor.Right;
                                            // Use position-based frame for branch variety
                                            source.Y += treeFrame * (source.Height + 2);
                                        }
                                        else if (isRight)
                                        {
                                            source.X = 42;
                                            switch (treeStyle)
                                            {
                                                case 3:
                                                    source.Y = (x % 3) * (42 * 3);
                                                    break;
                                            }
                                            frameAnchor = FrameAnchor.Left;
                                            // Use position-based frame for branch variety
                                            source.Y += treeFrame * (source.Height + 2);
                                        }
                                        dest.Width = (int)(_zoom * source.Width / 16f);
                                        dest.Height = (int)(_zoom * source.Height / 16f);
                                        switch (frameAnchor)
                                        {
                                            case FrameAnchor.None:
                                                dest.X += (int)(((16 - source.Width) / 2F) * _zoom / 16);
                                                dest.Y += (int)(((16 - source.Height) / 2F) * _zoom / 16);
                                                break;
                                            case FrameAnchor.Left:
                                                dest.Y += (int)(((16 - source.Height) / 2F) * _zoom / 16);
                                                break;
                                            case FrameAnchor.Right:
                                                dest.X += (int)((16 - source.Width) * _zoom / 16);
                                                dest.Y += (int)(((16 - source.Height) / 2F) * _zoom / 16);
                                                break;
                                            case FrameAnchor.Top:
                                                dest.X += (int)(((16 - source.Width) / 2F) * _zoom / 16);
                                                break;
                                            case FrameAnchor.Bottom:
                                                dest.X += (int)(((16 - source.Width) / 2F) * _zoom / 16);
                                                dest.Y += (int)((16 - source.Height) * _zoom / 16);
                                                break;
                                        }
                                    }
                                    else if (isMushroom)
                                    {
                                        source = new Rectangle(0, 0, 60, 42);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                        source.X = (curtile.V / 18) * 62;

                                        dest.Width = (int)(_zoom * source.Width / 16f);
                                        dest.Height = (int)(_zoom * source.Height / 16f);
                                        dest.X += (int)(((16 - source.Width) / 2F) * _zoom / 16);
                                        dest.Y += (int)((16 - source.Height) * _zoom / 16);
                                    }
                                    else
                                    {
                                        var type = curtile.Type;
                                        var renderUV = TileProperty.GetRenderUV(curtile.Type, curtile.U, curtile.V);

                                        // Render selected chest as "open" by adding 38 to frameY
                                        // Chests are 2x2, so check if current tile is within the selected chest area
                                        if (curtile.IsChest() && _selectedChestPosition.X >= 0)
                                        {
                                            int chestX = _selectedChestPosition.X;
                                            int chestY = _selectedChestPosition.Y;
                                            if (x >= chestX && x <= chestX + 1 && y >= chestY && y <= chestY + 1)
                                            {
                                                renderUV.Y += 38;
                                            }
                                        }

                                        source = new Rectangle(renderUV.X, renderUV.Y, tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                        dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                        if (type == 323)
                                        {
                                            dest.X += (int)(curtile.V * _zoom / 16);
                                            int treeType = (curtile.uvTileCache & 0x000F);
                                            source.Y = 22 * treeType;
                                        }
                                        // Handle Chimney (tiles 406) special case
                                        else if (type == 406)
                                        {
                                            switch (renderUV.Y / 54)
                                            {
                                                // On A
                                                case 0: break;
                                                // On B
                                                case 1: source.Y = source.Y % 54 + 56; break;
                                                // Off
                                                case 2: source.Y = source.Y % 54 + 56 * 6; break;
                                            }
                                        }
                                        // Handle Aether Monolith (tiles 658) special case
                                        else if (type == 658)
                                        {
                                            switch (renderUV.Y / 54)
                                            {
                                                // On A
                                                case 0: break;
                                                // On B
                                                case 1: source.Y = source.Y % 54 + 54 * 10; break;
                                                // Off
                                                case 2: source.Y = source.Y % 54 + 54 * 20; break;
                                            }
                                        }
                                        // Handle Relic Base (tiles 617) special case
                                        else if (type == 617)
                                        {
                                            if (renderUV.Y % 72 == 54)
                                            {
                                                source.X %= 54;
                                            }
                                            else
                                            {
                                                tileTex = _textureDictionary.GetExtra(198);
                                                source.X = renderUV.X % 54 / 18 * 16;
                                                source.Y = renderUV.Y % 72 / 18 * 16 + renderUV.X / 54 * 50;
                                            }
                                        }
                                        // Handle Radio Thing (tile 733) special case
                                        // On state: UV Y < 54, texture shifts X by 54
                                        // Off state: UV Y >= 54, no X shift; both axes wrap by 54
                                        else if (type == 733)
                                        {
                                            if (renderUV.Y < 54)
                                                source.X = renderUV.X % 54 + 54;
                                            else
                                                source.X = renderUV.X % 54;
                                            source.Y = renderUV.Y % 54;
                                        }
                                        // Handle Magic Droppers (tiles 373, 374, 375, 461, 709) special case
                                        else if (type == 373 || type == 374 || type == 375 || type == 461 || type == 709)
                                        {
                                            var goreType = type switch { 373 => 706, 374 => 716, 375 => 717, 461 => 943, 709 => 1383, _ => 0 };
                                            tileTex = _textureDictionary.GetGore(goreType);
                                            source.Y = 80;
                                        }

                                        if (source.Width <= 0)
                                            source.Width = 16;
                                        if (source.Height <= 0)
                                            source.Height = 16;

                                        if (source.Bottom > tileTex.Height)
                                            source.Height -= (source.Bottom - tileTex.Height);
                                        if (source.Right > tileTex.Width)
                                            source.Width -= (source.Right - tileTex.Width);

                                        if (source.Width <= 0 || source.Height <= 0)
                                            continue;

                                        var texsize = tileprop.TextureGrid;
                                        if (texsize.X != 16 || texsize.Y != 16)
                                        {
                                            dest.Width = (int)(texsize.X * (_zoom / 16));
                                            dest.Height = (int)(texsize.Y * (_zoom / 16));

                                            var tileU = curtile.U; var tileV = curtile.V;
                                            var frame = (tileprop.Frames.FirstOrDefault(f => f.UV == new Vector2Short(tileU, tileV)));
                                            var frameAnchor = FrameAnchor.None;
                                            if (frame != null)
                                                frameAnchor = frame.Anchor;
                                            switch (frameAnchor)
                                            {
                                                case FrameAnchor.None:
                                                    dest.X += (int)(((16 - texsize.X) / 2F) * _zoom / 16);
                                                    dest.Y += (int)(((16 - texsize.Y) / 2F) * _zoom / 16);
                                                    break;
                                                case FrameAnchor.Left:
                                                    //position.X += (16 - texsize.X) / 2;
                                                    dest.Y += (int)(((16 - texsize.Y) / 2F) * _zoom / 16);
                                                    break;
                                                case FrameAnchor.Right:
                                                    dest.X += (int)((16 - texsize.X) * _zoom / 16);
                                                    dest.Y += (int)(((16 - texsize.Y) / 2F) * _zoom / 16);
                                                    break;
                                                case FrameAnchor.Top:
                                                    dest.X += (int)(((16 - texsize.X) / 2F) * _zoom / 16);
                                                    //position.Y += (16 - texsize.Y);
                                                    break;
                                                case FrameAnchor.Bottom:
                                                    dest.X += (int)(((16 - texsize.X) / 2F) * _zoom / 16);
                                                    dest.Y += (int)((16 - texsize.Y) * _zoom / 16);
                                                    break;
                                            }
                                        }
                                    }

                                    // Grass/plant/vine rendering: horizontal flip on alternating X
                                    var spriteEffect = SpriteEffects.None;
                                    if (_spriteFlipTileIds.Contains(curtile.Type) && x % 2 == 0)
                                        spriteEffect = SpriteEffects.FlipHorizontally;

                                    // Apply tile render offsets (vines, position offset tiles)
                                    ApplyTileRenderOffset(ref dest, curtile.Type, curtile.U, curtile.V, _zoom);

                                    if (tileprop.HasSlopes && curtile.BrickStyle != BrickStyle.Full)
                                    {
                                        DrawSlopedTile(_spriteBatch, tileTex, source, dest, curtile, tilePaintColor, LayerTileTextures);
                                    }
                                    else
                                    {
                                        _spriteBatch.Draw(tileTex, dest, source, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, spriteEffect, LayerTileTextures);
                                    }
                                    // Actuator Overlay — always draw at standard tile size, not the (possibly inflated) dest
                                    if (curtile.Actuator && _wvm.ShowActuators)
                                    {
                                        var actuatorDest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        _spriteBatch.Draw(_textureDictionary.Actuator, actuatorDest, _textureDictionary.ZeroSixteenRectangle, Color.White, 0f, default, SpriteEffects.None, LayerTileActuator);
                                    }

                                }
                            }
                            else if (tileprop.IsPlatform)
                            {
                                var tileTex = _textureDictionary.GetTile(curtile.Type);

                                if (tileTex != null)
                                {
                                    Vector2Int32 uv;
                                    if (curtile.uvTileCache == 0xFFFF)
                                    {
                                        uv = new Vector2Int32(0, 0);

                                        // Use tile's actual U value if it has valid stair framing (columns 8-26)
                                        int tileColumn = curtile.U >= 0 ? curtile.U / 18 : -1;
                                        if (tileColumn >= 8 && tileColumn <= 26)
                                        {
                                            uv.X = tileColumn;
                                        }
                                        else
                                        {
                                            // Flat platform: compute from W/E horizontal neighbors
                                            byte state = 0x00;
                                            state |= (byte)((neighborTile[w]?.IsActive == true && neighborTile[w].Value.Type == curtile.Type) ? 0x01 : 0x00);
                                            state |= (byte)((neighborTile[w]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[w].Value.Type).HasSlopes && neighborTile[w].Value.Type != curtile.Type) ? 0x02 : 0x00);
                                            state |= (byte)((neighborTile[e]?.IsActive == true && neighborTile[e].Value.Type == curtile.Type) ? 0x04 : 0x00);
                                            state |= (byte)((neighborTile[e]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[e].Value.Type).HasSlopes && neighborTile[e].Value.Type != curtile.Type) ? 0x08 : 0x00);
                                            switch (state)
                                            {
                                                case 0x00:
                                                case 0x0A:
                                                    uv.X = 5;
                                                    break;
                                                case 0x01:
                                                    uv.X = 1;
                                                    break;
                                                case 0x02:
                                                    uv.X = 6;
                                                    break;
                                                case 0x04:
                                                    uv.X = 2;
                                                    break;
                                                case 0x05:
                                                    uv.X = 0;
                                                    break;
                                                case 0x06:
                                                    uv.X = 3;
                                                    break;
                                                case 0x08:
                                                    uv.X = 7;
                                                    break;
                                                case 0x09:
                                                    uv.X = 4;
                                                    break;
                                            }
                                        }

                                        // Row: style offset + visual variation
                                        int style = curtile.V >= 0 ? curtile.V / 18 : 0;
                                        int variation = ((x * 7) + (y * 11)) % 3;
                                        uv.Y = style * 3 + variation;
                                        curtile.uvTileCache = (ushort)((uv.Y << 8) + uv.X);
                                    }

                                    var texsize = new Vector2Int32(tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                    if (texsize.X == 0 || texsize.Y == 0)
                                    {
                                        texsize = new Vector2Int32(16, 16);
                                    }
                                    var source = new Rectangle((curtile.uvTileCache & 0x00FF) * (texsize.X + 2), (curtile.uvTileCache >> 8) * (texsize.Y + 2), texsize.X, texsize.Y);
                                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                    _spriteBatch.Draw(tileTex, dest, source, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                    // Actuator Overlay — always draw at standard tile size
                                    if (curtile.Actuator && _wvm.ShowActuators)
                                    {
                                        var actuatorDest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        _spriteBatch.Draw(_textureDictionary.Actuator, actuatorDest, _textureDictionary.ZeroSixteenRectangle, Color.White, 0f, default, SpriteEffects.None, LayerTileActuator);
                                    }

                                }
                            }
                            else if (tileprop.IsCactus)
                            {

                                var tileTex = _textureDictionary.GetTile(curtile.Type);

                                if ((curtile.uvTileCache & 0x00FF) >= 24)
                                {
                                    tileTex = (Texture2D)_textureDictionary.GetMisc("Crimson_Cactus");
                                }
                                else if ((curtile.uvTileCache & 0x00FF) >= 16)
                                {
                                    tileTex = (Texture2D)_textureDictionary.GetMisc("Evil_Cactus");
                                }
                                else if ((curtile.uvTileCache & 0x00FF) >= 8)
                                {
                                    tileTex = (Texture2D)_textureDictionary.GetMisc("Good_Cactus");
                                }

                                if (tileTex != null)
                                {
                                    Vector2Int32 uv;
                                    if (curtile.uvTileCache == 0xFFFF || curtile.hasLazyChecked == false)
                                    {
                                        bool isLeft = false, isRight = false, isBase = false;

                                        //Has this cactus been base-evaluated yet?
                                        int neighborX = ((neighborTile[w]?.uvTileCache ?? 0) & 0x00FF) % 8; //Why % 8? If X >= 8, use hallow, If X >= 16, use corruption
                                        if (neighborX == 0 || neighborX == 1 || neighborX == 4 || neighborX == 5)
                                        {
                                            isRight = true;
                                        }
                                        neighborX = (neighborTile[e]?.uvTileCache ?? 0) & 0x00FF;
                                        if (neighborX == 0 || neighborX == 1 || neighborX == 4 || neighborX == 5)
                                        {
                                            isLeft = true;
                                        }
                                        neighborX = curtile.uvTileCache & 0x00FF;
                                        if (neighborX == 0 || neighborX == 1 || neighborX == 4 || neighborX == 5)
                                        {
                                            isBase = true;
                                        }

                                        //Evaluate Base
                                        if (isLeft == false && isRight == false && isBase == false)
                                        {
                                            int length1 = 0;
                                            int length2 = 0;
                                            while (true)
                                            {
                                                Tile? checkTile = (y + length1) < _wvm.CurrentWorld.TilesHigh ? _wvm.CurrentWorld.Tiles[x, y + length1] : null;
                                                if (checkTile == null || checkTile.Value.IsActive == false || checkTile.Value.Type != curtile.Type)
                                                {
                                                    break;
                                                }
                                                length1++;
                                            }
                                            if (x + 1 < _wvm.CurrentWorld.TilesWide)
                                            {
                                                while (true)
                                                {
                                                    Tile? checkTile = (y + length2) < _wvm.CurrentWorld.TilesHigh ? _wvm.CurrentWorld.Tiles[x + 1, y + length2] : null;
                                                    if (checkTile == null || checkTile.Value.IsActive == false || checkTile.Value.Type != curtile.Type)
                                                    {
                                                        break;
                                                    }
                                                    length2++;
                                                }
                                            }
                                            int baseX = 0;
                                            int baseY = length1;
                                            isBase = true;
                                            if (length2 >= length1)
                                            {
                                                baseX = 1;
                                                baseY = length2;
                                                isBase = false;
                                                isLeft = true;
                                            }
                                            for (int cy = y; cy < y + baseY; cy++)
                                            {
                                                if (_wvm.CurrentWorld.Tiles[x + baseX, cy].uvTileCache == 0xFFFF)
                                                {
                                                    if (cy == y)
                                                    {
                                                        _wvm.CurrentWorld.Tiles[x + baseX, cy].uvTileCache = 0x00 << 8 + 0x00;
                                                    }
                                                    else
                                                    {
                                                        _wvm.CurrentWorld.Tiles[x + baseX, cy].uvTileCache = 0x01 << 8 + 0x00;
                                                    }
                                                }
                                            }
                                        }

                                        uv = new Vector2Int32(0, 0);
                                        byte state = 0x00;
                                        state |= (byte)((neighborTile[e]?.IsActive == true && neighborTile[e].Value.Type == curtile.Type) ? 0x01 : 0x00);
                                        state |= (byte)((neighborTile[n]?.IsActive == true && neighborTile[n].Value.Type == curtile.Type) ? 0x02 : 0x00);
                                        state |= (byte)((neighborTile[w]?.IsActive == true && neighborTile[w].Value.Type == curtile.Type) ? 0x04 : 0x00);
                                        state |= (byte)((neighborTile[s]?.IsActive == true && neighborTile[s].Value.Type == curtile.Type) ? 0x08 : 0x00);
                                        //state |= (byte)((neighborTile[ne]?.IsActive == true && neighborTile[ne].Value.Type == curtile.Type) ? 0x10 : 0x00);
                                        //state |= (byte)((neighborTile[nw]?.IsActive == true && neighborTile[nw].Value.Type == curtile.Type) ? 0x20 : 0x00);
                                        state |= (byte)((neighborTile[sw]?.IsActive == true && neighborTile[sw].Value.Type == curtile.Type) ? 0x40 : 0x00);
                                        state |= (byte)((neighborTile[se]?.IsActive == true && neighborTile[se].Value.Type == curtile.Type) ? 0x80 : 0x00);

                                        if (isLeft)
                                        {
                                            uv.X = 3;
                                            if ((state & 0x08) != 0x00) //s
                                            {
                                                if ((state & 0x02) != 0x00) //n
                                                {
                                                    uv.Y = 1;
                                                }
                                                else //!n
                                                {
                                                    uv.Y = 0;
                                                }
                                            }
                                            else //!s
                                            {
                                                if ((state & 0x02) != 0x00) //n
                                                {
                                                    uv.Y = 2;
                                                }
                                                else //!n
                                                {
                                                    uv.X = 6;
                                                    uv.Y = 2;
                                                }
                                            }
                                        }
                                        if (isRight)
                                        {
                                            uv.X = 2;
                                            if ((state & 0x08) != 0x00) //s
                                            {
                                                if ((state & 0x02) != 0x00) //n
                                                {
                                                    uv.Y = 1;
                                                }
                                                else //!n
                                                {
                                                    uv.Y = 0;
                                                }
                                            }
                                            else //!s
                                            {
                                                if ((state & 0x02) != 0x00) //n
                                                {
                                                    uv.Y = 2;
                                                }
                                                else //!n
                                                {
                                                    uv.X = 6;
                                                    uv.Y = 1;
                                                }
                                            }
                                        }
                                        if (isBase)
                                        {
                                            if ((state & 0x02) != 0x00) //n
                                            {
                                                uv.Y = 2;
                                                if ((state & 0x04) != 0x00 && (state & 0x40) == 0x00 && ((state & 0x01) == 0x00 || (state & 0x80) != 0x00)) //w !sw (!e or se)
                                                {
                                                    uv.X = 4;
                                                }
                                                else if ((state & 0x01) != 0x00 && (state & 0x80) == 0x00 && ((state & 0x04) == 0x00 || (state & 0x40) != 0x00)) //e !se (!w or sw)
                                                {
                                                    uv.X = 1;
                                                }
                                                else if ((state & 0x04) != 0x00 && (state & 0x40) == 0x00 && (state & 0x01) != 0x00 && (state & 0x80) == 0x00) //w !sw e !se
                                                {
                                                    uv.X = 5;
                                                }
                                                else
                                                {
                                                    uv.X = 0;
                                                    uv.Y = 1;
                                                }
                                            }
                                            else //!n
                                            {
                                                uv.Y = 0;
                                                if ((state & 0x04) != 0x00 && (state & 0x40) == 0x00 && ((state & 0x01) == 0x00 || (state & 0x80) != 0x00)) //w !sw (!e or se)
                                                {
                                                    uv.X = 4;
                                                }
                                                else if ((state & 0x01) != 0x00 && (state & 0x80) == 0x00 && ((state & 0x04) == 0x00 || (state & 0x40) != 0x00)) //e !se (!w or sw)
                                                {
                                                    uv.X = 1;
                                                }
                                                else if ((state & 0x04) != 0x00 && (state & 0x40) == 0x00 && (state & 0x01) != 0x00 && (state & 0x80) == 0x00) //w !sw e !se
                                                {
                                                    uv.X = 5;
                                                }
                                                else
                                                {
                                                    uv.X = 0;
                                                    uv.Y = 0;
                                                }
                                            }
                                        }

                                        //Check if cactus is good or evil
                                        for (int i = 0; i < 100; i++)
                                        {
                                            int baseX = (isLeft) ? 1 : (isRight) ? -1 : 0;
                                            Tile? checkTile = (y + i) < _wvm.CurrentWorld.TilesHigh ? _wvm.CurrentWorld.Tiles[x + baseX, y + i] : null;
                                            if (checkTile != null && checkTile.Value.IsActive && checkTile.Value.Type == (int)TileType.CrimsandBlock) //Crimson
                                            {
                                                uv.X += 24;
                                                break;
                                            }
                                            if (checkTile != null && checkTile.Value.IsActive && checkTile.Value.Type == (int)TileType.EbonsandBlock) //Corruption
                                            {
                                                uv.X += 16;
                                                break;
                                            }
                                            else if (checkTile != null && checkTile.Value.IsActive && checkTile.Value.Type == (int)TileType.PearlsandBlock) //Hallow
                                            {
                                                uv.X += 8;
                                                break;
                                            }
                                        }
                                        curtile.hasLazyChecked = true;

                                        curtile.uvTileCache = (ushort)((uv.Y << 8) + uv.X);
                                    }

                                    var texsize = new Vector2Int32(tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                    if (texsize.X == 0 || texsize.Y == 0)
                                    {
                                        texsize = new Vector2Int32(16, 16);
                                    }
                                    var source = new Rectangle(((curtile.uvTileCache & 0x00FF) % 8) * (texsize.X + 2), (curtile.uvTileCache >> 8) * (texsize.Y + 2), texsize.X, texsize.Y);
                                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                    _spriteBatch.Draw(tileTex, dest, source, tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                }
                            }
                            else if (tileprop.CanBlend || !(tileprop.IsFramed || tileprop.IsAnimated))
                            {
                                var tileTex = _textureDictionary.GetTile(curtile.Type);

                                if (tileTex != null)
                                {
                                    if (curtile.uvTileCache == 0xFFFF || curtile.hasLazyChecked == false)
                                    {
                                        if (TileFraming.IsGemSpark(curtile.Type))
                                        {
                                            var uv = TileFraming.CalculateSelfFrame8Way(_wvm.CurrentWorld, x, y);
                                            curtile.uvTileCache = (ushort)((uv.Y << 8) + uv.X);
                                            curtile.hasLazyChecked = true;
                                        }
                                        else
                                        {
                                        // TODO: Replace BlendRules path with full TileFrameCosmetic port for pixel-perfect accuracy
                                        int sameStyle = 0x00000000;
                                        int mergeMask = 0x00000000;
                                        int strictness = 0;
                                        if (tileprop.MergeWith.HasValue && tileprop.MergeWith.Value == -1) //Basically for cobweb
                                        {
                                            sameStyle |= (neighborTile[e]?.IsActive == true) ? 0x0001 : 0x0000;
                                            sameStyle |= (neighborTile[n]?.IsActive == true) ? 0x0010 : 0x0000;
                                            sameStyle |= (neighborTile[w]?.IsActive == true) ? 0x0100 : 0x0000;
                                            sameStyle |= (neighborTile[s]?.IsActive == true) ? 0x1000 : 0x0000;
                                        }
                                        else if (tileprop.IsStone) //Stone & Gems
                                        {
                                            sameStyle |= (neighborTile[e]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[e].Value.Type).IsStone) ? 0x0001 : 0x0000;
                                            sameStyle |= (neighborTile[n]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[n].Value.Type).IsStone) ? 0x0010 : 0x0000;
                                            sameStyle |= (neighborTile[w]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[w].Value.Type).IsStone) ? 0x0100 : 0x0000;
                                            sameStyle |= (neighborTile[s]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[s].Value.Type).IsStone) ? 0x1000 : 0x0000;
                                            sameStyle |= (neighborTile[ne]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[ne].Value.Type).IsStone) ? 0x00010000 : 0x00000000;
                                            sameStyle |= (neighborTile[nw]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[nw].Value.Type).IsStone) ? 0x00100000 : 0x00000000;
                                            sameStyle |= (neighborTile[sw]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[sw].Value.Type).IsStone) ? 0x01000000 : 0x00000000;
                                            sameStyle |= (neighborTile[se]?.IsActive == true && WorldConfiguration.GetTileProperties(neighborTile[se].Value.Type).IsStone) ? 0x10000000 : 0x00000000;
                                        }
                                        else //Everything else
                                        {
                                            //Join to nearby tiles if their merge type is this tile's type
                                            sameStyle |= (neighborTile[e]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[e].Value.Type))) ? 0x0001 : 0x0000;
                                            sameStyle |= (neighborTile[n]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[n].Value.Type))) ? 0x0010 : 0x0000;
                                            sameStyle |= (neighborTile[w]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[w].Value.Type))) ? 0x0100 : 0x0000;
                                            sameStyle |= (neighborTile[s]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[s].Value.Type))) ? 0x1000 : 0x0000;
                                            sameStyle |= (neighborTile[ne]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[ne].Value.Type))) ? 0x00010000 : 0x00000000;
                                            sameStyle |= (neighborTile[nw]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[nw].Value.Type))) ? 0x00100000 : 0x00000000;
                                            sameStyle |= (neighborTile[sw]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[sw].Value.Type))) ? 0x01000000 : 0x00000000;
                                            sameStyle |= (neighborTile[se]?.IsActive == true && tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[se].Value.Type))) ? 0x10000000 : 0x00000000;
                                            //Join if nearby tiles have the same type as this tile's type
                                            sameStyle |= (neighborTile[e]?.IsActive == true && curtile.Type == neighborTile[e].Value.Type) ? 0x0001 : 0x0000;
                                            sameStyle |= (neighborTile[n]?.IsActive == true && curtile.Type == neighborTile[n].Value.Type) ? 0x0010 : 0x0000;
                                            sameStyle |= (neighborTile[w]?.IsActive == true && curtile.Type == neighborTile[w].Value.Type) ? 0x0100 : 0x0000;
                                            sameStyle |= (neighborTile[s]?.IsActive == true && curtile.Type == neighborTile[s].Value.Type) ? 0x1000 : 0x0000;
                                            sameStyle |= (neighborTile[ne]?.IsActive == true && curtile.Type == neighborTile[ne].Value.Type) ? 0x00010000 : 0x00000000;
                                            sameStyle |= (neighborTile[nw]?.IsActive == true && curtile.Type == neighborTile[nw].Value.Type) ? 0x00100000 : 0x00000000;
                                            sameStyle |= (neighborTile[sw]?.IsActive == true && curtile.Type == neighborTile[sw].Value.Type) ? 0x01000000 : 0x00000000;
                                            sameStyle |= (neighborTile[se]?.IsActive == true && curtile.Type == neighborTile[se].Value.Type) ? 0x10000000 : 0x00000000;
                                        }
                                        if (curtile.hasLazyChecked == false)
                                        {
                                            bool lazyCheckReady = true;
                                            lazyCheckReady &= (neighborTile[e] == null || neighborTile[e].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[e].Value.Type))) ? true : (neighborTile[e].Value.lazyMergeId != 0xFF);
                                            lazyCheckReady &= (neighborTile[n] == null || neighborTile[n].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[n].Value.Type))) ? true : (neighborTile[n].Value.lazyMergeId != 0xFF);
                                            lazyCheckReady &= (neighborTile[w] == null || neighborTile[w].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[w].Value.Type))) ? true : (neighborTile[w].Value.lazyMergeId != 0xFF);
                                            lazyCheckReady &= (neighborTile[s] == null || neighborTile[s].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[s].Value.Type))) ? true : (neighborTile[s].Value.lazyMergeId != 0xFF);
                                            if (lazyCheckReady)
                                            {
                                                sameStyle &= 0x11111110 | ((neighborTile[e] == null || neighborTile[e].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[e].Value.Type))) ? 0x00000001 : ((neighborTile[e].Value.lazyMergeId & 0x04) >> 2));
                                                sameStyle &= 0x11111101 | ((neighborTile[n] == null || neighborTile[n].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[n].Value.Type))) ? 0x00000010 : ((neighborTile[n].Value.lazyMergeId & 0x08) << 1));
                                                sameStyle &= 0x11111011 | ((neighborTile[w] == null || neighborTile[w].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[w].Value.Type))) ? 0x00000100 : ((neighborTile[w].Value.lazyMergeId & 0x01) << 8));
                                                sameStyle &= 0x11110111 | ((neighborTile[s] == null || neighborTile[s].Value.IsActive == false || !tileprop.Merges(WorldConfiguration.GetTileProperties(neighborTile[s].Value.Type))) ? 0x00001000 : ((neighborTile[s].Value.lazyMergeId & 0x02) << 11));
                                                curtile.hasLazyChecked = true;
                                            }
                                        }
                                        if (tileprop.MergeWith.HasValue && tileprop.MergeWith.Value > -1) //Merges with a specific type
                                        {
                                            mergeMask |= (neighborTile[e]?.IsActive == true && neighborTile[e].Value.Type == tileprop.MergeWith.Value) ? 0x0001 : 0x0000;
                                            mergeMask |= (neighborTile[n]?.IsActive == true && neighborTile[n].Value.Type == tileprop.MergeWith.Value) ? 0x0010 : 0x0000;
                                            mergeMask |= (neighborTile[w]?.IsActive == true && neighborTile[w].Value.Type == tileprop.MergeWith.Value) ? 0x0100 : 0x0000;
                                            mergeMask |= (neighborTile[s]?.IsActive == true && neighborTile[s].Value.Type == tileprop.MergeWith.Value) ? 0x1000 : 0x0000;
                                            mergeMask |= (neighborTile[ne]?.IsActive == true && neighborTile[ne].Value.Type == tileprop.MergeWith.Value) ? 0x00010000 : 0x00000000;
                                            mergeMask |= (neighborTile[nw]?.IsActive == true && neighborTile[nw].Value.Type == tileprop.MergeWith.Value) ? 0x00100000 : 0x00000000;
                                            mergeMask |= (neighborTile[sw]?.IsActive == true && neighborTile[sw].Value.Type == tileprop.MergeWith.Value) ? 0x01000000 : 0x00000000;
                                            mergeMask |= (neighborTile[se]?.IsActive == true && neighborTile[se].Value.Type == tileprop.MergeWith.Value) ? 0x10000000 : 0x00000000;
                                            strictness = 1;
                                        }
                                        if (tileprop.IsGrass)
                                        {
                                            strictness = 2;
                                        }

                                        int variant = TileFraming.DetermineFrameNumber(curtile.Type, x, y);
                                        Vector2Int32 uvBlend = blendRules.GetUVForMasks((uint)sameStyle, (uint)mergeMask, strictness, variant);
                                        curtile.uvTileCache = (ushort)((uvBlend.Y << 8) + uvBlend.X);
                                        curtile.lazyMergeId = blendRules.lazyMergeValidation[uvBlend.Y, uvBlend.X];
                                        } // end else (non-gemspark BlendRules path)
                                    }

                                    var texsize = new Vector2Int32(tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                                    if (texsize.X == 0 || texsize.Y == 0)
                                    {
                                        texsize = new Vector2Int32(16, 16);
                                    }
                                    var source = new Rectangle((curtile.uvTileCache & 0x00FF) * (texsize.X + 2), (curtile.uvTileCache >> 8) * (texsize.Y + 2), texsize.X, texsize.Y);
                                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                    // Render liquid behind tiles if adjacent tile has liquid
                                    if (_wvm.ShowLiquid)
                                    {
                                        Tile? adjacentLiquidTile = null;
                                        int adjacentX = x, adjacentY = y;

                                        if (y > 0)
                                        {
                                            var aboveTile = _wvm.CurrentWorld.Tiles[x, y - 1];
                                            if (aboveTile.LiquidAmount > 0)
                                            {
                                                adjacentLiquidTile = aboveTile;
                                                adjacentY = y - 1;
                                            }
                                        }
                                        // For horizontal liquid, render if one side has liquid AND other side has liquid or solid tile (not air/plants)
                                        if (adjacentLiquidTile == null && x > 0 && x < _wvm.CurrentWorld.TilesWide - 1)
                                        {
                                            var leftTile = _wvm.CurrentWorld.Tiles[x - 1, y];
                                            var rightTile = _wvm.CurrentWorld.Tiles[x + 1, y];
                                            bool leftIsSolid = leftTile.IsActive && WorldConfiguration.GetTileProperties(leftTile.Type).IsSolid;
                                            bool rightIsSolid = rightTile.IsActive && WorldConfiguration.GetTileProperties(rightTile.Type).IsSolid;
                                            // Left has liquid, right has liquid or solid tile
                                            if (leftTile.LiquidAmount > 0 && (rightTile.LiquidAmount > 0 || rightIsSolid))
                                            {
                                                adjacentLiquidTile = leftTile;
                                                adjacentX = x - 1;
                                            }
                                            // Right has liquid, left has liquid or solid tile
                                            else if (rightTile.LiquidAmount > 0 && (leftTile.LiquidAmount > 0 || leftIsSolid))
                                            {
                                                adjacentLiquidTile = rightTile;
                                                adjacentX = x + 1;
                                            }
                                        }

                                        if (adjacentLiquidTile != null)
                                        {
                                            Texture2D liquidTex = null;
                                            var liquidColor = Color.White;
                                            float alpha = 0.5f;

                                            if (adjacentLiquidTile.Value.LiquidType == LiquidType.Lava)
                                            {
                                                liquidTex = (Texture2D)_textureDictionary.GetLiquid(1);
                                                alpha = 0.85f;
                                            }
                                            else if (adjacentLiquidTile.Value.LiquidType == LiquidType.Honey)
                                            {
                                                liquidTex = (Texture2D)_textureDictionary.GetLiquid(11);
                                            }
                                            else if (adjacentLiquidTile.Value.LiquidType == LiquidType.Shimmer)
                                            {
                                                liquidTex = (Texture2D)_textureDictionary.GetLiquid(14);
                                                liquidColor = new Color(WorldConfiguration.GlobalColors["Shimmer"].PackedValue);
                                            }
                                            else
                                            {
                                                liquidTex = (Texture2D)_textureDictionary.GetLiquid(0);
                                            }

                                            if (liquidTex != null)
                                            {
                                                // Use same texture as the adjacent tile would use for its own rendering
                                                // Check if adjacent tile has liquid above IT (at adjacentX, adjacentY - 1)
                                                var liquidSource = new Rectangle(0, 8, 16, 8); // Default to body
                                                var liquidDest = dest;
                                                bool adjacentHasLiquidAbove = adjacentY > 0 && _wvm.CurrentWorld.Tiles[adjacentX, adjacentY - 1].LiquidAmount > 0;

                                                if (!adjacentHasLiquidAbove)
                                                {
                                                    // Adjacent liquid is at the top - use surface texture with variable height
                                                    liquidSource.Y = 0;
                                                    liquidSource.Height = 4 + ((int)Math.Round(adjacentLiquidTile.Value.LiquidAmount * 6f / 255f)) * 2;
                                                    // Also adjust destination height and position like DrawTileLiquid does
                                                    liquidDest.Height = (int)(liquidSource.Height * _zoom / 16f);
                                                    liquidDest.Y = 1 + (int)((_scrollPosition.Y + y) * _zoom + ((16 - liquidSource.Height) * _zoom / 16f));
                                                }
                                                _spriteBatch.Draw(liquidTex, liquidDest, liquidSource, liquidColor * alpha, 0f, default, SpriteEffects.None, LayerTileSlopeLiquid);
                                            }
                                        }
                                    }

                                    // hack for some slopes
                                    switch (curtile.BrickStyle)
                                    {

                                        case BrickStyle.HalfBrick:
                                            source.Height /= 2;
                                            dest.Y += (int)(_zoom * 0.5);
                                            dest.Height = (int)(_zoom / 2.0f);
                                            _spriteBatch.Draw(tileTex, dest, source, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                            break;
                                        case BrickStyle.SlopeTopRight:

                                            for (int slice = 0; slice < 8; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, 16 - slice * 2);
                                                Vector2 destSlice = new Vector2(dest.X + slice * _zoom / 8.0f, dest.Y + slice * _zoom / 8.0f);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTextures);
                                            }

                                            break;
                                        case BrickStyle.SlopeTopLeft:
                                            for (int slice = 0; slice < 8; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, slice * 2 + 2);
                                                Vector2 destSlice = new Vector2(dest.X + slice * _zoom / 8.0f, dest.Y + (7 - slice) * _zoom / 8.0f);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTextures);
                                            }

                                            break;
                                        case BrickStyle.SlopeBottomRight:
                                            for (int slice = 0; slice < 8; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y + slice * 2, 2, 16 - slice * 2);
                                                Vector2 destSlice = new Vector2(dest.X + slice * _zoom / 8.0f, dest.Y);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTextures);
                                            }

                                            break;
                                        case BrickStyle.SlopeBottomLeft:
                                            for (int slice = 0; slice < 8; slice++)
                                            {
                                                Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, slice * 2 + 2);
                                                Vector2 destSlice = new Vector2(dest.X + slice * _zoom / 8.0f, dest.Y);

                                                _spriteBatch.Draw(tileTex, destSlice, sourceSlice, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileTextures);
                                            }

                                            break;
                                        case BrickStyle.Full:
                                        default:
                                            _spriteBatch.Draw(tileTex, dest, source, curtile.InActive ? Color.Gray : tilePaintColor, 0f, default, SpriteEffects.None, LayerTileTextures);
                                            break;
                                    }


                                    // Actuator Overlay — always draw at standard tile size, not the (possibly modified) dest
                                    if (curtile.Actuator && _wvm.ShowActuators)
                                    {
                                        var actuatorDest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                        _spriteBatch.Draw(_textureDictionary.Actuator, actuatorDest, _textureDictionary.ZeroSixteenRectangle, Color.White, 0f, default, SpriteEffects.None, LayerTileActuator);
                                    }

                                }
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    // failed to render tile? log?
                }
            }
        }
    }

    /// <summary>
    /// Draws additive glow mask overlays for tiles that have them (meteorite, moss, shimmer, etc.).
    /// Must be called within a SpriteBatch.Begin/End pair using AdditiveGlowBlend.
    /// </summary>
    private void DrawTileGlowMasks()
    {
        Rectangle visibleBounds = GetViewingArea();
        var width = _wvm.CurrentWorld.TilesWide;
        var height = _wvm.CurrentWorld.TilesHigh;

        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                try
                {
                    if (x < 0 || y < 0 || x >= width || y >= height) continue;

                    var curtile = _wvm.CurrentWorld.Tiles[x, y];
                    if (!curtile.IsActive) continue;

                    // Echo coating (invisible block) — skip unless coatings are visible
                    if (curtile.InvisibleBlock && !_wvm.ShowCoatings) continue;

                    // Shadow paint suppresses glow
                    if (curtile.TileColor == 29) continue;

                    // Negative paint — skip glow (undefined visual)
                    if (curtile.TileColor == 30) continue;

                    // Actuated/inactive tiles — suppress glow
                    if (curtile.InActive) continue;

                    var tileprop = WorldConfiguration.GetTileProperties(curtile.Type);

                    // Dedicated glow mask texture takes priority
                    if (GlowMaskData.TileToGlowIndex.TryGetValue(curtile.Type, out int glowIndex))
                    {
                        var glowTex = _textureDictionary.GetGlowMask(glowIndex);
                        if (glowTex == null || glowTex == _textureDictionary.DefaultTexture) continue;

                        var glowColor = GlowMaskData.GetGlowColor(curtile.Type);

                        if (tileprop.IsFramed)
                        {
                            // For framed tiles, use the tile's UV coordinates as the source rect
                            var renderUV = TileProperty.GetRenderUV(curtile.Type, curtile.U, curtile.V);
                            var source = new Rectangle(renderUV.X, renderUV.Y, tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
                            var dest = new Rectangle(
                                1 + (int)((_scrollPosition.X + x) * _zoom),
                                1 + (int)((_scrollPosition.Y + y) * _zoom),
                                (int)_zoom, (int)_zoom);

                            // Adjust dest for non-16x16 frames
                            if (source.Width > 16 || source.Height > 16)
                            {
                                dest.Width = (int)(_zoom * source.Width / 16f);
                                dest.Height = (int)(_zoom * source.Height / 16f);
                                dest.X += (int)(((16 - source.Width) / 2F) * _zoom / 16);
                                dest.Y += (int)((16 - source.Height) * _zoom / 16);
                            }

                            _spriteBatch.Draw(glowTex, dest, source, glowColor, 0f, default, SpriteEffects.None, LayerTileGlowMask);
                        }
                        else
                        {
                            DrawSolidGlow(curtile, tileprop, glowTex, glowColor, x, y);
                        }
                    }
                    else if (tileprop.IsLight)
                    {
                        // Synthetic glow for isLight tiles without dedicated glow mask textures
                        var tc = tileprop.Color;
                        if (tc.R == 0 && tc.G == 0 && tc.B == 0) continue;

                        float intensity = _wvm.LightGlowIntensity;
                        if (intensity <= 0f) continue;

                        if (tileprop.IsFramed)
                        {
                            // Only draw halo from the anchor (origin) tile to avoid stacking
                            if (!tileprop.IsOrigin(new Vector2Short(curtile.U, curtile.V))) continue;

                            // Light halo — soft radial gradient sized by frame footprint, centered on sprite
                            var frameSize = tileprop.GetFrameSize(curtile.V);
                            int frameMax = Math.Max(frameSize.X, frameSize.Y);
                            int haloRadius = Math.Min(Math.Max(frameMax, 1), 4);

                            float haloMul = 0.08f * intensity;
                            var haloColor = new Color((byte)(tc.R * haloMul), (byte)(tc.G * haloMul), (byte)(tc.B * haloMul), (byte)0);
                            int haloDiameterPx = (int)(haloRadius * 2 * _zoom);

                            // Center halo on the middle of the sprite footprint
                            float spriteCenterX = x + frameSize.X * 0.5f;
                            float spriteCenterY = y + frameSize.Y * 0.5f;
                            var haloDest = new Rectangle(
                                1 + (int)((_scrollPosition.X + spriteCenterX) * _zoom) - haloDiameterPx / 2,
                                1 + (int)((_scrollPosition.Y + spriteCenterY) * _zoom) - haloDiameterPx / 2,
                                haloDiameterPx, haloDiameterPx);

                            _spriteBatch.Draw(_textureDictionary.GlowHaloTexture, haloDest, null, haloColor, 0f, default, SpriteEffects.None, LayerTileGlowMask);
                        }
                        else
                        {
                            // Luminous re-draw — additive redraw of tile's own texture with color tint
                            var tileTex = _textureDictionary.GetTile(curtile.Type);
                            if (tileTex == null || tileTex == _textureDictionary.DefaultTexture) continue;

                            float glowMul = 0.05f * intensity;
                            var glowColor = new Color((byte)(tc.R * glowMul), (byte)(tc.G * glowMul), (byte)(tc.B * glowMul), (byte)0);
                            DrawSolidGlow(curtile, tileprop, tileTex, glowColor, x, y);
                        }
                    }
                }
                catch (Exception)
                {
                    // Failed to render glow mask for tile
                }
            }
        }
    }

    /// <summary>
    /// Draw a framed tile with slope/half-brick geometry, matching Terraria's
    /// TileDrawing slope algorithm (8 slices of 2px over 16px + 2px strip).
    /// For tiles larger than 16px (e.g. cannonball 20x20), the slope is centered
    /// within the source texture.
    /// </summary>
    private void DrawSlopedTile(SpriteBatch sb, Texture2D tex, Rectangle source, Rectangle dest, Tile tile, Color color, float layer)
    {
        var tileColor = tile.InActive ? Color.Gray : color;
        float scale = _zoom / 16f;

        // Center the 16x16 slope region within the source texture
        int padX = (source.Width - 16) / 2;
        int padY = (source.Height - 16) / 2;
        int srcBaseX = source.X + padX;
        int srcBaseY = source.Y + padY;
        // Shift destination to match the centering offset
        float dstOffX = dest.X + padX * scale;
        float dstOffY = dest.Y + padY * scale;

        switch (tile.BrickStyle)
        {
            case BrickStyle.HalfBrick:
                source.Height /= 2;
                dest.Y += (int)(_zoom * 0.5);
                dest.Height = (int)(_zoom / 2.0f);
                sb.Draw(tex, dest, source, tileColor, 0f, default, SpriteEffects.None, layer);
                break;

            case BrickStyle.SlopeTopRight:
            case BrickStyle.SlopeTopLeft:
            case BrickStyle.SlopeBottomRight:
            case BrickStyle.SlopeBottomLeft:
            {
                // Matches TileDrawing.cs lines 1175-1207
                int slopeType = tile.BrickStyle switch
                {
                    BrickStyle.SlopeTopRight => 1,
                    BrickStyle.SlopeTopLeft => 2,
                    BrickStyle.SlopeBottomRight => 3,
                    _ => 4 // SlopeBottomLeft
                };

                for (int s = 0; s < 8; s++)
                {
                    int num8 = s * -2;
                    int height = 16 - s * 2;
                    int num9 = 16 - height; // = s * 2
                    int x;

                    switch (slopeType)
                    {
                        case 1: // SlopeTopRight
                            num8 = 0; x = s * 2; height = 14 - s * 2; num9 = 0;
                            break;
                        case 2: // SlopeTopLeft
                            num8 = 0; x = 16 - s * 2 - 2; height = 14 - s * 2; num9 = 0;
                            break;
                        case 3: // SlopeBottomRight
                            x = s * 2;
                            break;
                        default: // SlopeBottomLeft
                            x = 16 - s * 2 - 2;
                            break;
                    }

                    if (height > 0)
                    {
                        var srcSlice = new Rectangle(srcBaseX + x, srcBaseY + num9, 2, height);
                        var dstSlice = new Vector2(dstOffX + x * scale, dstOffY + (s * 2 + num8) * scale);
                        sb.Draw(tex, dstSlice, srcSlice, tileColor, 0f, default, scale, SpriteEffects.None, layer);
                    }
                }

                // Bottom or top strip (2px tall, full width)
                int stripY = slopeType > 2 ? 0 : 14;
                var srcStrip = new Rectangle(srcBaseX, srcBaseY + stripY, 16, 2);
                var dstStrip = new Vector2(dstOffX, dstOffY + stripY * scale);
                sb.Draw(tex, dstStrip, srcStrip, tileColor, 0f, default, scale, SpriteEffects.None, layer);
                break;
            }

            default:
                sb.Draw(tex, dest, source, tileColor, 0f, default, SpriteEffects.None, layer);
                break;
        }
    }

    /// <summary>
    /// Draw a solid (non-framed) tile glow using the given texture and color,
    /// respecting half-brick and slope geometry.
    /// </summary>
    private void DrawSolidGlow(Tile curtile, TileProperty tileprop, Texture2D glowTex, Color glowColor, int x, int y)
    {
        if (curtile.uvTileCache == 0xFFFF) return; // not yet cached

        var texsize = new Vector2Int32(tileprop.TextureGrid.X, tileprop.TextureGrid.Y);
        if (texsize.X == 0 || texsize.Y == 0)
        {
            texsize = new Vector2Int32(16, 16);
        }

        // Decode cached UV coordinates — lower byte = column, upper byte = row
        int tileX = curtile.uvTileCache & 0x00FF;
        int tileY = curtile.uvTileCache >> 8;

        // Guard against out-of-bounds UV: verify the source rect fits in the texture
        int srcX = tileX * (texsize.X + 2);
        int srcY = tileY * (texsize.Y + 2);
        if (srcX + texsize.X > glowTex.Width || srcY + texsize.Y > glowTex.Height) return;

        var source = new Rectangle(srcX, srcY, texsize.X, texsize.Y);
        var dest = new Rectangle(
            1 + (int)((_scrollPosition.X + x) * _zoom),
            1 + (int)((_scrollPosition.Y + y) * _zoom),
            (int)_zoom, (int)_zoom);

        switch (curtile.BrickStyle)
        {
            case BrickStyle.HalfBrick:
                source.Height /= 2;
                dest.Y += (int)(_zoom * 0.5);
                dest.Height = (int)(_zoom / 2.0f);
                _spriteBatch.Draw(glowTex, dest, source, glowColor, 0f, default, SpriteEffects.None, LayerTileGlowMask);
                break;

            case BrickStyle.SlopeTopRight:
                for (int slice = 0; slice < 8; slice++)
                {
                    Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, 16 - slice * 2);
                    Vector2 destSlice = new Vector2(
                        (int)(dest.X + slice * _zoom / 8.0f),
                        (int)(dest.Y + slice * _zoom / 8.0f));
                    _spriteBatch.Draw(glowTex, destSlice, sourceSlice, glowColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileGlowMask);
                }
                break;

            case BrickStyle.SlopeTopLeft:
                for (int slice = 0; slice < 8; slice++)
                {
                    Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, slice * 2 + 2);
                    Vector2 destSlice = new Vector2(
                        (int)(dest.X + slice * _zoom / 8.0f),
                        (int)(dest.Y + (7 - slice) * _zoom / 8.0f));
                    _spriteBatch.Draw(glowTex, destSlice, sourceSlice, glowColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileGlowMask);
                }
                break;

            case BrickStyle.SlopeBottomRight:
                for (int slice = 0; slice < 8; slice++)
                {
                    Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y + slice * 2, 2, 16 - slice * 2);
                    Vector2 destSlice = new Vector2(
                        (int)(dest.X + slice * _zoom / 8.0f), dest.Y);
                    _spriteBatch.Draw(glowTex, destSlice, sourceSlice, glowColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileGlowMask);
                }
                break;

            case BrickStyle.SlopeBottomLeft:
                for (int slice = 0; slice < 8; slice++)
                {
                    Rectangle? sourceSlice = new Rectangle(source.X + slice * 2, source.Y, 2, slice * 2 + 2);
                    Vector2 destSlice = new Vector2(
                        (int)(dest.X + slice * _zoom / 8.0f), dest.Y);
                    _spriteBatch.Draw(glowTex, destSlice, sourceSlice, glowColor, 0f, default, _zoom / 16, SpriteEffects.None, LayerTileGlowMask);
                }
                break;

            case BrickStyle.Full:
            default:
                _spriteBatch.Draw(glowTex, dest, source, glowColor, 0f, default, SpriteEffects.None, LayerTileGlowMask);
                break;
        }
    }

    private void DrawTileWires()
    {
        Rectangle visibleBounds = GetViewingArea();
        BlendRules blendRules = BlendRules.Instance;
        var width = _wvm.CurrentWorld.TilesWide;
        var height = _wvm.CurrentWorld.TilesHigh;
        bool anyFilter = FilterManager.AnyFilterActive;

        //Extended the viewing space to give tiles time to cache their UV's
        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                try
                {
                    if (x < 0 ||
                        y < 0 ||
                        x >= _wvm.CurrentWorld.TilesWide ||
                        y >= _wvm.CurrentWorld.TilesHigh)
                    {
                        continue;
                    }

                    var curtile = _wvm.CurrentWorld.Tiles[x, y];
                    if (curtile.Type >= WorldConfiguration.TileProperties.Count) { continue; }

                    // Per-wire filter checks (Hide mode only — Darken handled by overlay)
                    bool allowRed = true, allowBlue = true, allowGreen = true, allowYellow = true;
                    if (anyFilter && FilterManager.CurrentFilterMode == FilterManager.FilterMode.Hide)
                    {
                        if (curtile.WireRed && FilterManager.WireIsNotAllowed(FilterManager.WireType.Red)) allowRed = false;
                        if (curtile.WireBlue && FilterManager.WireIsNotAllowed(FilterManager.WireType.Blue)) allowBlue = false;
                        if (curtile.WireGreen && FilterManager.WireIsNotAllowed(FilterManager.WireType.Green)) allowGreen = false;
                        if (curtile.WireYellow && FilterManager.WireIsNotAllowed(FilterManager.WireType.Yellow)) allowYellow = false;
                    }

                    //Neighbor tiles are often used when dynamically determining which UV position to render
#pragma warning disable CS0219 // Variable is assigned but its value is never used
                    int e = 0, n = 1, w = 2, s = 3, ne = 4, nw = 5, sw = 6, se = 7;
#pragma warning restore CS0219 // Variable is assigned but its value is never used
                    //Tile[] neighborTile = new Tile[8];
                    neighborTile[e] = (x + 1) < width ? _wvm.CurrentWorld.Tiles[x + 1, y] : null;
                    neighborTile[n] = (y - 1) > 0 ? _wvm.CurrentWorld.Tiles[x, y - 1] : null;
                    neighborTile[w] = (x - 1) > 0 ? _wvm.CurrentWorld.Tiles[x - 1, y] : null;
                    neighborTile[s] = (y + 1) < height ? _wvm.CurrentWorld.Tiles[x, y + 1] : null;

                    if (_wvm.ShowRedWires || _wvm.ShowBlueWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires)
                    {
                        var tileTex = (Texture2D)_textureDictionary.GetMisc("WiresNew");
                        if (tileTex != null)
                        {
                            int voffset = 0;
                            if (curtile.Type == 424)
                                voffset = (curtile.U / 18 + 1) * 72;
                            if (curtile.Type == 445)
                                voffset = 72;
                            if (curtile.WireRed && _wvm.ShowRedWires && allowRed)
                            {
                                var source = new Rectangle(0, 0, 16, 16);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                byte state = 0x00;
                                state |= (byte)((neighborTile[n]?.WireRed == true) ? 0x01 : 0x00);
                                state |= (byte)((neighborTile[e]?.WireRed == true) ? 0x02 : 0x00);
                                state |= (byte)((neighborTile[s]?.WireRed == true) ? 0x04 : 0x00);
                                state |= (byte)((neighborTile[w]?.WireRed == true) ? 0x08 : 0x00);
                                source.X = state * 18;
                                source.Y = voffset;

                                var color = (!_wvm.ShowWireTransparency) ? Color.White : (curtile.WireRed && (_wvm.ShowBlueWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires)) ? Translucent : Color.White;

                                _spriteBatch.Draw(tileTex, dest, source, Color.White, 0f, default, SpriteEffects.None, LayerRedWires);
                            }
                            if (curtile.WireBlue && _wvm.ShowBlueWires && allowBlue)
                            {
                                var source = new Rectangle(0, 0, 16, 16);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                byte state = 0x00;
                                state |= (byte)((neighborTile[n]?.WireBlue == true) ? 0x01 : 0x00);
                                state |= (byte)((neighborTile[e]?.WireBlue == true) ? 0x02 : 0x00);
                                state |= (byte)((neighborTile[s]?.WireBlue == true) ? 0x04 : 0x00);
                                state |= (byte)((neighborTile[w]?.WireBlue == true) ? 0x08 : 0x00);
                                source.X = state * 18;
                                source.Y = 18 + voffset;

                                var color = (!_wvm.ShowWireTransparency) ? Color.White : (curtile.WireRed && (_wvm.ShowRedWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires)) ? Translucent : Color.White;
                                _spriteBatch.Draw(tileTex, dest, source, color, 0f, default, SpriteEffects.None, LayerBlueWires);
                            }
                            if (curtile.WireGreen && _wvm.ShowGreenWires && allowGreen)
                            {
                                var source = new Rectangle(0, 0, 16, 16);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                byte state = 0x00;
                                state |= (byte)((neighborTile[n]?.WireGreen == true) ? 0x01 : 0x00);
                                state |= (byte)((neighborTile[e]?.WireGreen == true) ? 0x02 : 0x00);
                                state |= (byte)((neighborTile[s]?.WireGreen == true) ? 0x04 : 0x00);
                                state |= (byte)((neighborTile[w]?.WireGreen == true) ? 0x08 : 0x00);
                                source.X = state * 18;
                                source.Y = 36 + voffset;

                                var color = (!_wvm.ShowWireTransparency) ? Color.White : ((curtile.WireRed || curtile.WireBlue) && (_wvm.ShowRedWires || _wvm.ShowBlueWires || _wvm.ShowYellowWires)) ? Translucent : Color.White;
                                _spriteBatch.Draw(tileTex, dest, source, color, 0f, default, SpriteEffects.None, LayerGreenWires);
                            }
                            if (curtile.WireYellow && _wvm.ShowYellowWires && allowYellow)
                            {
                                var source = new Rectangle(0, 0, 16, 16);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);

                                byte state = 0x00;
                                state |= (byte)((neighborTile[n]?.WireYellow == true) ? 0x01 : 0x00);
                                state |= (byte)((neighborTile[e]?.WireYellow == true) ? 0x02 : 0x00);
                                state |= (byte)((neighborTile[s]?.WireYellow == true) ? 0x04 : 0x00);
                                state |= (byte)((neighborTile[w]?.WireYellow == true) ? 0x08 : 0x00);
                                source.X = state * 18;
                                source.Y = 54 + voffset;

                                var color = (!_wvm.ShowWireTransparency) ? Color.White : ((curtile.WireRed || curtile.WireBlue || curtile.WireGreen) && (_wvm.ShowRedWires || _wvm.ShowBlueWires || _wvm.ShowGreenWires)) ? Translucent : Color.White;
                                _spriteBatch.Draw(tileTex, dest, source, color, 0f, default, SpriteEffects.None, LayerYellowWires);
                            }
                                }
                    }
                }
                catch (Exception)
                {
                    // failed to render tile? log?
                }
            }
        }

    }

    private void DrawWireTraceHighlight()
    {
        var highlight = _wvm.WireTraceHighlight;
        if (highlight == null || highlight.Count == 0) return;

        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        Rectangle visibleBounds = GetViewingArea();
        var highlightColor = _wvm.WireTraceColor switch
        {
            1 => new Color(255, 80, 80, 100),   // Red tint
            2 => new Color(80, 80, 255, 100),    // Blue tint
            3 => new Color(80, 255, 80, 100),    // Green tint
            4 => new Color(255, 255, 80, 100),   // Yellow tint
            _ => new Color(255, 255, 255, 80)
        };

        foreach (var tile in highlight)
        {
            if (tile.X < visibleBounds.Left - 1 || tile.X > visibleBounds.Right + 1
                || tile.Y < visibleBounds.Top - 1 || tile.Y > visibleBounds.Bottom + 1)
                continue;

            _spriteBatch.Draw(whiteTex, TileOrigin(tile.X, tile.Y), null, highlightColor,
                0f, Vector2.Zero, _zoom, SpriteEffects.None, LayerWireTraceHighlight);
        }
    }

    private void DrawTileLiquid()
    {
        Rectangle visibleBounds = GetViewingArea();
        bool anyFilter = FilterManager.AnyFilterActive;

        //Extended the viewing space to give tiles time to cache their UV's
        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                try
                {
                    if (x < 0 ||
                        y < 0 ||
                        x >= _wvm.CurrentWorld.TilesWide ||
                        y >= _wvm.CurrentWorld.TilesHigh)
                    {
                        continue;
                    }

                    var curtile = _wvm.CurrentWorld.Tiles[x, y];
                    if (curtile.Type >= WorldConfiguration.TileProperties.Count) { continue; }

                    // Filter check: hide liquids not allowed by the filter
                    if (anyFilter && FilterManager.LiquidIsNotAllowed(curtile.LiquidType))
                    {
                        if (FilterManager.CurrentFilterMode == FilterManager.FilterMode.Hide) continue;
                    }

                    //Neighbor tiles are often used when dynamically determining which UV position to render
#pragma warning disable CS0219 // Variable is assigned but its value is never used
                    int e = 0, n = 1, w = 2, s = 3, ne = 4, nw = 5, sw = 6, se = 7;
#pragma warning restore CS0219 // Variable is assigned but its value is never used
                    //Tile[] neighborTile = new Tile[8];

                    neighborTile[n] = (y - 1) > 0 ? _wvm.CurrentWorld.Tiles[x, y - 1] : null;

                    if (_wvm.ShowLiquid)
                    {
                        if (curtile.LiquidAmount > 0)
                        {
                            var liquidColor = Color.White;
                            Texture2D tileTex = null;
                            if (curtile.LiquidType == LiquidType.Lava)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetLiquid(1);
                            }
                            else if (curtile.LiquidType == LiquidType.Honey)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetLiquid(11); // Not sure if yellow Desert water, or Honey, but looks fine.
                            }
                            else if (curtile.LiquidType == LiquidType.Shimmer)
                            {
                                tileTex = (Texture2D)_textureDictionary.GetLiquid(14);
                                liquidColor = new Color(WorldConfiguration.GlobalColors["Shimmer"].PackedValue);
                            }
                            else
                            {
                                tileTex = (Texture2D)_textureDictionary.GetLiquid(0);
                            }

                            if (tileTex != null)
                            {
                                var source = new Rectangle(0, 0, 16, 16);
                                var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                                float alpha = 1f;

                                if (curtile.LiquidType != LiquidType.Lava)
                                {
                                    alpha = 0.5f;
                                }
                                else
                                {
                                    alpha = 0.85f;
                                }

                                // Check if there's liquid above (either actual or extended horizontal)
                                bool hasLiquidAbove = neighborTile[n] != null && neighborTile[n].Value.LiquidAmount > 0;

                                // Also check for extended horizontal liquid above (only if tile above is solid, not plants)
                                if (!hasLiquidAbove && y > 0 && neighborTile[n]?.IsActive == true
                                    && WorldConfiguration.GetTileProperties(neighborTile[n].Value.Type).IsSolid)
                                {
                                    // Tile above is solid - check if it would have extended horizontal liquid
                                    if (x > 0 && x < _wvm.CurrentWorld.TilesWide - 1)
                                    {
                                        var aboveLeft = _wvm.CurrentWorld.Tiles[x - 1, y - 1];
                                        var aboveRight = _wvm.CurrentWorld.Tiles[x + 1, y - 1];
                                        bool aboveLeftIsSolid = aboveLeft.IsActive && WorldConfiguration.GetTileProperties(aboveLeft.Type).IsSolid;
                                        bool aboveRightIsSolid = aboveRight.IsActive && WorldConfiguration.GetTileProperties(aboveRight.Type).IsSolid;
                                        // Same liquid type check for extended liquid (also check filter)
                                        if ((aboveLeft.LiquidAmount > 0 && aboveLeft.LiquidType == curtile.LiquidType
                                                && (!anyFilter || !FilterManager.LiquidIsNotAllowed(aboveLeft.LiquidType))
                                                && (aboveRight.LiquidAmount > 0 || aboveRightIsSolid)) ||
                                            (aboveRight.LiquidAmount > 0 && aboveRight.LiquidType == curtile.LiquidType
                                                && (!anyFilter || !FilterManager.LiquidIsNotAllowed(aboveRight.LiquidType))
                                                && (aboveLeft.LiquidAmount > 0 || aboveLeftIsSolid)))
                                        {
                                            hasLiquidAbove = true;
                                        }
                                    }
                                }

                                if (hasLiquidAbove)
                                {
                                    source.Y = 8;
                                    source.Height = 8;
                                }
                                else
                                {
                                    source.Height = 4 + ((int)Math.Round(curtile.LiquidAmount * 6f / 255f)) * 2;
                                    dest.Height = (int)(source.Height * _zoom / 16f);
                                    dest.Y = 1 + (int)((_scrollPosition.Y + y) * _zoom + ((16 - source.Height) * _zoom / 16f));
                                }

                                _spriteBatch.Draw(tileTex, dest, source, liquidColor * alpha, 0f, default, SpriteEffects.None, LayerLiquid);
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    // failed to render tile? log?
                }
            }
        }
    }

    private Vector2Int32 TrackUV(int num)
    {
        var uv = new Vector2Int32(0, 0);
        switch (num)
        {
            case 0:
                uv.X = 0;
                uv.Y = 0;
                break;
            case 1:
                uv.X = 1;
                uv.Y = 0;
                break;
            case 2:
                uv.X = 2;
                uv.Y = 1;
                break;
            case 3:
                uv.X = 3;
                uv.Y = 1;
                break;
            case 4:
                uv.X = 0;
                uv.Y = 2;
                break;
            case 5:
                uv.X = 1;
                uv.Y = 2;
                break;
            case 6:
                uv.X = 0;
                uv.Y = 1;
                break;
            case 7:
                uv.X = 1;
                uv.Y = 1;
                break;
            case 8:
                uv.X = 0;
                uv.Y = 3;
                break;
            case 9:
                uv.X = 1;
                uv.Y = 3;
                break;
            case 10:
                uv.X = 4;
                uv.Y = 1;
                break;
            case 11:
                uv.X = 5;
                uv.Y = 1;
                break;
            case 12:
                uv.X = 6;
                uv.Y = 1;
                break;
            case 13:
                uv.X = 7;
                uv.Y = 1;
                break;
            case 14:
                uv.X = 2;
                uv.Y = 0;
                break;
            case 15:
                uv.X = 3;
                uv.Y = 0;
                break;
            case 16:
                uv.X = 4;
                uv.Y = 0;
                break;
            case 17:
                uv.X = 5;
                uv.Y = 0;
                break;
            case 18:
                uv.X = 6;
                uv.Y = 0;
                break;
            case 19:
                uv.X = 7;
                uv.Y = 0;
                break;
            case 20:
                uv.X = 0;
                uv.Y = 4;
                break;
            case 21:
                uv.X = 1;
                uv.Y = 4;
                break;
            case 22:
                uv.X = 0;
                uv.Y = 5;
                break;
            case 23:
                uv.X = 1;
                uv.Y = 5;
                break;
            case 24:
                uv.X = 2;
                uv.Y = 2;
                break;
            case 25:
                uv.X = 3;
                uv.Y = 2;
                break;
            case 26:
                uv.X = 4;
                uv.Y = 2;
                break;
            case 27:
                uv.X = 5;
                uv.Y = 2;
                break;
            case 28:
                uv.X = 6;
                uv.Y = 2;
                break;
            case 29:
                uv.X = 7;
                uv.Y = 2;
                break;
            case 30:
                uv.X = 2;
                uv.Y = 3;
                break;
            case 31:
                uv.X = 3;
                uv.Y = 3;
                break;
            case 32:
                uv.X = 4;
                uv.Y = 3;
                break;
            case 33:
                uv.X = 5;
                uv.Y = 3;
                break;
            case 34:
                uv.X = 6;
                uv.Y = 3;
                break;
            case 35:
                uv.X = 7;
                uv.Y = 3;
                break;
            case 36:
                uv.X = 0;
                uv.Y = 6;
                break;
            case 37:
                uv.X = 1;
                uv.Y = 6;
                break;
            case 38:
                uv.X = 0;
                uv.Y = 7;
                break;
            case 39:
                uv.X = 1;
                uv.Y = 7;
                break;
        }
        return uv;
    }
    private Rectangle GetViewingArea()
    {
        if (_wvm.CurrentWorld == null)
            return new Rectangle();

        double viewW = _exportViewSize?.Width ?? xnaViewport.ActualWidth;
        double viewH = _exportViewSize?.Height ?? xnaViewport.ActualHeight;

        var r = new Rectangle(
            (int)Math.Floor(-_scrollPosition.X),
            (int)Math.Floor(-_scrollPosition.Y),
            (int)Math.Ceiling(viewW / _zoom),
            (int)Math.Ceiling(viewH / _zoom));

        // Clamp to world bounds — negative offsets and overflow are trimmed
        if (r.X < 0) { r.Width += r.X; r.X = 0; }
        if (r.Y < 0) { r.Height += r.Y; r.Y = 0; }
        if (r.Right > _wvm.CurrentWorld.TilesWide)
            r.Width = r.Width - (r.Right - _wvm.CurrentWorld.TilesWide);
        if (r.Bottom > _wvm.CurrentWorld.TilesHigh)
            r.Height = r.Height - (r.Bottom - _wvm.CurrentWorld.TilesHigh);

        return r;
    }

    private void DrawPoints()
    {
        Boolean useTextures = _wvm.ShowTextures && _textureDictionary.Valid;

        foreach (var npc in _wvm.CurrentWorld.NPCs)
        {
            if (useTextures)
                DrawNpcTexture(npc);
            else
                DrawNpcOverlay(npc);
        }

        _spriteBatch.Draw(
            _textures["Spawn"],
            GetOverlayLocation(_wvm.CurrentWorld.SpawnX, _wvm.CurrentWorld.SpawnY),
            _textures["Spawn"].Bounds,
            Color.FromNonPremultiplied(255, 255, 255, 128),
            0f,
            Vector2.Zero,
            Vector2.One,
            SpriteEffects.None,
            LayerLocations);

        _spriteBatch.Draw(
            _textures["Dungeon"],
            GetOverlayLocation(_wvm.CurrentWorld.DungeonX, _wvm.CurrentWorld.DungeonY),
            _textures["Dungeon"].Bounds,
            Color.FromNonPremultiplied(255, 255, 255, 128),
            0f,
            Vector2.Zero,
            Vector2.One,
            SpriteEffects.None,
            LayerLocations);

        // Team spawn points
        if (_wvm.CurrentWorld.TeamBasedSpawnsSeed)
        {
            Color[] teamColors =
            [
                Color.FromNonPremultiplied(236, 240, 241, 128), // White
                Color.FromNonPremultiplied(231, 76,  60,  128), // Red
                Color.FromNonPremultiplied(46,  204, 113, 128), // Green
                Color.FromNonPremultiplied(52,  152, 219, 128), // Blue
                Color.FromNonPremultiplied(241, 196, 15,  128), // Yellow
                Color.FromNonPremultiplied(233, 30,  158, 128), // Pink
            ];

            for (int i = 0; i < _wvm.CurrentWorld.TeamSpawns.Count && i < World.TeamCount; i++)
            {
                var ts = _wvm.CurrentWorld.TeamSpawns[i];
                if (ts.X == 0 && ts.Y == 0) continue;
                if (ts.X == _wvm.CurrentWorld.SpawnX && ts.Y == _wvm.CurrentWorld.SpawnY) continue;

                var tint = i < teamColors.Length ? teamColors[i] : Color.FromNonPremultiplied(200, 200, 200, 128);
                _spriteBatch.Draw(
                    _textures["Spawn"],
                    GetOverlayLocation(ts.X, ts.Y),
                    _textures["Spawn"].Bounds,
                    tint,
                    0f,
                    Vector2.Zero,
                    Vector2.One,
                    SpriteEffects.None,
                    LayerLocations);
            }
        }

    }

    private void DrawNbtOverlay()
    {
        var world = _wvm.CurrentWorld;
        if (world == null) return;

        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        var chestColor = Color.FromNonPremultiplied(255, 200, 0, 200);   // gold
        var signColor = Color.FromNonPremultiplied(0, 220, 255, 200);    // cyan
        var entityColor = Color.FromNonPremultiplied(220, 0, 255, 200);  // magenta

        // Draw chests
        foreach (var chest in world.Chests)
        {
            if (chest == null) continue;
            var dest = new Rectangle(
                (int)((_scrollPosition.X + chest.X) * _zoom),
                (int)((_scrollPosition.Y + chest.Y) * _zoom),
                Math.Max(1, (int)_zoom),
                Math.Max(1, (int)_zoom));
            _spriteBatch.Draw(whiteTex, dest, null, chestColor, 0f, default, SpriteEffects.None, LayerNbtOverlay);
        }

        // Draw signs
        foreach (var sign in world.Signs)
        {
            if (sign == null) continue;
            var dest = new Rectangle(
                (int)((_scrollPosition.X + sign.X) * _zoom),
                (int)((_scrollPosition.Y + sign.Y) * _zoom),
                Math.Max(1, (int)_zoom),
                Math.Max(1, (int)_zoom));
            _spriteBatch.Draw(whiteTex, dest, null, signColor, 0f, default, SpriteEffects.None, LayerNbtOverlay);
        }

        // Draw tile entities
        foreach (var te in world.TileEntities)
        {
            if (te == null) continue;
            var dest = new Rectangle(
                (int)((_scrollPosition.X + te.PosX) * _zoom),
                (int)((_scrollPosition.Y + te.PosY) * _zoom),
                Math.Max(1, (int)_zoom),
                Math.Max(1, (int)_zoom));
            _spriteBatch.Draw(whiteTex, dest, null, entityColor, 0f, default, SpriteEffects.None, LayerNbtOverlay);
        }
    }

    private void DrawFindCrosshair()
    {
        var findViewModel = _find;
        if (findViewModel == null || !findViewModel.ShowCrosshair)
            return;

        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        // Get crosshair position in tile coordinates
        int tileX = findViewModel.CrosshairTileX;
        int tileY = findViewModel.CrosshairTileY;

        // Convert tile center to screen coordinates
        float screenCenterX = (_scrollPosition.X + tileX + 0.5f) * _zoom;
        float screenCenterY = (_scrollPosition.Y + tileY + 0.5f) * _zoom;

        // Fixed size crosshair that doesn't scale with zoom (minimum 24px, max 48px)
        const int minCrosshairSize = 24;
        const int maxCrosshairSize = 48;
        int crosshairSize = Math.Clamp((int)(_zoom * 3), minCrosshairSize, maxCrosshairSize);
        int outlineThickness = 3; // Fixed thickness

        // Center the crosshair on the tile
        int screenX = (int)(screenCenterX - crosshairSize / 2);
        int screenY = (int)(screenCenterY - crosshairSize / 2);

        var crosshairColor = Color.Red;

        // Top edge
        _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY, crosshairSize, outlineThickness),
            null, crosshairColor, 0f, default, SpriteEffects.None, LayerFindCrosshair);
        // Bottom edge
        _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY + crosshairSize - outlineThickness, crosshairSize, outlineThickness),
            null, crosshairColor, 0f, default, SpriteEffects.None, LayerFindCrosshair);
        // Left edge
        _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY, outlineThickness, crosshairSize),
            null, crosshairColor, 0f, default, SpriteEffects.None, LayerFindCrosshair);
        // Right edge
        _spriteBatch.Draw(whiteTex, new Rectangle(screenX + crosshairSize - outlineThickness, screenY, outlineThickness, crosshairSize),
            null, crosshairColor, 0f, default, SpriteEffects.None, LayerFindCrosshair);
    }

    private void DrawBuffRadii()
    {
        if (_wvm.CurrentWorld == null) return;

        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        Rectangle visibleBounds = GetViewingArea();

        foreach (var entry in _wvm.BuffTileCache.Entries)
        {
            // AABB overlap test: does this buff zone intersect the visible area?
            float zoneLeft = entry.CenterX - entry.HalfW;
            float zoneTop = entry.CenterY - entry.HalfH;
            float zoneRight = entry.CenterX + entry.HalfW;
            float zoneBottom = entry.CenterY + entry.HalfH;

            if (zoneRight < visibleBounds.Left || zoneLeft > visibleBounds.Right ||
                zoneBottom < visibleBounds.Top || zoneTop > visibleBounds.Bottom)
                continue;

            // Convert to screen coordinates
            int screenX = (int)((_scrollPosition.X + zoneLeft) * _zoom);
            int screenY = (int)((_scrollPosition.Y + zoneTop) * _zoom);
            int screenW = (int)(entry.HalfW * 2 * _zoom);
            int screenH = (int)(entry.HalfH * 2 * _zoom);

            var bc = entry.Color;
            var fillColor = new Color(bc.R, bc.G, bc.B, bc.A);

            // Draw filled rectangle
            _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY, screenW, screenH),
                null, fillColor, 0f, default, SpriteEffects.None, LayerBuffRadii);

            // Draw radius border with higher opacity
            int borderAlpha = Math.Min(255, fillColor.A * 3);
            var borderColor = new Color(fillColor.R, fillColor.G, fillColor.B, borderAlpha);
            int borderThickness = Math.Max(1, (int)(_zoom / 4));

            // Top
            _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY, screenW, borderThickness),
                null, borderColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Bottom
            _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY + screenH - borderThickness, screenW, borderThickness),
                null, borderColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Left
            _spriteBatch.Draw(whiteTex, new Rectangle(screenX, screenY, borderThickness, screenH),
                null, borderColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Right
            _spriteBatch.Draw(whiteTex, new Rectangle(screenX + screenW - borderThickness, screenY, borderThickness, screenH),
                null, borderColor, 0f, default, SpriteEffects.None, LayerBuffRadii);

            // Draw emitter outline around the sprite itself (no fill)
            int emitterX = (int)((_scrollPosition.X + entry.X) * _zoom);
            int emitterY = (int)((_scrollPosition.Y + entry.Y) * _zoom);
            int emitterW = (int)(entry.FrameW * _zoom);
            int emitterH = (int)(entry.FrameH * _zoom);
            var emitterColor = new Color(bc.R, bc.G, bc.B, (byte)Math.Min(255, bc.A * 16));
            int emitterThickness = Math.Max(1, (int)Math.Ceiling(_zoom / 8.0));

            // Top
            _spriteBatch.Draw(whiteTex, new Rectangle(emitterX, emitterY, emitterW, emitterThickness),
                null, emitterColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Bottom
            _spriteBatch.Draw(whiteTex, new Rectangle(emitterX, emitterY + emitterH - emitterThickness, emitterW, emitterThickness),
                null, emitterColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Left
            _spriteBatch.Draw(whiteTex, new Rectangle(emitterX, emitterY, emitterThickness, emitterH),
                null, emitterColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
            // Right
            _spriteBatch.Draw(whiteTex, new Rectangle(emitterX + emitterW - emitterThickness, emitterY, emitterThickness, emitterH),
                null, emitterColor, 0f, default, SpriteEffects.None, LayerBuffRadii);
        }
    }

    private void DrawNpcTexture(NPC npc)
    {
        int npcId = npc.SpriteId;

        if (!WorldConfiguration.BestiaryData.NpcById.ContainsKey(npcId))
        {
            DrawNpcOverlay(npc);
            return;
        }

        var bestiaryData = WorldConfiguration.BestiaryData.NpcById[npcId];
        string npcName = bestiaryData.BestiaryId;
        bool isPartying = _wvm.CurrentWorld.PartyingNPCs.Contains(npcId);
        bool isShimmered = npcId < _wvm.CurrentWorld.ShimmeredTownNPCs.Count
            && _wvm.CurrentWorld.ShimmeredTownNPCs[npcId] != 0;

        Texture2D npcTexture = bestiaryData.IsTownNpc ?
                _textureDictionary.GetTownNPC(npcName, npcId, variant: npc.TownNpcVariationIndex, partying: isPartying, shimmered: isShimmered) :
                null;

        if (npcTexture != null)
        {
            // Get source rect from NPC data, or default to full texture width and estimated height
            Rectangle sourceRect;
            if (WorldConfiguration.NpcById.TryGetValue(npcId, out var npcData) && npcData.SourceRect.Width > 0)
            {
                sourceRect = new Rectangle(
                    npcData.SourceRect.X,
                    npcData.SourceRect.Y,
                    Math.Min(npcData.SourceRect.Width, npcTexture.Width - npcData.SourceRect.X),
                    Math.Min(npcData.SourceRect.Height, npcTexture.Height - npcData.SourceRect.Y));
            }
            else
            {
                // Fallback: use full texture width, estimate first frame height (55 for humanoids)
                int estimatedHeight = Math.Min(55, npcTexture.Height);
                sourceRect = new Rectangle(0, 0, npcTexture.Width, estimatedHeight);
            }

            // Normal scaling like tiles, but clamp minimum to 0.5
            float scale = Math.Max(0.5f, _zoom / 16f);

            // Get tile offset from NPC data (default 0)
            int tileOffsetY = 0;
            if (WorldConfiguration.NpcById.TryGetValue(npcId, out var npcDataForOffset))
                tileOffsetY = npcDataForOffset.TileOffsetY;

            // Position: bottom of sprite aligns with bottom of home tile
            float scaledHeight = sourceRect.Height * scale;
            Vector2 position = new Vector2(
                (_scrollPosition.X + npc.Home.X) * _zoom,
                (_scrollPosition.Y + npc.Home.Y + tileOffsetY) * _zoom - scaledHeight);

            _spriteBatch.Draw(npcTexture, position, sourceRect, Color.White, 0.0f, Vector2.Zero, scale, SpriteEffects.None, LayerLocations);
        }
        else
        {
            DrawNpcOverlay(npc);
        }
    }

    private void DrawNpcOverlay(NPC npc)
    {
        int npcId = npc.SpriteId;
        var tex = _textureDictionary.GetNPC(npcId);
        if (tex != null)
        {
            // Get source rect from NPC data, or default to full texture
            Rectangle sourceRect;
            bool hasNpcData = WorldConfiguration.NpcById.TryGetValue(npcId, out var npcData) && npcData.SourceRect.Width > 0;

            if (hasNpcData)
            {
                sourceRect = new Rectangle(
                    npcData.SourceRect.X,
                    npcData.SourceRect.Y,
                    Math.Min(npcData.SourceRect.Width, tex.Width - npcData.SourceRect.X),
                    Math.Min(npcData.SourceRect.Height, tex.Height - npcData.SourceRect.Y));
            }
            else
            {
                // Fallback: use full texture (legacy behavior for NPCs without SourceRect)
                sourceRect = tex.Bounds;
            }

            // Use full opacity for NPCs we have data for, transparency for unknown NPCs
            var color = hasNpcData ? Color.White : Color.FromNonPremultiplied(255, 255, 255, 128);

            // Normal scaling like tiles, but clamp minimum to 0.5
            float scale = Math.Max(0.5f, _zoom / 16f);

            // Get tile offset from NPC data (default 0)
            int tileOffsetY = hasNpcData ? npcData.TileOffsetY : 0;

            // Position: bottom of sprite aligns with bottom of home tile
            float scaledHeight = sourceRect.Height * scale;
            Vector2 position = new Vector2(
                (_scrollPosition.X + npc.Home.X) * _zoom,
                (_scrollPosition.Y + npc.Home.Y + tileOffsetY) * _zoom - scaledHeight);

            _spriteBatch.Draw(
                tex,
                position,
                sourceRect,
                color,
                0f,
                Vector2.Zero,
                scale,
                SpriteEffects.None,
                LayerLocations);
        }
    }

    private Vector2 GetOverlayLocation(int x, int y)
    {
        return new Vector2(
            (_scrollPosition.X + x) * _zoom - 10,
            (_scrollPosition.Y + y) * _zoom - 34);
    }

    private Vector2 GetNpcLocation(int x, int y, int width, int height)
    {
        // Position NPC sprite with bottom at tile location
        // +16 to move down by 1 tile (NPCs were appearing 1 tile too high)
        return new Vector2(
            (_scrollPosition.X + x) * _zoom - 6,
            (_scrollPosition.Y + y) * _zoom - height + 4 + 16);
    }

    private Color GetActiveWireAnchorColor()
    {
        var picker = _wvm.TilePicker;
        if (picker.RedWireActive)
            return new Color(255, 128, 128, 160);
        if (picker.BlueWireActive)
            return new Color(128, 128, 255, 160);
        if (picker.GreenWireActive)
            return new Color(128, 255, 128, 160);
        if (picker.YellowWireActive)
            return new Color(255, 255, 128, 160);
        return new Color(255, 255, 255, 128);
    }

    private Color GetActiveWirePreviewColor()
    {
        var picker = _wvm.TilePicker;
        if (picker.RedWireActive)
            return new Color(255, 0, 0, 96);
        if (picker.BlueWireActive)
            return new Color(0, 0, 255, 96);
        if (picker.GreenWireActive)
            return new Color(0, 255, 0, 96);
        if (picker.YellowWireActive)
            return new Color(255, 255, 0, 96);
        return new Color(255, 255, 255, 64);
    }

    private void DrawToolPreview()
    {
        // CAD routing preview (wire, track, platform, etc.)
        if (_wvm.ActiveTool.HasCadPreview)
        {
            var whiteTex = _textureDictionary.WhitePixelTexture;
            if (whiteTex != null)
            {
                // Wire mode uses wire-colored preview; all other modes use standard blue
                var previewColor = _wvm.TilePicker.PaintMode == PaintMode.Wire
                    ? GetActiveWirePreviewColor()
                    : Color.FromNonPremultiplied(0, 90, 255, 127);

                var path = _wvm.ActiveTool.CadPreviewPath;
                for (int i = 0; i < path.Count; i++)
                {
                    var tile = path[i];
                    var pos = new Vector2(
                        (_scrollPosition.X + tile.X) * _zoom,
                        (_scrollPosition.Y + tile.Y) * _zoom);
                    _spriteBatch.Draw(whiteTex, pos, null, previewColor,
                        0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                }

                // Draw tunnel clearing preview (darker blue) for Track mode
                var tunnelPath = _wvm.ActiveTool.CadPreviewTunnelPath;
                if (tunnelPath.Count > 0)
                {
                    var tunnelColor = Color.FromNonPremultiplied(0, 50, 180, 100);
                    for (int i = 0; i < tunnelPath.Count; i++)
                    {
                        var tile = tunnelPath[i];
                        var pos = new Vector2(
                            (_scrollPosition.X + tile.X) * _zoom,
                            (_scrollPosition.Y + tile.Y) * _zoom);
                        _spriteBatch.Draw(whiteTex, pos, null, tunnelColor,
                            0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                    }
                }

                // Draw anchor marker: lightened wire color with transparency
                if (path.Count > 0)
                {
                    var anchor = path[0];
                    var anchorPos = new Vector2(
                        (_scrollPosition.X + anchor.X) * _zoom,
                        (_scrollPosition.Y + anchor.Y) * _zoom);
                    var anchorColor = _wvm.TilePicker.PaintMode == PaintMode.Wire
                        ? GetActiveWireAnchorColor()
                        : Color.FromNonPremultiplied(128, 170, 255, 160);
                    _spriteBatch.Draw(whiteTex, anchorPos, null, anchorColor,
                        0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                }
            }
            return;
        }

        // Shift+line preview: stamp brush preview texture along the line
        if (_wvm.ActiveTool.HasLinePreviewAnchor
            && (RenderInput.Modifiers & RenderModifiers.Shift) != 0)
        {
            var anchor = _wvm.ActiveTool.LinePreviewAnchor;
            var cursor = _wvm.MouseOverTile.MouseState.Location;

            bool isBrush = _wvm.ActiveTool.ToolType == ToolType.Brush;

            if (isBrush && _preview != null)
            {
                // Stamp the brush preview texture at subsampled intervals along the line.
                // Adjacent stamps overlap by ~50%, giving full visual coverage with minimal draw calls.
                int brushW = _wvm.Brush.Width;
                int brushH = _wvm.Brush.Height;
                int step = Math.Max(1, Math.Min(brushW, brushH) / 2);
                int offX = _wvm.Brush.OffsetX;
                int offY = _wvm.Brush.OffsetY;
                var tint = Color.FromNonPremultiplied(0, 90, 255, 80);

                int idx = 0;
                Vector2Int32 last = anchor;
                foreach (var center in Shape.DrawLineTool(anchor, cursor))
                {
                    if (idx++ % step == 0)
                    {
                        last = center;
                        var pos = new Vector2(
                            1 + (_scrollPosition.X + center.X - offX) * _zoom,
                            1 + (_scrollPosition.Y + center.Y - offY) * _zoom);
                        _spriteBatch.Draw(_preview, pos, null, tint,
                            0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                    }
                }

                // Always stamp at the final cursor position to avoid a gap at the end
                if (last.X != cursor.X || last.Y != cursor.Y)
                {
                    var lastPos = new Vector2(
                        1 + (_scrollPosition.X + cursor.X - offX) * _zoom,
                        1 + (_scrollPosition.Y + cursor.Y - offY) * _zoom);
                    _spriteBatch.Draw(_preview, lastPos, null, tint,
                        0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                }
            }
            else
            {
                // Non-brush tools: simple Bresenham line
                var whiteTex = _textureDictionary.WhitePixelTexture;
                if (whiteTex != null)
                {
                    var previewColor = Color.FromNonPremultiplied(0, 90, 255, 127);
                    foreach (var tile in Shape.DrawLineTool(anchor, cursor))
                    {
                        var pos = new Vector2(
                            (_scrollPosition.X + tile.X) * _zoom,
                            (_scrollPosition.Y + tile.Y) * _zoom);
                        _spriteBatch.Draw(whiteTex, pos, null, previewColor,
                            0, Vector2.Zero, _zoom, SpriteEffects.None, LayerTools);
                    }
                }
            }
            // Fall through to also render cursor preview at tip
        }

        if (_preview == null)
            return;

        // Skip cursor-follow preview when paste tool is in floating state (DrawPasteLayer handles it)
        if (_wvm.ActiveTool.IsFloatingPaste)
            return;

        Vector2 position;

        if (_wvm.ActiveTool.Name == "Paste")
        {
            position = new Vector2((_scrollPosition.X + _wvm.MouseOverTile.MouseState.Location.X) * _zoom,
                                   (_scrollPosition.Y + _wvm.MouseOverTile.MouseState.Location.Y) * _zoom);
        }
        else if (_wvm.ActiveTool.ToolType == ToolType.Brush)
        {
            int offX = _wvm.ActiveTool.PreviewOffsetX >= 0 ? _wvm.ActiveTool.PreviewOffsetX : _wvm.Brush.OffsetX;
            int offY = _wvm.ActiveTool.PreviewOffsetY >= 0 ? _wvm.ActiveTool.PreviewOffsetY : _wvm.Brush.OffsetY;
            position = new Vector2(1 + (_scrollPosition.X + _wvm.MouseOverTile.MouseState.Location.X - offX) * _zoom,
                                   1 + (_scrollPosition.Y + _wvm.MouseOverTile.MouseState.Location.Y - offY) * _zoom);
        }
        else
        {
            position = new Vector2(1 + (_scrollPosition.X + _wvm.MouseOverTile.MouseState.Location.X) * _zoom,
                                   1 + (_scrollPosition.Y + _wvm.MouseOverTile.MouseState.Location.Y) * _zoom);
        }

        if (_wvm.ActiveTool.Name == "Sprite2" &&
            _wvm.SelectedSpriteItem != null &&
            _wvm.SelectedSpriteSheet != null)
        {
            // Handle tiles with custom rendering BEFORE anchor adjustments
            // These tiles need direct offset application to match in-world rendering
            var previewConfigEarly = _wvm.SelectedSpriteItem?.PreviewConfig;

            // Sleeping Digtoise (751) - position-based animation, direct offset
            if (_wvm.SelectedSpriteSheet.Tile == 751 && previewConfigEarly?.SourceRect != null)
            {
                int cursorX = _wvm.MouseOverTile.MouseState.Location.X;
                int cursorY = _wvm.MouseOverTile.MouseState.Location.Y;
                int digtFrame = (cursorX + cursorY * 2) % 7;

                var tex = _textureDictionary.GetTile(751);
                if (tex != null)
                {
                    // Apply direct offset matching in-world renderer (-12, -7)
                    var drawPos = position;
                    drawPos.X += previewConfigEarly.Offset.X * _zoom / 16f;
                    drawPos.Y += previewConfigEarly.Offset.Y * _zoom / 16f;

                    var srcRect = new Rectangle(0, digtFrame * 46, 56, 46);
                    _spriteBatch.Draw(
                        tex,
                        drawPos,
                        srcRect,
                        Color.White,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return;
            }

            // Chillet Egg (752) - direct offset, no anchor adjustments
            if (_wvm.SelectedSpriteSheet.Tile == 752 && previewConfigEarly?.SourceRect != null)
            {
                var tex = _textureDictionary.GetTile(752);
                if (tex != null)
                {
                    // Apply direct offset matching in-world renderer (-2, +2)
                    var drawPos = position;
                    drawPos.X += previewConfigEarly.Offset.X * _zoom / 16f;
                    drawPos.Y += previewConfigEarly.Offset.Y * _zoom / 16f;

                    var srcRect = new Rectangle(
                        previewConfigEarly.SourceRect.Value.X,
                        previewConfigEarly.SourceRect.Value.Y,
                        previewConfigEarly.SourceRect.Value.Width,
                        previewConfigEarly.SourceRect.Value.Height);
                    _spriteBatch.Draw(
                        tex,
                        drawPos,
                        srcRect,
                        Color.White,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return;
            }

            var texsize = _wvm.SelectedSpriteSheet.SizePixelsRender;
            if (texsize.X != 16 || texsize.Y != 16)
            {
                switch (_wvm.SelectedSpriteItem?.Anchor)
                {
                    case FrameAnchor.None:
                        position.X += ((16 - texsize.X) / 2F) * _zoom / 16;
                        position.Y += ((16 - texsize.Y) / 2F) * _zoom / 16;
                        break;
                    case FrameAnchor.Left:
                        //position.X += (16 - texsize.X) / 2;
                        position.Y += ((16 - texsize.Y) / 2F) * _zoom / 16;
                        break;
                    case FrameAnchor.Right:
                        position.X += (16 - texsize.X) * _zoom / 16;
                        position.Y += ((16 - texsize.Y) / 2F) * _zoom / 16;
                        break;
                    case FrameAnchor.Top:
                        position.X += ((16 - texsize.X) / 2F) * _zoom / 16;
                        //position.Y += (16 - texsize.Y);
                        break;
                    case FrameAnchor.Bottom:
                        position.X += ((16 - texsize.X) / 2F) * _zoom / 16;
                        position.Y += (16 - texsize.Y) * _zoom / 16;
                        break;
                }
            }

            // Apply render offsets for special tiles (vines, position offset tiles)
            ApplyTileRenderOffset(ref position, (int)_wvm.SelectedSpriteSheet.Tile, _wvm.SelectedSpriteItem.UV.X, _wvm.SelectedSpriteItem.UV.Y, _zoom);

            // For tree sprites, dynamically determine tree style based on cursor position biome
            var previewConfig = _wvm.SelectedSpriteItem?.PreviewConfig;

            if (previewConfig != null &&
                (previewConfig.TextureType == PreviewTextureType.TreeTops || previewConfig.TextureType == PreviewTextureType.TreeBranch) &&
                _wvm.CurrentWorld != null)
            {
                // If TextureStyle is set (gem/vanity/ash trees), use it directly
                // Otherwise determine dynamically from cursor position biome (regular trees)
                int dynamicStyle = previewConfig.TextureStyle > 0
                    ? previewConfig.TextureStyle
                    : _wvm.CurrentWorld.GetTreeStyleAtPosition(_wvm.MouseOverTile.MouseState.Location.X, _wvm.MouseOverTile.MouseState.Location.Y);

                // Get texture with dynamic style
                var tex = previewConfig.TextureType == PreviewTextureType.TreeTops
                    ? (Texture2D)_textureDictionary.GetTreeTops(dynamicStyle)
                    : (Texture2D)_textureDictionary.GetTreeBranches(dynamicStyle);

                if (tex != null && previewConfig.SourceRect.HasValue)
                {
                    var srcRect = previewConfig.SourceRect.Value;

                    // Calculate dimensions based on tree style (different styles have different sizes)
                    int sourceWidth = srcRect.Width;
                    int sourceHeight = srcRect.Height;

                    if (previewConfig.TextureType == PreviewTextureType.TreeTops)
                    {
                        // Tree top dimensions vary by style
                        switch (dynamicStyle)
                        {
                            case 2:  // Jungle
                            case 11: // Jungle variant
                            case 13: // Underground Jungle
                                sourceWidth = 114;
                                sourceHeight = 96;
                                break;
                            case 3: // Snow (style 3 only, other snow styles use default)
                                sourceWidth = 80;
                                sourceHeight = 140;
                                break;
                            // Gem trees (styles 22-28), Ash tree (style 31): 116x96
                            case 22:
                            case 23:
                            case 24:
                            case 25:
                            case 26:
                            case 27:
                            case 28:
                            case 31:
                                sourceWidth = 116;
                                sourceHeight = 96;
                                break;
                            // Vanity trees (styles 29-30): 118x96
                            case 29:
                            case 30:
                                sourceWidth = 118;
                                sourceHeight = 96;
                                break;
                            default:
                                sourceWidth = 80;
                                sourceHeight = 80;
                                break;
                        }
                    }
                    // Branches stay at 40x40 for all styles

                    // Calculate offset dynamically based on actual dimensions (Bottom anchor for tops, Left/Right for branches)
                    float offsetX, offsetY;
                    if (previewConfig.TextureType == PreviewTextureType.TreeTops)
                    {
                        // Bottom anchor: center X, anchor Y at bottom
                        offsetX = (16 - sourceWidth) / 2f;
                        offsetY = 16 - sourceHeight;
                    }
                    else
                    {
                        // Branches use Left or Right anchor based on source X position
                        bool isLeftBranch = srcRect.X == 0;
                        if (isLeftBranch)
                        {
                            // Right anchor: anchor X at right of tile, center Y
                            offsetX = 16 - sourceWidth;
                            offsetY = (16 - sourceHeight) / 2f;
                        }
                        else
                        {
                            // Left anchor: anchor X at left of tile, center Y
                            offsetX = 0;
                            offsetY = (16 - sourceHeight) / 2f;
                        }
                    }

                    position.X += offsetX * _zoom / 16f;
                    position.Y += offsetY * _zoom / 16f;

                    // Adjust source rect for dynamic style dimensions
                    var xnaSourceRect = new Rectangle(srcRect.X, srcRect.Y, sourceWidth, sourceHeight);

                    _spriteBatch.Draw(
                        tex,
                        position,
                        xnaSourceRect,
                        Color.White * 0.8f,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return; // Skip default preview rendering for tree top/branch sprites
            }

            // For tree trunk sprites, dynamically determine tree type based on cursor position biome
            if (previewConfig != null &&
                previewConfig.TextureType == PreviewTextureType.Tree &&
                _wvm.CurrentWorld != null)
            {
                var mousePos = _wvm.MouseOverTile.MouseState.Location;
                int dynamicTreeType = _wvm.CurrentWorld.GetTreeTypeAtPosition(mousePos.X, mousePos.Y);

                // Get tree trunk texture with dynamic type
                var tex = _textureDictionary.GetTree(dynamicTreeType);

                if (tex != null && previewConfig.SourceRect.HasValue)
                {
                    var srcRect = previewConfig.SourceRect.Value;
                    var xnaSourceRect = new Rectangle(srcRect.X, srcRect.Y, srcRect.Width, srcRect.Height);

                    _spriteBatch.Draw(
                        tex,
                        position,
                        xnaSourceRect,
                        Color.White * 0.8f,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return; // Skip default preview rendering for tree trunk sprites
            }

            // For palm tree top sprites, dynamically determine palm type based on cursor position
            if (previewConfig != null &&
                previewConfig.TextureType == PreviewTextureType.PalmTreeTop &&
                _wvm.CurrentWorld != null)
            {
                var mousePos = _wvm.MouseOverTile.MouseState.Location;
                int palmType = _wvm.CurrentWorld.GetPalmTreeTypeAtPosition(mousePos.X, mousePos.Y);

                // Get Tree_Tops_15 texture
                var tex = (Texture2D)_textureDictionary.GetTreeTops(15);

                if (tex != null && previewConfig.SourceRect.HasValue)
                {
                    var srcRect = previewConfig.SourceRect.Value;

                    // source.Y = palmType * 82 (different palm variants stacked vertically)
                    int sourceY = palmType * 82;

                    // Calculate offset: Bottom anchor for palm tops (80x80)
                    float offsetX = (16 - 80) / 2f;
                    float offsetY = 16 - 80;
                    position.X += offsetX * _zoom / 16f;
                    position.Y += offsetY * _zoom / 16f;

                    var xnaSourceRect = new Rectangle(srcRect.X, sourceY, 80, 80);

                    _spriteBatch.Draw(
                        tex,
                        position,
                        xnaSourceRect,
                        Color.White * 0.8f,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return; // Skip default preview rendering for palm tree top sprites
            }

            // For palm tree trunk sprites, dynamically determine palm type based on cursor position
            if (previewConfig != null &&
                previewConfig.TextureType == PreviewTextureType.PalmTree &&
                _wvm.CurrentWorld != null)
            {
                var mousePos = _wvm.MouseOverTile.MouseState.Location;
                int palmType = _wvm.CurrentWorld.GetPalmTreeTypeAtPosition(mousePos.X, mousePos.Y);

                // Get Tiles_323 texture
                var tex = _textureDictionary.GetTile(323);

                if (tex != null && previewConfig.SourceRect.HasValue)
                {
                    var srcRect = previewConfig.SourceRect.Value;

                    // Apply preview offset (palm tree frames are 20x20, need to center on 16x16 tile)
                    var drawPosition = position;
                    if (previewConfig.Offset.X != 0 || previewConfig.Offset.Y != 0)
                    {
                        drawPosition.X += previewConfig.Offset.X * _zoom / 16f;
                        drawPosition.Y += previewConfig.Offset.Y * _zoom / 16f;
                    }

                    // Set source.Y to palmType * 22 (replacement, not addition, matching world renderer)
                    int sourceY = palmType * 22;
                    var xnaSourceRect = new Rectangle(srcRect.X, sourceY, srcRect.Width, srcRect.Height);

                    _spriteBatch.Draw(
                        tex,
                        drawPosition,
                        xnaSourceRect,
                        Color.White * 0.8f,
                        0,
                        Vector2.Zero,
                        _zoom / 16f,
                        SpriteEffects.None,
                        LayerTools);
                }
                return; // Skip default preview rendering for palm tree trunk sprites
            }

            // Apply custom preview offset for non-tree sprites
            if (previewConfig != null && (previewConfig.Offset.X != 0 || previewConfig.Offset.Y != 0))
            {
                position.X += previewConfig.Offset.X * _zoom / 16f;
                position.Y += previewConfig.Offset.Y * _zoom / 16f;
            }
        }

        if (_wvm.ActiveTool.PreviewIsTexture)
        {
            _spriteBatch.Draw(
                _preview,
                position,
                null,
                Color.White,
                0,
                Vector2.Zero,
                (_zoom / 16) * (float)_wvm.ActiveTool.PreviewScale,
                SpriteEffects.None,
                LayerTools);
        }
        else
        {
            _spriteBatch.Draw(
                _preview,
                position,
                null,
                Color.White,
                0,
                Vector2.Zero,
                _zoom * (float)_wvm.ActiveTool.PreviewScale,
                SpriteEffects.None,
                LayerTools);
        }
    }

    private void DrawPasteLayer()
    {
        var tool = _wvm.ActiveTool;
        if (!tool.IsFloatingPaste)
        {
            DisposePasteTiles();
            return;
        }

        var anchor = tool.FloatingPasteAnchor;
        var size = tool.FloatingPasteSize;
        if (size.X <= 0 || size.Y <= 0) return;

        // Use tiled textures when paste is settled (not actively dragging/resizing)
        var buffer = tool.FloatingPasteBuffer;
        if (!tool.IsPasteInteracting && buffer != null)
        {
            // Generate tiled textures if needed (new buffer or first time)
            if (_pasteTiledPreview == null || _pasteTiledBuffer != buffer)
            {
                DisposePasteTiles();
                _pasteTiledPreview = ClipboardTiledPreview.Create(buffer, xnaViewport.GraphicsService.GraphicsDevice);
                _pasteTiledBuffer = buffer;
            }

            // Draw all tiles
            for (int tx = 0; tx < _pasteTiledPreview.TilesX; tx++)
            {
                for (int ty = 0; ty < _pasteTiledPreview.TilesY; ty++)
                {
                    var tile = _pasteTiledPreview.GetTile(tx, ty);
                    var tilePos = new Vector2(
                        (_scrollPosition.X + anchor.X + tx * ClipboardTiledPreview.MaxTileSize) * _zoom,
                        (_scrollPosition.Y + anchor.Y + ty * ClipboardTiledPreview.MaxTileSize) * _zoom);

                    _spriteBatch.Draw(tile, tilePos, null, Color.White, 0,
                        Vector2.Zero, _zoom, SpriteEffects.None, LayerPastePreview);
                }
            }
        }
        else if (_preview != null)
        {
            // Fallback to scaled single-texture preview during drag/resize
            var pos = new Vector2(
                (_scrollPosition.X + anchor.X) * _zoom,
                (_scrollPosition.Y + anchor.Y) * _zoom);

            _spriteBatch.Draw(
                _preview,
                pos,
                null,
                Color.White,
                0,
                Vector2.Zero,
                _zoom * (float)tool.PreviewScale,
                SpriteEffects.None,
                LayerPastePreview);
        }

        // Border and handle geometry
        float left = (_scrollPosition.X + anchor.X) * _zoom;
        float top = (_scrollPosition.Y + anchor.Y) * _zoom;
        float right = (_scrollPosition.X + anchor.X + size.X) * _zoom;
        float bottom = (_scrollPosition.Y + anchor.Y + size.Y) * _zoom;
        float width = right - left;
        float height = bottom - top;
        float midX = (left + right) * 0.5f;
        float midY = (top + bottom) * 0.5f;
        float borderThickness = Math.Max(1f, _zoom * 0.25f);

        var borderColor = Color.White;

        // Dashed border edges
        // Horizontal: stretch _pasteBorderH (Nx1) along width, scale height by borderThickness
        _spriteBatch.Draw(_pasteBorderH, new Vector2(left, top), null, borderColor, 0,
            Vector2.Zero, new Vector2(width / _pasteBorderH.Width, borderThickness),
            SpriteEffects.None, LayerPasteBorder);
        _spriteBatch.Draw(_pasteBorderH, new Vector2(left, bottom - borderThickness), null, borderColor, 0,
            Vector2.Zero, new Vector2(width / _pasteBorderH.Width, borderThickness),
            SpriteEffects.None, LayerPasteBorder);
        // Vertical: stretch _pasteBorderV (1xN) along height, scale width by borderThickness
        _spriteBatch.Draw(_pasteBorderV, new Vector2(left, top), null, borderColor, 0,
            Vector2.Zero, new Vector2(borderThickness, height / _pasteBorderV.Height),
            SpriteEffects.None, LayerPasteBorder);
        _spriteBatch.Draw(_pasteBorderV, new Vector2(right - borderThickness, top), null, borderColor, 0,
            Vector2.Zero, new Vector2(borderThickness, height / _pasteBorderV.Height),
            SpriteEffects.None, LayerPasteBorder);

        // Handles centered on edge pixels
        float handleSize = Math.Max(4f, _zoom * 0.5f);
        float halfHandle = handleSize * 0.5f;
        var handleColor = Color.FromNonPremultiplied(255, 255, 255, 200);
        var handleOutline = Color.FromNonPremultiplied(0, 0, 0, 200);

        // Edge midpoint handles
        DrawHandle(midX - halfHandle, top - halfHandle, handleSize, handleColor, handleOutline);       // Top center
        DrawHandle(midX - halfHandle, bottom - halfHandle, handleSize, handleColor, handleOutline);    // Bottom center
        DrawHandle(left - halfHandle, midY - halfHandle, handleSize, handleColor, handleOutline);      // Left center
        DrawHandle(right - halfHandle, midY - halfHandle, handleSize, handleColor, handleOutline);     // Right center

        // Corner handles
        DrawHandle(left - halfHandle, top - halfHandle, handleSize, handleColor, handleOutline);       // Top-left
        DrawHandle(right - halfHandle, top - halfHandle, handleSize, handleColor, handleOutline);      // Top-right
        DrawHandle(left - halfHandle, bottom - halfHandle, handleSize, handleColor, handleOutline);    // Bottom-left
        DrawHandle(right - halfHandle, bottom - halfHandle, handleSize, handleColor, handleOutline);   // Bottom-right

    }

    private void DisposePasteTiles()
    {
        _pasteTiledPreview?.Dispose();
        _pasteTiledPreview = null;
        _pasteTiledBuffer = null;
    }

    private void DrawHandle(float x, float y, float size, Color fillColor, Color outlineColor)
    {
        // Outline
        _spriteBatch.Draw(_pasteHandleTexture,
            new Vector2(x - 1f, y - 1f), null, outlineColor, 0, Vector2.Zero,
            new Vector2(size + 2f, size + 2f), SpriteEffects.None, LayerPasteBorder - .01f);
        // Fill
        _spriteBatch.Draw(_pasteHandleTexture,
            new Vector2(x, y), null, fillColor, 0, Vector2.Zero,
            new Vector2(size, size), SpriteEffects.None, LayerPasteBorder - .02f);
    }

    private void DrawWorldBorder()
    {
        if (_wvm.CurrentWorld == null) return;

        var whiteTex = _textureDictionary.WhitePixelTexture;
        if (whiteTex == null) return;

        int worldW = _wvm.CurrentWorld.TilesWide;
        int worldH = _wvm.CurrentWorld.TilesHigh;

        // Border offsets: tiles from edge that are unsafe
        const int leftBorder = 41;
        const int rightBorder = 42;
        const int topBorder = 41;
        const int bottomBorder = 42;

        // Safe rectangle boundaries (in tile coords)
        int safeLeft = leftBorder;
        int safeRight = worldW - rightBorder;
        int safeTop = topBorder;
        int safeBottom = worldH - bottomBorder;

        bool overlay = _wvm.WorldBorderOverlay;

        // Colors
        var lineColor = Color.FromNonPremultiplied(0xA3, 0x3D, 0x3D, 0xFF);
        var overlayColor = Color.FromNonPremultiplied(0xA3, 0x3D, 0x3D, 0x90);

        if (overlay)
        {
            // Draw 4 non-overlapping filled rectangles for unsafe areas
            // Top: full width, topBorder tiles tall
            DrawWorldRect(whiteTex, 0, 0, worldW, safeTop, overlayColor);
            // Bottom: full width, bottomBorder tiles tall
            DrawWorldRect(whiteTex, 0, safeBottom, worldW, worldH - safeBottom, overlayColor);
            // Left: between top and bottom only
            DrawWorldRect(whiteTex, 0, safeTop, safeLeft, safeBottom - safeTop, overlayColor);
            // Right: between top and bottom only
            DrawWorldRect(whiteTex, safeRight, safeTop, worldW - safeRight, safeBottom - safeTop, overlayColor);
        }
        else
        {
            // Line mode: draw 4 lines at safe/unsafe boundary (1px screen width)
            int thickness = Math.Max(1, (int)Math.Ceiling(1.0 / _zoom));

            // Left vertical line at x=safeLeft
            DrawWorldRect(whiteTex, safeLeft, safeTop, thickness, safeBottom - safeTop, lineColor);
            // Right vertical line at x=safeRight
            DrawWorldRect(whiteTex, safeRight, safeTop, thickness, safeBottom - safeTop, lineColor);
            // Top horizontal line at y=safeTop
            DrawWorldRect(whiteTex, safeLeft, safeTop, safeRight - safeLeft, thickness, lineColor);
            // Bottom horizontal line at y=safeBottom
            DrawWorldRect(whiteTex, safeLeft, safeBottom, safeRight - safeLeft, thickness, lineColor);
        }
    }

    private void DrawWorldRect(Texture2D tex, int tileX, int tileY, int tileW, int tileH, Color color)
    {
        // Use Floor/Ceiling to avoid sub-pixel gaps between adjacent rectangles
        float x1 = (_scrollPosition.X + tileX) * _zoom;
        float y1 = (_scrollPosition.Y + tileY) * _zoom;
        float x2 = (_scrollPosition.X + tileX + tileW) * _zoom;
        float y2 = (_scrollPosition.Y + tileY + tileH) * _zoom;

        int left = (int)Math.Floor(x1);
        int top = (int)Math.Floor(y1);
        int right = (int)Math.Ceiling(x2);
        int bottom = (int)Math.Ceiling(y2);

        var dest = new Rectangle(left, top, right - left, bottom - top);
        _spriteBatch.Draw(tex, dest, null, color, 0, Vector2.Zero, SpriteEffects.None, LayerWorldBorder);
    }

    private void DrawSelection()
    {
        Rectangle destinationRectangle = new Rectangle(
            (int)((_scrollPosition.X + _wvm.Selection.SelectionArea.Left) * _zoom),
            (int)((_scrollPosition.Y + _wvm.Selection.SelectionArea.Top) * _zoom),
            (int)((_wvm.Selection.SelectionArea.Width) * _zoom),
            (int)((_wvm.Selection.SelectionArea.Height) * _zoom));

        _spriteBatch.Draw(
            _selectionTexture,
            destinationRectangle, null,
             Color.White, 0, Vector2.Zero, SpriteEffects.None,
             LayerSelection);
    }

    private Vector2 TileOrigin(int tileX, int tileY)
    {
        return new Vector2(
            (_scrollPosition.X + tileX) * _zoom,
            (_scrollPosition.Y + tileY) * _zoom);
    }

    /// <summary>
    /// Renders world layers for export — same draw order as Render() but without
    /// filter overlays, selection rectangles, or other UI elements.
    /// Always uses texture mode when textures are loaded (regardless of zoom threshold).
    /// Parallax backgrounds (surface/underworld) are skipped because they are screen-space
    /// effects that can't tile correctly across chunked world-space rendering.
    /// </summary>
    private void RenderExportLayers()
    {
        bool texturesAvailable = _textureDictionary != null && _textureDictionary.Valid;

        // Background and base tiles
        _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp,
            DepthStencilState.Default, RasterizerState.CullNone);

        if (texturesAvailable)
        {
            // Draw gradient zones (world-space, tiles correctly across chunks)
            DrawBackgroundGradient();

            // Draw underground tile backgrounds (world-space tiling, works correctly)
            // Note: DrawTileBackgrounds() also calls DrawSurfaceBackground() and
            // DrawUnderworldBackground() which use screen-space parallax. Skip those
            // during export by drawing only the tile-level backgrounds directly.
            DrawExportTileBackgrounds();
        }
        else
        {
            DrawPixelTiles();
        }
        _spriteBatch.End();

        if (!texturesAvailable) return;

        // Walls
        if (_wvm.ShowWalls)
        {
            _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp,
                DepthStencilState.Default, RasterizerState.CullNone);
            DrawTileWalls();
            _spriteBatch.End();

            _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp,
                DepthStencilState.Default, RasterizerState.CullNone, _textureDictionary?.InvertEffect);
            DrawTileWalls(true);
            _spriteBatch.End();
        }

        // Tiles
        if (_wvm.ShowTiles)
        {
            _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp,
                DepthStencilState.Default, RasterizerState.CullNone);
            DrawTileTextures();
            _spriteBatch.End();

            _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp,
                DepthStencilState.Default, RasterizerState.CullNone, _textureDictionary?.InvertEffect);
            DrawTileTextures(true);
            _spriteBatch.End();

            if (_wvm.ShowGlowMasks)
            {
                _spriteBatch.Begin(SpriteSortMode.Deferred, AdditiveGlowBlend, SamplerState.PointClamp,
                    DepthStencilState.Default, RasterizerState.CullNone);
                DrawTileGlowMasks();
                _spriteBatch.End();
            }
        }

        // Wires, liquids, entities
        if (_wvm.ShowTiles || _wvm.ShowBlueWires || _wvm.ShowRedWires ||
            _wvm.ShowGreenWires || _wvm.ShowYellowWires || _wvm.ShowLiquid)
        {
            _spriteBatch.Begin(SpriteSortMode.BackToFront, BlendState.AlphaBlend, SamplerState.PointClamp,
                DepthStencilState.Default, RasterizerState.CullNone);

            if (_wvm.ShowBlueWires || _wvm.ShowRedWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires)
                DrawTileWires();

            if (_wvm.ShowLiquid)
                DrawTileLiquid();

            if (_wvm.ShowTiles)
                DrawTileEntities();

            _spriteBatch.End();
        }
    }

    /// <summary>
    /// Draws underground tile backgrounds for export — same as DrawTileBackgrounds() but
    /// without the parallax surface/underworld layers that don't tile across chunks.
    /// </summary>
    private void DrawExportTileBackgrounds()
    {
        if (!_wvm.ShowBackgrounds) return;

        Rectangle visibleBounds = GetViewingArea();

        for (int y = visibleBounds.Top - 1; y < visibleBounds.Bottom + 2; y++)
        {
            for (int x = visibleBounds.Left - 1; x < visibleBounds.Right + 2; x++)
            {
                if (x < 0 || y < 0 ||
                    x >= _wvm.CurrentWorld.TilesWide ||
                    y >= _wvm.CurrentWorld.TilesHigh)
                    continue;

                if (y < _wvm.CurrentWorld.GroundLevel) continue;

                if (y >= 80)
                {
                    int hellback = _wvm.CurrentWorld.HellBackStyle;
                    int backX = 0;
                    if (x <= _wvm.CurrentWorld.CaveBackX0)
                        backX = _wvm.CurrentWorld.CaveBackStyle0;
                    else if (x > _wvm.CurrentWorld.CaveBackX0 && x <= _wvm.CurrentWorld.CaveBackX1)
                        backX = _wvm.CurrentWorld.CaveBackStyle1;
                    else if (x > _wvm.CurrentWorld.CaveBackX1 && x <= _wvm.CurrentWorld.CaveBackX2)
                        backX = _wvm.CurrentWorld.CaveBackStyle2;
                    else if (x > _wvm.CurrentWorld.CaveBackX2)
                        backX = _wvm.CurrentWorld.CaveBackStyle3;
                    backX = Math.Clamp(backX, 0, 7);
                    var source = new Rectangle(0, 0, 16, 16);
                    var backTex = _textureDictionary.GetBackground(0);

                    if (y == _wvm.CurrentWorld.GroundLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 0]);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > _wvm.CurrentWorld.GroundLevel && y < _wvm.CurrentWorld.RockLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 1]);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.GroundLevel) % 6) * 16;
                    }
                    else if (y == _wvm.CurrentWorld.RockLevel)
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 2]);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > _wvm.CurrentWorld.RockLevel && y < (_wvm.CurrentWorld.TilesHigh - 327))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 3]);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.RockLevel) % 6) * 16;
                    }
                    else if (y == (_wvm.CurrentWorld.TilesHigh - 327))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 4] + hellback);
                        source.X += (x % 8) * 16;
                    }
                    else if (y > (_wvm.CurrentWorld.TilesHigh - 327) && y < (_wvm.CurrentWorld.TilesHigh - 200))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 5] + hellback);
                        source.X += (x % 8) * 16;
                        source.Y += ((y - 1 - (int)_wvm.CurrentWorld.TilesHigh + 327) % 18) * 16;
                    }
                    else if (y == (_wvm.CurrentWorld.TilesHigh - 200))
                    {
                        backTex = _textureDictionary.GetBackground(backstyle[backX, 6] + hellback);
                        source.X += (x % 8) * 16;
                    }
                    else
                    {
                        continue;
                    }

                    var dest = new Rectangle(1 + (int)((_scrollPosition.X + x) * _zoom), 1 + (int)((_scrollPosition.Y + y) * _zoom), (int)_zoom, (int)_zoom);
                    _spriteBatch.Draw(backTex, dest, source, Color.White, 0f, default, SpriteEffects.None, LayerTileBackgroundTextures);
                }
            }
        }
    }

}