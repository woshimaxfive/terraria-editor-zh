using System.Text.Json;
using TEdit.Terraria;
namespace TEdit.Port;
public sealed class NewWorldOptions{
 public string Title{get;set;}="TEdit World";
 public int Width{get;set;}=4200;
 public int Height{get;set;}=1200;
 public double Ground{get;set;}=350;
 public double Rock{get;set;}=480;
 public double Hill{get;set;}=0;
 public string Seed{get;set;}="";
 public int? WorldId{get;set;}
 public bool Grass{get;set;}=true;
 public bool Walls{get;set;}=true;
 public bool Caves{get;set;}
 public bool SurfaceCaves{get;set;}
 public double CaveNoise{get;set;}=.08;
 public double CaveMultiplier{get;set;}=.02;
 public double CaveDensity{get;set;}=3;
 public bool Underworld{get;set;}
 public bool Ash{get;set;}=true;
 public bool Lava{get;set;}=true;
 public double RoofNoise{get;set;}=.15;
 public double FloorNoise{get;set;}=.05;
 public double LavaNoise{get;set;}=.10;
}
public static partial class NewWorldFiles{
 public static async Task<byte[]> Create(string json){
  WorldFiles.EnsureInitialized();var o=JsonSerializer.Deserialize<NewWorldOptions>(json,new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new ArgumentException("新世界参数缺失");
  if(o.Width<100||o.Width>8400||o.Height<250||o.Height>2400||o.Title.Length>256||o.Seed.Length>256||o.Ground<10||o.Rock<=o.Ground||o.Rock>=o.Height-20||o.Hill<0||o.Hill>o.Height/2||o.Ground-o.Hill<0||o.Rock+o.Hill>=o.Height||new[]{o.Ground,o.Rock,o.Hill,o.CaveNoise,o.CaveMultiplier,o.CaveDensity,o.RoofNoise,o.FloorNoise,o.LavaNoise}.Any(n=>!double.IsFinite(n))||o.CaveMultiplier<0||o.CaveMultiplier>2||o.CaveDensity<0||o.CaveDensity>10||new[]{o.CaveNoise,o.RoofNoise,o.FloorNoise,o.LavaNoise}.Any(n=>n<0||n>1))throw new ArgumentException("新世界参数超出安全范围");
  var world=new World(o.Height,o.Width,o.Title){Version=WorldConfiguration.CompatibleVersion,GroundLevel=o.Ground,RockLevel=o.Rock,HillSize=o.Hill,Seed=o.Seed,GenerateGrass=o.Grass,GenerateWalls=o.Walls,GenerateCaves=o.Caves,SurfaceCaves=o.SurfaceCaves,CaveNoise=o.CaveNoise,CaveMultiplier=o.CaveMultiplier,CaveDensity=o.CaveDensity,GenerateUnderworld=o.Underworld,GenerateAsh=o.Ash,GenerateLava=o.Lava,UnderworldRoofNoise=o.RoofNoise,UnderworldFloorNoise=o.FloorNoise,UnderworldLavaNoise=o.LavaNoise,CreationTime=DateTime.Now.ToBinary()};
  if(o.WorldId is {} id){if(id<0)throw new ArgumentException("世界 ID 必须为非负整数");world.WorldId=id;}
  world.ResetTime();AddNames(world);new OriginalWorldGenerator().Generate(world);return (await WorldFiles.SaveAsync(world)).World;
 }
}
