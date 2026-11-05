using TEdit.Terraria;
using TEdit.Editor;
using System.Reflection;
using System.Text.Json;
namespace TEdit.Port;

// Original serializers retain header fields, object types and mod item payloads.
// This optional tail makes non-tile edits use the original undo indices/records.
public static class WorldMetadata {
 const int Magic=0x3341544d,MaxBytes=32*1024*1024;
 static readonly PropertyInfo[] ExtraProperties=typeof(World).GetProperties().Where(p=>p.CanRead&&p.SetMethod?.IsPublic==true&&p.GetIndexParameters().Length==0&&p.Name is not ("TilesWide" or "TilesHigh" or "Version")&&(p.PropertyType.IsPrimitive||p.PropertyType==typeof(string)||p.PropertyType==typeof(Guid)||p.PropertyType.IsEnum)).OrderBy(p=>p.Name).ToArray();
 public static byte[] Capture(World world){
  uint originalVersion=world.Version;
  try{world.Version=WorldConfiguration.CompatibleVersion;
  using var stream=new MemoryStream();using var writer=new BinaryWriter(stream,System.Text.Encoding.UTF8,true);
  writer.Write(3);writer.Write(WorldConfiguration.CompatibleVersion);
  using(var header=new MemoryStream()){using var output=new BinaryWriter(header,System.Text.Encoding.UTF8,true);World.SaveHeaderFlags(world,output,(int)WorldConfiguration.CompatibleVersion);var bytes=header.ToArray();writer.Write(bytes.Length);writer.Write(bytes);}
  writer.Write(ExtraProperties.Length);foreach(var p in ExtraProperties){writer.Write(p.Name);writer.Write(JsonSerializer.Serialize(p.GetValue(world),p.PropertyType));}
  World.SaveNPCs(world,writer,(int)WorldConfiguration.CompatibleVersion,true);
  World.SaveChests(world.Chests,writer,(int)WorldConfiguration.CompatibleVersion,true);World.SaveSigns(world.Signs,writer,(int)WorldConfiguration.CompatibleVersion);World.SaveTileEntities(world.TileEntities,writer,WorldConfiguration.CompatibleVersion);
  ModDataSerializer.SaveModPayload(writer,world.Chests,world.TileEntities,[],[],world.TwldData);
  // The compatible header normalizes banner counts to the current game's
  // limit. Internal history must retain the original older/modded collection.
  writer.Write(world.KilledMobs.Count);foreach(var value in world.KilledMobs)writer.Write(value);
  writer.Write(world.ClaimableBanners.Count);foreach(var value in world.ClaimableBanners)writer.Write(value);
  World.SaveBestiary(world.Bestiary,writer);World.SaveCreativePowers(world.CreativePowers,writer);
  var data=stream.ToArray();if(data.Length>MaxBytes)throw new InvalidOperationException("对象历史超过32MiB预算");return data;
  }finally{world.Version=originalVersion;}
 }
 public static void Write(BinaryWriter writer,byte[] bytes){writer.Write(Magic);writer.Write(bytes.Length);writer.Write(bytes);}
 public static void Validate(BinaryReader reader,ISet<string> validated){
  if(reader.BaseStream.Position==reader.BaseStream.Length)return;
  long start=reader.BaseStream.Position;
  if(reader.ReadInt32()!=Magic)throw new InvalidDataException("世界属性历史标记无效");
  int length=reader.ReadInt32();if(length<0||length>MaxBytes||length>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("世界属性历史长度无效");
  var payload=reader.ReadBytes(length);var digest=Convert.ToHexString(CheckpointHash.HashBytes(payload));
  if(validated.Contains(digest))return;
  reader.BaseStream.Position=start;Read(reader,new World());validated.Add(digest);
 }
 public static void Read(BinaryReader reader,World world){
  if(reader.BaseStream.Position==reader.BaseStream.Length)return; // Legacy checkpoint format.
  if(reader.ReadInt32()!=Magic)throw new InvalidDataException("世界属性历史标记无效");int length=reader.ReadInt32();if(length<0||length>MaxBytes||length>reader.BaseStream.Length-reader.BaseStream.Position)throw new InvalidDataException("世界属性历史长度无效");
  using var input=new BinaryReader(new MemoryStream(reader.ReadBytes(length)));int format=input.ReadInt32();if(format is not (1 or 2 or 3))throw new InvalidDataException("世界属性历史版本无效");uint version=input.ReadUInt32();
  int headerSize=input.ReadInt32();if(headerSize<0||headerSize>length)throw new InvalidDataException("世界属性头无效");var header=input.ReadBytes(headerSize);uint originalVersion=world.Version;
  try{world.Version=version;using var h=new BinaryReader(new MemoryStream(header));World.LoadHeaderFlags(h,world,headerSize);}finally{world.Version=originalVersion;}
  int count=input.ReadInt32();if(count!=ExtraProperties.Length)throw new InvalidDataException("世界属性数量无效");
  foreach(var p in ExtraProperties){if(input.ReadString()!=p.Name)throw new InvalidDataException("世界属性名称无效");p.SetValue(world,JsonSerializer.Deserialize(input.ReadString(),p.PropertyType));}
  world.NPCs.Clear();world.Mobs.Clear();try{world.Version=version;World.LoadNPCsData(input,world);}finally{world.Version=originalVersion;}
  world.Chests.Clear();foreach(var chest in World.LoadChestData(input,version))world.Chests.Add(chest);
  world.Signs.Clear();foreach(var sign in World.LoadSignData(input))world.Signs.Add(sign);
  world.TileEntities.Clear();foreach(var entity in World.LoadTileEntityData(input,version))world.TileEntities.Add(entity);
  ModDataSerializer.LoadModPayload(input,world.Chests,world.TileEntities,out var tiles,out var walls,world.TwldData);
  if(format>=2){
   int killed=input.ReadInt32();if(killed<0||killed>32767||killed*4L>input.BaseStream.Length-input.BaseStream.Position)throw new InvalidDataException("击杀计数恢复无效");
   world.KilledMobs.Clear();for(int i=0;i<killed;i++)world.KilledMobs.Add(input.ReadInt32());
   int claimable=input.ReadInt32();if(claimable<0||claimable>32767||claimable*2L>input.BaseStream.Length-input.BaseStream.Position)throw new InvalidDataException("旗帜计数恢复无效");
   world.ClaimableBanners.Clear();for(int i=0;i<claimable;i++)world.ClaimableBanners.Add(input.ReadUInt16());
  }
  if(format>=3){try{world.Version=version;World.LoadBestiary(input,world);World.LoadCreativePowers(input,world);}finally{world.Version=originalVersion;}}
  if(input.BaseStream.Position!=input.BaseStream.Length)throw new InvalidDataException("世界属性历史含多余内容");
 }
}
