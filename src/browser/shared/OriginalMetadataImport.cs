using System.IO;
using System;
using System.ComponentModel;
using TEdit.Terraria;
using TEdit.Common.Exceptions;
using TEdit.Helper;
using TEdit.Utility;
namespace TEdit.Port;
public static class OriginalMetadataImport {
    public static void ImportKillsAndBestiaryBytes(World world, byte[] bytes, IProgress<ProgressChangedEventArgs>? progress = null)
    {
        World w = new World();

        // load npc and bestiary data to temp world
        using (var b = new BinaryReader(new MemoryStream(bytes)))
        {
            bool[] tileFrameImportant;
            int[] sectionPointers;

            w.Version = b.ReadUInt32();
            var curVersion = w.Version;


            if (w.Version < 87)
                throw new TEditFileFormatException("World file too old, please update it by loading in game.");
            if (w.Version > world.Version)
                throw new TEditFileFormatException("Source world version is greater than target world. Please reload both in game and resave");

            // reset the stream
            b.BaseStream.Position = (long)0;

            progress?.Report(new ProgressChangedEventArgs(0, "Loading File Header..."));
            // read section pointers and tile frame data
            if (!World.LoadSectionHeader(b, out tileFrameImportant, out sectionPointers, w))
                throw new TEditFileFormatException("Invalid File Format Section");

            w.TileFrameImportant = tileFrameImportant;

            // we should be at the end of the first section
            if (b.BaseStream.Position != sectionPointers[0])
                throw new TEditFileFormatException("Unexpected Position: Invalid File Format Section");

            // Load the flags
            World.LoadHeaderFlags(b, w, sectionPointers[1]);
            if (b.BaseStream.Position != sectionPointers[1])
                throw new TEditFileFormatException("Unexpected Position: Invalid Header Flags");

            if (w.Version >= 210 && sectionPointers.Length > 9)
            {
                // skip to bestiary data
                b.BaseStream.Position = sectionPointers[8];
                World.LoadBestiary(b, w);
                if (b.BaseStream.Position != sectionPointers[9])
                    throw new TEditFileFormatException("Unexpected Position: Invalid Bestiary Section");
            }
        }

        // copy kill tally and bestiary to target world
        world.Bestiary = w.Bestiary;
        world.KilledMobs.Clear();
        world.KilledMobs.AddRange(w.KilledMobs);
    }

    public static void ImportBannersBytes(World world, byte[] bytes, IProgress<ProgressChangedEventArgs>? progress = null)
    {
        World w = new World();

        using (var b = new BinaryReader(new MemoryStream(bytes)))
        {
            w.Version = b.ReadUInt32();

            if (w.Version < 289)
                throw new TEditFileFormatException("Source world does not support banners (requires version 289+).");
            if (w.Version > world.Version)
                throw new TEditFileFormatException("Source world version is greater than target world. Please reload both in game and resave.");

            b.BaseStream.Position = 0;

            if (!World.LoadSectionHeader(b, out var tileFrameImportant, out var sectionPointers, w))
                throw new TEditFileFormatException("Invalid File Format Section");

            w.TileFrameImportant = tileFrameImportant;

            if (b.BaseStream.Position != sectionPointers[0])
                throw new TEditFileFormatException("Unexpected Position: Invalid File Format Section");

            // Load header flags (contains KilledMobs and ClaimableBanners)
            World.LoadHeaderFlags(b, w, sectionPointers[1]);
            if (b.BaseStream.Position != sectionPointers[1])
                throw new TEditFileFormatException("Unexpected Position: Invalid Header Flags");
        }

        // Copy claimable banners to target world
        world.ClaimableBanners.Clear();
        foreach (var banner in w.ClaimableBanners)
        {
            world.ClaimableBanners.Add(banner);
        }
    }


}
