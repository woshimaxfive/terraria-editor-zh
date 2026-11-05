using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.LogicalTree;
namespace TEditBrowser;
public partial class MainView {
 string? settingsRollback;bool loadingGeneralPreferences;
 int spriteThumbnailSize=64,scriptTimeoutSeconds=10,maxBackups=10;bool enablePlayerEditor=true;
 void ApplyGeneralPreferences(JsonElement prefs){loadingGeneralPreferences=true;try{
  if(prefs.TryGetProperty("language",out var lang))DesktopLanguage.Apply(lang.GetString()!);
  if(prefs.TryGetProperty("tab",out var tab))Current.SidebarIndex=tab.GetInt32();
  if(prefs.TryGetProperty("spriteThumbnailSize",out var size))spriteThumbnailSize=Math.Clamp(size.GetInt32(),16,128);
  if(prefs.TryGetProperty("enablePlayerEditor",out var player))enablePlayerEditor=player.GetBoolean();
  if(prefs.TryGetProperty("maxBackups",out var backups))maxBackups=Math.Clamp(backups.GetInt32(),1,50);
  if(prefs.TryGetProperty("scriptTimeoutSeconds",out var timeout))scriptTimeoutSeconds=Math.Clamp(timeout.GetInt32(),10,300);
  if(this.FindControl<Image>("SpriteThumbnail") is {} image)image.Width=image.Height=spriteThumbnailSize;
  if(this.FindControl<TabControl>("DesktopTabs") is {} tabs&&tabs.Items.Cast<object>().OfType<TabItem>().FirstOrDefault(t=>t.Tag as string=="player") is {} playerTab){if(!enablePlayerEditor&&playerTab.IsSelected)Current.SidebarIndex=1;playerTab.IsVisible=enablePlayerEditor;}
  if(this.FindControl<TextBox>("ScriptTimeout") is {} field)field.Text=scriptTimeoutSeconds.ToString();
 }finally{loadingGeneralPreferences=false;}}
 async Task OpenDesktopSettings(){settingsRollback=await CoreBridge.DesktopData("settingsSnapshot","");ShowDesktopDialog("settings");}
 async void RevertDesktopSettings(){try{if(settingsRollback is not {} snapshot)return;await CoreBridge.DesktopData("settingsRestore",snapshot);desktopInput.Registry.ResetAllToDefaults();await RestoreInputBindings();using var restored=JsonDocument.Parse(await CoreBridge.DesktopData("readPreference",""));spriteThumbnailSize=64;enablePlayerEditor=true;scriptTimeoutSeconds=10;maxBackups=10;ApplyGeneralPreferences(restored.RootElement);settingsRollback=null;this.FindControl<Border>("DesktopDialog")!.IsVisible=false;map.Focus();}catch(Exception ex){Current.Fail(ex.Message);}}
 void ShowDesktopAbout(){
  ShowMessage("TEdit 浏览器版","基于 TEdit 原版 C# 代码移植，原版作者与贡献者见原项目。原版许可证 MS-PL；Jint BSD-2-Clause，LuaCSharp、AvaloniaEdit、SkiaSharp MIT。世界、玩家与贴图在本机处理。非官方社区项目。原版来源、完整第三方许可与源码见本站许可证和项目仓库。");
  var stack=this.FindControl<StackPanel>("DesktopDialogContent")!;
  foreach(var (key,label) in new[]{("github","原版 GitHub"),("discord","原版 Discord"),("patreon","支持原作者 Patreon")})stack.Children.Add(Button(label,async()=>{try{await CoreBridge.DesktopData("projectLink",key);}catch(Exception ex){Current.Fail(ex.Message);}}));
 }
 void BuildDesktopSettings(StackPanel stack){
  using var initial=JsonDocument.Parse(settingsRollback??"{}");var view=initial.RootElement.TryGetProperty("view",out var v)?v.Clone():JsonDocument.Parse("{}").RootElement.Clone();
  var search=new TextBox{Name="SettingsSearch",Watermark="搜索设置分类或名称"};stack.Children.Add(search);
  stack.Children.Add(Button("取消本次设置修改",RevertDesktopSettings));stack.Children.Add(Label("设置即时生效；关闭保留修改，取消恢复打开窗口前的设置。文件导出、删除与恢复属于独立操作。"));
  var sections=new List<Expander>();
  StackPanel Section(string title){var panel=new StackPanel{Spacing=5};var exp=new Expander{Header=title,Content=panel,HorizontalAlignment=HorizontalAlignment.Stretch,IsExpanded=true};sections.Add(exp);stack.Children.Add(exp);return panel;}
  var general=Section("常规与界面");
  var language=new ComboBox{Name="SettingsLanguage",ItemsSource=new[]{"zh-Hans","zh-Hant","en","ja","ko","de","fr","es","ru","pt","pl","it","ar"},SelectedItem=DesktopLanguage.Language};general.Children.Add(Label("语言"));general.Children.Add(language);language.SelectionChanged+=async(_,_)=>{if(language.SelectedItem is string key){DesktopLanguage.Apply(key);await SaveDesktopPreferences();}};
  var player=new CheckBox{Name="SettingsEnablePlayer",Content="启用玩家编辑器",IsChecked=enablePlayerEditor};general.Children.Add(player);player.IsCheckedChanged+=async(_,_)=>{enablePlayerEditor=player.IsChecked==true;using var prefs=JsonDocument.Parse(JsonSerializer.Serialize(new{enablePlayerEditor}));ApplyGeneralPreferences(prefs.RootElement);await SaveDesktopPreferences();};
  general.Children.Add(Button("检查网页更新",async()=>{try{await ShowBrowserUpdate();}catch(Exception ex){Current.Fail(ex.Message);}}));
  var rendering=Section("绘图与图层");
  double Number(string key,double fallback)=>view.TryGetProperty(key,out var number)?number.GetDouble():fallback;
  async Task Set(string key,object value)=>await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="set",view=new Dictionary<string,object>{{key,value}}}));
  void Slider(string name,string label,string key,double min,double max,double fallback,double step){var slider=new Slider{Name=name,Minimum=min,Maximum=max,Value=Number(key,fallback),TickFrequency=step,IsSnapToTickEnabled=true};rendering.Children.Add(Label(label));rendering.Children.Add(slider);slider.ValueChanged+=async(_,e)=>{try{await Set(key,e.NewValue);}catch(Exception ex){Current.Fail(ex.Message);}};}
  var color=new ComboBox{Name="SettingsColorMode",ItemsSource=new[]{"Default","Minimap","Realistic"},SelectedItem=view.TryGetProperty("colorMode",out var mode)?mode.GetString():"Default",ItemTemplate=ChoiceTemplate};rendering.Children.Add(Label("地图颜色模式"));rendering.Children.Add(color);color.SelectionChanged+=async(_,_)=>{if(color.SelectedItem is string value)await Set("colorMode",value);};
  Slider("SettingsTextureThreshold","贴图显示缩放阈值","textureVisibilityZoomLevel",3,10,6,1);Slider("SettingsBackgroundScale","背景缩放基准","backgroundScaleZoom",7,12,9,1);Slider("SettingsGlow","发光强度","lightGlowIntensity",0,1,.5,.05);
  var thumbnail=new Slider{Name="SettingsThumbnailSize",Minimum=16,Maximum=128,TickFrequency=16,IsSnapToTickEnabled=true,Value=spriteThumbnailSize};rendering.Children.Add(Label("家具预览尺寸（16–128）"));rendering.Children.Add(thumbnail);thumbnail.ValueChanged+=async(_,e)=>{spriteThumbnailSize=(int)e.NewValue;if(this.FindControl<Image>("SpriteThumbnail") is {} image)image.Width=image.Height=spriteThumbnailSize;await SaveDesktopPreferences();};
  foreach(var (name,label) in new[]{("ShowTextures","贴图"),("ShowGrid","网格"),("ShowBackgrounds","背景"),("ShowWalls","墙壁"),("ShowTiles","方块"),("ShowCoatings","涂层"),("ShowLiquid","液体"),("ShowActuators","制动器"),("ShowRedWires","红线"),("ShowBlueWires","蓝线"),("ShowGreenWires","绿线"),("ShowYellowWires","黄线"),("ShowWireTransparency","电线透明"),("ShowPoints","坐标标记"),("MinimapBackground","小地图背景")}){
   var check=new CheckBox{Name="SettingsLayer_"+name,Content=label,IsChecked=view.TryGetProperty("layers",out var layers)&&layers.TryGetProperty(name,out var enabled)?enabled.GetBoolean():name is not ("ShowGrid" or "ShowWireTransparency" or "MinimapBackground")};rendering.Children.Add(check);check.IsCheckedChanged+=async(_,_)=>{try{await CoreBridge.RenderView(JsonSerializer.Serialize(new{operation="setLayer",name,enabled=check.IsChecked==true}));}catch(Exception ex){Current.Fail(ex.Message);}};
  }
  rendering.Children.Add(Button("选择 Terraria 贴图目录",async()=>await CoreBridge.ChooseTextures()));rendering.Children.Add(Button("导出当前画面",async()=>await CoreBridge.ExportPng()));
  var scripts=Section("脚本");var timeout=new Slider{Name="SettingsScriptTimeout",Minimum=10,Maximum=300,TickFrequency=10,IsSnapToTickEnabled=true,Value=scriptTimeoutSeconds};scripts.Children.Add(Label("默认脚本时限（10–300秒）"));scripts.Children.Add(timeout);timeout.ValueChanged+=async(_,e)=>{scriptTimeoutSeconds=(int)e.NewValue;this.FindControl<TextBox>("ScriptTimeout")!.Text=scriptTimeoutSeconds.ToString();await SaveDesktopPreferences();};
  BuildInputSettings(Section("快捷键与长按取色器"));
  var storage=Section("本机进度与恢复");storage.Children.Add(Button("保存本机进度",()=>Current.SaveCommand.Execute(null)));storage.Children.Add(Button("恢复上次进度",()=>Current.RestoreCommand.Execute(null)));storage.Children.Add(Button("下载原始副本",()=>Current.OriginalCommand.Execute(null)));storage.Children.Add(Button(Current.AutoSaveLabel,()=>Current.AutoSaveCommand.Execute(null)));storage.Children.Add(Button("刷新恢复记录",()=>Current.RecoveriesCommand.Execute(null)));
  storage.Children.Add(Label("每个世界的历史备份数（1–50，默认10；下次保存时轮换）"));
  var backups=new NumericUpDown{Name="SettingsMaxBackups",Minimum=1,Maximum=50,Increment=1,Value=maxBackups,FormatString="0"};storage.Children.Add(backups);backups.ValueChanged+=async(_,_)=>{if(backups.Value is {} value&&value==decimal.Truncate(value)){maxBackups=(int)value;await SaveDesktopPreferences();}};
  storage.Children.Add(Label("恢复历史备份会打开独立副本。删除当前进度会同时删除它的历史备份；删除一份历史备份只影响该份备份。下载的原始文件保留。"));
  var records=new ComboBox{Name="SettingsRecoveryRecords",[!ItemsControl.ItemsSourceProperty]=new Avalonia.Data.Binding("Recoveries"),SelectedItem=Current.SelectedRecovery};records.SelectionChanged+=(_,_)=>Current.SelectedRecovery=records.SelectedItem as RecoveryChoice;storage.Children.Add(records);storage.Children.Add(Button("恢复所选记录",()=>Current.RestoreSelectedCommand.Execute(null)));storage.Children.Add(Button("删除所选记录",()=>Current.DeleteSelectedCommand.Execute(null)));
  var platform=Section("浏览器与桌面设置的对应");platform.Children.Add(Label("世界与 Steam/Workshop 目录：使用世界浏览器选择文件夹；贴图目录由用户选择。浏览器管理窗口、启动页和网页更新渠道；不安装桌面更新。当前没有自动错误上报。"));platform.Children.Add(Label("原版武器架的全部物品可通过实体物品 ID 输入。高质量笔刷预览开关在此固定版本的原版源码中未被使用。本机按每个世界保留1–50份历史备份；浏览器清除站点数据会移除进度和备份，请定期下载副本。筛选模式与变暗强度在右侧筛选面板即时应用。"));
  search.TextChanged+=(_,_)=>{string query=search.Text??"";foreach(var exp in sections){string terms=exp.Header+" "+string.Join(" ",exp.GetLogicalDescendants().OfType<TextBlock>().Select(t=>t.Text))+" "+string.Join(" ",exp.GetLogicalDescendants().OfType<CheckBox>().Select(c=>c.Content));exp.IsVisible=terms.Contains(query,StringComparison.OrdinalIgnoreCase);if(query.Length>0&&exp.IsVisible)exp.IsExpanded=true;}};
 }
}
