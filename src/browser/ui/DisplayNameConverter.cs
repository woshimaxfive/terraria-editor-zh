using System.Globalization;
using Avalonia.Data.Converters;
namespace TEditBrowser;
public sealed class DisplayNameConverter:IValueConverter {
 public object? Convert(object? value,Type targetType,object? parameter,CultureInfo culture)=>value is string text?DesktopLanguage.Field(text):value;
 public object? ConvertBack(object? value,Type targetType,object? parameter,CultureInfo culture)=>throw new NotSupportedException();
}
