using System.Text.Json;
using TEdit.Terraria;
using TEdit.Editor.Clipboard;
namespace TEdit.Port;
public sealed partial class Session {
 internal OriginalObjectCommands ItemCommands {get;}=new();
 byte[]? CaptureAux(){byte[]? copied=null;if(ItemCommands.ItemClipboard is {} item){var previous=clipboard;var identity=clipboardIdentity;try{clipboard=new(new(2,2),true);var chest=new Chest(0,0);chest.Items[0]=item.Copy();clipboard.Chests.Add(chest);clipboardIdentity=ClipboardIdentity.FromWorld(World!);copied=ExportClipboardState();}finally{clipboard=previous;clipboardIdentity=identity;}}var recording=CaptureRecordingState();var spriteFrames=CaptureSpriteFrames();return copied==null&&recording==null&&spriteFrames==null?null:JsonSerializer.SerializeToUtf8Bytes(new{copied,recording,spriteFrames});}
 void RestoreAux(byte[] bytes){using var doc=JsonDocument.Parse(bytes);var state=doc.RootElement;if(state.TryGetProperty("spriteFrames",out var frames)&&frames.ValueKind!=JsonValueKind.Null)RestoreSpriteFrames(frames.GetBytesFromBase64());if(state.GetProperty("recording").ValueKind!=JsonValueKind.Null)RestoreRecordingState(state.GetProperty("recording").GetBytesFromBase64());if(state.GetProperty("copied").ValueKind!=JsonValueKind.Null){var previous=clipboard;var identity=clipboardIdentity;int revision=ClipboardRevision;try{ImportClipboardState(state.GetProperty("copied").GetBytesFromBase64());if(clipboard!.Chests.Count!=1)throw new InvalidDataException("复制物品记录无效");ItemCommands.ItemClipboard=clipboard.Chests[0].Items[0].Copy();}finally{clipboard=previous;clipboardIdentity=identity;ClipboardRevision=revision;}}}
}
