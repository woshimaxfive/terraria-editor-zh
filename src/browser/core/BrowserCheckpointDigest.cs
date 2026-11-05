using System.Runtime.InteropServices.JavaScript;
using TEdit.Port;

internal sealed partial class BrowserCheckpointDigest : ICheckpointDigest {
 [JSImport("begin","checkpointHash")]private static partial int Begin();
 [JSImport("append","checkpointHash")]private static partial void Update(int token,byte[] bytes,int count);
 [JSImport("finish","checkpointHash")]private static partial byte[] Complete(int token);
 [JSImport("dispose","checkpointHash")]private static partial void Release(int token);
 int token=Begin();
 public void Append(byte[] bytes,int count){ObjectDisposedException.ThrowIf(token==0,this);Update(token,bytes,count);}
 public byte[] Finish(){ObjectDisposedException.ThrowIf(token==0,this);int value=token;token=0;return Complete(value);}
 public void Dispose(){if(token!=0){int value=token;token=0;Release(value);}}
}
