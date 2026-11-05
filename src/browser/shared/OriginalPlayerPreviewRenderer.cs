// Original TEdit PlayerPreviewRenderer: original frame/layer/tint/blend logic.
// Only WPF bitmap output and texture readback are adapted to portable RGBA.
using TEdit.Common;
using TEdit.Terraria.Player;
using Textures=TEdit.Port.PreviewTextures;
using Texture2D=TEdit.Port.PreviewTexture;
namespace TEdit.Port;
public static class OriginalPlayerPreviewRenderer {
 const int FrameWidth=40,FrameHeight=56;
 private static bool IsFemaleVariant(int skinVariant)=>skinVariant is >=4 and <=7 or 9;
    public static PreviewImage? RenderPreview(
        PlayerCharacter player, Textures textures, int scale = 4,
        int? armorHeadSlot = null, int? armorBodySlot = null, int? armorLegsSlot = null,
        TEditColor? dyeHead = null, TEditColor? dyeBody = null, TEditColor? dyeLegs = null,
        bool showHairWithHelmet = true,
        int? wingSlot = null, int? backSlot = null, int? balloonSlot = null,
        int? shoeSlot = null, int? waistSlot = null, int? neckSlot = null,
        int? faceSlot = null, int? shieldSlot = null,
        int? handOnSlot = null, int? handOffSlot = null, int? frontSlot = null)
    {
        if (textures == null || !textures.Valid) return null;

        var appearance = player.Appearance;
        var skinVariant = appearance.SkinVariant;

        // Composite buffer in WPF BGRA format (0xAARRGGBB)
        var composite = new int[FrameWidth * FrameHeight];

        // Terraria 1.4+ composite frame system: female characters use different
        // grid positions for torso/shoulder parts. See PlayerDrawSet.CreateCompositeData().
        bool isFemale = IsFemaleVariant(skinVariant);
        int femaleRowOffset = isFemale ? 2 : 0;

        // Composite frame positions for the standing pose (targetFrameNumber = 0):
        //   Torso:          grid (0, 0 + femaleOffset) → covers chest/belly area
        //   Back shoulder:  grid (1, 1 + femaleOffset) → covers shoulder/upper-arm area
        int torsoFrameX = 0;
        int torsoFrameY = (0 + femaleRowOffset) * FrameHeight;
        int shoulderFrameX = 1 * FrameWidth;
        int shoulderFrameY = (1 + femaleRowOffset) * FrameHeight;

        // When armor is equipped, Terraria hides the corresponding clothing layers
        // and only draws the armor texture. This prevents clothing from showing through
        // semi-transparent or small armor pieces (e.g. bikini tops).
        bool hasBodyArmor = armorBodySlot.HasValue;
        bool hasLegsArmor = armorLegsSlot.HasValue;

        // Draw order follows Terraria's composite layer order (back to front):

        // Back arm layers (use traditional frame 0 — arm frames are not gender-offset)
        BlendBodyPart(composite, textures, skinVariant, 7, appearance.SkinColor);   // back arm skin — always drawn
        if (!hasBodyArmor)
        {
            BlendBodyPart(composite, textures, skinVariant, 8, appearance.UnderShirtColor);  // back arm undershirt
            BlendBodyPart(composite, textures, skinVariant, 13, appearance.ShirtColor);      // back arm shirt sleeve
        }

        // Back accessories (behind body, in front of back arm)
        if (handOffSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccHandsOff(handOffSlot.Value));
        if (wingSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccWings(wingSlot.Value));
        if (backSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccBack(backSlot.Value));
        if (balloonSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccBalloon(balloonSlot.Value));

        // Legs and feet (use traditional legFrame — not affected by composite system)
        BlendBodyPart(composite, textures, skinVariant, 10, appearance.SkinColor);  // leg skin — always drawn
        if (!hasLegsArmor)
        {
            BlendBodyPart(composite, textures, skinVariant, 12, appearance.ShoeColor);   // shoes
            BlendBodyPart(composite, textures, skinVariant, 11, appearance.PantsColor);  // pants
        }

        // Long coat / dress overlay (part 14) — hidden when body armor is equipped
        if (!hasBodyArmor)
            BlendBodyPart(composite, textures, skinVariant, 14, appearance.ShirtColor);

        // Armor legs overlay
        if (armorLegsSlot.HasValue)
            BlendArmorPart(composite, textures, (Texture2D)textures.GetArmorLegs(armorLegsSlot.Value), dyeLegs);

        // Shoe accessories (over leg area)
        if (shoeSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccShoes(shoeSlot.Value));

        // Torso skin — always drawn (composite torso frame)
        BlendBodyPart(composite, textures, skinVariant, 3, appearance.SkinColor, torsoFrameX, torsoFrameY);

        if (hasBodyArmor)
        {
            // When body armor is equipped, Terraria's DrawPlayer_17_TorsoComposite skips
            // clothing AND hands composite — the armor texture replaces the entire torso area.
            var bodyTex = isFemale
                ? (Texture2D)textures.GetArmorFemale(armorBodySlot!.Value)
                : null;
            // Fall back to male body texture when female variant doesn't exist
            if (bodyTex == null || bodyTex == textures.DefaultTexture)
                bodyTex = (Texture2D)textures.GetArmorBody(armorBodySlot!.Value);
            BlendArmorPart(composite, textures, bodyTex, dyeBody);
        }
        else
        {
            // No body armor: draw clothing layers (undershirt, shirt, hands)
            // Drawn twice per Terraria's DrawPlayer_17_TorsoComposite:
            // first with compBackShoulderFrame (shoulder area), then compTorsoFrame (chest area)
            BlendBodyPart(composite, textures, skinVariant, 4, appearance.UnderShirtColor, shoulderFrameX, shoulderFrameY);
            BlendBodyPart(composite, textures, skinVariant, 6, appearance.ShirtColor, shoulderFrameX, shoulderFrameY);
            BlendBodyPart(composite, textures, skinVariant, 4, appearance.UnderShirtColor, torsoFrameX, torsoFrameY);
            BlendBodyPart(composite, textures, skinVariant, 6, appearance.ShirtColor, torsoFrameX, torsoFrameY);

            // Hands skin — only when no body armor (armor texture includes sleeve/hand areas)
            BlendBodyPart(composite, textures, skinVariant, 5, appearance.SkinColor, torsoFrameX, torsoFrameY);
        }

        // Torso accessories (over body armor)
        if (waistSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccWaist(waistSlot.Value));
        if (neckSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccNeck(neckSlot.Value));

        // Head and face (use traditional bodyFrame — not affected by composite system)
        BlendBodyPart(composite, textures, skinVariant, 0, appearance.SkinColor);
        BlendBodyPart(composite, textures, skinVariant, 1, null); // eye whites - no tint
        BlendBodyPart(composite, textures, skinVariant, 2, appearance.EyeColor);
        BlendBodyPart(composite, textures, skinVariant, 15, appearance.SkinColor); // eyelid

        // Hair — drawn when no helmet, or when helmet allows hair (DrawFullHair/DrawHatHair).
        // Full-coverage helmets (neither flag set) hide hair entirely.
        if (!armorHeadSlot.HasValue || showHairWithHelmet)
            BlendHair(composite, textures, appearance.Hair, appearance.HairColor);

        // Face accessories (over head, under helmet)
        if (faceSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccFace(faceSlot.Value));

        // Armor head overlay
        if (armorHeadSlot.HasValue)
            BlendArmorPart(composite, textures, (Texture2D)textures.GetArmorHead(armorHeadSlot.Value), dyeHead);

        // Shield (in front of body, before front arm)
        if (shieldSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccShield(shieldSlot.Value));

        // Front arm (use traditional frame 0 — arm frames are not gender-offset)
        BlendBodyPart(composite, textures, skinVariant, 9, appearance.SkinColor);

        // Front accessories (over front arm, frontmost layer)
        if (handOnSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccHandsOn(handOnSlot.Value));
        if (frontSlot.HasValue)
            BlendArmorPart(composite, textures, textures.GetAccFront(frontSlot.Value));

        // Scale up with nearest-neighbor
        int outW = FrameWidth * scale;
        int outH = FrameHeight * scale;
        var scaled = new int[outW * outH];

        for (int y = 0; y < outH; y++)
        {
            int srcY = y / scale;
            for (int x = 0; x < outW; x++)
            {
                scaled[y * outW + x] = composite[srcY * FrameWidth + x / scale];
            }
        }

        return new PreviewImage(outW,outH,scaled);
    }

    private static void BlendBodyPart(int[] composite, Textures textures, int skinVariant, int partIndex, TEditColor? tint, int frameX = 0, int frameY = 0)
    {
        var texture = textures.GetPlayerBody(skinVariant, partIndex);
        if (texture == null || texture == textures.DefaultTexture)
        {
            ErrorLogging.LogDebug($"PlayerPreview: Missing texture for variant {skinVariant} part {partIndex}");
            return;
        }
        BlendFrame(composite, texture, tint, frameX, frameY);
    }

    private static void BlendArmorPart(int[] composite, Textures textures, Texture2D texture, TEditColor? dyeTint = null)
    {
        if (texture == null || texture == textures.DefaultTexture) return;
        BlendFrame(composite, texture, dyeTint);
    }

    private static void BlendHair(int[] composite, Textures textures, int hairIndex, TEditColor tint)
    {
        var texture = textures.GetPlayerHair(hairIndex);
        if (texture == null || texture == textures.DefaultTexture) return;
        BlendFrame(composite, texture, tint);
    }

    /// <summary>
    /// Blends a single frame from a sprite sheet onto the composite buffer.
    /// </summary>
    /// <param name="composite">Target buffer (FrameWidth x FrameHeight, WPF BGRA format)</param>
    /// <param name="texture">Source sprite sheet texture</param>
    /// <param name="tint">Color tint to apply (null = white/no tint)</param>
    /// <param name="frameX">X pixel offset of the frame origin in the sprite sheet</param>
    /// <param name="frameY">Y pixel offset of the frame origin in the sprite sheet</param>
    private static void BlendFrame(int[] composite, Texture2D texture, TEditColor? tint, int frameX = 0, int frameY = 0)
    {
        int texW = texture.Width;
        int texH = texture.Height;
        if (texW <= 0 || texH <= 0) return;

        // Calculate usable frame size, clamped to texture bounds
        int frameW = Math.Min(texW - frameX, FrameWidth);
        int frameH = Math.Min(texH - frameY, FrameHeight);
        if (frameW <= 0 || frameH <= 0) return;

        var pixels = new int[texW * texH];
        try
        {
            texture.GetData(pixels);
        }
        catch (Exception ex)
        {
            ErrorLogging.LogWarn($"PlayerPreview: GetData failed for {texture.Width}x{texture.Height} texture: {ex.Message}");
            return;
        }

        byte tR = tint?.R ?? 255;
        byte tG = tint?.G ?? 255;
        byte tB = tint?.B ?? 255;

        for (int y = 0; y < frameH; y++)
        {
            for (int x = 0; x < frameW; x++)
            {
                // XNA pixel format: packed as 0xAABBGGRR (SurfaceFormat.Color, little-endian)
                int abgr = pixels[(frameY + y) * texW + (frameX + x)];
                int srcA = (abgr >> 24) & 0xFF;
                if (srcA == 0) continue;

                int srcB = (abgr >> 16) & 0xFF;
                int srcG = (abgr >> 8) & 0xFF;
                int srcR = abgr & 0xFF;

                // XNA textures are premultiplied alpha - undo premultiplication before tinting
                if (srcA < 255 && srcA > 0)
                {
                    srcR = Math.Min(255, srcR * 255 / srcA);
                    srcG = Math.Min(255, srcG * 255 / srcA);
                    srcB = Math.Min(255, srcB * 255 / srcA);
                }

                // Apply tint
                srcR = srcR * tR / 255;
                srcG = srcG * tG / 255;
                srcB = srcB * tB / 255;

                // Alpha-blend onto composite (WPF BGRA: 0xAARRGGBB)
                int dstPixel = composite[y * FrameWidth + x];
                int dstA = (dstPixel >> 24) & 0xFF;
                int dstR = (dstPixel >> 16) & 0xFF;
                int dstG = (dstPixel >> 8) & 0xFF;
                int dstB = dstPixel & 0xFF;

                int outA = srcA + dstA * (255 - srcA) / 255;
                int outR, outG, outB;
                if (outA == 0)
                {
                    outR = outG = outB = 0;
                }
                else
                {
                    outR = (srcR * srcA + dstR * dstA * (255 - srcA) / 255) / outA;
                    outG = (srcG * srcA + dstG * dstA * (255 - srcA) / 255) / outA;
                    outB = (srcB * srcA + dstB * dstA * (255 - srcA) / 255) / outA;
                }

                composite[y * FrameWidth + x] = (outA << 24) | (Math.Min(255, outR) << 16) | (Math.Min(255, outG) << 8) | Math.Min(255, outB);
            }
        }
    }
}