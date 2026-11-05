using TEdit.Geometry;
namespace TEdit.Port;
// Portable buffer for the frozen WPF compositor. The original receives GPU RGBA
// as straight Bgra32, then uses integer source-over and float nearest-neighbor.
public sealed class BackgroundBitmap(int width,int height) {
 public int PixelWidth {get;}=width;
 public int PixelHeight {get;}=height;
 public byte[] Bgra {get;}=new byte[checked(width*height*4)];
 public static BackgroundBitmap FromTexture(PreviewTexture texture){
  var result=new BackgroundBitmap(texture.Width,texture.Height);
  // Original WriteableBitmapEx.ColorToWindows uses (channel * alpha) >> 8,
  // including its one-level darkening at alpha=255. Preserve that exact rule.
  for(int i=0;i<result.Bgra.Length;i+=4){int a=texture.Rgba[i+3];result.Bgra[i]=(byte)((texture.Rgba[i+2]*a)>>8);result.Bgra[i+1]=(byte)((texture.Rgba[i+1]*a)>>8);result.Bgra[i+2]=(byte)((texture.Rgba[i]*a)>>8);result.Bgra[i+3]=(byte)a;}
  return result;
 }
 public static BackgroundBitmap Crop(BackgroundBitmap source,RectangleInt32 area){
  var result=new BackgroundBitmap(area.Width,area.Height);source.CopyPixels(area,result.Bgra,area.Width*4,0);return result;
 }
 public void CopyPixels(RectangleInt32 area,byte[] target,int stride,int offset){
  for(int y=0;y<area.Height;y++)Buffer.BlockCopy(Bgra,((area.Y+y)*PixelWidth+area.X)*4,target,offset+y*stride,area.Width*4);
 }
 public void WritePixels(RectangleInt32 area,byte[] source,int stride,int offset){
  for(int y=0;y<area.Height;y++)Buffer.BlockCopy(source,offset+y*stride,Bgra,((area.Y+y)*PixelWidth+area.X)*4,area.Width*4);
 }
 public BackgroundBitmap Resize(int width,int height){
  var result=new BackgroundBitmap(width,height);float xs=(float)PixelWidth/width,ys=(float)PixelHeight/height;
  for(int y=0;y<height;y++)for(int x=0;x<width;x++)Buffer.BlockCopy(Bgra,((int)(y*ys)*PixelWidth+(int)(x*xs))*4,result.Bgra,(y*width+x)*4,4);
  return result;
 }
 public byte[] PremultipliedRgba(){
  var rgba=new byte[Bgra.Length];for(int i=0;i<rgba.Length;i+=4){int a=Bgra[i+3];rgba[i]=(byte)((Bgra[i+2]*a+127)/255);rgba[i+1]=(byte)((Bgra[i+1]*a+127)/255);rgba[i+2]=(byte)((Bgra[i]*a+127)/255);rgba[i+3]=(byte)a;}return rgba;
 }
}
