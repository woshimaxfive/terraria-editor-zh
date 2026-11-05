using TEdit.Editor.Clipboard;

using TEdit.Geometry;

using TEdit.Terraria;



namespace TEdit.Port;

public sealed record CopyFilters(bool Tiles=false,bool Walls=false,bool Liquids=false,bool Wires=false);



// Browser file/transaction boundary only; all template codecs and edits are original.

public sealed partial class Session {

 ClipboardBuffer? clipboard;

 bool clipboardMetadataReady;

 public const int MaxClipboardCells=(int)WorldFiles.MaxWorldCells;

 public const int MaxTemplateBytes=WorldFiles.MaxInputBytes;

 public object? ClipboardInfo=>clipboard==null?null:new{width=clipboard.Size.X,height=clipboard.Size.Y,chests=clipboard.Chests.Count,signs=clipboard.Signs.Count,entities=clipboard.TileEntities.Count,modItems=clipboard.Chests.Sum(chest=>chest.Items.Count(item=>item.IsModItem)),rotationRemovesSprites=true};

 public void CopyRegion(int x,int y,int width,int height,CopyFilters? filters=null){

  RequireWorld();ValidateSize(width,height);

  long right=Math.Min((long)x+width,World!.TilesWide),bottom=Math.Min((long)y+height,World.TilesHigh);x=Math.Max(x,0);y=Math.Max(y,0);width=checked((int)(right-x));height=checked((int)(bottom-y));

  if(width<=0||height<=0)throw new ArgumentException("复制范围不与世界相交，原模板保留");

  var next=ClipboardBuffer.GetSelectionBuffer(World,new RectangleInt32(x,y,width,height),filters!=null,filters?.Tiles==true?_=>true:null,filters?.Walls==true?_=>true:null,filters?.Liquids==true?_=>true:null,filters?.Wires==true?_=>true:null);

  var identity=ClipboardIdentity.FromWorld(World);identity.Validate();clipboard=next;clipboardIdentity=identity;ClipboardRevision++;Notify();

 }

 public void DeleteRegion(int x,int y,int width,int height,bool cut=false,CopyFilters? filters=null){

  RequireWorld();ValidateSize(width,height);

  long right=Math.Min((long)x+width,World!.TilesWide),bottom=Math.Min((long)y+height,World.TilesHigh);x=Math.Max(x,0);y=Math.Max(y,0);width=checked((int)(right-x));height=checked((int)(bottom-y));

  if(width<=0||height<=0)throw new ArgumentException("删除范围不与世界相交，未修改");

  if(cut)CopyRegion(x,y,width,height,filters);

  OriginalSelectionDelete.Run(World,vm!.UndoManager,new RectangleInt32(x,y,width,height));Notify();

 }

 public void ImportTemplate(byte[] bytes){

  RequireWorld();var next=ReadTemplate(bytes);

  var identity=(next.CapturedIdentity??new ClipboardIdentity(1,World!.Version,[],[])).ResolveFrames(World!.TwldData);identity.Validate();

  clipboard=next;clipboardIdentity=identity;ClipboardRevision++;Notify();

 }

 ClipboardBuffer ReadTemplate(byte[] bytes){

  if(bytes.Length<12||bytes.Length>MaxTemplateBytes)throw new InvalidDataException("模板为空或超过256MiB文件上限，原模板保留");

  // Validate only the allocation prefix, then delegate the entire file to the original reader.

  using(var reader=new BinaryReader(new MemoryStream(bytes))){

   _=reader.ReadString();int version=reader.ReadInt32();if(version>10000)_=World.ReadBitArray(reader);

   int width=reader.ReadInt32(),height=reader.ReadInt32();ValidateSize(width,height);

  }

  if(TryReadRestoredFloatingTemplate(bytes,out var restoredFloating))return restoredFloating;
  using var files=new TemplateWorkspace();File.WriteAllBytes(files.Path,bytes);

  var next=ClipboardBuffer.Load(files.Path)??throw new InvalidDataException("原版读取器拒绝该模板，原模板保留");

  ValidateSize(next.Size.X,next.Size.Y);return next;

 }

 public void TransformClipboard(string operation,bool allowSpriteRemoval=false){

  var current=RequireClipboard();

  var identity=clipboardIdentity!.ResolveFrames(World!.TwldData);

  if(current.EnumerateStorageTiles().Any(tile=>tile.IsActive&&tile.Type>=WorldConfiguration.TileCount&&!identity.Tiles.Any(item=>item.Id==tile.Type&&item.Framed.HasValue)))throw new InvalidOperationException("原版变换缺少该模板的模组图格定义；请使用匹配的模组世界。原模板和世界保留");

  // Original transforms use global desktop property tables. Scope them to the source IDs.

  var spriteSheets=WorldConfiguration.Sprites2.ToArray();var tileProperties=WorldConfiguration.TileProperties.ToArray();var wallProperties=WorldConfiguration.WallProperties.ToArray();

  var bricks=WorldConfiguration.TileBricks.ToArray();var brickMasks=WorldConfiguration.TileBricksMask.ToArray();var wallMasks=WorldConfiguration.WallPropertiesMask.ToArray();

  try{

  TEdit.Terraria.TModLoader.TwldFile.RegisterModProperties(identity.AsModData());ClipboardSpriteMetadata.Build();

  if(operation=="rotate"&&!allowSpriteRemoval&&(current.Chests.Count+current.Signs.Count+current.TileEntities.Count>0||current.EnumerateStorageTiles().Any(tile=>tile.IsActive&&tile.Type<WorldConfiguration.TileProperties.Count&&WorldConfiguration.TileProperties[tile.Type].IsFramed)))throw new InvalidOperationException("原版旋转会移除家具、箱子、告示牌和实体；请先勾选允许移除，原模板保留");

  // Isolate original container side effects without copying read-only source Tiles.

  var candidate=current.ContainerCopyWithSharedTiles();

  try{candidate=operation switch{"flipX"=>candidate.FlipX(),"flipY"=>candidate.FlipY(),"rotate"=>candidate.Rotate(),_=>throw new ArgumentException("未知模板变换")};}

  catch(ArgumentOutOfRangeException error){throw new InvalidOperationException("原版变换缺少该模板的模组图格定义；请使用匹配的模组世界。原模板和世界保留",error);}

  clipboard=candidate;clipboardIdentity=identity;ClipboardRevision++;Notify();

  }finally{

   WorldConfiguration.Sprites2.Clear();foreach(var item in spriteSheets)WorldConfiguration.Sprites2.Add(item);

   WorldConfiguration.TileProperties.Clear();foreach(var item in tileProperties)WorldConfiguration.TileProperties.Add(item);

   WorldConfiguration.WallProperties.Clear();foreach(var item in wallProperties)WorldConfiguration.WallProperties.Add(item);

   WorldConfiguration.TileBricks.Clear();foreach(var item in bricks)WorldConfiguration.TileBricks.Add(item);

   WorldConfiguration.TileBricksMask.Clear();foreach(var item in brickMasks)WorldConfiguration.TileBricksMask.Add(item);

   WorldConfiguration.WallPropertiesMask.Clear();foreach(var item in wallMasks)WorldConfiguration.WallPropertiesMask.Add(item);

  }

 }

 public byte[] ExportTemplate(){

  RequireWorld();return SaveTemplate(World!.Version);

 }

 public void BindLegacyClipboard(){

  var current=RequireClipboard();var previous=clipboardIdentity!;

  if(previous.Tiles.Length+previous.Walls.Length>0)throw new InvalidOperationException("模板已有模组名称，不能用当前世界的数字ID覆盖；原模板保留");

  var identity=ClipboardIdentity.FromWorld(World!) with{Version=previous.Version};identity.Validate();

  var tiles=identity.Tiles.Select(item=>item.Id).ToHashSet();var walls=identity.Walls.Select(item=>item.Id).ToHashSet();

  if(current.EnumerateStorageTiles().Any(tile=>tile.IsActive&&tile.Type>=WorldConfiguration.TileCount&&!tiles.Contains(tile.Type)||tile.Wall>=WorldConfiguration.WallCount&&!walls.Contains(tile.Wall)))throw new InvalidOperationException("当前世界也缺少旧模板的ID定义，未绑定；原模板保留");

  clipboardIdentity=identity;ClipboardRevision++;Notify();

 }

 byte[] SaveTemplate(uint version){

  if(TryStoredFloatingTemplate(version,out var archivedTemplate))return archivedTemplate;
  var current=RequireClipboard();using var files=new TemplateWorkspace();

  // Save only changes Name; retain it across success and failure without a Tile clone.

  var previousName=current.Name;try{current.Save(files.Path,version,clipboardIdentity!.AsModData());}finally{current.Name=previousName;}

  if(new FileInfo(files.Path).Length>MaxTemplateBytes)throw new InvalidOperationException("模板导出超过256MiB文件上限");return File.ReadAllBytes(files.Path);

 }

 public void PasteClipboard(int x,int y,PasteOptions options){

  RequireWorld();var current=RequireClipboard();

  if(!options.HasAction)throw new ArgumentException("未启用粘贴内容，世界未修改");

  if((long)x+current.Size.X<=0||(long)y+current.Size.Y<=0||x>=World!.TilesWide||y>=World.TilesHigh)throw new ArgumentException("粘贴范围不与世界相交，未提交");

  if((long)current.Size.X*current.Size.Y>1_048_576){
   using var stream=new ClipboardTileStream(SaveTemplate(clipboardIdentity!.Version),World.TwldData);
   ValidatePasteContext(current,stream.Buffer,x,y,options,stream.Read);
   stream.Buffer.PasteStream(World,new Vector2Int32(x,y),vm!.UndoManager,stream.Read,options);Notify();return;
  }

  using var files=new TemplateWorkspace();File.WriteAllBytes(files.Path,SaveTemplate(clipboardIdentity!.Version));

  var resolved=ClipboardBuffer.Load(files.Path,World.TwldData)??throw new InvalidDataException("原版目标模板读取失败，世界与原模板保留");

  ValidatePasteContext(current,resolved,x,y,options);

  resolved.Paste(World,new Vector2Int32(x,y),vm!.UndoManager,options);Notify();

 }

 void ValidatePasteContext(ClipboardBuffer source,ClipboardBuffer buffer,int anchorX,int anchorY,PasteOptions options,Func<int,int,Tile>? readTile=null){

  var tileNames=clipboardIdentity!.Tiles.ToDictionary(item=>item.Id,item=>item.Name);var wallNames=clipboardIdentity.Walls.ToDictionary(item=>item.Id,item=>item.Name);

  for(int x=0;x<buffer.Size.X;x++)for(int y=0;y<buffer.Size.Y;y++){

   long worldX=(long)anchorX+x,worldY=(long)anchorY+y;if(worldX<0||worldY<0||worldX>=World!.TilesWide||worldY>=World.TilesHigh)continue;

   if(y==0)OperationProgress.Advance(buffer.Size.Y);
   var tile=readTile==null?buffer.StorageTile(x,y):readTile(x,y);var destination=World.Tiles[(int)worldX,(int)worldY];

   // Match the original Paste skip conditions before checking mod requirements.

   if(tile.IsEmpty&&!options.PasteEmpty||!destination.IsEmpty&&!options.PasteOverTiles)continue;

   bool framed=tile.Type<WorldConfiguration.SettingsTileFrameImportant.Length?WorldConfiguration.SettingsTileFrameImportant[tile.Type]:tile.Type<WorldConfiguration.TileProperties.Count&&WorldConfiguration.TileProperties[tile.Type].IsFramed;

   bool copiesTile=options.PasteTiles&&!framed||options.PasteSprites&&framed;

   var original=source.StorageTile(x,y);

   bool missingTile=copiesTile&&tile.IsActive&&original.Type>=WorldConfiguration.TileCount&&(!tileNames.TryGetValue(original.Type,out var tileName)||World.TwldData==null||!World.TwldData.VirtualTileIdToMapIndex.TryGetValue(tile.Type,out int ti)||World.TwldData.TileMap[ti].FullName!=tileName);

   bool missingWall=options.PasteWalls&&original.Wall>=WorldConfiguration.WallCount&&(!wallNames.TryGetValue(original.Wall,out var wallName)||World.TwldData==null||!World.TwldData.VirtualWallIdToMapIndex.TryGetValue(tile.Wall,out int wi)||World.TwldData.WallMap[wi].FullName!=wallName);

   bool missingItems=options.PasteSprites&&(tile.IsChest()||tile.Type>=WorldConfiguration.TileCount)&&World.TwldData==null&&buffer.GetChestAtTile(x,y)?.Items.Any(item=>item.IsModItem)==true;

   if(missingTile||missingWall||missingItems)throw new InvalidOperationException("目标世界缺少模板使用的模组定义，未粘贴；模板仍可导出，请选择匹配的模组世界");

  }

 }

 void RequireWorld(){if(vm==null)throw new InvalidOperationException("请先打开世界");if(!clipboardMetadataReady){TEdit.Terraria.TModLoader.TwldFile.RegisterModProperties(World!.TwldData);clipboardMetadataReady=true;}}

 ClipboardBuffer RequireClipboard(){RequireWorld();if(clipboard!=null&&clipboard.Tiles.Length==0&&TryStoredFloatingState(clipboard,out _))throw new InvalidOperationException("请先确认或取消当前浮动粘贴，再替换源模板");return clipboard??throw new InvalidOperationException("请先复制区域或导入模板");}

 static void ValidateSize(int width,int height){if(width<1||height<1||(long)width*height>MaxClipboardCells)throw new InvalidDataException("模板或选区超出20160000格容量，原模板和世界保留");}

 sealed class TemplateWorkspace:IDisposable {

  readonly string root=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"tedit-browser-r2-templates",Guid.NewGuid().ToString("N"));

  public string Path=>System.IO.Path.Combine(root,"template.TEditSch");

  public TemplateWorkspace(){Directory.CreateDirectory(root);}

  public void Dispose(){if(Directory.Exists(root))Directory.Delete(root,true);}

 }

}

