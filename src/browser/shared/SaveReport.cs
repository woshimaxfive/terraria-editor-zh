using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Encodings.Web;
using TEdit.Common.IO;

namespace TEdit.Port;

public sealed record FileFingerprint(int Bytes,string Sha256);
public sealed record TagChange(string Path,string Kind,string? Before,string? After);
public sealed record TagComparison(int Removed,int Added,int Changed,TagChange[] Details,bool DetailsTruncated);
public sealed record SaveBaseline(int Schema,string SourceCommit,FileFingerprint OriginalWorld,FileFingerprint CanonicalWorld,FileFingerprint? OriginalSidecar,FileFingerprint? CanonicalSidecar,TagComparison NormalizationTags,Dictionary<string,string> CanonicalTags);
public static class SaveReports {
 public static readonly JsonSerializerOptions Json=new(){WriteIndented=true,Encoder=JavaScriptEncoder.UnsafeRelaxedJsonEscaping};
 public static FileFingerprint Fingerprint(byte[] bytes)=>new(bytes.Length,Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
 public static Dictionary<string,string> Tags(byte[]? bytes){
  var result=new Dictionary<string,string>(StringComparer.Ordinal);if(bytes==null)return result;
  using var stream=new MemoryStream(bytes);var root=TagIO.FromStream(stream);
  void Walk(TagCompound tag,string path,int depth){
   if(depth>64)throw new InvalidDataException("NBT报告嵌套超过64层；原始配套仍保留");
   foreach(var pair in tag.OrderBy(item=>item.Key,StringComparer.Ordinal)){
    if(result.Count>=100000)throw new InvalidDataException("NBT报告超过100000个字段预算；原始配套仍保留");
    string next=path+"/"+pair.Key.Replace("~","~0").Replace("/","~1");
    if(pair.Value is TagCompound child&&child.Count>0)Walk(child,next,depth+1);
    else{using var output=new MemoryStream();TagIO.ToStream(new TagCompound{["value"]=Canonical(pair.Value)},output,compressed:false);result.Add(next,Fingerprint(output.ToArray()).Sha256);}
   }
  }
  Walk(root,"",0);return result;
 }
 static object Canonical(object value){
  if(value is TagCompound compound){var result=new TagCompound();foreach(var pair in compound.OrderBy(item=>item.Key,StringComparer.Ordinal))result[pair.Key]=Canonical(pair.Value);return result;}
  if(value is System.Collections.IList list&&value is not Array){var result=(System.Collections.IList)Activator.CreateInstance(value.GetType())!;foreach(var item in list)result.Add(Canonical(item!));return result;}
  return value;
 }
 public static TagComparison Compare(Dictionary<string,string> before,Dictionary<string,string> after){
  int removed=0,added=0,changed=0;var details=new List<TagChange>();
  foreach(var key in before.Keys.Concat(after.Keys).Distinct(StringComparer.Ordinal).OrderBy(key=>key,StringComparer.Ordinal)){
   before.TryGetValue(key,out var a);after.TryGetValue(key,out var b);if(a==b)continue;
   string kind=a==null?"新增":b==null?"移除":"值变化";if(a==null)added++;else if(b==null)removed++;else changed++;
   if(details.Count<200)details.Add(new(key,kind,a,b));
  }
  return new(removed,added,changed,details.ToArray(),removed+added+changed>details.Count);
 }
 public static SaveBaseline Baseline(WorldFileData raw,WorldFileData canonical){var tags=Tags(canonical.Sidecar);return new(1,Session.SourceCommit,Fingerprint(raw.World),Fingerprint(canonical.World),raw.Sidecar==null?null:Fingerprint(raw.Sidecar),canonical.Sidecar==null?null:Fingerprint(canonical.Sidecar),Compare(Tags(raw.Sidecar),tags),tags);}
}

public sealed partial class Session {
 public bool ThrowOnError {get;set;}
 SaveBaseline? saveBaseline;
 public async Task PrepareSaveBaselineAsync(WorldFileData raw){saveBaseline=SaveReports.Baseline(raw,await ExportFilesAsync());}
 public string SaveReport(WorldFileData saved,int revision){
  if(saveBaseline==null)throw new InvalidOperationException("此旧恢复包没有保存变化基线，请重新打开原始文件；原始副本仍可下载");
  var world=SaveReports.Fingerprint(saved.World);var sidecar=saved.Sidecar==null?null:SaveReports.Fingerprint(saved.Sidecar);
  return JsonSerializer.Serialize(new{
   schema=1,sourceCommit=SourceCommit,worldTitle=World!.Title,version=World.Version,revision,
   explanation=new[]{"原始输入→原版首次保存：显示原版读写自身带来的规范化。","原版首次保存→当前导出：显示本次会话的保存结果差异；revision记录操作次数，不等于字段变化数量。","世界.wld仅核对字节长度和SHA256。字节变化不能证明全部语义相同或损坏；坡形、背景及其他原版规范化尚不能全部逐字段定位。","配套.twld由原版TagIO解压比较；忽略压缩包装和Compound键顺序，按路径比较值。列表、数组作为完整值比较，最多展示200条，计数覆盖全部已比较字段。","移除或变化可能由原版重建区段造成，不保证未知或未来模组格式无损。请保留原始副本，并在游戏中验证编辑副本。"},
   originalToCanonical=new{worldChanged=saveBaseline.OriginalWorld!=saveBaseline.CanonicalWorld,sidecarBytesChanged=saveBaseline.OriginalSidecar!=saveBaseline.CanonicalSidecar,originalWorld=saveBaseline.OriginalWorld,canonicalWorld=saveBaseline.CanonicalWorld,originalSidecar=saveBaseline.OriginalSidecar,canonicalSidecar=saveBaseline.CanonicalSidecar,tags=saveBaseline.NormalizationTags},
   canonicalToCurrent=new{worldChanged=saveBaseline.CanonicalWorld!=world,sidecarBytesChanged=saveBaseline.CanonicalSidecar!=sidecar,world,sidecar,tags=SaveReports.Compare(saveBaseline.CanonicalTags,SaveReports.Tags(saved.Sidecar))}
  },SaveReports.Json);
 }
}
