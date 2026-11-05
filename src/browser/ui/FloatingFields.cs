using System.Windows.Input;
using System.Text.Json;
namespace TEditBrowser;
public sealed partial class EditorViewModel {
 int lastFloatingWidth,lastFloatingHeight;
 void ApplyFloatingInfo(JsonElement info){
  if(info.TryGetProperty("floatingPaste",out var floating)&&floating.ValueKind==JsonValueKind.Object&&floating.GetProperty("active").GetBoolean()){
   int width=floating.GetProperty("width").GetInt32(),height=floating.GetProperty("height").GetInt32();
   if(width!=lastFloatingWidth||height!=lastFloatingHeight){FloatingWidth=width;FloatingHeight=height;lastFloatingWidth=width;lastFloatingHeight=height;}
  }else{lastFloatingWidth=0;lastFloatingHeight=0;}
 }

 public int FloatingWidth {get;set;}=16;
 public int FloatingHeight {get;set;}=16;
 public ICommand FloatingAcceptCommand=>new UiCommand(()=>_=Run("floating",new{operation="accept"}));
 public ICommand FloatingCancelCommand=>new UiCommand(()=>_=Run("floating",new{operation="cancel"}));
 public ICommand FloatingAnchorCommand=>new UiCommand(()=>_=Run("floating",new{operation="anchor",x=PasteX,y=PasteY}));
 public ICommand FloatingResizeCommand=>new UiCommand(()=>_=Run("floating",new{operation="resize",width=FloatingWidth,height=FloatingHeight}));
 public ICommand FloatingRotateCommand=>new UiCommand(()=>_=Run("floating",new{operation="rotate",allowSpriteRemoval=AllowSpriteRemoval}));
 public ICommand FloatingFlipXCommand=>new UiCommand(()=>_=Run("floating",new{operation="flipX"}));
 public ICommand FloatingFlipYCommand=>new UiCommand(()=>_=Run("floating",new{operation="flipY"}));
}
