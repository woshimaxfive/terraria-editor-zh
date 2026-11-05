namespace TEdit;
public static class ErrorLogging {
 [ThreadStatic] static List<string>? errors;
 public static void BeginRender()=>errors=new();
 public static string[] RenderErrors()=>errors?.ToArray()??[];
 public static void LogDebug(string text)=>errors?.Add(text);
 public static void LogWarn(string text)=>errors?.Add(text);
 public static void LogException(Exception e)=>errors?.Add(e.ToString());
}
