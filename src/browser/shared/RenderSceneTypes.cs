namespace TEdit.Port.Rendering;
public sealed record SpriteCommand(string Texture,float X,float Y,float Width,float Height,int SourceX,int SourceY,int SourceWidth,int SourceHeight,uint Color,float Rotation,float OriginX,float OriginY,int Effects,float Depth);
public sealed record RenderPass(string Blend,string? Effect,SpriteCommand[] Sprites,string? Target=null,int Width=0,int Height=0);
public sealed record TextureUpload(string Key,int Width,int Height,byte[] Pixels);
public sealed record FilterRegion(float X,float Y,float Width,float Height);
public sealed record RenderScene(int Width,int Height,uint Clear,RenderPass[] Passes,string[] Missing,string[] Errors,TextureUpload[]? Dynamic=null,float ViewX=0,float ViewY=0,float Zoom=1,FilterRegion[]? Filter=null,float Darken=0,float Desaturate=0);
