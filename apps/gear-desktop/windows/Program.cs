using System.Text.Json;

namespace Gildra.Gear;

internal static class Program
{
    public static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Gildra", "Gear");
    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, @"Local\Gildra.Gear.Desktop", out bool first);
        if (!first) { MessageBox.Show("Gildra Gear уже открыта. / Gildra Gear is already open."); return; }
        Microsoft.Web.WebView2.Core.CoreWebView2Environment.SetLoaderDllFolderPath(AppContext.BaseDirectory);
        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(DataDir);
        Application.Run(new GearWindow());
    }
}

internal sealed class Preferences
{
    public bool Local { get; set; }
    public bool Russian { get; set; } = true;
    public Rectangle Overlay { get; set; }
    static string FileName => Path.Combine(Program.DataDir, "settings.json");
    public static Preferences Load()
    {
        try { return JsonSerializer.Deserialize<Preferences>(File.ReadAllText(FileName)) ?? new(); }
        catch { return new(); }
    }
    public void Save()
    {
        try {
            File.WriteAllText(FileName + ".tmp", JsonSerializer.Serialize(this));
            File.Move(FileName + ".tmp", FileName, true);
        } catch (IOException) { }
    }
}
