using TEdit.Terraria;
namespace TEdit.Port;
public sealed class OriginalObjectCommands {
    public void ClearChest(Chest SelectedChest)
    {
        if (SelectedChest == null) return;

        foreach (var item in SelectedChest.Items)
        {
            item.NetId = 0;
            item.StackSize = 0;
            item.Prefix = 0;
            item.ModName = null;
            item.ModItemName = null;
            item.ModItemData = null;
            item.ModGlobalData = null;
            item.ModPrefixMod = null;
            item.ModPrefixName = null;
        }
    }

    public Item ItemClipboard { get; set; }

    public void CopyChestItems(object container)
    {
        if (container is Item item)
        {
            CopyChestItem(item);
        }
        else if (container is TileEntity te)
        {
            if ((te.EntityType == TileEntityType.ItemFrame ||
                 te.EntityType == TileEntityType.WeaponRack ||
                 te.EntityType == TileEntityType.FoodPlatter ||
                 te.EntityType == TileEntityType.DeadCellsDisplayJar) &&
                (te.StackSize > 0 || te.IsModItem))
            {
                CopyChestItem(te.ToItem());
            }
        }
    }

    private void CopyChestItem(Item item)
    {
        ItemClipboard = item?.Copy();
    }

    public void PasteChestItems(object parameter)
    {
        if (parameter is System.Collections.IList selectedItems)
        {
            foreach (var obj in selectedItems)
            {
                if (obj is Item item)
                {
                    PasteChestItem(item);
                }
            }
        }
        else if (parameter is Item item)
        {
            PasteChestItem(item);
        }
        else if (parameter is TileEntity te)
        {
            if (te.EntityType == TileEntityType.ItemFrame ||
                te.EntityType == TileEntityType.WeaponRack ||
                te.EntityType == TileEntityType.FoodPlatter ||
                te.EntityType == TileEntityType.DeadCellsDisplayJar)
            {
                if (ItemClipboard != null)
                {
                    te.FromItem(ItemClipboard);
                }
                else
                {
                    te.NetId = 0;
                    te.Prefix = 0;
                    te.StackSize = 0;
                }
            }
        }
    }

    private void PasteChestItem(Item item)
    {
        if (ItemClipboard != null)
        {
            item.NetId = ItemClipboard.NetId;
            item.Prefix = ItemClipboard.Prefix;
            item.StackSize = ItemClipboard.StackSize;
            item.ModName = ItemClipboard.ModName;
            item.ModItemName = ItemClipboard.ModItemName;
            item.ModPrefixMod = ItemClipboard.ModPrefixMod;
            item.ModPrefixName = ItemClipboard.ModPrefixName;
            item.ModItemData = ItemClipboard.ModItemData;
            item.ModGlobalData = ItemClipboard.ModGlobalData;
        }
        else
        {
            item.NetId = 0;
        }
    }

    public void ChestItemMaxStack(object container)
    {
        if (container == null) return;

        if (container is System.Collections.IList selectedItems)
        {
            foreach (var obj in selectedItems)
            {
                if (obj is Item listItem)
                    SetItemMaxStack(listItem);
            }
        }
        else if (container is Item item)
        {
            SetItemMaxStack(item);
        }
        else if (container is TileEntity te &&
                 (te.EntityType == TileEntityType.ItemFrame ||
                  te.EntityType == TileEntityType.WeaponRack ||
                  te.EntityType == TileEntityType.FoodPlatter ||
                  te.EntityType == TileEntityType.DeadCellsDisplayJar))
        {
            var teItem = te.ToItem();
            SetItemMaxStack(teItem);
            te.StackSize = (short)teItem.StackSize;
        }
    }

    private static void SetItemMaxStack(Item item)
    {
        if (WorldConfiguration.ItemLookupTable.TryGetValue(item.NetId, out var props) && props.MaxStackSize > 0)
        {
            item.StackSize = props.MaxStackSize;
        }
        else
        {
            item.StackSize = 9999;
        }
    }


}
