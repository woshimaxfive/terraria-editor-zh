// Derived from frozen TEdit World.LoadV2; MS-PL. Only tile delivery differs.
using System.ComponentModel;
using TEdit.Common.Exceptions;
using TEdit.Terraria;
using static TEdit.Terraria.World;
namespace TEdit.Port;
public sealed partial class WorldTransformSnapshot {
    void LoadMetadata(BinaryReader b, World w, bool headersOnly = false, IProgress<ProgressChangedEventArgs>? progress = null)
    {
        //throw new NotImplementedException("World Version > 87");

        bool[] tileFrameImportant;
        int[] sectionPointers;

        // reset the stream
        b.BaseStream.Position = (long)0;

        progress?.Report(new ProgressChangedEventArgs(0, "Loading File Header..."));
        // read section pointers and tile frame data
        if (!LoadSectionHeader(b, out tileFrameImportant, out sectionPointers, w))
            throw new TEditFileFormatException("Invalid File Format Section");

        w.TileFrameImportant = tileFrameImportant;

        // we should be at the end of the first section
        if (b.BaseStream.Position != sectionPointers[0])
            throw new TEditFileFormatException("Unexpected Position: Invalid File Format Section");

        // Load the flags
        LoadHeaderFlags(b, w, sectionPointers[1]);
        if (b.BaseStream.Position != sectionPointers[1])
            throw new TEditFileFormatException("Unexpected Position: Invalid Header Flags");

        if (headersOnly) { return; }

        progress?.Report(new ProgressChangedEventArgs(0, "Loading Tiles..."));
        IndexColumns(b, w);

        if (b.BaseStream.Position != sectionPointers[2])
            b.BaseStream.Position = sectionPointers[2];
        //throw new FileFormatException("Unexpected Position: Invalid Tile Data");

        progress?.Report(new ProgressChangedEventArgs(100, "Loading Chests..."));

        foreach (Chest chest in LoadChestData(b, w.Version))
        {
            //Tile tile = w.Tiles[chest.X, chest.Y];
            //if (tile.IsActive && (tile.Type == 55 || tile.Type == 85))
            {
                w.Chests.Add(chest);
            }
        }

        if (b.BaseStream.Position != sectionPointers[3])
            throw new TEditFileFormatException("Unexpected Position: Invalid Chest Data");

        progress?.Report(new ProgressChangedEventArgs(100, "Loading Signs..."));

        foreach (Sign sign in LoadSignData(b))
        {
            Tile tile = ReadTile(sign.X, sign.Y);
            if (tile.IsActive && tile.IsSign())
            {
                w.Signs.Add(sign);
            }
        }

        if (b.BaseStream.Position != sectionPointers[4])
            throw new TEditFileFormatException("Unexpected Position: Invalid Sign Data");

        progress?.Report(new ProgressChangedEventArgs(100, "Loading NPCs..."));
        LoadNPCsData(b, w);
        if (b.BaseStream.Position != sectionPointers[5])
            throw new TEditFileFormatException("Unexpected Position: Invalid Mob and NPC Data");


        if (w.Version >= 116)
        {
            progress?.Report(new ProgressChangedEventArgs(100, "Loading Tile Entities Section..."));
            if (w.Version < 122)
            {
                LoadDummies(b, w);
            }
            else
            {
                LoadTileEntities(b, w);
            }
            if (b.BaseStream.Position != sectionPointers[6])
                throw new TEditFileFormatException("Unexpected Position: Invalid Tile Entities Section");
        }

        if (w.Version >= 170)
        {
            LoadPressurePlate(b, w);
            if (b.BaseStream.Position != sectionPointers[7])
                throw new TEditFileFormatException("Unexpected Position: Invalid Weighted Pressure Plate Section");
        }
        if (w.Version >= 189)
        {
            LoadTownManager(b, w);
            if (b.BaseStream.Position != sectionPointers[8])
                throw new TEditFileFormatException("Unexpected Position: Invalid Town Manager Section");
        }
        if (w.Version >= 210)
        {
            LoadBestiary(b, w);
            if (b.BaseStream.Position != sectionPointers[9])
                throw new TEditFileFormatException("Unexpected Position: Invalid Bestiary Section");
        }
        if (w.Version >= 220)
        {
            LoadCreativePowers(b, w);
            if (b.BaseStream.Position != sectionPointers[10])
                throw new TEditFileFormatException("Unexpected Position: Invalid Creative Powers Section");
        }

        progress?.Report(new ProgressChangedEventArgs(100, "Verifying File..."));
        LoadFooter(b, w);

        progress?.Report(new ProgressChangedEventArgs(100, "Load Complete."));
    }

}
