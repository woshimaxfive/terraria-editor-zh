using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.LogicalTree;
using System.Text.Json;

namespace TEditBrowser;

public partial class MainView
{
    bool panMode;
    string? previewMaterialKey;
    string? paletteTool;

    void RefreshInteractionUi()
    {
        this.FindControl<Border>("WelcomePanel")!.IsVisible = Current.DesktopSessionId == null && !Current.Busy;
        this.FindControl<StackPanel>("MapNavigation")!.IsVisible = Current.DesktopSessionId != null;
        this.FindControl<Button>("PanButton")!.Classes.Set("activeTool", panMode);
        foreach (var button in this.FindControl<ScrollViewer>("ToolRail")!.GetLogicalDescendants().OfType<Button>())
            button.Classes.Set("activeTool", !panMode && button.Tag as string == Current.SelectedTool.Id);
        map.Cursor = panMode || spacePan || panning ? new Cursor(StandardCursorType.Hand) : null;
        this.FindControl<TextBlock>("MapHint")!.Text = panMode
            ? "拖动平移 · 选择绘制工具返回编辑"
            : "空格 + 拖动或中键平移 · 滚轮缩放";
        this.FindControl<TextBlock>("ActiveToolLabel")!.Text = panMode ? "平移" : Current.SelectedTool.Label;
        this.FindControl<TextBlock>("ToolHelp")!.Text = panMode ? "拖动查看地图，点击平移按钮或选择绘制工具返回编辑。" : Current.SelectedTool.Id switch
        {
            "Brush" => "拖动绘制，松开提交一笔。宽、高在顶部调整，形状在笔刷参数中设置。",
            "Pencil" => "单格绘制。拖动时显示临时轨迹，松开提交一笔。",
            "Fill" => "点击填充相连区域，范围受掩码和选区约束。",
            "Picker" => "点击地图吸取方块及墙壁设置。",
            "Selection" => "拖动框选，复制、删除和导出会使用当前选区。",
            "Morph" => "先设置目标生态，再拖动转换。",
            "Sprite" => "在家具与物体面板选择样式，再点击地图放置。",
            "Paste" => "移动浮动模板，按 Enter 确认，Esc 取消。",
            _ => "工具参数沿用原版设置，可通过左侧工具栏或快捷键切换。"
        };
        RefreshMaterialPreview();
    }

    async void RefreshMaterialPreview()
    {
        var image = this.FindControl<Image>("MaterialThumbnail")!;
        var material = Current.SelectedMaterial;
        string key = $"{Current.DesktopSessionId}/{material?.Id}";
        if (key == previewMaterialKey) return;
        previewMaterialKey = key;
        image.Tag = null;
        (image.Source as IDisposable)?.Dispose();
        image.Source = null;
        this.FindControl<TextBlock>("SelectedMaterialLabel")!.Text = material == null
            ? "选择绘制材料"
            : $"{material.Name} · ID {material.Id}";
        if (Current.DesktopSessionId != null && material is { Id: >= 0 })
            await LoadThumbnail(image, "tile", material.Id);
    }

    void ExpandActiveToolParameters()
    {
        if (paletteTool == Current.SelectedTool.Id || Current.ToolFields.Length == 0) return;
        paletteTool = Current.SelectedTool.Id;
        string group = paletteTool == "Morph" ? "morph" : "brush";
        foreach (var expander in this.FindControl<StackPanel>("PaletteFields")!.Children.OfType<Expander>())
            if (expander.Tag as string == group) expander.IsExpanded = true;
    }

    public void InvalidateMaterialPreview()
    {
        previewMaterialKey = null;
        RefreshMaterialPreview();
    }

    void ResetPanMode()
    {
        panMode = false;
        RefreshInteractionUi();
    }

    void PreviewStroke(PointerEventArgs e)
    {
        if (Current.SelectedTool.Id is not ("Brush" or "Pencil" or "Hammer" or "Morph")) return;
        var tile = MapLocation(e);
        map.AddStrokePreview(tile.X, tile.Y);
        this.FindControl<TextBlock>("MapHint")!.Text = "临时笔画轨迹 · 松开后按工具、掩码和选区计算结果";
    }

    void ClearStrokePreview()
    {
        map.ClearStrokePreview();
        RefreshInteractionUi();
    }

    void UpdateZoomLabel(JsonElement view)
    {
        if (view.TryGetProperty("zoom", out var zoom))
        {
            double value = zoom.GetDouble() / 16 * 100;
            this.FindControl<TextBlock>("MapZoom")!.Text = $"{value:0.##}%";
        }
    }
}
