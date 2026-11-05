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

 private void RenderViewportLayers(){
        // Start SpriteBatch (Immediate mode — draw order is final order)
        _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone);

        // Flush deferred UV cache resets before drawing textures
        // Cache invalidation is synchronous in the worker host.

        // Draw layers based on whether textures are visible
        if (_wvm.ShowTextures && _textureDictionary.Valid && AreTexturesVisible())
        {
            // Gradient background always shows when textures are visible (panning depth zones)
            DrawBackgroundGradient();

            // Tile-level backgrounds (includes surface background)
            DrawTileBackgrounds();
        }
        else
        {
            // When textures not visible: draw pixel tiles only (no background)
            DrawPixelTiles();
        }

        _spriteBatch.End();

        // Draw sprite overlays
        if (_wvm.ShowTextures && _textureDictionary.Valid && AreTexturesVisible())
        {
            if (_wvm.ShowWalls)
            {
                _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone);
                DrawTileWalls();
                _spriteBatch.End();

                _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone, _textureDictionary?.InvertEffect);
                DrawTileWalls(true);
                _spriteBatch.End();
            }

            if (_wvm.ShowTiles)
            {
                _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone);
                DrawTileTextures();
                _spriteBatch.End();

                _spriteBatch.Begin(SpriteSortMode.Immediate, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone, _textureDictionary?.InvertEffect);
                DrawTileTextures(true);
                _spriteBatch.End();

                if (_wvm.ShowGlowMasks)
                {
                    _spriteBatch.Begin(SpriteSortMode.Deferred, AdditiveGlowBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone);
                    DrawTileGlowMasks();
                    _spriteBatch.End();
                }
            }

            if ((_wvm.ShowTiles) ||
                (_wvm.ShowBlueWires || _wvm.ShowRedWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires) ||
                (_wvm.ShowLiquid))
            {

                _spriteBatch.Begin(SpriteSortMode.BackToFront, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.Default, RasterizerState.CullNone);

                if (_wvm.ShowBlueWires || _wvm.ShowRedWires || _wvm.ShowGreenWires || _wvm.ShowYellowWires)
                {
                    DrawTileWires();
                }

                if (_wvm.ShowLiquid)
                {
                    DrawTileLiquid();
                }
                // Draw Tile Entities

                if (_wvm.ShowTiles)
                {
                    DrawTileEntities();
                }

                _spriteBatch.End();
            }
        }


 }
}