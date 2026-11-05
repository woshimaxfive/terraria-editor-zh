using TEdit.Editor.Undo;
namespace TEdit.Port;
public sealed partial class Session {
 public async Task ValidateRecoveryCapacityAsync(){
  if(vm==null)return;
  var state=vm.UndoManager.CapturePersistentFiles();
  long bytes=state.Records.Values.Sum(path=>new FileInfo(path).Length);
  if(state.Records.Count>=9000||bytes>=MaxCheckpointExpandedBytes/2){
   using var checkpoint=await CaptureCheckpointFileAsync();
  }
 }
}
// Limit encoded output as it is written; large images retain the original
// strip/chunk algorithms without allocating a full pixel array.
public sealed class ExportBudgetStream(Stream inner):Stream {
 const long Limit=256L*1024*1024;
 public override bool CanRead=>inner.CanRead;
 public override bool CanSeek=>inner.CanSeek;
 public override bool CanWrite=>inner.CanWrite;
 public override long Length=>inner.Length;
 public override long Position{get=>inner.Position;set{Check(value);inner.Position=value;}}
 static void Check(long length){if(length<0||length>Limit)throw new IOException("编码后的图片或图块包超过256MiB；请分区导出，世界和历史保留");}
 public override void Flush()=>inner.Flush();
 public override int Read(byte[] buffer,int offset,int count)=>inner.Read(buffer,offset,count);
 public override long Seek(long offset,SeekOrigin origin){long target=origin switch{SeekOrigin.Begin=>offset,SeekOrigin.Current=>Position+offset,_=>Length+offset};Check(target);return inner.Seek(offset,origin);}
 public override void SetLength(long value){Check(value);inner.SetLength(value);}
 public override void Write(byte[] buffer,int offset,int count){Check(Position+count);inner.Write(buffer,offset,count);}
 public override void Write(ReadOnlySpan<byte> buffer){Check(Position+buffer.Length);inner.Write(buffer);}
 protected override void Dispose(bool disposing){if(disposing)inner.Dispose();base.Dispose(disposing);}
}
