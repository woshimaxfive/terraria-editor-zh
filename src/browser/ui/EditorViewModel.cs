using System.ComponentModel;
using System.Text.Json;
using System.Windows.Input;

namespace TEditBrowser;
public sealed record Material(int Id,string OriginalName){public string Name=>DesktopLanguage.Name(OriginalName);}
public sealed record RecoveryChoice(string Id,string Label){public override string ToString()=>Label;}
public sealed record PickedWorld(byte[] Data,string Name,byte[] Sidecar,string SidecarName);
public sealed class UiCommand(Action action):ICommand {
 public event EventHandler? CanExecuteChanged {add{}remove{}}
 public bool CanExecute(object? value)=>true;
 public void Execute(object? value)=>action();
}
// Metadata and tool settings only. This assembly has no TEdit world/core reference.
public sealed partial class EditorViewModel:INotifyPropertyChanged {
 public event PropertyChangedEventHandler? PropertyChanged;
 string infoJson="{}";
 string? pendingProgress;
 public string Info {get{
  if(pendingProgress!=null){var progress=pendingProgress;pendingProgress=null;var node=System.Text.Json.Nodes.JsonNode.Parse(infoJson)!;node["status"]=progress;infoJson=node.ToJsonString();}
  return infoJson;
 }private set{infoJson=value;pendingProgress=null;}}
 public void ApplyProgress(string status){Status=status;pendingProgress=status;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(nameof(Status)));}
 public string Status {get;private set;}="打开世界文件开始编辑；存档在本机处理。";
 public bool Editable {get;private set;}
 public bool Busy {get;private set;}
 public int OriginX {get;private set;}
 public int OriginY {get;private set;}
 public Material[] Materials {get;private set;}=[];
 public string[] MaskModes {get;private set;}=[];
 Material? selectedMaterial;
 string selectedMask="Off";
 public Material? SelectedMaterial {get=>selectedMaterial;set{if(value!=null)selectedMaterial=value;}}
 public string SelectedMask {get=>selectedMask;set{if(value!=null)selectedMask=value;}}
 public bool TileActive {get;set;}=true;
 public int BrushWidth {get;set;}=3;
 public int BrushHeight {get;set;}=3;
 public string AutoSaveLabel {get;private set;}="自动保存：开";
 public ICommand SaveCommand {get;}
 public ICommand RestoreCommand {get;}
 public ICommand OriginalCommand {get;}
 public ICommand AutoSaveCommand {get;}
 public ICommand ReportCommand {get;}
 public ICommand RecoveriesCommand {get;}
 public ICommand RestoreSelectedCommand {get;}
 public ICommand DeleteSelectedCommand {get;}
 public RecoveryChoice[] Recoveries {get;private set;}=[];
 public RecoveryChoice? SelectedRecovery {get;set;}
 public ICommand LibraryListCommand {get;}
 public ICommand LibrarySaveCommand {get;}
 public ICommand LibraryLoadCommand {get;}
 public ICommand LibraryDeleteCommand {get;}
 public string TemplateTitle {get;set;}="建筑模板";
 RecoveryChoice[] allTemplates=[];
 string templateSearch="";
 public string TemplateSearch {get=>templateSearch;set{templateSearch=value??"";SelectedTemplate=Library.FirstOrDefault();PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(nameof(SelectedTemplate)));PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(nameof(Library)));}}
 public RecoveryChoice[] Library=>allTemplates.Where(item=>item.Label.Contains(templateSearch,StringComparison.OrdinalIgnoreCase)).ToArray();
 public RecoveryChoice? SelectedTemplate {get;set;}
 public Func<Task<PickedWorld?>> PickFile {get;set;}=()=>Task.FromResult<PickedWorld?>(null);
 public Func<Task<(byte[] Bytes,string Name)?>> PickTemplate {get;set;}=()=>Task.FromResult<(byte[],string)?>(null);
 public bool SelectMode {get;set;}
 public int SelectionX {get;set;}
 public int SelectionY {get;set;}
 public int SelectionWidth {get;set;}=16;
 public int SelectionHeight {get;set;}=32;
 public int PasteX {get;set;}
 public int PasteY {get;set;}
 public bool AllowSpriteRemoval {get;set;}
 public bool PasteEmpty {get;set;}=true;
 public bool PasteTiles {get;set;}=true;
 public bool PasteWalls {get;set;}=true;
 public bool PasteLiquids {get;set;}=true;
 public bool PasteWires {get;set;}=true;
 public bool PasteSprites {get;set;}=true;
 public bool PasteOverTiles {get;set;}=true;
 public bool FilterTiles {get;set;}
 public bool FilterWalls {get;set;}
 public bool FilterLiquids {get;set;}
 public bool FilterWires {get;set;}
 public string ClipboardStatus {get;private set;}="拖动框选或填写世界坐标，再复制；也可导入原版模板。";
 public string[] SaveVersions {get;private set;}=[];
 public string? TargetVersion {get;set;}
 public bool PreserveVersionContent {get;set;}
 public ICommand ExportVersionCommand {get;}
 public ICommand CutCommand {get;}
 public ICommand DeleteCommand {get;}
 public ICommand CopyCommand {get;}
 public ICommand ImportTemplateCommand {get;}
 public ICommand ExportTemplateCommand {get;}
 public ICommand FlipXCommand {get;}
 public ICommand FlipYCommand {get;}
 public ICommand RotateCommand {get;}
 public ICommand PasteCommand {get;}
 public ICommand BindLegacyCommand {get;}
 public void SelectRectangle(int x,int y,int width,int height){SelectionX=x;SelectionY=y;SelectionWidth=width;SelectionHeight=height;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));}
 async Task ImportTemplate(){
  if(picking||Busy)return;picking=true;bool wasEditable=Editable;Busy=true;Editable=false;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));
  try{var file=await PickTemplate();if(file!=null)await CoreBridge.ImportTemplate(file.Value.Bytes,file.Value.Name);else Fail("未选择模板，原模板和世界保留");}
  catch(Exception error){Fail(error.Message);}finally{picking=false;if(Busy){Busy=false;Editable=wasEditable;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));}}
 }
 bool picking;
 public bool PickingFile=>picking;
 public ICommand OpenCommand {get;}
 public ICommand ExportCommand {get;}
 public ICommand UndoCommand {get;}
 public ICommand RedoCommand {get;}
 public ICommand CancelCommand {get;}=new UiCommand(CoreBridge.Cancel);
 public EditorViewModel(){
  LibraryListCommand=new UiCommand(()=>_=Run("libraryList"));LibrarySaveCommand=new UiCommand(()=>_=Run("librarySave",new{title=TemplateTitle}));LibraryLoadCommand=new UiCommand(()=>_=Run("libraryLoad",new{id=SelectedTemplate?.Id}));LibraryDeleteCommand=new UiCommand(()=>_=Run("libraryDelete",new{id=SelectedTemplate?.Id}));
  ReportCommand=new UiCommand(()=>_=Run("report"));RecoveriesCommand=new UiCommand(()=>_=Run("recoveries"));
  RestoreSelectedCommand=new UiCommand(()=>_=Run("restoreSelected",new{id=SelectedRecovery?.Id}));DeleteSelectedCommand=new UiCommand(()=>_=Run("deleteSelected",new{id=SelectedRecovery?.Id}));
  ExportVersionCommand=new UiCommand(()=>_=Run("exportVersion",new{gameVersion=TargetVersion,preserveAll=PreserveVersionContent}));
  CutCommand=new UiCommand(()=>_=Run("cut",new{x=SelectionX,y=SelectionY,width=SelectionWidth,height=SelectionHeight,filters=new{tiles=FilterTiles,walls=FilterWalls,liquids=FilterLiquids,wires=FilterWires}}));
  DeleteCommand=new UiCommand(()=>_=Run("delete",new{x=SelectionX,y=SelectionY,width=SelectionWidth,height=SelectionHeight}));
  CopyCommand=new UiCommand(()=>_=Run("copy",new{x=SelectionX,y=SelectionY,width=SelectionWidth,height=SelectionHeight,filters=new{tiles=FilterTiles,walls=FilterWalls,liquids=FilterLiquids,wires=FilterWires}}));
  ImportTemplateCommand=new UiCommand(()=>_=ImportTemplate());ExportTemplateCommand=new UiCommand(()=>_=Run("templateExport"));
  FlipXCommand=new UiCommand(()=>_=Run("flipX"));FlipYCommand=new UiCommand(()=>_=Run("flipY"));RotateCommand=new UiCommand(()=>_=Run("rotate",new{allowSpriteRemoval=AllowSpriteRemoval}));
  PasteCommand=new UiCommand(()=>_=Run("paste",new{x=PasteX,y=PasteY,options=new{PasteEmpty,PasteTiles,PasteWalls,PasteLiquids,PasteWires,PasteSprites,PasteOverTiles}}));
  BindLegacyCommand=new UiCommand(()=>_=Run("bindLegacy"));
  OpenCommand=new UiCommand(()=>_=Open());ExportCommand=new UiCommand(()=>_=Run("export"));UndoCommand=new UiCommand(()=>_=Run("undo"));RedoCommand=new UiCommand(()=>_=Run("redo"));SaveCommand=new UiCommand(()=>_=Run("save",Settings()));RestoreCommand=new UiCommand(()=>_=Run("restore"));OriginalCommand=new UiCommand(()=>_=Run("original"));AutoSaveCommand=new UiCommand(()=>_=Run("autoSave"));}
 async Task Open(){
  if(picking||Busy)return;picking=true;bool wasEditable=Editable;Busy=true;Editable=false;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));
  try{var file=await PickFile();if(file!=null)await CoreBridge.OpenFile(file.Data,file.Name,file.Sidecar,file.SidecarName);else Fail("未选择文件，原编辑状态保留");}
  catch(Exception error){Fail(error.Message);}finally{picking=false;if(Busy){Busy=false;Editable=wasEditable;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));}}
 }
 public void ApplyInfo(string json){
  Info=json;using var doc=JsonDocument.Parse(json);var info=doc.RootElement;InitializeTools(info);ApplyInteraction(info);ApplyDomain(info);ApplyReplay(info);ApplyDesktop(info);ApplyFloatingInfo(info);
  Status=info.GetProperty("status").GetString()!;Editable=info.GetProperty("editable").GetBoolean();Busy=info.GetProperty("busy").GetBoolean();
  if(info.TryGetProperty("autoSave",out var auto))AutoSaveLabel=auto.GetBoolean()?"自动保存：开":"自动保存：关";
  if(info.TryGetProperty("recoveries",out var records)){
   var selected=SelectedRecovery?.Id;Recoveries=records.EnumerateArray().Select(item=>new RecoveryChoice(item.GetProperty("id").GetString()!,$"{(item.TryGetProperty("isBackup",out var backup)&&backup.GetBoolean()?"[历史备份] ":"[当前进度] ")}{item.GetProperty("title").GetString()} · {item.GetProperty("originalName").GetString()} · {DateTimeOffset.FromUnixTimeMilliseconds(item.GetProperty("updatedAt").GetInt64()).ToLocalTime():MM-dd HH:mm} · {item.GetProperty("bytes").GetInt64()/1048576.0:F1}MiB")).ToArray();SelectedRecovery=Recoveries.FirstOrDefault(item=>item.Id==selected)??Recoveries.FirstOrDefault();
  }
  if(info.TryGetProperty("library",out var templates)){var selected=SelectedTemplate?.Id;allTemplates=templates.EnumerateArray().Select(item=>new RecoveryChoice(item.GetProperty("id").GetString()!,$"{item.GetProperty("title").GetString()} · {item.GetProperty("size").GetInt64()/1024.0:F1}KiB")).ToArray();SelectedTemplate=Library.FirstOrDefault(item=>item.Id==selected)??Library.FirstOrDefault();}
  if(info.TryGetProperty("originX",out var x))OriginX=x.GetInt32();
  if(info.TryGetProperty("originY",out var y))OriginY=y.GetInt32();
  if(SaveVersions.Length==0&&info.TryGetProperty("saveVersions",out var versions)){SaveVersions=versions.EnumerateArray().Select(v=>v.GetString()!).ToArray();TargetVersion=SaveVersions.FirstOrDefault();}
  if(Materials.Length==0&&info.TryGetProperty("materials",out var materials)){
   Materials=materials.EnumerateArray().Select(v=>new Material(v.GetProperty("id").GetInt32(),v.GetProperty("name").GetString()!)).ToArray();
   SelectedMaterial=Materials.FirstOrDefault(m=>m.Id==(SelectedMaterial?.Id??1));
   MaskModes=info.GetProperty("maskModes").EnumerateArray().Select(v=>v.GetString()!).ToArray();
  }
  if(info.TryGetProperty("clipboard",out var clip)&&clip.ValueKind==JsonValueKind.Object)ClipboardStatus=$"模板 {clip.GetProperty("width")}×{clip.GetProperty("height")} · 箱 {clip.GetProperty("chests")} · 牌 {clip.GetProperty("signs")} · 实体 {clip.GetProperty("entities")}";
  else ClipboardStatus="拖动框选或填写世界坐标，再复制；也可导入原版模板。";
  SyncToolFeedback(info);PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));
 }
 public object Settings()=>new {tool=SelectedTool.Id,toolState=BuildToolState(),tile=SelectedMaterial?.Id??1,tileActive=TileActive,width=BrushWidth,height=BrushHeight,mask=SelectedMask,clipboard=new{selectMode=SelectMode,selectionX=SelectionX,selectionY=SelectionY,selectionWidth=SelectionWidth,selectionHeight=SelectionHeight,pasteX=PasteX,pasteY=PasteY,allowSpriteRemoval=AllowSpriteRemoval,pasteEmpty=PasteEmpty,pasteTiles=PasteTiles,pasteWalls=PasteWalls,pasteLiquids=PasteLiquids,pasteWires=PasteWires,pasteSprites=PasteSprites,pasteOverTiles=PasteOverTiles,filterTiles=FilterTiles,filterWalls=FilterWalls,filterLiquids=FilterLiquids,filterWires=FilterWires}};
 public void ApplySettings(string json){
  using var document=JsonDocument.Parse(json);var settings=document.RootElement;
  SelectedMaterial=Materials.FirstOrDefault(material=>material.Id==settings.GetProperty("tile").GetInt32());TileActive=settings.GetProperty("tileActive").GetBoolean();
  BrushWidth=settings.GetProperty("width").GetInt32();BrushHeight=settings.GetProperty("height").GetInt32();SelectedMask=settings.GetProperty("mask").GetString()??"Off";
  if(settings.TryGetProperty("clipboard",out var clip)){
   SelectMode=clip.GetProperty("selectMode").GetBoolean();SelectionX=clip.GetProperty("selectionX").GetInt32();SelectionY=clip.GetProperty("selectionY").GetInt32();SelectionWidth=clip.GetProperty("selectionWidth").GetInt32();SelectionHeight=clip.GetProperty("selectionHeight").GetInt32();PasteX=clip.GetProperty("pasteX").GetInt32();PasteY=clip.GetProperty("pasteY").GetInt32();AllowSpriteRemoval=clip.GetProperty("allowSpriteRemoval").GetBoolean();
   PasteEmpty=clip.GetProperty("pasteEmpty").GetBoolean();PasteTiles=clip.GetProperty("pasteTiles").GetBoolean();PasteWalls=clip.GetProperty("pasteWalls").GetBoolean();PasteLiquids=clip.GetProperty("pasteLiquids").GetBoolean();PasteWires=clip.GetProperty("pasteWires").GetBoolean();PasteSprites=clip.GetProperty("pasteSprites").GetBoolean();PasteOverTiles=clip.GetProperty("pasteOverTiles").GetBoolean();
   FilterTiles=clip.TryGetProperty("filterTiles",out var ft)&&ft.GetBoolean();FilterWalls=clip.TryGetProperty("filterWalls",out var fw)&&fw.GetBoolean();FilterLiquids=clip.TryGetProperty("filterLiquids",out var fl)&&fl.GetBoolean();FilterWires=clip.TryGetProperty("filterWires",out var fi)&&fi.GetBoolean();
  }
  RestoreTools(settings);PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(null));
 }
 public async Task Run(string action,object? payload=null){if(Busy)return;try{
  var value=JsonSerializer.SerializeToNode(payload);
  if(action is "cut" or "delete" or "copy" or "flipX" or "flipY" or "rotate" or "paste" or "bindLegacy"){
   value??=new System.Text.Json.Nodes.JsonObject();value["uiSettings"]=JsonSerializer.SerializeToNode(Settings());
  }
  await CoreBridge.Run(action,value?.ToJsonString()??"null");
 }catch(Exception error){Status=error.Message;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(nameof(Status)));}}
 public void Fail(string message){Status=message;PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(nameof(Status)));}
}
