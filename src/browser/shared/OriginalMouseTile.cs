// Frozen TEdit UI/MouseTile.cs methods, MS-PL; reactive properties and language access adapted.
using TEdit.Terraria;
using TEdit.Geometry;
namespace TEdit.Port;
public sealed class OriginalMouseTile(string language){
 readonly HoverLabels Language=new(language);
 public string TileExtras {get;private set;}="";
 public string TileName {get;private set;}="";
 public string WallName {get;private set;}="";
 public string Paint {get;private set;}="";
 public string DepthText {get;private set;}="";
 public Vector2Short UV {get;private set;}
    private static string GetPaintName(byte colorId)
    {
        if (colorId == 0) return null;
        if (colorId < WorldConfiguration.PaintProperties.Count)
            return WorldConfiguration.PaintProperties[colorId].Name;
        return $"Unknown ({colorId})";
    }

    public void UpdateTileInfo(Tile tile)
    {
        // Tile name
        if (WorldConfiguration.TileProperties.Count > tile.Type)
        {
            var tileProperty = WorldConfiguration.TileProperties[tile.Type];
            TileName = tile.IsActive ? $"{tileProperty.Name} ({tile.Type})" : "[empty]";
        }
        else
        {
            TileName = $"INVALID TILE ({tile.Type})";
        }

        // Wall name
        if (WorldConfiguration.WallProperties.Count > tile.Wall)
            WallName = $"{WorldConfiguration.WallProperties[tile.Wall].Name} ({tile.Wall})";
        else
            WallName = $"INVALID WALL ({tile.Wall})";

        // UV
        UV = new Vector2Short(tile.U, tile.V);

        // Extras
        var extras = tile.LiquidAmount > 0
            ? $"{tile.LiquidType}: {tile.LiquidAmount}"
            : string.Empty;

        if (tile.InActive)
            extras += " Inactive";

        if (tile.Actuator)
            extras += " Actuator";

        if (tile.WireRed || tile.WireBlue || tile.WireGreen || tile.WireYellow)
        {
            extras += string.IsNullOrWhiteSpace(extras) ? "Wire " : ", Wire ";
            if (tile.WireRed) extras += "R";
            if (tile.WireGreen) extras += "G";
            if (tile.WireBlue) extras += "B";
            if (tile.WireYellow) extras += "Y";
        }

        TileExtras = extras;

        // Paint
        string tilePaint = GetPaintName(tile.TileColor);
        string wallPaint = GetPaintName(tile.WallColor);

        if (tilePaint != null && wallPaint != null)
            Paint = $"Tile: {tilePaint}, Wall: {wallPaint}";
        else if (tilePaint != null)
            Paint = $"Tile: {tilePaint}";
        else if (wallPaint != null)
            Paint = $"Wall: {wallPaint}";
        else
            Paint = "None";
    }

    /// <summary>
    /// Updates depth display text using Terraria's in-game GPS formulas.
    /// 1 tile = 2 feet. Depth is relative to surface; compass is relative to world center.
    /// </summary>
    public void UpdateDepth(int tileX, int tileY, int tilesWide, int tilesHigh, double groundLevel, double rockLevel)
    {
        // Compass: feet east/west from center
        int compassFeet = tileX * 2 - tilesWide;
        string compass;
        if (compassFeet > 0)
            compass = string.Format(Language.depth_east, compassFeet);
        else if (compassFeet < 0)
            compass = string.Format(Language.depth_west, -compassFeet);
        else
            compass = Language.depth_center;

        // Depth: feet above/below surface
        int depthFeet = (int)(tileY * 2 - groundLevel * 2);

        // Layer determination (matches Terraria source)
        string layer;
        if (tileY > tilesHigh - 204)
            layer = Language.depth_layer_underworld;
        else if (tileY > rockLevel)
            layer = Language.depth_layer_caverns;
        else if (depthFeet > 0)
            layer = Language.depth_layer_underground;
        else
        {
            // Space check: same formula as Terraria
            float sizeRatio = (float)tilesWide / 4200f;
            float sizeRatioSq = sizeRatio * sizeRatio;
            float spaceCheck = (float)((tileY - (65.0 + 10.0 * sizeRatioSq)) / (groundLevel / 5.0));
            layer = spaceCheck < 1.0f ? Language.depth_layer_space : Language.depth_layer_surface;
        }

        int absFeet = Math.Abs(depthFeet);
        string depth = absFeet != 0
            ? $"{string.Format(Language.depth_feet, absFeet)} {layer}"
            : $"{Language.depth_level} {layer}";

        DepthText = $"{compass}, {depth}";
    }
}

sealed class HoverLabels(string language){
 static readonly Dictionary<string,Dictionary<string,string>> resources=System.Text.Json.JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string>>>("""
{"ar-BH": {"depth_center": "المركز", "depth_east": "{0}' شرق", "depth_feet": "{0}'", "depth_layer_caverns": "الكهوف", "depth_layer_space": "الفضاء", "depth_layer_surface": "السطح", "depth_layer_underground": "تحت الأرض", "depth_layer_underworld": "العالم السفلي", "depth_level": "المستوى", "depth_west": "{0}' غرب"}, "de-DE": {"depth_center": "Zentrum", "depth_east": "{0}' Osten", "depth_feet": "{0}'", "depth_layer_caverns": "Höhlen", "depth_layer_space": "Weltraum", "depth_layer_surface": "Oberfläche", "depth_layer_underground": "Untergrund", "depth_layer_underworld": "Unterwelt", "depth_level": "Ebene", "depth_west": "{0}' Westen"}, "en": {"depth_center": "Center", "depth_east": "{0}' East", "depth_feet": "{0}'", "depth_layer_caverns": "Caverns", "depth_layer_space": "Space", "depth_layer_surface": "Surface", "depth_layer_underground": "Underground", "depth_layer_underworld": "Underworld", "depth_level": "Level", "depth_west": "{0}' West"}, "es-ES": {"depth_center": "Centro", "depth_east": "{0}' Este", "depth_feet": "{0}'", "depth_layer_caverns": "Cavernas", "depth_layer_space": "Espacio", "depth_layer_surface": "Superficie", "depth_layer_underground": "Subterráneo", "depth_layer_underworld": "Inframundo", "depth_level": "Nivel", "depth_west": "{0}' Oeste"}, "fr-FR": {"depth_center": "Centre", "depth_east": "{0}' Est", "depth_feet": "{0}'", "depth_layer_caverns": "Cavernes", "depth_layer_space": "Espace", "depth_layer_surface": "Surface", "depth_layer_underground": "Sous-sol", "depth_layer_underworld": "Monde souterrain", "depth_level": "Niveau", "depth_west": "{0}' Ouest"}, "it-IT": {"depth_center": "Centro", "depth_east": "{0}' Est", "depth_feet": "{0}'", "depth_layer_caverns": "Caverne", "depth_layer_space": "Spazio", "depth_layer_surface": "Superficie", "depth_layer_underground": "Sottoterra", "depth_layer_underworld": "Oltretomba", "depth_level": "Livello", "depth_west": "{0}' Ovest"}, "ja-JP": {"depth_center": "中央", "depth_east": "{0}度 東", "depth_feet": "{0}度", "depth_layer_caverns": "洞窟", "depth_layer_space": "宇宙", "depth_layer_surface": "地表", "depth_layer_underground": "地下", "depth_layer_underworld": "アンダーワールド", "depth_level": "レベル", "depth_west": "{0}度 西"}, "ko-KR": {"depth_center": "중앙", "depth_east": "{0}도 동쪽", "depth_feet": "{0}도", "depth_layer_caverns": "동굴", "depth_layer_space": "우주", "depth_layer_surface": "표면", "depth_layer_underground": "지하", "depth_layer_underworld": "지하세계", "depth_level": "레벨", "depth_west": "{0}도 서쪽"}, "pl-PL": {"depth_center": "Centrum", "depth_east": "{0}' Wschód", "depth_feet": "{0}'", "depth_layer_caverns": "Jaskinie", "depth_layer_space": "Przestrzeń", "depth_layer_surface": "Powierzchnia", "depth_layer_underground": "Podziemie", "depth_layer_underworld": "Podziemie", "depth_level": "Poziom", "depth_west": "{0}' Zachód"}, "pt-BR": {"depth_center": "Centro", "depth_east": "{0}' Leste", "depth_feet": "{0}'", "depth_layer_caverns": "Cavernas", "depth_layer_space": "Espaço", "depth_layer_surface": "Superfície", "depth_layer_underground": "Subterrâneo", "depth_layer_underworld": "Submundo", "depth_level": "Nível", "depth_west": "{0}' Oeste"}, "ru-RU": {"depth_center": "Центр", "depth_east": "{0}' Восток", "depth_feet": "{0}'", "depth_layer_caverns": "Пещеры", "depth_layer_space": "Космос", "depth_layer_surface": "Поверхность", "depth_layer_underground": "Подземелье", "depth_layer_underworld": "Подземный мир", "depth_level": "Уровень", "depth_west": "{0}' Запад"}, "zh-Hans": {"depth_center": "中心", "depth_east": "{0} 东", "depth_feet": "{0} 度", "depth_layer_caverns": "洞穴", "depth_layer_space": "太空", "depth_layer_surface": "地表", "depth_layer_underground": "地下", "depth_layer_underworld": "地狱", "depth_level": "层级", "depth_west": "{0} 西"}, "zh-Hant": {"depth_center": "中心", "depth_east": "{0} 東", "depth_feet": "{0} 樣", "depth_layer_caverns": "洞穴", "depth_layer_space": "空間", "depth_layer_surface": "地表", "depth_layer_underground": "地下", "depth_layer_underworld": "黑社會", "depth_level": "層級", "depth_west": "{0} 西"}}
""")!;
 string Text(string key){string name=resources.ContainsKey(language)?language:resources.Keys.FirstOrDefault(k=>k.Split('-')[0]==language)??"en";return resources[name].GetValueOrDefault(key)??resources["en"][key];}
 public string depth_center=>Text("depth_center");
 public string depth_east=>Text("depth_east");
 public string depth_feet=>Text("depth_feet");
 public string depth_layer_caverns=>Text("depth_layer_caverns");
 public string depth_layer_space=>Text("depth_layer_space");
 public string depth_layer_surface=>Text("depth_layer_surface");
 public string depth_layer_underground=>Text("depth_layer_underground");
 public string depth_layer_underworld=>Text("depth_layer_underworld");
 public string depth_level=>Text("depth_level");
 public string depth_west=>Text("depth_west");
}
