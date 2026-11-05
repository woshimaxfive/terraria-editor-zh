using TEdit.Terraria;



namespace TEdit.Port;

public sealed record WorldFileData(byte[] World,byte[]? Sidecar);

// Only this adapter knows temporary paths. Parsing, compression, legacy format

// dispatch, mod overlays and saving remain the unchanged original World APIs.

public static class WorldFiles {

 public static void EnsureInitialized(){}

 static WorldFiles(){

  // File versions before 190 encode English NPC names, not translated labels.

  // Initialize the original domain tables before any UI localization can run.

  var previous=System.Globalization.CultureInfo.CurrentUICulture;

  try{System.Globalization.CultureInfo.CurrentUICulture=System.Globalization.CultureInfo.GetCultureInfo("en-US");WorldConfiguration.Initialize();}

  finally{System.Globalization.CultureInfo.CurrentUICulture=previous;}

 }

 public const int MaxInputBytes=256*1024*1024;

 public const long MaxWorldCells=20_160_000;

 public static void ValidateAllocation(int width,int height){if(width<1||height<1||width>16800||height>16800||(long)width*height>MaxWorldCells)throw new InvalidDataException("世界超过当前浏览器分配预算（20160000格），未分配图格；原编辑状态保留，请使用桌面版处理该尺寸");}

 public static (int Width,int Height) Probe(string path){

  using var file=File.OpenRead(path);Stream stream=file;MemoryStream? decompressed=null;

  try{

   if(TEdit.Terraria.IO.ConsoleCompressor.IsCompressed(file)){

    // Original console codec uses ZLib after its 8-byte prefix. Bound the

    // expansion before its unbounded original full-load path is entered.

    file.Position=8;using var zip=new System.IO.Compression.ZLibStream(file,System.IO.Compression.CompressionMode.Decompress,true);decompressed=new MemoryStream();var chunk=new byte[65536];int count;

    while((count=zip.Read(chunk))>0){if(decompressed.Length+count>MaxInputBytes)throw new InvalidDataException("主机世界展开超过256MiB读取预算");decompressed.Write(chunk,0,count);}decompressed.Position=0;stream=decompressed;

   }

   using var reader=new BinaryReader(stream,System.Text.Encoding.UTF8,true);uint version=reader.ReadUInt32();int width,height;

   if(version>87){

    // Use the original section/header readers without allocating Tiles.

    stream.Position=0;var header=new World{Version=version};if(!World.LoadSectionHeader(reader,out _,out var pointers,header))throw new InvalidDataException("世界头无效");World.LoadHeaderFlags(reader,header,pointers[1]);width=header.TilesWide;height=header.TilesHigh;

   }else{

    // Original legacy headersOnly still allocates Tiles before returning.

    // Inspect just its common dimension prefix; full decoding stays original.

    _=reader.ReadString();long position=stream.Position;int first=reader.ReadInt32();bool v0=version<=38&&first==0;stream.Position=position;if(!v0)_=reader.ReadInt32();for(int i=0;i<4;i++)_=reader.ReadInt32();height=reader.ReadInt32();width=reader.ReadInt32();

   }

   ValidateAllocation(width,height);return(width,height);

  }finally{decompressed?.Dispose();}

 }

 sealed class Workspace:IDisposable {

  readonly string root;

  public string WorldPath {get;}

  public Workspace(){root=Path.Combine(Path.GetTempPath(),"tedit-browser-r2-files",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);WorldPath=Path.Combine(root,"world.wld");}

  public void Dispose(){if(Directory.Exists(root))Directory.Delete(root,true);}

 }

 public static World Load(WorldFileData input){

  if(input.World.Length<4||(long)input.World.Length+(input.Sidecar?.Length??0)>MaxInputBytes)throw new InvalidDataException("世界和配套文件超出当前读取预算，原编辑状态保留");

  using var files=new Workspace();File.WriteAllBytes(files.WorldPath,input.World);

  if(input.Sidecar!=null)File.WriteAllBytes(Path.ChangeExtension(files.WorldPath,".twld"),input.Sidecar);

  var allocation=Probe(files.WorldPath);if((long)allocation.Width*allocation.Height>1_048_576)GC.Collect();

  var (world,error)=World.LoadWorld(files.WorldPath);

  if(error!=null)throw new InvalidDataException("原版读取器拒绝该世界或配套文件："+error.Message,error);

  return world;

 }

 // Original validation normalizes vanilla container lists while writing. Keep
 // those changes in the encoded file, without changing the live undo baseline
 // or replacing selected object references. Mod-sidecar save/reapply stays original.
 sealed class ExportContainers:IDisposable {
  readonly World world;
  readonly Chest[]? chests;
  readonly Sign[]? signs;
  readonly TileEntity[]? entities;
  public ExportContainers(World world){
   this.world=world;
   if(!world.IsTModLoader){chests=world.Chests.ToArray();signs=world.Signs.ToArray();entities=world.TileEntities.ToArray();}
  }
  public void Dispose(){
   if(chests==null)return;
   world.Chests.Clear();world.Chests.AddRange(chests);
   world.Signs.Clear();world.Signs.AddRange(signs!);
   world.TileEntities.Clear();world.TileEntities.AddRange(entities!);
  }
 }
 public static WorldFileData Save(World world,int? targetVersion=null,bool preserveAll=true){
  using var containers=new ExportContainers(world);
  using var files=new Workspace();
  World.Save(world,files.WorldPath,versionOverride:targetVersion??checked((int)world.Version),incrementRevision:false,preserveAll:preserveAll);
  string sidecar=Path.ChangeExtension(files.WorldPath,".twld");
  return new(File.ReadAllBytes(files.WorldPath),File.Exists(sidecar)?File.ReadAllBytes(sidecar):null);
 }
 public static async Task<WorldFileData> SaveAsync(World world,int? targetVersion=null,bool preserveAll=true){
  using var containers=new ExportContainers(world);

  using var files=new Workspace();

  await World.SaveAsync(world,files.WorldPath,versionOverride:targetVersion??checked((int)world.Version),incrementRevision:false,preserveAll:preserveAll);

  string sidecar=Path.ChangeExtension(files.WorldPath,".twld");

  return new(File.ReadAllBytes(files.WorldPath),File.Exists(sidecar)?File.ReadAllBytes(sidecar):null);

 }

}

