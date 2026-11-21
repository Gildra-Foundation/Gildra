using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Gildra.Gear;

internal sealed class GearWindow : Form
{
    const int OverlayKey = 0x646;
    readonly Preferences prefs = Preferences.Load();
    readonly ToolStrip bar = new() { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 5, 8, 4), RenderMode = ToolStripRenderMode.System };
    readonly ToolStripButton roster = new(), overlay = new(), reload = new(), language = new();
    readonly ToolStripDropDownButton mode = new();
    readonly ToolStripMenuItem serverChoice = new(), localChoice = new();
    readonly Label notice = new() { Dock = DockStyle.Bottom, AutoSize = false, Height = 30, TextAlign = ContentAlignment.MiddleCenter, Visible = false };
    readonly Panel content = new() { Dock = DockStyle.Fill };
    readonly WebView2?[] views = new WebView2?[2];
    CoreWebView2Environment? environment;
    LocalPlanner? planner;
    WebView2? active;
    bool switching, registered, closed;
    GearOverlay? companion;

    string T(string ru, string en) => prefs.Russian ? ru : en;
    string RosterUrl => LocalPlanner.Site + (prefs.Russian ? "/ru" : "") + "/wow/characters";

    public GearWindow()
    {
        Text = "Gildra Gear";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(390, 330);
        Size = new Size(1200, 820);
        BackColor = Color.FromArgb(16, 24, 30);
        notice.ForeColor = Color.FromArgb(228, 218, 189);
        bar.BackColor = Color.FromArgb(219, 231, 237);
        bar.Items.AddRange(new ToolStripItem[] { roster, mode, overlay, reload, language });
        mode.DropDownItems.AddRange(new ToolStripItem[] { serverChoice, localChoice });
        Controls.Add(content); Controls.Add(notice); Controls.Add(bar);
        bar.Dock = DockStyle.Top;
        roster.Click += (_, _) => { if (active != null) active.Source = new Uri(RosterUrl); };
        reload.Click += async (_, _) => { if (prefs.Local && planner?.IsRunning == false) await SelectMode(true); else if (active != null) active.Reload(); else await Start(); };
        overlay.Click += (_, _) => ToggleOverlay();
        serverChoice.Click += async (_, _) => await SelectMode(false);
        localChoice.Click += async (_, _) => await SelectMode(true);
        language.Click += (_, _) => {
            prefs.Russian = !prefs.Russian; prefs.Save(); Labels();
            if (active?.Source is { } source && LocalPlanner.OnSite(source.AbsoluteUri)) {
                var path = source.PathAndQuery;
                if (path.StartsWith("/ru/")) path = path[3..];
                active.Source = new Uri(LocalPlanner.Site + (prefs.Russian ? "/ru" : "") + path + source.Fragment);
            }
        };
        Shown += async (_, _) => await Start();
        FormClosed += (_, _) => { closed = true; if (companion != null) { prefs.Overlay = companion.Bounds; companion.Dispose(); } prefs.Save(); planner?.Dispose(); };
        Labels();
    }

    void Labels()
    {
        roster.Text = T("Персонажи", "Characters");
        serverChoice.Text = T("Сервер Gildra", "Gildra server");
        localChoice.Text = T("На моём ПК", "On my PC");
        mode.Text = prefs.Local ? localChoice.Text : serverChoice.Text;
        mode.ToolTipText = T("Где выполнять расчёт", "Where to run calculations");
        serverChoice.Checked = !prefs.Local; localChoice.Checked = prefs.Local;
        overlay.Text = T("Оверлей", "Overlay");
        overlay.Checked = companion?.Visible == true;
        overlay.ToolTipText = registered ? "Ctrl+Alt+G" : T("Переключить окно поверх игры", "Toggle always-on-top window");
        language.Text = prefs.Russian ? "EN" : "RU";
        language.ToolTipText = prefs.Russian ? "English" : "Русский";
        reload.Text = T("Обновить", "Reload");
    }
    void Status(string message) { notice.Text = message; notice.Visible = message.Length > 0; }
    async Task Start()
    {
        try {
            environment ??= await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDir, "Browser"));
            await SelectMode(prefs.Local);
        } catch (WebView2RuntimeNotFoundException) {
            Status(T("Для запуска установите Microsoft Edge WebView2 Runtime.", "Install Microsoft Edge WebView2 Runtime to start."));
        } catch { Status(T("Не удалось открыть приложение. Нажмите «Обновить».", "Could not open the app. Select Reload.")); }
    }
    async Task SelectMode(bool local)
    {
        if (environment == null || switching || closed) return;
        switching = true;
        try {
            var prior = active?.Source;
            var index = local ? 1 : 0;
            var view = views[index];
            if (local && view != null && planner?.IsRunning == false) {
                planner.Dispose(); planner = null;
                content.Controls.Remove(view); view.Dispose();
                if (active == view) active = null;
                views[index] = view = null;
            }
            if (view == null) {
                view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
                content.Controls.Add(view);
                try {
                    await view.EnsureCoreWebView2Async(environment);
                    if (local) { planner = new LocalPlanner(view.CoreWebView2); await planner.Install(); }
                    Configure(view, local);
                    views[index] = view;
                } catch { if (local) { planner?.Dispose(); planner = null; } content.Controls.Remove(view); view.Dispose(); throw; }
            }
            foreach (var other in views) if (other != null) other.Visible = other == view;
            active = view; view.BringToFront();
            prefs.Local = local; prefs.Save(); Labels(); Status("");
            var target = prior != null && LocalPlanner.OnSite(prior.AbsoluteUri) && prior.AbsolutePath.Contains("/wow/characters") ? prior.AbsoluteUri : RosterUrl;
            if (view.Source == null || view.Source.AbsoluteUri != target) view.Source = new Uri(target);
            view.Focus();
        } catch { Status(T("Не удалось открыть режим. Проверьте файлы приложения и повторите попытку.", "Could not open this mode. Check the app files and try again.")); }
        finally { switching = false; }
    }

    void Configure(WebView2 view, bool local)
    {
        var core = view.CoreWebView2;
        core.Settings.AreHostObjectsAllowed = false;
        core.Settings.IsWebMessageEnabled = local;
        core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        core.NavigationStarting += (_, e) => {
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var url) || !Allowed(url)) {
                e.Cancel = true;
                if (e.IsUserInitiated && url?.Scheme == "https") OpenExternal(url);
            }
        };
        core.NewWindowRequested += (_, e) => {
            e.Handled = true;
            if (e.IsUserInitiated && Uri.TryCreate(e.Uri, UriKind.Absolute, out var url) && url.Scheme == "https") {
                if (Allowed(url)) view.Source = url; else OpenExternal(url);
            }
        };
        core.SourceChanged += async (_, e) => {
            if (e.IsNewDocument) return;
            var source = view.Source;
            if (source == null || !LocalPlanner.OnSite(source.AbsoluteUri)) return;
            if (System.Text.RegularExpressions.Regex.IsMatch(source.AbsolutePath, @"^/(ru/)?wow/characters/[^/]+/?$") && source.Fragment.Length == 0)
                try { await core.ExecuteScriptAsync("if (!location.hash) location.hash='upgrades'"); } catch (InvalidOperationException) { }
        };
        core.NavigationCompleted += async (_, e) => {
            if (active != view || closed) return;
            if (!e.IsSuccess) { Status(T("Страница недоступна. Нажмите «Обновить».", "Page unavailable. Select Reload.")); return; }
            Status("");
            if (view.Source is {} url && LocalPlanner.OnSite(url.AbsoluteUri) && url.AbsolutePath.Contains("/wow/characters/")) {
                await core.ExecuteScriptAsync("if (!location.hash) location.hash='upgrades'");
                if (local && planner != null) {
                    try {
                        var response = await planner.Check();
                        if (active == view && !closed && response.Status != 200)
                            Status(response.Status == 401 ? T("Войдите в Battle.net для расчёта.", "Sign in to Battle.net to calculate.") :
                                T("Не удалось получить данные Gildra. Обновите страницу.", "Gildra data is unavailable. Reload the page."));
                    } catch { if (active == view && !closed) Status(T("Локальный движок недоступен.", "Local engine unavailable.")); }
                }
            }
        };
    }
    static bool Allowed(Uri u)
    {
        if (u.Scheme != "https" || !u.IsDefaultPort || u.UserInfo.Length > 0) return false;
        return u.Host is "wowarcana.com" or "gildra.net" or "battle.net" or "blizzard.com" ||
            u.Host.EndsWith(".battle.net", StringComparison.OrdinalIgnoreCase) || u.Host.EndsWith(".blizzard.com", StringComparison.OrdinalIgnoreCase);
    }
    static void OpenExternal(Uri url)
    {
        try { Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }
    void ToggleOverlay()
    {
        if (companion == null) {
            companion = new GearOverlay(() => active, () => prefs.Russian, () => {
                if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                Show(); Activate(); active?.Focus();
            });
            Rectangle area = Screen.FromControl(this).WorkingArea;
            Rectangle saved = prefs.Overlay;
            companion.Bounds = saved.Width >= 260 && saved.Height >= 170 && Screen.AllScreens.Any(s => s.WorkingArea.Contains(new Point(saved.X + 36, saved.Y + 18)))
                ? saved : new Rectangle(area.Right - 372, area.Top + 20, 352, Math.Min(500, area.Height - 40));
            companion.VisibleChanged += (_, _) => { overlay.Checked = companion.Visible; prefs.Overlay = companion.Bounds; prefs.Save(); };
        }
        if (companion.Visible) companion.Hide(); else companion.Show();
    }
    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); registered = RegisterHotKey(Handle, OverlayKey, 0x4003, (int)Keys.G); }
    protected override void OnHandleDestroyed(EventArgs e) { if (registered) UnregisterHotKey(Handle, OverlayKey); base.OnHandleDestroyed(e); }
    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0312 && message.WParam.ToInt32() == OverlayKey) { ToggleOverlay(); return; }
        base.WndProc(ref message);
    }
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, int key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
