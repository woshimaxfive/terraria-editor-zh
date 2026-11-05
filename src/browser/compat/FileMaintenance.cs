using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
namespace TEdit.Utility;
public readonly record struct CacheCleanupResult(int DeletedFileCount,long FreedBytes,int FailedFileCount) {
 public static CacheCleanupResult operator +(CacheCleanupResult a,CacheCleanupResult b)=>new(a.DeletedFileCount+b.DeletedFileCount,a.FreedBytes+b.FreedBytes,a.FailedFileCount+b.FailedFileCount);
}
public static class FileMaintenance {
public static CacheCleanupResult ClearDirectoryContents(
        string directory,
        IReadOnlySet<string> excludedFiles = null)
    {
        if (!Directory.Exists(directory)) return default;

        var exclusions = excludedFiles == null
            ? null
            : new HashSet<string>(excludedFiles.Select(Path.GetFullPath), StringComparer.OrdinalIgnoreCase);
        CacheCleanupResult result = default;

        foreach (var file in Directory.GetFiles(directory, "*", SearchOption.AllDirectories))
        {
            if (exclusions?.Contains(Path.GetFullPath(file)) == true) continue;
            result += DeleteCacheFile(file);
        }

        foreach (var child in Directory.GetDirectories(directory, "*", SearchOption.AllDirectories)
                     .OrderByDescending(path => path.Length))
        {
            try
            {
                if (!Directory.EnumerateFileSystemEntries(child).Any())
                    Directory.Delete(child, false);
            }
            catch (Exception ex)
            {
                ErrorLogging.LogWarn($"Unable to remove empty cache directory {child}: {ex.Message}");
            }
        }

        return result;
    }
private static CacheCleanupResult DeleteCacheFile(string file)
    {
        try
        {
            long size = new FileInfo(file).Length;
            File.Delete(file);
            return new CacheCleanupResult(1, size, 0);
        }
        catch (FileNotFoundException)
        {
            return default;
        }
        catch (Exception ex)
        {
            ErrorLogging.LogWarn($"Unable to delete cache file {file}: {ex.Message}");
            return new CacheCleanupResult(0, 0, 1);
        }
    }
}
