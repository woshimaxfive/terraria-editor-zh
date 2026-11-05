using System.Text.Json;
using System.Text.Json.Nodes;
using TEdit.Common;
using TEdit.Terraria;
using TEdit.Terraria.Player;
using TEdit.Port.Rendering;
namespace TEdit.Port;
public sealed partial class Session {
 readonly Dictionary<string,PreviewTexture> previewPixels=new(StringComparer.OrdinalIgnoreCase);long previewBytes;
 readonly LinkedList<string> previewOrder=new();
 readonly Dictionary<string,LinkedListNode<string>> previewNodes=new(StringComparer.OrdinalIgnoreCase);
 public void ClearPreviewTextures(){previewPixels.Clear();previewOrder.Clear();previewNodes.Clear();previewBytes=0;}
 public void RegisterPreviewTexture(string key,int width,int height,byte[] rgba){
  if(key.Length>256||width<1||height<1||width>4096||height>4096||rgba.Length!=(long)width*height*4||rgba.Length>64*1024*1024)throw new ArgumentException("预览纹理无效");
  if(previewPixels.Remove(key,out var old)){previewBytes-=old.Rgba.Length;previewOrder.Remove(previewNodes[key]);previewNodes.Remove(key);}
  while(previewBytes+rgba.Length>64*1024*1024&&previewOrder.First is {} first){string removed=first.Value;previewOrder.RemoveFirst();previewNodes.Remove(removed);previewBytes-=previewPixels[removed].Rgba.Length;previewPixels.Remove(removed);}
  previewPixels[key]=new(width,height,rgba);previewNodes[key]=previewOrder.AddLast(key);previewBytes+=rgba.Length;
 }
 public string PlayerPreviewJson(byte[] plain,string json){
  EnsureRenderer();if(plain.Length>8*1024*1024)throw new ArgumentException("玩家预览超过8MiB");using var stream=new MemoryStream(plain);var player=PlayerFile.Load(stream);
  renderTextures!.BeginFrame();var textures=new PreviewTextures(renderTextures,previewPixels);
  // Original PlayerEditorViewModel active loadout, vanity overrides, visibility,
  // dye colours and hair visibility. Accessory preview is also disabled upstream.
  using var options=JsonDocument.Parse(json);int loadout=options.RootElement.TryGetProperty("loadout",out var chosen)?chosen.GetInt32():player.CurrentLoadoutIndex;
  if(loadout<0||loadout>=player.Loadouts.Length)throw new ArgumentException("装备栏位无效");bool showArmor=!options.RootElement.TryGetProperty("armor",out var visible)||visible.GetBoolean();
  var armor=loadout==player.CurrentLoadoutIndex?player.Armor:player.Loadouts[loadout].Armor;var dyes=loadout==player.CurrentLoadoutIndex?player.Dye:player.Loadouts[loadout].Dye;var hide=loadout==player.CurrentLoadoutIndex?player.HideVisibleAccessory:player.Loadouts[loadout].Hide;
  int? head=null,body=null,legs=null;TEditColor? headDye=null,bodyDye=null,legsDye=null;bool hair=true;
  int Item(int i)=>armor.Count>i+3&&armor[i+3].NetId>0?armor[i+3].NetId:armor.Count>i?armor[i].NetId:0;
  bool Visible(int i)=>showArmor&&(hide==null||hide.Length<=i||!hide[i]);
  if(Visible(0)&&WorldConfiguration.ItemLookupTable.TryGetValue(Item(0),out var h)){head=h.Head;hair=h.DrawFullHair==true||h.DrawHatHair==true;}
  if(Visible(1)&&WorldConfiguration.ItemLookupTable.TryGetValue(Item(1),out var b))body=b.Body;
  if(Visible(2)&&WorldConfiguration.ItemLookupTable.TryGetValue(Item(2),out var l))legs=l.Legs;
  TEditColor? Dye(int i)=>dyes.Count>i&&WorldConfiguration.DyeColorById.TryGetValue(dyes[i].NetId,out var d)?d.Color:null;
  headDye=Dye(0);bodyDye=Dye(1);legsDye=Dye(2);
  var image=OriginalPlayerPreviewRenderer.RenderPreview(player,textures,4,head,body,legs,headDye,bodyDye,legsDye,hair)??new PreviewImage(160,224,new int[160*224]);
  var scene=new RenderScene(image.Width,image.Height,0,[new("Opaque",null,[new("@player-preview",0,0,image.Width,image.Height,0,0,image.Width,image.Height,uint.MaxValue,0,0,0,0,0)])],renderTextures.Missing.ToArray(),[],[new("@player-preview",image.Width,image.Height,image.Rgba())]);
  var result=JsonNode.Parse(JsonSerializer.Serialize(scene,RenderJson))!.AsObject();result["pixelRequests"]=JsonSerializer.SerializeToNode(textures.PixelRequests);return result.ToJsonString();
 }
}
