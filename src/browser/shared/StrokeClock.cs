namespace TEdit.Port;
// Input time was measured on the UI thread. Replay it without sleeping in the Worker.
// Only the original spray Stopwatch is adapted; interpolation and random sampling stay original.
public sealed class StrokeClock {
 public static long Now {get;set;}
 long started,elapsed;
 bool running;
 public long ElapsedMilliseconds=>running?Now-started:elapsed;
 public void Restart(){started=Now;elapsed=0;running=true;}
 public void Stop(){elapsed=ElapsedMilliseconds;running=false;}
}
