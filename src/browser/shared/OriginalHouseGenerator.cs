/* 
Copyright (c) 2021 ReconditeDeity
 
This source is subject to the Microsoft Public License.
See http://www.microsoft.com/opensource/licenses.mspx#Ms-PL.
All other rights reserved.

THIS CODE AND INFORMATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, 
EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED 
WARRANTIES OF MERCHANTABILITY AND/OR FITNESS FOR A PARTICULAR PURPOSE.
*/

// Original HouseGenPlugin domain; desktop file selection is replaced.
using TEdit.Editor.Clipboard;
using TEdit.Geometry;
using TEdit.ViewModel;
namespace TEdit.Port;
public sealed class OriginalHouseGenerator(int seed){
 readonly Random _rand=new(seed);
 Vector2Int32 _generatedSchematicSize;
        public TEdit.Editor.Clipboard.ClipboardBuffer GenerateFromTemplate(HouseGenTemplate template)
        {

            //Retrive buffer size.
            _generatedSchematicSize.X = template.Schematic.Size.X;
            _generatedSchematicSize.Y = template.Schematic.Size.Y / template.Data.Count;

            var bufferData = new ClipboardBuffer(_generatedSchematicSize);

            int type;

            // Process Rooms
            for (int i = 0; i < template.Data.Rooms.Count; i++)
            {
                type = _rand.Next(template.Data.Count);

                Room room = template.Data.Rooms[i];

                for (int x = 0; x < room.Width; x++)
                {
                    for (int y = 0; y < room.Height; y++)
                    {
                        try
                        {
                            bufferData.Tiles[x + room.X, y + room.Y] =
                                template.Schematic.Tiles[x + room.X, y + room.Y + (_generatedSchematicSize.Y * type)];
                        }
                        catch (IndexOutOfRangeException e)
                        {
                            ErrorLogging.LogDebug($"HouseGen IndexOutOfRange in {room.Name}: {e.Message}");
                            throw;
                        }
                    }
                }
            }

            // Process Roofs
            // Generate the random roof value once for the whole "building"
            type = _rand.Next(template.Data.Count);

            for (int i = 0; i < template.Data.Roofs.Count; i++)
            {
                Roof roof = template.Data.Roofs[i];

                for (int x = 0; x < roof.Width; x++)
                {
                    for (int y = 0; y < roof.Height; y++)
                    {
                        try
                        {
                            bufferData.Tiles[x + roof.X, y + roof.Y] =
                                template.Schematic.Tiles[x + roof.X, y + roof.Y + (_generatedSchematicSize.Y * type)];
                        }
                        catch (IndexOutOfRangeException e)
                        {
                            throw;
                        }
                    }
                }
            }

            //Fill in any empty space of schematic outside of room definintions (empty space within bounds of roof or room should already be filled)
            for (int x2 = 0; x2 < _generatedSchematicSize.X; x2++)
            {
                for (int y2 = 0; y2 < _generatedSchematicSize.Y; y2++)
                {
                    try
                    {
                        // default(Tile) is valid zero state for struct — just verify bounds
                    }
                    catch (IndexOutOfRangeException e)
                    {
                        ErrorLogging.LogDebug($"HouseGen IndexOutOfRange (Count mismatch): {e.Message}");
                            throw;
                    }
                }
            }

            return bufferData;
        }

    public class HouseGenTemplate
    {
        private readonly string _name;
        private readonly HouseGenTemplateData _data;
        private readonly ClipboardBuffer _schematic;

        public string Name => _name;
        public HouseGenTemplateData Data => _data;
        public ClipboardBuffer Schematic => _schematic;

        public HouseGenTemplate(string name, ClipboardBuffer schematic, HouseGenTemplateData template)
        {
            _schematic = schematic;
            _name = name;
            _data = template;
        }
    }

    public class HouseGenTemplateData
    {
        public int Count { get; set; }
        public List<Room> Rooms { get; set; } = new List<Room>();
        public List<Roof> Roofs { get; set; } = new List<Roof>();
    }

    public class Room
    {
        public string Name { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class Roof
    {
        public string Name { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }
}
