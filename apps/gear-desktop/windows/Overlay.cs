using System.Text.Json;
using System.Reflection;
using Microsoft.Web.WebView2.WinForms;

namespace Gildra.Gear;

internal sealed class GearOverlay : Form
{
    readonly Func<WebView2?> current;
    readonly Func<bool> russian;
    readonly Label title = new() { Dock = DockStyle.Top, Height = 38, Padding = new Padding(12, 7, 0, 0) };
    readonly RichTextBox details = new() { Dock = DockStyle.Fill, ReadOnly = true, BorderStyle = BorderStyle.None, DetectUrls = false, TabStop = false };
    readonly Button open = new() { Dock = DockStyle.Bottom, Height = 36, FlatStyle = FlatStyle.Flat };
    readonly System.Windows.Forms.Timer refresh = new() { Interval = 1500 };
    readonly string script;
    bool reading;
    public GearOverlay(Func<WebView2?> getView, Func<bool> getRussian, Action showMain)
    {
        current = getView; russian = getRussian;
        Text = "Gildra Gear"; TopMost = true; ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.SizableToolWindow;
        StartPosition = FormStartPosition.Manual; MinimumSize = new Size(260, 170);
        BackColor = details.BackColor = Color.FromArgb(16, 24, 30);
        ForeColor = details.ForeColor = Color.FromArgb(223, 234, 241);
        title.ForeColor = Color.FromArgb(168, 217, 242);
        title.Font = new Font("Segoe UI", 12, FontStyle.Bold); details.Font = new Font("Segoe UI", 10);
        var inset = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12, 5, 10, 8) };
        inset.Controls.Add(details); Controls.Add(inset); Controls.Add(title); Controls.Add(open);
        open.FlatAppearance.BorderColor = Color.FromArgb(64, 83, 97);
        open.Click += (_,_) => showMain();
        var assembly = Assembly.GetExecutingAssembly();
        using var resource = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(n => n.EndsWith(".overlay.js")))!;
        using var reader = new StreamReader(resource); script = reader.ReadToEnd();
        refresh.Tick += async (_, _) => await UpdateView();
        VisibleChanged += async (_, _) => { refresh.Enabled = Visible; if (Visible) await UpdateView(); };
        FormClosing += (_, e) => { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
        Disposed += (_, _) => refresh.Dispose();
    }
    public async Task UpdateView()
    {
        if (reading || !Visible) return;
        reading = true;
        var view = current();
        try {
            bool ru = russian();
            open.Text = ru ? "Открыть подбор" : "Open gear planner";
            string label = ru ? "Подбор предметов" : "Gear planner";
            string body = ru ? "Откройте вкладку улучшений персонажа." : "Open a character’s Upgrades tab.";
            if (view?.CoreWebView2 is {} web && LocalPlanner.OnSite(web.Source)) {
                var original = web.Source;
                var json = await web.ExecuteScriptAsync(script);
                if (view != current() || original != web.Source || IsDisposed) return;
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Object) {
                    var dto = doc.RootElement;
                    string? character = dto.GetProperty("title").GetString();
                    if (!string.IsNullOrWhiteSpace(character)) label = character;
                    var lines = dto.GetProperty("lines").EnumerateArray().Select(line => line.GetString()).ToArray();
                    body = lines.Length > 0 ? string.Join("\n\n", lines) : dto.GetProperty("empty").GetString()!;
                }
            }
            title.Text = label;
            if (details.Text != body) details.Text = body;
        } catch { if (!IsDisposed) { title.Text = "Gildra Gear"; details.Text = russian() ? "Данные недоступны." : "Data unavailable."; } }
        finally { reading = false; }
    }
}
