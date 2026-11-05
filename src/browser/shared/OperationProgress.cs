namespace TEdit.Port;
public static class OperationProgress {
 static Action<double>? notify;
 static long count,last;
 public static void Begin(Action<double> callback){notify=callback;count=0;last=Environment.TickCount64;}
 public static void Advance(long cells=1){count+=cells;if(notify!=null&&Environment.TickCount64-last>=150){last=Environment.TickCount64;notify(count);}}
 public static void End(){notify=null;}
}
