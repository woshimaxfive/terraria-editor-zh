using Avalonia;
using Avalonia.Browser;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Styling;
using Avalonia.Themes.Fluent;
using System.Runtime.InteropServices.JavaScript;

namespace TEditBrowser;
internal static class Program {
 static async Task Main(string[] args) {
  await JSHost.ImportAsync("coreBridge",new Uri(new Uri(args[0]),"bridge.js").AbsoluteUri);
  await AppBuilder.Configure<App>().StartBrowserAppAsync("out");
 }
}
public sealed class App:Application {
 public override void Initialize(){Styles.Add(new FluentTheme());Styles.Add(new Avalonia.Markup.Xaml.Styling.StyleInclude(new Uri("avares://TEdit.Browser.UI/")){Source=new Uri("avares://AvaloniaEdit/Themes/Fluent/AvaloniaEdit.xaml")});RequestedThemeVariant=ThemeVariant.Dark;DesktopLanguage.Apply("zh-Hans");}
 public override void OnFrameworkInitializationCompleted(){if(ApplicationLifetime is ISingleViewApplicationLifetime view)view.MainView=new MainView();base.OnFrameworkInitializationCompleted();}
}
internal static partial class CoreBridge {
 [JSImport("desktopData","coreBridge")] internal static partial Task<string> DesktopData(string action,string json);
 [JSImport("renderView","coreBridge")] internal static partial Task<string> RenderView(string json);
 [JSImport("chooseTextures","coreBridge")] internal static partial Task<string> ChooseTextures();
 [JSImport("exportPng","coreBridge")] internal static partial Task<string> ExportPng();
 [JSImport("run","coreBridge")] internal static partial Task<string> Run(string action,string payload);
 [JSImport("openFile","coreBridge")] internal static partial Task<string> OpenFile(byte[] data,string name,byte[] sidecar,string sidecarName);
 [JSImport("importTemplate","coreBridge")] internal static partial Task<string> ImportTemplate(byte[] data,string name);
 [JSImport("createWorld","coreBridge")] internal static partial Task<string> CreateWorld(string options);
 [JSImport("importImage","coreBridge")] internal static partial Task<string> ImportImage(byte[] data,string name,string options);
 [JSImport("importReplay","coreBridge")] internal static partial Task<string> ImportReplay(byte[] data,string name);
 [JSImport("cancel","coreBridge")] internal static partial void Cancel();
}
public static partial class UiHooks {
 [JSExport] public static void ApplyScene(string json)=>MainView.Instance?.ApplyScene(json);
 [JSExport] public static void RegisterTexture(string key,int width,int height,byte[] pixels)=>MainView.Instance?.RegisterTexture(key,width,height,pixels);
 [JSExport] public static void ReleaseTexture(string key)=>MainView.Instance?.ReleaseTexture(key);
 [JSExport] public static void RenderStatus(string text)=>MainView.Instance?.RenderStatus(text);
 [JSExport] public static string RenderState()=>MainView.Instance?.RenderState()??"{}";
 [JSExport] public static void ApplyMinimap(byte[] pixels)=>MainView.Instance?.ApplyMinimap(pixels);
 [JSExport] public static void ClearScene()=>MainView.Instance?.ClearScene();
 [JSExport] public static void ExportProgress(bool visible,double overall,double layer,string text)=>MainView.Instance?.ShowExportProgress(visible,overall,layer,text);
 [JSExport] public static byte[] SnapshotScene(string json,bool png)=>MainView.Instance!.SnapshotScene(json,png);
 [JSExport] public static byte[] Snapshot(bool png)=>MainView.Instance!.Snapshot(png);

 [JSExport] public static byte[] PackPair(byte[] world,byte[] sidecar,string worldName,string sidecarName)=>TEdit.Port.Files.WorldFilePackage.PackPair(world,sidecar,worldName,sidecarName);
 [JSExport] public static void ApplyInfo(string json)=>MainView.Current.ApplyInfo(json);
 [JSExport] public static void ApplyProgress(string status)=>MainView.Current.ApplyProgress(status);
 [JSExport] public static void ApplyFrame(byte[] rgba)=>MainView.Instance?.ApplyFrame(rgba);
 [JSExport] public static string Info()=>MainView.Current.Info;
 [JSExport] public static string UiState()=>System.Text.Json.JsonSerializer.Serialize(new{pickingFile=MainView.Current.PickingFile,busy=MainView.Current.Busy,status=MainView.Current.Status,libraryCount=MainView.Current.Library.Length,selectedTemplate=MainView.Current.SelectedTemplate?.Id});
 [JSExport] public static string Settings()=>System.Text.Json.JsonSerializer.Serialize(MainView.Current.Settings());
 [JSExport] public static void ApplySettings(string json)=>MainView.Current.ApplySettings(json);
}
