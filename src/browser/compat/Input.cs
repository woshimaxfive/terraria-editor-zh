using System.Collections.Generic;
using TEdit.Geometry;
namespace TEdit.UI;
public class TileMouseState { public Vector2Int32 Location {get;set;} public List<string> Actions {get;set;}=new(); }
