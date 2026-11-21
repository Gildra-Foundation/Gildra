using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace Gildra.Gear;

internal record Reply(int Status, string Body);
internal sealed class LocalPlanner : IDisposable
{
    public const string Site = "https://wowarcana.com";
    static readonly HashSet<string> Routes = new() { "/api/wow/gear-farm-plans", "/api/wow/auction-gear-plans", "/api/wow/auction-shopping-list" };
    static readonly Reply Unavailable = new(503, """{"error":"desktop_unavailable"}""");
    readonly CoreWebView2 web;
    readonly string readScript;
    readonly Process child;
    readonly ConcurrentDictionary<string, TaskCompletionSource<Reply>> requests = new();
    readonly Dictionary<string, TaskCompletionSource<Reply>> reads = new();
    readonly SemaphoreSlim writer = new(1, 1);
    readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly SynchronizationContext ui;
    readonly CancellationTokenSource lifetime = new();

    public LocalPlanner(CoreWebView2 browser)
    {
        web = browser;
        ui = SynchronizationContext.Current ?? throw new InvalidOperationException();
        readScript = Script("read-data.js");
        var dir = Path.Combine(AppContext.BaseDirectory, "runtime");
        var psi = new ProcessStartInfo(Path.Combine(dir, "node.exe")) {
            WorkingDirectory = dir, UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true,
            StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = new UTF8Encoding(false)
        };
        psi.ArgumentList.Add(Path.Combine(dir, "planner.mjs"));
        psi.Environment.Remove("NODE_OPTIONS");
        psi.Environment["GILDRA_AUCTION_STATE_DIR"] = Path.Combine(Program.DataDir, "checkpoints");
        child = Process.Start(psi) ?? throw new InvalidOperationException();
        foreach (var path in Routes) web.AddWebResourceRequestedFilter(Site + path + "*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.Document);
        web.WebResourceRequested += BlockUnexpectedTransport;
        web.WebMessageReceived += ReceiveData;
        _ = Listen();
    }

    static string Script(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(n => n.EndsWith("." + name)))!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
    public Task<string> Install() => web.AddScriptToExecuteOnDocumentCreatedAsync(Script("local-transport.js"));

    public bool IsRunning => !child.HasExited;
    public static bool OnSite(string? source) => Uri.TryCreate(source, UriKind.Absolute, out var url) && url.GetLeftPart(UriPartial.Authority) == Site;

    async Task Write(object packet)
    {
        await writer.WaitAsync(lifetime.Token);
        try { await child.StandardInput.WriteLineAsync(JsonSerializer.Serialize(packet)); await child.StandardInput.FlushAsync(); }
        finally { writer.Release(); }
    }
    async Task Listen()
    {
        try {
            while (await child.StandardOutput.ReadLineAsync(lifetime.Token).ConfigureAwait(false) is { } line) {
                using var doc = JsonDocument.Parse(line);
                var msg = doc.RootElement;
                var type = msg.GetProperty("type").GetString();
                if (type == "ready") { ready.TrySetResult(); continue; }
                string id = msg.GetProperty("id").GetString()!;
                if (type == "response" && requests.TryRemove(id, out var source))
                    source.TrySetResult(new(msg.GetProperty("status").GetInt32(), msg.GetProperty("body").GetString()!));
                if (type == "read") {
                    var query = msg.GetProperty("query").GetString()!;
                    ui.Post(async _ => {
                        try {
                            var answer = await Read(query);
                            await Write(new { type = "data", id, status = answer.Status, body = answer.Body });
                        } catch { /* Process has closed. */ }
                    }, null);
                }
            }
        } catch (Exception) when (lifetime.IsCancellationRequested || child.HasExited) { }
        finally {
            ready.TrySetException(new IOException("Local engine stopped"));
            foreach (var source in requests.Values) source.TrySetResult(Unavailable);
        }
    }
    void ReceiveData(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!OnSite(args.Source) || !OnSite(web.Source)) return;
        try {
            using var doc = JsonDocument.Parse(args.WebMessageAsJson);
            var msg = doc.RootElement;
            if (msg.ValueKind != JsonValueKind.Object || !msg.TryGetProperty("id", out var key) || key.ValueKind != JsonValueKind.String ||
                key.GetString() is not {} id) return;
            if (msg.TryGetProperty("type", out var type)) {
                if (type.GetString() == "gear-request") _ = Forward(id, msg.Clone());
                else if (type.GetString() == "gear-cancel" && requests.TryGetValue(id, out var running)) running.TrySetCanceled();
                return;
            }
            if (!reads.TryGetValue(id, out var source)) return;
            int status = msg.GetProperty("status").GetInt32();
            string? body = msg.GetProperty("body").GetString();
            if (status is >= 200 and <= 599 && body != null) source.TrySetResult(new(status, body));
        } catch (Exception ex) when (ex is JsonException or InvalidOperationException or KeyNotFoundException) { }
    }
    async Task<Reply> Read(string query)
    {
        if (!OnSite(web.Source)) return new(401, """{"error":"session_expired"}""");
        var id = Guid.NewGuid().ToString("N");
        var result = new TaskCompletionSource<Reply>(TaskCreationOptions.RunContinuationsAsynchronously);
        reads.Add(id, result);
        try {
            var payload = JsonSerializer.Serialize(new { id, query });
            await web.ExecuteScriptAsync($"void ({readScript})({payload})");
            return await result.Task.WaitAsync(TimeSpan.FromSeconds(48), lifetime.Token);
        } catch { return Unavailable; }
        finally { reads.Remove(id); }
    }
    public async Task<Reply> Check()
    {
        await ready.Task.WaitAsync(TimeSpan.FromSeconds(20), lifetime.Token);
        return await Read("read=session");
    }
    // Future site code using another transport must never submit local work to the cloud.
    void BlockUnexpectedTransport(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        var url = new Uri(args.Request.Uri);
        if (OnSite(args.Request.Uri) && Routes.Contains(url.AbsolutePath))
            args.Response = web.Environment.CreateWebResourceResponse(new MemoryStream("{}"u8.ToArray()), 503,
                "Local transport required", "Content-Type: application/json\r\nCache-Control: no-store");
    }

    async Task Forward(string id, JsonElement packet)
    {
        if (!Guid.TryParseExact(id, "D", out _) || !OnSite(web.Source)) return;
        var result = new TaskCompletionSource<Reply>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!requests.TryAdd(id, result)) return;
        Reply reply = Unavailable;
        try {
            var path = packet.GetProperty("path").GetString()!;
            var method = packet.GetProperty("method").GetString()!;
            var body = packet.GetProperty("body").GetString();
            if (path.Length > 8192 || !Uri.TryCreate(new Uri(Site), path, out var uri) ||
                !OnSite(uri.AbsoluteUri) || !Routes.Contains(uri.AbsolutePath) || method is not ("GET" or "DELETE" or "POST"))
                reply = new(400, """{"error":"invalid_request"}""");
            else if (body != null && Encoding.UTF8.GetByteCount(body) > 4 * 1024 * 1024)
                reply = new(413, """{"error":"request_too_large"}""");
            else {
                await ready.Task.WaitAsync(TimeSpan.FromSeconds(20), lifetime.Token);
                await Write(new { type = "request", id, method, path = uri.PathAndQuery, body });
                reply = await result.Task.WaitAsync(TimeSpan.FromSeconds(210), lifetime.Token);
            }
        } catch {
            if (!lifetime.IsCancellationRequested) try { await Write(new { type = "cancel", id }); } catch { }
        } finally {
            requests.TryRemove(id, out _);
            if (!lifetime.IsCancellationRequested && OnSite(web.Source))
                web.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "gear-response", id, status = reply.Status, body = reply.Body }));
        }
    }
    public void Dispose()
    {
        web.WebResourceRequested -= BlockUnexpectedTransport;
        web.WebMessageReceived -= ReceiveData;
        lifetime.Cancel();
        try { if (!child.HasExited) child.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
    }
}
