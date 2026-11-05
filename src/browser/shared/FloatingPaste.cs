using System.Reflection;
using System.Text.Json;
using TEdit.Editor.Clipboard;
using TEdit.Editor.Tools;
using TEdit.Geometry;
using TEdit.Terraria;
namespace TEdit.Port {
 public sealed class BrowserClipboard(Session session){
  public bool InstantPaste {get;set;}
  public PasteOptions Options {get;set;}=new();
  public ClipboardBufferPreview? Buffer=>session.ClipboardBuffer is {} buffer?new(buffer):null;
  public static void ValidateSize(int width,int height){if(width<1||height<1||(long)width*height>Session.MaxClipboardCells)throw new ArgumentException("浮动模板超过20160000格容量");}
  public ClipboardBuffer TransformFloating(ClipboardBuffer buffer,string action)=>session.TransformFloatingBuffer(buffer,action);
  public ClipboardBuffer ResizeFloating(ClipboardBuffer buffer,int width,int height)=>session.ResizeFloatingBuffer(buffer,width,height);
  public void ReleaseFloatingIntermediate(ClipboardBuffer previous,ClipboardBuffer next)=>session.ReleaseFloatingIntermediate(previous,next);
  public void PasteBufferIntoWorld(World world,Vector2Int32 position,ClipboardBuffer buffer)=>session.PasteFloating(position,buffer,Options);
 }
 public sealed partial class Session {
  internal ClipboardBuffer? ClipboardBuffer=>clipboard;
  internal void PasteFloating(Vector2Int32 position,ClipboardBuffer buffer,PasteOptions options){var previous=clipboard;try{clipboard=buffer;PasteClipboard(position.X,position.Y,options);}finally{clipboard=previous;}}
  PasteTool Floating=>(PasteTool)Tools["Paste"];
  public object FloatingInfo()=>new{active=Floating.IsFloatingPaste,x=Floating.FloatingPasteAnchor.X,y=Floating.FloatingPasteAnchor.Y,width=Floating.FloatingPasteSize.X,height=Floating.FloatingPasteSize.Y,instant=vm!.Clipboard.InstantPaste};
  public bool ConfigureFloating(JsonElement input){RequireWorld();var before=Floating.FloatingPasteBuffer;try{return ConfigureFloatingCore(input);}finally{FinishFloatingMemory(before);}}
  bool ConfigureFloatingCore(JsonElement input){RequireWorld();if(replayPlayer!=null)throw new ArgumentException("请先将回放帧转为编辑起点");int before=UndoIndex;string operation=input.GetProperty("operation").GetString()??"";
   if(input.TryGetProperty("options",out var options))vm!.Clipboard.Options=JsonSerializer.Deserialize<PasteOptions>(options.GetRawText(),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new ArgumentException("粘贴选项无效");
   switch(operation){case "instant":vm!.Clipboard.InstantPaste=input.GetProperty("enabled").GetBoolean();break;case "accept":Floating.AcceptPaste();break;case "cancel":Floating.CancelPaste();break;case "anchor":int x=input.GetProperty("x").GetInt32(),y=input.GetProperty("y").GetInt32();if(Math.Abs((long)x)>100000||Math.Abs((long)y)>100000)throw new ArgumentException("浮动锚点无效");Floating.SetAnchor(x,y);break;case "resize":int width=input.GetProperty("width").GetInt32(),height=input.GetProperty("height").GetInt32();ValidateSize(width,height);Floating.ResizeFromUI(width,height);break;case "flipX":ClipboardSpriteMetadata.Build();Floating.FlipH();break;case "flipY":ClipboardSpriteMetadata.Build();Floating.FlipV();break;case "rotate":case "rotateCCW":if(Floating.FloatingPasteBuffer is {} buffer&&buffer.EnumerateStorageTiles().Any(t=>t.IsActive&&WorldConfiguration.GetTileProperties(t.Type).IsFramed)&&(!input.TryGetProperty("allowSpriteRemoval",out var allow)||!allow.GetBoolean()))throw new ArgumentException("原版旋转会移除家具，需要明确勾选允许");if(operation=="rotate")Floating.RotateCW();else Floating.RotateCCW();break;default:throw new ArgumentException("浮动粘贴操作无效");}return before!=UndoIndex;
  }
  static readonly string[] PasteFields=["_state","_floatingAnchor","_dragStartMouse","_dragStartAnchor","_resizeEdge","_resizeStartMouse","_resizeStartAnchor","_resizeStartSize"];
  FieldInfo PasteField(string name)=>typeof(PasteTool).GetField(name,BindingFlags.NonPublic|BindingFlags.Instance)!;
  byte[]? CaptureFloatingState(){var tool=Floating;if(!tool.IsFloatingPaste&&!vm!.Clipboard.InstantPaste)return null;byte[]? ExportBuffer(ClipboardBuffer? buffer){if(buffer==null)return null;var previous=clipboard;try{clipboard=buffer;return ExportClipboardState();}finally{clipboard=previous;}}
   return JsonSerializer.SerializeToUtf8Bytes(new{instant=vm!.Clipboard.InstantPaste,options=vm.Clipboard.Options,fields=PasteFields.ToDictionary(name=>name,name=>JsonSerializer.SerializeToElement(PasteField(name).GetValue(tool),PasteField(name).FieldType,InteractionJson)),buffer=ExportBuffer(tool.FloatingPasteBuffer),original=ExportBuffer((ClipboardBuffer?)PasteField("_originalBuffer").GetValue(tool))});
  }
  void RestoreFloatingState(byte[] bytes){using var doc=JsonDocument.Parse(bytes);var state=doc.RootElement;vm!.Clipboard.InstantPaste=state.GetProperty("instant").GetBoolean();vm.Clipboard.Options=state.GetProperty("options").Deserialize<PasteOptions>()!;var tool=Floating;
   foreach(var field in state.GetProperty("fields").EnumerateObject()){if(!PasteFields.Contains(field.Name))throw new InvalidDataException("浮动状态字段无效");var f=PasteField(field.Name);var value=JsonSerializer.Deserialize(field.Value.GetRawText(),f.FieldType,InteractionJson);if(f.FieldType.IsEnum&&!Enum.IsDefined(f.FieldType,value!))throw new InvalidDataException("浮动状态枚举无效");if(value is Vector2Int32 p&&(Math.Abs((long)p.X)>100000||Math.Abs((long)p.Y)>100000))throw new InvalidDataException("浮动状态坐标无效");f.SetValue(tool,value);}
   ClipboardBuffer? ImportBuffer(JsonElement value){if(value.ValueKind==JsonValueKind.Null)return null;var previous=clipboard;var identity=clipboardIdentity;int revision=ClipboardRevision;try{ImportFloatingClipboardState(value.GetBytesFromBase64());return clipboard;}finally{clipboard=previous;clipboardIdentity=identity;ClipboardRevision=revision;}}
   var original=ImportBuffer(state.GetProperty("original"));PasteField("_originalBuffer").SetValue(tool,original);StoreRestoredFloatingResize(original);var floating=ImportBuffer(state.GetProperty("buffer"));PasteField("_floatingBuffer").SetValue(tool,floating);PasteField("_floatingPreview").SetValue(tool,floating==null?null:new ClipboardBufferPreview(floating));if(tool.IsFloatingPaste&&floating==null)throw new InvalidDataException("浮动模板缺失");CompleteRestoredFloatingBuffers();
  }
 }
}
namespace TEdit.Editor.Clipboard {public sealed class ClipboardBufferPreview(ClipboardBuffer buffer){public ClipboardBuffer Buffer {get;}=buffer;}}
