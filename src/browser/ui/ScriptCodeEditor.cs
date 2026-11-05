// Adapted from frozen TEdit ScriptingSidebarView.xaml.cs (MS-PL).
using System;
using System.Linq;
using System.Reflection;
using Avalonia.Controls;
using AvaloniaEdit;
using Avalonia.Input;
using Avalonia.Media;
using System.Xml;
using AvaloniaEdit.CodeCompletion;
using AvaloniaEdit.Document;
using AvaloniaEdit.Editing;
using AvaloniaEdit.Highlighting;
using AvaloniaEdit.Highlighting.Xshd;

using TEdit.Scripting;


namespace TEditBrowser;

public sealed class ScriptCodeEditor : TextEditor
{
    private CompletionWindow? _completionWindow;
    private IHighlightingDefinition? _jsHighlighting;
    private IHighlightingDefinition? _luaHighlighting;

    public string? CompletionError {get;private set;}
    public string[] CompletionItems => _completionWindow?.CompletionList.CompletionData.Select(c=>c.Text).ToArray()??[];
    protected override Type StyleKeyOverride => typeof(TextEditor);
    public int LanguageIndex {get;private set;}
    public ScriptCodeEditor(){InitializeSyntaxHighlighting();WireCompletion();}
    public void SetLanguage(int index){LanguageIndex=index;ApplySyntaxHighlighting();}
    private void InitializeSyntaxHighlighting()
    {
        var assembly = Assembly.GetExecutingAssembly();

        _jsHighlighting = LoadHighlighting(assembly, "TEdit.Resources.JavaScript.xshd");
        _luaHighlighting = LoadHighlighting(assembly, "TEdit.Resources.Lua.xshd");

        ApplySyntaxHighlighting();
    }

    private static IHighlightingDefinition? LoadHighlighting(Assembly assembly, string resourceName)
    {
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null) return null;
        using var reader = new XmlTextReader(stream);
        return HighlightingLoader.Load(reader, HighlightingManager.Instance);
    }

    private void ApplySyntaxHighlighting()
    {
        this.SyntaxHighlighting = LanguageIndex switch
        {
            0 => _jsHighlighting,
            1 => _luaHighlighting,
            _ => null
        };
    }

    private void WireCompletion()
    {
        this.TextArea.TextEntering += OnTextEntering;
        this.TextArea.TextEntered += OnTextEntered;

        // Ctrl+Space for top-level module completion
        this.TextArea.KeyDown += (sender, e) =>
        {
            if (e.Key == Key.Space && e.KeyModifiers == KeyModifiers.Control)
            {
                e.Handled = true;
                ShowModuleCompletion();
            }
        };
    }

    private void OnTextEntering(object sender, TextInputEventArgs e)
    {
        if (_completionWindow != null && e.Text.Length > 0)
        {
            if (!char.IsLetterOrDigit(e.Text[0]))
            {
                _completionWindow.CompletionList.RequestInsertion(e);
            }
        }
    }

    private void OnTextEntered(object sender, TextInputEventArgs e)
    {
        if (e.Text != ".") return;

        // Find the word before the dot
        var offset = this.CaretOffset - 1; // position of the dot
        var document = this.Document;
        var wordStart = offset - 1;

        while (wordStart >= 0 && char.IsLetterOrDigit(document.GetCharAt(wordStart)))
            wordStart--;
        wordStart++;

        if (wordStart >= offset) return;

        var moduleName = document.GetText(wordStart, offset - wordStart);
        var module = ScriptApiMetadata.Modules.FirstOrDefault(m =>
            m.Name.Equals(moduleName, StringComparison.OrdinalIgnoreCase));

        if (module == null) return;

        ShowMethodCompletion(module);
    }

    private void ShowModuleCompletion()
    {
        _completionWindow = new CompletionWindow(this.TextArea);
        var data = _completionWindow.CompletionList.CompletionData;

        foreach (var module in ScriptApiMetadata.Modules)
        {
            data.Add(new ScriptCompletionData(module.Name, module.Description));
        }

        try{_completionWindow.Show();}catch(Exception e){CompletionError=e.ToString();Console.WriteLine(CompletionError);throw;}
        _completionWindow.Closed += (_, _) => _completionWindow = null;
    }

    private void ShowMethodCompletion(ScriptApiMetadata.ApiModule module)
    {
        _completionWindow = new CompletionWindow(this.TextArea);
        var data = _completionWindow.CompletionList.CompletionData;

        foreach (var method in module.Methods)
        {
            data.Add(new ScriptCompletionData(method.Name, $"{method.Signature}\n{method.Description}"));
        }

        try{_completionWindow.Show();}catch(Exception e){CompletionError=e.ToString();Console.WriteLine(CompletionError);throw;}
        _completionWindow.Closed += (_, _) => _completionWindow = null;
    }
}

internal class ScriptCompletionData : ICompletionData
{
    public ScriptCompletionData(string text, string description)
    {
        Text = text;
        Description = description;
    }

    public IImage? Image => null;
    public string Text { get; }
    public object Content => Text;
    public object Description { get; }
    public double Priority => 1;

    public void Complete(TextArea textArea, ISegment completionSegment, EventArgs insertionRequestEventArgs)
    {
        textArea.Document.Replace(completionSegment, Text);
    }
}
