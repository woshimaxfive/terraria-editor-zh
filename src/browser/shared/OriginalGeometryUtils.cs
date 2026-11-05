namespace TEdit.Render;

public static class GeometryUtils
{
    public static TEdit.Geometry.RectangleInt32 Frame(
         this TEdit.Port.Rendering.Texture2D tex,
         int horizontalFrames = 1,
         int verticalFrames = 1,
         int frameX = 0,
         int frameY = 0,
         int sizeOffsetX = 0,
         int sizeOffsetY = 0)
    {
        int num1 = tex.Width / horizontalFrames;
        int num2 = tex.Height / verticalFrames;
        return new TEdit.Geometry.RectangleInt32(num1 * frameX, num2 * frameY, num1 + sizeOffsetX, num2 + sizeOffsetY);
    }
}
