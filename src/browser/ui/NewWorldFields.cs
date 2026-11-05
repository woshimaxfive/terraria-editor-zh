using System.Text.Json;
using System.Windows.Input;
namespace TEditBrowser;
public sealed partial class EditorViewModel{
 public string NewWorldTitle{get;set;}="TEdit World";
 public string NewWorldSeed{get;set;}="";
 public int NewWorldWidth{get;set;}=4200;
 public int NewWorldHeight{get;set;}=1200;
 public double NewWorldGround{get;set;}=350;
 public double NewWorldRock{get;set;}=480;
 public double NewWorldHill{get;set;}
 public bool NewWorldGrass{get;set;}=true;
 public bool NewWorldWalls{get;set;}=true;
 public bool NewWorldCaves{get;set;}
 public bool NewWorldUnderworld{get;set;}
 public int NewWorldId{get;set;}=Random.Shared.Next(int.MaxValue);
 public bool NewWorldSurfaceCaves{get;set;}
 public double NewWorldCaveNoise{get;set;}=.08;
 public double NewWorldCaveMultiplier{get;set;}=.02;
 public double NewWorldCaveDensity{get;set;}=3;
 public bool NewWorldAsh{get;set;}=true;
 public bool NewWorldLava{get;set;}=true;
 public double NewWorldRoofNoise{get;set;}=.15;
 public double NewWorldFloorNoise{get;set;}=.05;
 public double NewWorldLavaNoise{get;set;}=.10;
 public bool NewWorldOres{get;set;}
 public ICommand NewWorldCommand=>new UiCommand(()=>_=CreateNewWorld());
 public event Action? NewWorldCreated;
 async Task CreateNewWorld(){if(Busy||picking)return;try{MainView.Instance?.ValidateNewWorldFields();await CoreBridge.CreateWorld(JsonSerializer.Serialize(new{title=NewWorldTitle,worldId=NewWorldId,seed=NewWorldSeed,width=NewWorldWidth,height=NewWorldHeight,ground=NewWorldGround,rock=NewWorldRock,hill=NewWorldHill,grass=NewWorldGrass,walls=NewWorldWalls,caves=NewWorldCaves,surfaceCaves=NewWorldSurfaceCaves,caveNoise=NewWorldCaveNoise,caveMultiplier=NewWorldCaveMultiplier,caveDensity=NewWorldCaveDensity,underworld=NewWorldUnderworld,ash=NewWorldAsh,lava=NewWorldLava,roofNoise=NewWorldRoofNoise,floorNoise=NewWorldFloorNoise,lavaNoise=NewWorldLavaNoise}));NewWorldCreated?.Invoke();}catch(Exception e){Fail(e.Message);}}
}
