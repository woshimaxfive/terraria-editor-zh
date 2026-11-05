using TEdit.Terraria;
using TEdit.ViewModel;

namespace TEdit.Port;

public sealed partial class Session
{
 // Only the host's checkpoint-protected replacement sequence calls this boundary.
 public void ReleaseClipboardForReplacement()
 {
  if(vm!=null&&Floating.IsFloatingPaste)throw new InvalidOperationException("请先确认或取消当前浮动粘贴");
  clipboard=null;clipboardIdentity=null;
  GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
 }

 public static byte[] TransformClipboardIsolated(byte[] bytes,string operation,bool allowSpriteRemoval)
 {
  var context=new Session{ThrowOnError=true};
  try{
   // The original transform needs source property tables, not the edited world.
   var world=new World(1,1,"Template"){Tiles=new Tile[1,1],Version=WorldConfiguration.CompatibleVersion};
   context.vm=new WorldViewModel(world);context.vm.Clipboard=new(context);
   context.ImportClipboardState(bytes);
   context.TransformClipboard(operation,allowSpriteRemoval);
   return context.ExportClipboardState();
  }finally{context.CloseSession();}
 }
}
