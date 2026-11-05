using System.Text.Json;
using TEdit.Editor.Plugins;
namespace TEdit.Port;

public sealed partial class Session {
 PlaybackMode replayMode;
 double replaySpeed=1;
 int replayDelay=250;
 ReplayPlayer RequireReplay()=>replayPlayer??throw new ArgumentException("请先打开 .terp 回放");
 public void ConfigureReplay(string mode,double rate){
  var player=RequireReplay();
  if(!Enum.TryParse<PlaybackMode>(mode,false,out var parsed)||!Enum.IsDefined(parsed)||!double.IsFinite(rate)||(parsed==PlaybackMode.Speed?(rate<0.1||rate>64):(rate<1||rate>60000||rate!=Math.Truncate(rate))))throw new ArgumentException("回放模式或速率无效；Speed 为0.1至64倍，Delay 为1至60000毫秒");
  replayMode=parsed;player.SetMode(parsed);
  if(parsed==PlaybackMode.Speed){replaySpeed=rate;player.SetSpeed(rate);}else{replayDelay=(int)rate;player.SetDelay((int)rate);}
  DomainResult=ReplayInfo();
 }
 public void PlayReplay(){RequireReplay().Play();DomainResult=ReplayInfo();}
 public void PauseReplay(){RequireReplay().Pause();DomainResult=ReplayInfo();}
 public void TickReplay(){RequireReplay().OnTick();DomainResult=ReplayInfo();}
 public void StepReplay(int direction){var player=RequireReplay();if(direction is not (-1 or 1))throw new ArgumentException("回放步进方向必须为-1或1");player.Pause();if(direction>0)player.StepForward();else player.StepBackward();DomainResult=ReplayInfo();}
 public void SeekReplayTime(double milliseconds){var player=RequireReplay();if(!double.IsFinite(milliseconds)||milliseconds<0||milliseconds>player.TotalTime)throw new ArgumentException("回放时间超出范围");player.SeekByTime(milliseconds);DomainResult=ReplayInfo();}
 void ResetReplayControls(){replayMode=PlaybackMode.Speed;replaySpeed=1;replayDelay=250;}
 void RestoreReplayControls(JsonElement state){
  if(!state.TryGetProperty("mode",out var mode))return; // Earlier schema9-12 capsules contain only index and file.
  ConfigureReplay(mode.GetString()!,mode.GetString()=="Delay"?state.GetProperty("delay").GetInt32():state.GetProperty("speed").GetDouble());
  replaySpeed=state.GetProperty("speed").GetDouble();replayDelay=state.GetProperty("delay").GetInt32();
  if(!double.IsFinite(replaySpeed)||replaySpeed<0.1||replaySpeed>64||replayDelay<1||replayDelay>60000)throw new InvalidDataException("回放速率恢复数据无效");
  RequireReplay().SetSpeed(replaySpeed);RequireReplay().SetDelay(replayDelay);
  double time=state.GetProperty("time").GetDouble();if(!double.IsFinite(time)||time<0||time>RequireReplay().TotalTime)throw new InvalidDataException("回放时钟恢复数据无效");
  // A delay-mode frame can have a different clock from a seek-by-time frame.
  typeof(ReplayPlayer).GetField("_playTime",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!.SetValue(RequireReplay(),time);
  if(state.GetProperty("playing").GetBoolean())RequireReplay().Play();
 }
}
