// Original texture key/fallback methods retained from TEdit; local files are represented by metadata.
using TEdit.Terraria;
using TEdit.Terraria.Objects;
namespace TEdit.Port.Rendering;
public sealed class Textures {
 public readonly HashSet<string> Missing=new(StringComparer.OrdinalIgnoreCase);
 readonly Dictionary<string,Texture2D> metadata=new(StringComparer.OrdinalIgnoreCase);
 public static string Normalize(string path)=>path.Replace('\\','/').Replace("Images/","",StringComparison.OrdinalIgnoreCase).ToLowerInvariant();
 public bool Available {get;set;}
 public bool Valid=>Available||metadata.Count>0;
 public Texture2D DefaultTexture {get;}=new("@empty",1,1);
 public Texture2D WhitePixelTexture {get;}=new("@white",1,1);
 public Texture2D GlowHaloTexture {get;}=new("@halo",64,64);
 public Texture2D Actuator=>(Texture2D)GetMisc("Actuator");
 public TEdit.Geometry.RectangleInt32 ZeroSixteenRectangle=>new(0,0,16,16);
 public Effect InvertEffect {get;}=new("invert");
 public Effect DarkenEffect {get;}=new("darken");
 readonly object ContentManager=new(); readonly object? _previewContentManager=null;
 Texture2D _defaultTexture=>DefaultTexture;
 public void BeginFrame()=>Missing.Clear();
 public void Register(IEnumerable<Texture2D> entries){metadata.Clear();foreach(var t in entries){if(t.Width<1||t.Height<1||t.Width>4096||t.Height>4096)throw new ArgumentException("Invalid texture dimensions");metadata[Normalize(t.Key)]=t with{Key=Normalize(t.Key)};}
  Gore.Clear();
  Extra.Clear();
  Moon.Clear();
  Tiles.Clear();
  Underworld.Clear();
  Backgrounds.Clear();
  Walls.Clear();
  Trees.Clear();
  TreeTops.Clear();
  TreeBranches.Clear();
  Shrooms.Clear();
  Npcs.Clear();
  TownNpcs.Clear();
  GlowMasks.Clear();
  Liquids.Clear();
  Misc.Clear();
  ArmorHead.Clear();
  ArmorBody.Clear();
  ArmorFemale.Clear();
  ArmorLegs.Clear();
  Item.Clear();
  PlayerBody.Clear();
  PlayerHair.Clear();
  AccWings.Clear();
  AccBack.Clear();
  AccBalloon.Clear();
  AccShoes.Clear();
  AccWaist.Clear();
  AccNeck.Clear();
  AccFace.Clear();
  AccShield.Clear();
  AccHandsOn.Clear();
  AccHandsOff.Clear();
  AccFront.Clear();
 }
 public Texture2D LoadTextureImmediate(string path)=>LoadTexture(path);
 Texture2D LoadTexture(string path){var key=Normalize(path);if(metadata.TryGetValue(key,out var texture))return texture;Missing.Add(key);return DefaultTexture;}
 Texture2D LoadTextureFrom(object manager,string path)=>LoadTexture(path);
    public Dictionary<int, Texture2D> Gore { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Extra { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Moon { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Tiles { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Underworld { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Backgrounds { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Walls { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Trees { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> TreeTops { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> TreeBranches { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Shrooms { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Npcs { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<TownNpcKey, Texture2D> TownNpcs { get; } = new();
    public Dictionary<int, Texture2D> GlowMasks { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Liquids { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<string, Texture2D> Misc { get; } = new Dictionary<string, Texture2D>();
    public Dictionary<int, Texture2D> ArmorHead { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> ArmorBody { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> ArmorFemale { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> ArmorLegs { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> Item { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<string, Texture2D> PlayerBody { get; } = new Dictionary<string, Texture2D>();
    public Dictionary<int, Texture2D> PlayerHair { get; } = new Dictionary<int, Texture2D>();
    public Dictionary<int, Texture2D> AccWings { get; } = new();
    public Dictionary<int, Texture2D> AccBack { get; } = new();
    public Dictionary<int, Texture2D> AccBalloon { get; } = new();
    public Dictionary<int, Texture2D> AccShoes { get; } = new();
    public Dictionary<int, Texture2D> AccWaist { get; } = new();
    public Dictionary<int, Texture2D> AccNeck { get; } = new();
    public Dictionary<int, Texture2D> AccFace { get; } = new();
    public Dictionary<int, Texture2D> AccShield { get; } = new();
    public Dictionary<int, Texture2D> AccHandsOn { get; } = new();
    public Dictionary<int, Texture2D> AccHandsOff { get; } = new();
    public Dictionary<int, Texture2D> AccFront { get; } = new();

    public Texture2D GetTile(int num) => GetTextureById(Tiles, num, "Images\\Tiles_{0}");

    public Texture2D GetUnderworld(int num) => GetTextureById(Underworld, num, "Images\\Backgrounds\\Underworld {0}");

    public Texture2D GetBackground(int num) => GetTextureById(Backgrounds, num, "Images\\Background_{0}");

    public Texture2D GetWall(int num) => GetTextureById(Walls, num, "Images\\Wall_{0}");

    public Texture2D GetTree(int num)
    {
        if (!Trees.ContainsKey(num))
        {
            if (num >= 0)
            {
                string name = $"Images\\Tiles_5_{num}";
                Trees[num] = LoadTexture(name);
            }
            else
            {
                string name = "Images\\Tiles_5";
                Trees[num] = LoadTexture(name);
            }
        }
        return Trees[num];
    }
    public Texture2D GetTreeTops(int num) => GetTextureById(TreeTops, num, "Images\\Tree_Tops_{0}");

    public Texture2D GetTreeBranches(int num) => GetTextureById(TreeBranches, num, "Images\\Tree_Branches_{0}");

    public Texture2D GetShroomTop(int num) => GetTextureById(Shrooms, num, "Images\\Shroom_Tops");

    public Texture2D GetNPC(int num)
    {
        if (!Npcs.ContainsKey(num))
        {
            string name = string.Format("Images\\NPC_{0}", num);
            Npcs[num] = LoadTextureFrom(_previewContentManager ?? ContentManager, name);
        }
        return Npcs[num];
    }

    public Texture2D GetTownNPC(string name, int npcId, int variant = 0, bool partying = false, bool shimmered = false)
    {
        var key = new TownNpcKey(name, variant, partying, shimmered);

        if (!TownNpcs.ContainsKey(key))
        {
            var cm = _previewContentManager ?? ContentManager;

            string variantName = "Default";
            if (WorldConfiguration.NpcById.TryGetValue(npcId, out var npcData)
                && npcData.Variants != null
                && variant >= 0
                && variant < npcData.Variants.Count)
            {
                variantName = npcData.Variants[variant];
            }
            if (name == "DD2Bartender")
            {
                name = "Tavernkeep";
            }
            else if (name == "SantaClaus")
            {
                name = "Santa";
            }
            else if (name.StartsWith("Town"))
            {
                name = name.Substring(4);
            }

            string basePath = $"Images\\TownNPCs\\{name}_{variantName}";
            string texturePath = basePath;

            if (partying && shimmered)
            {
                texturePath = $"Images\\TownNPCs\\Shimmered\\{name}_{variantName}_Party";
            }
            else if (shimmered)
            {
                texturePath = $"Images\\TownNPCs\\Shimmered\\{name}_{variantName}";
            }
            else if (partying)
            {
                texturePath = $"Images\\TownNPCs\\{name}_{variantName}_Party";
            }

            var tex = LoadTextureFrom(cm, texturePath);

            // Fallback chain: party/shimmer variant → base town NPC texture → NPC_{id}
            // Note: LoadTextureFrom returns _defaultTexture for missing files, never null
            if ((tex == null || tex == _defaultTexture) && texturePath != basePath)
            {
                tex = LoadTextureFrom(cm, basePath);
            }
            if (tex == null || tex == _defaultTexture)
            {
                tex = LoadTextureFrom(cm, $"Images\\NPC_{npcId}");
            }

            TownNpcs[key] = tex;
        }

        return TownNpcs[key];
    }


    public Texture2D GetGlowMask(int id) => GetTextureById(GlowMasks, id, "Images\\Glow_{0}");

    public Texture2D GetLiquid(int num) => GetTextureById(Liquids, num, "Images\\Liquid_{0}");

    public Texture2D GetMisc(string name) => GetTextureById(Misc, name, "Images\\{0}");

    public Texture2D GetArmorHead(int num) => GetPreviewTextureById(ArmorHead, num, "Images\\Armor_Head_{0}");

    public Texture2D GetArmorBody(int num) => GetPreviewTextureById(ArmorBody, num, "Images\\Armor\\Armor_{0}");

    public Texture2D GetArmorFemale(int num) => GetPreviewTextureById(ArmorFemale, num, "Images\\Armor\\Armor_Female_{0}");

    public Texture2D GetArmorLegs(int num) => GetPreviewTextureById(ArmorLegs, num, "Images\\Armor_Legs_{0}");

    // Accessory texture getters
    public Texture2D GetAccWings(int num) => GetPreviewTextureById(AccWings, num, "Images\\Wings_{0}");
    public Texture2D GetAccBack(int num) => GetPreviewTextureById(AccBack, num, "Images\\Acc_Back_{0}");
    public Texture2D GetAccBalloon(int num) => GetPreviewTextureById(AccBalloon, num, "Images\\Acc_Balloon_{0}");
    public Texture2D GetAccShoes(int num) => GetPreviewTextureById(AccShoes, num, "Images\\Acc_Shoes_{0}");
    public Texture2D GetAccWaist(int num) => GetPreviewTextureById(AccWaist, num, "Images\\Acc_Waist_{0}");
    public Texture2D GetAccNeck(int num) => GetPreviewTextureById(AccNeck, num, "Images\\Acc_Neck_{0}");
    public Texture2D GetAccFace(int num) => GetPreviewTextureById(AccFace, num, "Images\\Acc_Face_{0}");
    public Texture2D GetAccShield(int num) => GetPreviewTextureById(AccShield, num, "Images\\Acc_Shield_{0}");
    public Texture2D GetAccHandsOn(int num) => GetPreviewTextureById(AccHandsOn, num, "Images\\Acc_HandsOn_{0}");
    public Texture2D GetAccHandsOff(int num) => GetPreviewTextureById(AccHandsOff, num, "Images\\Acc_HandsOff_{0}");
    public Texture2D GetAccFront(int num) => GetPreviewTextureById(AccFront, num, "Images\\Acc_Front_{0}");

    public Texture2D GetItem(int num)
    {
        if (!Item.ContainsKey(num))
        {
            string name = string.Format("Images\\Item_{0}", num);
            Item[num] = LoadTextureFrom(_previewContentManager ?? ContentManager, name);
        }
        return Item[num];
    }

    public Texture2D GetPlayerBody(int skinVariant, int partIndex)
    {
        // Try the specific variant first
        var key = $"{skinVariant}_{partIndex}";
        var texture = GetPreviewTextureById(PlayerBody, key, "Images\\Player_{0}");
        if (texture != DefaultTexture) return texture;

        // Fallback chain matching Terraria's PlayerDataInitializer CopyVariant logic:
        // Variants 1,2,3,8 → fall back to variant 0 (male base)
        // Variants 5,6,7,9 → fall back to variant 4 (female base)
        // Variant 4 → falls back to variant 0 for head parts (0,1,2,15)
        // Variants 10,11 (display dolls) → 10 falls back to 0, 11 falls back to 10
        int fallback = skinVariant switch
        {
            1 or 2 or 3 or 8 => 0,
            5 or 6 or 7 or 9 => 4,
            4 => 0,
            11 => 10,
            10 => 0,
            _ => -1
        };

        if (fallback >= 0)
        {
            var fbKey = $"{fallback}_{partIndex}";
            texture = GetPreviewTextureById(PlayerBody, fbKey, "Images\\Player_{0}");
            if (texture != DefaultTexture) return texture;

            // Second-level fallback: variant 4 → 0, variant 10 → 0, variant 11 → 10 → 0
            if (fallback == 4 || fallback == 10)
            {
                var fb2Key = $"0_{partIndex}";
                texture = GetPreviewTextureById(PlayerBody, fb2Key, "Images\\Player_{0}");
                if (texture != DefaultTexture) return texture;
            }
        }

        return DefaultTexture;
    }

    public Texture2D GetPlayerHair(int hairIndex)
    {
        if (!PlayerHair.ContainsKey(hairIndex))
        {
            // Terraria hair textures are 1-indexed: Player_Hair_1.xnb = hair style 0
            string name = $"Images\\Player_Hair_{hairIndex + 1}";
            PlayerHair[hairIndex] = LoadTextureFrom(_previewContentManager ?? ContentManager, name);
        }
        return PlayerHair[hairIndex];
    }




    /// <summary>

    /// Get texture for preview based on PreviewConfig settings.

    /// </summary>

    public Texture2D GetPreviewTexture(PreviewConfig config, int tileId)

    {

        if (config == null)

            return GetTile(tileId);



        return config.TextureType switch

        {

            PreviewTextureType.Tree => GetTree(config.TextureStyle),

            PreviewTextureType.TreeTops => (Texture2D)GetTreeTops(config.TextureStyle),

            PreviewTextureType.TreeBranch => (Texture2D)GetTreeBranches(config.TextureStyle),

            PreviewTextureType.PalmTree => GetTile(323), // Palm tree trunk texture

            PreviewTextureType.PalmTreeTop => (Texture2D)GetTreeTops(15), // Palm tree top texture

            PreviewTextureType.Item => GetItem(config.TextureStyle),

            _ => GetTile(tileId)

        };

    }


    public Texture2D GetExtra(int num) => GetTextureById(Extra, num, "Images\\Extra_{0}");

    public Texture2D GetGore(int num) => GetTextureById(Gore, num, "Images\\Gore_{0}");

    private Texture2D GetTextureById<T>(Dictionary<T, Texture2D> collection, T id, string path)
    {
        if (!collection.ContainsKey(id))
        {
            string name = string.Format(path, id);
            collection[id] = LoadTexture(name);
        }

        return collection[id];
    }

    private Texture2D GetPreviewTextureById<T>(Dictionary<T, Texture2D> collection, T id, string path)
    {
        if (!collection.ContainsKey(id))
        {
            string name = string.Format(path, id);
            collection[id] = LoadTextureFrom(_previewContentManager ?? ContentManager, name);
        }

        return collection[id];
    }
}
