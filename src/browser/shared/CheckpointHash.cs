using System.Security.Cryptography;

namespace TEdit.Port;

// Platform boundary: desktop IncrementalHash streams; the browser implementation
// must not use the framework provider that accumulates the whole input.
public interface ICheckpointDigest : IDisposable {
 void Append(byte[] bytes,int count);
 byte[] Finish();
}

public static class CheckpointHash {
 public static Func<ICheckpointDigest> Factory {private get;set;}=()=>new FrameworkDigest();
 public static ICheckpointDigest Create()=>Factory();
 public static byte[] HashBytes(byte[] input){using var stream=new MemoryStream(input,false);return HashStream(stream);}
 public static byte[] HashStream(Stream input){
  using var hash=Create();var chunk=new byte[65536];int count;
  while((count=input.Read(chunk))>0){hash.Append(chunk,count);OperationProgress.Advance(count);}
  return hash.Finish();
 }
 sealed class FrameworkDigest : ICheckpointDigest {
  readonly IncrementalHash hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
  public void Append(byte[] bytes,int count)=>hash.AppendData(bytes,0,count);
  public byte[] Finish()=>hash.GetHashAndReset();
  public void Dispose()=>hash.Dispose();
 }
}
