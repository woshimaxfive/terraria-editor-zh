using System.IO.Compression;
using System.Text;
using System.Text.Json;
using TEdit.Common.IO;
using TEdit.Editor.Clipboard;
using TEdit.Terraria;
using TEdit.Terraria.TModLoader;

namespace TEdit.Port {
public sealed record ClipboardDefinition(ushort Id,string Name,bool? Framed=null);
public sealed record ClipboardIdentity(int Schema,uint Version,ClipboardDefinition[] Tiles,ClipboardDefinition[] Walls) {
 public static ClipboardIdentity FromWorld(World world)=>new(1,world.Version,
  world.TwldData?.MapIndexToVirtualTileId.Select(pair=>new ClipboardDefinition(pair.Value,world.TwldData.TileMap[pair.Key].FullName,world.TwldData.TileMap[pair.Key].FrameImportant)).ToArray()??[],
  world.TwldData?.MapIndexToVirtualWallId.Select(pair=>new ClipboardDefinition(pair.Value,world.TwldData.WallMap[pair.Key].FullName)).ToArray()??[]);
 // Observe metadata with the original NBT reader; the original Load consumes it next.
 public static ClipboardIdentity Capture(BinaryReader reader,uint version){
  long position=reader.BaseStream.Position;
  try{
   if(reader.BaseStream.Length-position<8||!reader.ReadBytes(4).SequenceEqual(new byte[]{84,78,66,84}))return new(1,version,[],[]);
   int payloadVersion=reader.ReadInt32();if(payloadVersion<3)return new(1,version,[],[]);
   var tag=TagIO.FromStream(reader.BaseStream,compressed:false);
   ClipboardDefinition[] Read(string key)=>tag.GetCompound(key).Select(pair=>new ClipboardDefinition(ushort.Parse(pair.Key,System.Globalization.CultureInfo.InvariantCulture),pair.Value as string??throw new InvalidDataException("模板名称表无效"))).ToArray();
   return new(1,version,Read("tileIdMap"),Read("wallIdMap"));
  }finally{reader.BaseStream.Position=position;}
 }
 public ClipboardIdentity ResolveFrames(TwldData? target)=>this with{Tiles=Tiles.Select(definition=>definition.Framed.HasValue?definition:definition with{Framed=target?.TileMap.FirstOrDefault(entry=>entry.FullName==definition.Name)?.FrameImportant}).ToArray()};
 public void Validate(){
  if(Schema!=1||Version<1||Version>WorldConfiguration.CompatibleVersion||Tiles==null||Walls==null||Tiles.Length>ushort.MaxValue||Walls.Length>ushort.MaxValue)throw new InvalidDataException("剪贴板身份清单无效");
  foreach(var definitions in new[]{Tiles,Walls})if(definitions.Any(item=>item==null||string.IsNullOrWhiteSpace(item.Name)||item.Name.Length>1024||!item.Name.Contains(':'))||definitions.Select(item=>item.Id).Distinct().Count()!=definitions.Length||definitions.Select(item=>item.Name).Distinct(StringComparer.Ordinal).Count()!=definitions.Length)throw new InvalidDataException("剪贴板名称或ID表无效");
  if(Tiles.Any(item=>item.Id<WorldConfiguration.TileCount)||Walls.Any(item=>item.Id<WorldConfiguration.WallCount))throw new InvalidDataException("剪贴板模组ID落入原版范围");
 }
 public TwldData? AsModData(){
  if(Tiles.Length+Walls.Length==0)return null;var result=new TwldData();
  foreach(var item in Tiles){int split=item.Name.IndexOf(':');int index=result.TileMap.Count;result.TileMap.Add(new ModTileEntry{ModName=item.Name[..split],Name=item.Name[(split+1)..],FrameImportant=item.Framed??false});result.MapIndexToVirtualTileId.Add(index,item.Id);result.VirtualTileIdToMapIndex.Add(item.Id,index);}
  foreach(var item in Walls){int split=item.Name.IndexOf(':');int index=result.WallMap.Count;result.WallMap.Add(new ModWallEntry{ModName=item.Name[..split],Name=item.Name[(split+1)..]});result.MapIndexToVirtualWallId.Add(index,item.Id);result.VirtualWallIdToMapIndex.Add(item.Id,index);}
  return result;
 }
 public bool SameNames(ClipboardIdentity other)=>Tiles.OrderBy(item=>item.Id).Select(item=>(item.Id,item.Name)).SequenceEqual(other.Tiles.OrderBy(item=>item.Id).Select(item=>(item.Id,item.Name)))&&Walls.OrderBy(item=>item.Id).Select(item=>(item.Id,item.Name)).SequenceEqual(other.Walls.OrderBy(item=>item.Id).Select(item=>(item.Id,item.Name)));
}
public sealed partial class Session {
 ClipboardIdentity? clipboardIdentity;
 public int ClipboardRevision {get;private set;}
 const int MaxClipboardStateBytes=MaxTemplateBytes+4*1024*1024;
 public byte[] ExportClipboardState(){
  if(clipboard==null)return [];if(TryStoredFloatingState(clipboard,out var archivedState))return archivedState;var identity=clipboardIdentity!;identity.Validate();
  var template=SaveTemplate(identity.Version);var metadata=JsonSerializer.SerializeToUtf8Bytes(identity,new JsonSerializerOptions{Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping});
  if(metadata.Length>4*1024*1024)throw new InvalidDataException("剪贴板身份清单超过预算");
  using var output=new MemoryStream();using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true)){
   void Write(string name,byte[] data){var entry=zip.CreateEntry(name,CompressionLevel.NoCompression);entry.LastWriteTime=new DateTimeOffset(1980,1,1,0,0,0,TimeSpan.Zero);using var stream=entry.Open();stream.Write(data);}
   Write("template.TEditSch",template);Write("identity.json",metadata);
  }var result=output.ToArray();if(result.Length>MaxClipboardStateBytes)throw new InvalidDataException("剪贴板恢复数据超过预算");return result;
 }
 public void ImportClipboardState(byte[] bytes){
  RequireWorld();if(bytes.Length>MaxClipboardStateBytes)throw new InvalidDataException("剪贴板恢复数据超过预算");
  using var zip=new ZipArchive(new MemoryStream(bytes),ZipArchiveMode.Read);
  if(zip.Entries.Count!=2||zip.Entries.Select(entry=>entry.FullName).Distinct(StringComparer.Ordinal).Count()!=2||zip.Entries.Sum(entry=>entry.Length)>MaxClipboardStateBytes)throw new InvalidDataException("剪贴板恢复条目无效");
  byte[] Read(string name,int limit){var entry=zip.GetEntry(name)??throw new InvalidDataException("剪贴板恢复条目缺失");if(entry.Length>limit)throw new InvalidDataException("剪贴板恢复条目过大");using var stream=entry.Open();using var output=new MemoryStream();stream.CopyTo(output);return output.ToArray();}
  var identity=JsonSerializer.Deserialize<ClipboardIdentity>(Read("identity.json",4*1024*1024))??throw new InvalidDataException("剪贴板身份缺失");identity.Validate();
  var next=ReadTemplate(Read("template.TEditSch",MaxTemplateBytes));
  if(next.CapturedIdentity==null||next.CapturedIdentity.Version!=identity.Version||!identity.SameNames(next.CapturedIdentity))throw new InvalidDataException("剪贴板名称与模板不一致，原模板保留");
  clipboard=next;clipboardIdentity=identity;ClipboardRevision++;Notify();
 }
}
}
namespace TEdit.Editor.Clipboard {
public partial class ClipboardBuffer {public TEdit.Port.ClipboardIdentity? CapturedIdentity {get;set;}}
}
