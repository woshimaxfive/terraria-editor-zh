using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed record PreviewImage(int Width,int Height,int[] Bgra){
 public byte[] Rgba(){var pixels=new byte[Bgra.Length*4];for(int i=0;i<Bgra.Length;i++){uint c=(uint)Bgra[i];uint a=c>>24;pixels[i*4]=(byte)(((c>>16)&255)*a/255);pixels[i*4+1]=(byte)(((c>>8)&255)*a/255);pixels[i*4+2]=(byte)((c&255)*a/255);pixels[i*4+3]=(byte)a;}return pixels;}
}
public sealed record PreviewTexture(int Width,int Height,byte[] Rgba){public void GetData(int[] pixels){if(pixels.Length!=Width*Height)throw new ArgumentException("纹理尺寸不匹配");Buffer.BlockCopy(Rgba,0,pixels,0,Rgba.Length);}}
public sealed partial class PreviewTextures(Textures source,IReadOnlyDictionary<string,PreviewTexture> pixels){
 public PreviewTexture DefaultTexture {get;}=new(1,1,new byte[4]);
 public bool Valid=>source.Valid;
 public HashSet<string> PixelRequests {get;}=new(StringComparer.OrdinalIgnoreCase);
 public PreviewTexture GetBackground(int id)=>Wrap(source.GetBackground(id));
 public PreviewTexture GetTreeTops(int id)=>Wrap(source.GetTreeTops(id));
 public PreviewTexture GetUnderworld(int id)=>Wrap(source.GetUnderworld(id));
 PreviewTexture Wrap(Texture2D texture){if(texture==source.DefaultTexture)return DefaultTexture;if(pixels.TryGetValue(texture.Key,out var data))return data;PixelRequests.Add(texture.Key);return DefaultTexture;}
}
