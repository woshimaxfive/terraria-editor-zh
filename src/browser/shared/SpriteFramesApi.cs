using System.Collections.ObjectModel;
using ReactiveUI;
using ReactiveUI.SourceGenerators;
using TEdit.Geometry;
using TEdit.Terraria;
using TEdit.Terraria.Objects;
namespace TEdit.Port;
public partial class EditableFrame : ReactiveObject
{
    [Reactive] private string _name = "Default";
    [Reactive] private string? _variety;
    [Reactive] private short _uvX;
    [Reactive] private short _uvY;
    [Reactive] private short _sizeX = 1;
    [Reactive] private short _sizeY = 1;
    [Reactive] private FrameAnchor _anchor = FrameAnchor.None;
    [Reactive] private bool _isSelected;

    /// <summary>Pixel X position on texture.</summary>
    public int PixelX { get; set; }
    /// <summary>Pixel Y position on texture.</summary>
    public int PixelY { get; set; }
    /// <summary>Pixel width on texture.</summary>
    public int PixelWidth { get; set; }
    /// <summary>Pixel height on texture.</summary>
    public int PixelHeight { get; set; }

    public static EditableFrame FromFrameProperty(FrameProperty fp, Vector2Short textureGrid, Vector2Short frameGap, Vector2Short defaultSize)
    {
        var size = (fp.Size.X > 0 && fp.Size.Y > 0) ? fp.Size : defaultSize;
        var ef = new EditableFrame
        {
            Name = fp.Name,
            Variety = fp.Variety,
            UvX = fp.UV.X,
            UvY = fp.UV.Y,
            SizeX = size.X,
            SizeY = size.Y,
            Anchor = fp.Anchor,
        };

        // Calculate pixel position from UV and grid
        ef.PixelX = fp.UV.X;
        ef.PixelY = fp.UV.Y;
        ef.PixelWidth = size.X * textureGrid.X + (size.X - 1) * frameGap.X;
        ef.PixelHeight = size.Y * textureGrid.Y + (size.Y - 1) * frameGap.Y;

        return ef;
    }

    public FrameProperty ToFrameProperty() => new()
    {
        Name = Name,
        Variety = Variety,
        UV = new Vector2Short(UvX, UvY),
        Size = new Vector2Short(SizeX, SizeY),
        Anchor = Anchor,
    };
}


public sealed class OriginalSpriteFrames {
 public ObservableCollection<EditableFrame> Frames {get;}=new();
 public EditableFrame? SelectedFrame {get;set;}
 public string StatusText {get;set;}="";
    public void AddFrameFromSelection(short uvX, short uvY, short sizeX, short sizeY, int pixelW, int pixelH)
    {
        var frame = new EditableFrame
        {
            Name = $"Frame {Frames.Count}",
            UvX = uvX,
            UvY = uvY,
            SizeX = sizeX,
            SizeY = sizeY,
            PixelX = uvX,
            PixelY = uvY,
            PixelWidth = pixelW,
            PixelHeight = pixelH,
        };
        Frames.Add(frame);
        SelectedFrame = frame;
        StatusText = $"Added selection frame at ({uvX},{uvY}) {sizeX}x{sizeY} ({Frames.Count} total)";
    }

}
public sealed class SpriteFramesApi(Session session){
 static object Describe(EditableFrame f)=>new{f.Name,f.Variety,f.UvX,f.UvY,f.SizeX,f.SizeY,anchor=f.Anchor.ToString(),f.PixelX,f.PixelY,f.PixelWidth,f.PixelHeight};
 public object GetFrames(int tile)=>session.SpriteFrameSheet(tile).Frames.Select(Describe).ToArray();
 public object AddSelection(int tile,int gridX,int gridY,int gapX,int gapY,int startCol,int startRow,int endCol,int endRow){
  // Validate the platform boundary before executing the original event/math.
  if(gridX<1||gridY<1||gridX>256||gridY>256||gapX<0||gapY<0||gapX>64||gapY>64||new[]{startCol,startRow,endCol,endRow}.Any(n=>n<0||n>32767)||((long)Math.Max(startCol,endCol)+1)*(gridX+gapX)>32767||((long)Math.Max(startRow,endRow)+1)*(gridY+gapY)>32767)throw new ArgumentException("图格选择超出帧坐标范围");
  var sheet=session.SpriteFrameSheet(tile);if(sheet.Frames.Count>=4096)throw new ArgumentException("一个图格最多4096帧");
        int minCol = Math.Min(startCol, endCol);
        int maxCol = Math.Max(startCol, endCol);
        int minRow = Math.Min(startRow, endRow);
        int maxRow = Math.Max(startRow, endRow);

        int intervalX = gridX + gapX;
        int intervalY = gridY + gapY;

        int numCols = maxCol - minCol + 1;
        int numRows = maxRow - minRow + 1;

        short uvX = (short)(minCol * intervalX);
        short uvY = (short)(minRow * intervalY);
        short sizeX = (short)numCols;
        short sizeY = (short)numRows;
        int pixelW = numCols * gridX + (numCols - 1) * gapX;
        int pixelH = numRows * gridY + (numRows - 1) * gapY;

        sheet.AddFrameFromSelection(uvX, uvY, sizeX, sizeY, pixelW, pixelH);


  return Describe(sheet.SelectedFrame!);
 }
}
public sealed partial class Session {
 readonly Dictionary<int,OriginalSpriteFrames> spriteFrameSheets=new();
 internal OriginalSpriteFrames SpriteFrameSheet(int tile){
  if(tile<0||tile>=WorldConfiguration.TileProperties.Count)throw new ArgumentException("图格ID无效");
  if(spriteFrameSheets.TryGetValue(tile,out var found))return found;
  if(spriteFrameSheets.Count>=256)throw new ArgumentException("当前最多编辑256种图格帧");
  var p=WorldConfiguration.TileProperties[tile];var sheet=new OriginalSpriteFrames();var size=p.FrameSize?.FirstOrDefault()??new Vector2Short(1,1);
  if(p.Frames!=null)foreach(var frame in p.Frames)sheet.Frames.Add(EditableFrame.FromFrameProperty(frame,p.TextureGrid,p.FrameGap,size));
  spriteFrameSheets.Add(tile,sheet);return sheet;
 }
 byte[]? CaptureSpriteFrames(){if(spriteFrameSheets.Count==0)return null;var bytes=System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(spriteFrameSheets.ToDictionary(p=>p.Key,p=>p.Value.Frames.Select(f=>new{f.Name,f.Variety,f.UvX,f.UvY,f.SizeX,f.SizeY,anchor=(int)f.Anchor,f.PixelX,f.PixelY,f.PixelWidth,f.PixelHeight}).ToArray()));if(bytes.Length>4*1024*1024)throw new InvalidOperationException("图格帧恢复记录超过4MiB预算");return bytes;}
 void RestoreSpriteFrames(byte[] bytes){
  if(bytes.Length>4*1024*1024)throw new InvalidDataException("图格帧恢复数据过大");
  using var doc=System.Text.Json.JsonDocument.Parse(bytes);var parsed=new Dictionary<int,OriginalSpriteFrames>();
  foreach(var p in doc.RootElement.EnumerateObject()){
   if(!int.TryParse(p.Name,out int tile)||tile<0||tile>=WorldConfiguration.TileProperties.Count||parsed.Count>=256||p.Value.GetArrayLength()>4096)throw new InvalidDataException("图格帧恢复范围无效");
   var sheet=new OriginalSpriteFrames();foreach(var frame in p.Value.EnumerateArray()){
    var f=System.Text.Json.JsonSerializer.Deserialize<EditableFrame>(frame.GetRawText())!;int anchor=frame.GetProperty("anchor").GetInt32();
    if(f.Name.Length>16000||f.Variety?.Length>16000||f.UvX<0||f.UvY<0||f.SizeX<1||f.SizeY<1||f.PixelX<0||f.PixelY<0||f.PixelWidth<0||f.PixelHeight<0||f.PixelWidth>32767||f.PixelHeight>32767||!Enum.IsDefined(typeof(FrameAnchor),anchor))throw new InvalidDataException("图格帧内容无效");
    f.Anchor=(FrameAnchor)anchor;sheet.Frames.Add(f);
   }
   sheet.SelectedFrame=sheet.Frames.LastOrDefault();parsed.Add(tile,sheet);
  }
  spriteFrameSheets.Clear();foreach(var p in parsed)spriteFrameSheets.Add(p.Key,p.Value);
 }
}
