using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TEdit.ViewModel;

namespace TEdit.Editor.Plugins;

public class ReplayRecorder
{
    readonly WorldViewModel host;
    public ReplayRecorder(WorldViewModel host)=>this.host=host;
    private DateTime _startTime;
    readonly Dictionary<string,string> seen=new();
    public void MarkExisting(){seen.Clear();string dir=Path.GetDirectoryName(host.UndoManager.GetUndoFileName())!;foreach(string path in Directory.GetFiles(dir,"undo_temp_*").Where(path=>int.TryParse(Path.GetFileName(path).Replace("undo_temp_",""),out int index)&&index<host.UndoManager.CurrentIndex))seen[path]=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(path)));}
    public void ForgetFrom(int index){foreach(string path in seen.Keys.ToArray())if(int.TryParse(Path.GetFileName(path).Replace("undo_temp_",""),out int i)&&i>=index)seen.Remove(path);}
    private DateTime _lastTime;

    public ReplayFile Recording { get; private set; }
    public bool IsRecording { get; private set; }

    public void Start()
    {
        _startTime = DateTime.UtcNow;
        _lastTime = DateTime.UtcNow;
        IsRecording = true;

        Recording = new ReplayFile { StartTime = _startTime };
        MarkExisting();
    }

    public void Poll()
    {
        if (!IsRecording) return;

        string undoDir = Path.GetDirectoryName(
            host.UndoManager.GetUndoFileName());

        var pending = new List<(string Path, DateTime WriteTime)>();
        foreach (string file in Directory.GetFiles(undoDir, "undo_temp_*"))
        {
            if(!int.TryParse(Path.GetFileName(file).Replace("undo_temp_",""),out int index)||index>=host.UndoManager.CurrentIndex)continue;
            DateTime writeTime = File.GetLastWriteTimeUtc(file);
            string hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(file)));
            if(!seen.TryGetValue(file,out string? previous)||previous!=hash)pending.Add((file,writeTime));
        }

        pending.Sort((a,b)=>int.Parse(Path.GetFileName(a.Path).Replace("undo_temp_","")).CompareTo(int.Parse(Path.GetFileName(b.Path).Replace("undo_temp_",""))));
        foreach (var (path, writeTime) in pending)
        {
            byte[] data;
            try { data = File.ReadAllBytes(path); }
            catch (IOException) { break; }

            _lastTime = writeTime;
            seen[path]=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(data));
            Recording.Frames.Add(new ReplayFrame
            {
                Index = Recording.Frames.Count,
                Time = Math.Max(Recording.Frames.LastOrDefault()?.Time??0,Math.Max(0,(long)(writeTime - _startTime).TotalMilliseconds)),
                Data = data,
            });
        }
    }

    public void Stop()
    {
        IsRecording = false;
        Recording.TotalTime = Math.Max(Recording.Frames.LastOrDefault()?.Time??0,(long)(DateTime.UtcNow - _startTime).TotalMilliseconds);
        Recording.BaselineWorld = host.CurrentWorld;
    }
}
