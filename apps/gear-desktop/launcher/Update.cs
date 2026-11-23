using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace GildraLauncher {
    public class Asset {
        public long size { get; set; }
        public string name { get; set; }
        public string digest { get; set; }
        public string browser_download_url { get; set; }
    }
    public class Release {
        public string tag_name { get; set; }
        public bool draft { get; set; }
        public bool prerelease { get; set; }
        public Asset[] assets { get; set; }
    }
    public class Build {
        public long Number;
        public string Hash, Url;
        public long Bytes;
        public Asset Index;
        public IndexedFile[] Files;
        public string BaseDir;
    }
    public partial class Updates {
        const string Repo = "Gildra-Foundation/Gildra";
        const string Prefix = "gear-desktop-build-";
        const string Package = "Gildra-Gear-Windows-x64.zip";
        const string Exe = "Gildra Gear.exe";
        readonly string root, portable;
        static readonly HttpClient http = Client();
        static HttpClient Client() {
            var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Gildra-Gear-Launcher/1");
            client.Timeout = TimeSpan.FromMinutes(10);
            return client;
        }
        public Updates(string root, string portable) { this.root = root; this.portable = portable; }
        static bool Complete(string dir) {
            foreach (string name in new[]{Exe, "resources/app/main.cjs", "resources/app/package.json", "runtime/node.exe", "runtime/gear-engine.exe", "runtime/simc.exe", "runtime/planner.mjs"})
                if (!File.Exists(Path.Combine(dir, name))) return false;
            return true;
        }
        string Installed(long number) { return Path.Combine(root, "build-" + number); }
        public string Current(out long number) {
            number = 0;
            string active = Path.Combine(root, "active");
            if (File.Exists(active) && long.TryParse(File.ReadAllText(active), out number) && number > 0 && Complete(Installed(number)))
                return Path.Combine(Installed(number), Exe);
            number = 0;
            if (!Complete(portable)) return null;
            string marker = Path.Combine(portable,"gear-build.txt");
            if (File.Exists(marker)) long.TryParse(File.ReadAllText(marker), out number);
            return Path.Combine(portable, Exe);
        }
        public void Launch() {
            long version;
            string exe = Current(out version);
            if (exe == null) throw new FileNotFoundException("Сначала установите Gildra Gear.");
            Process.Start(new ProcessStartInfo(exe){WorkingDirectory = Path.GetDirectoryName(exe)});
        }
        public static async Task<Build> Latest() {
            for (int page = 1; ; page++) {
                string body = await http.GetStringAsync("https://api.github.com/repos/" + Repo + "/releases?per_page=100&page=" + page);
                var releases = new JavaScriptSerializer(){MaxJsonLength=16*1024*1024}.Deserialize<Release[]>(body);
                foreach (var r in releases) {
                    long version;
                    if (r.draft || r.prerelease || !r.tag_name.StartsWith(Prefix) || !long.TryParse(r.tag_name.Substring(Prefix.Length),out version) || version <= 0) continue;
                    string url = "https://github.com/" + Repo + "/releases/download/" + r.tag_name + "/" + Package;
                    foreach (var a in r.assets)
                        if (a.name == Package && a.browser_download_url == url && a.digest != null && System.Text.RegularExpressions.Regex.IsMatch(a.digest,"^sha256:[a-fA-F0-9]{64}$"))
                            return new Build{Number=version, Url=url, Hash=a.digest.Substring(7), Bytes=a.size,
                                Index=Array.Find(r.assets,f=>f.name=="gear-files.json" && f.browser_download_url==url.Replace(Package,"gear-files.json") && f.digest!=null && f.digest.StartsWith("sha256:"))};
                }
                if (releases.Length < 100) throw new IOException("Опубликованная сборка пока недоступна.");
            }
        }
        public async Task Download(Build build, Action<string> status) {
            using (var response = await http.GetAsync(build.Url,HttpCompletionOption.ResponseHeadersRead)) {
                response.EnsureSuccessStatusCode();
                using (var source = await response.Content.ReadAsStreamAsync())
                    await Task.Run(() => Install(build, source, response.Content.Headers.ContentLength, status));
            }
        }
        public void Install(Build build, Stream source, long? length, Action<string> status) {
            Directory.CreateDirectory(root);
            string stage = Path.Combine(root, ".update-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stage);
            try {
                string zip = Path.Combine(stage, "download.zip"), unpack = Path.Combine(stage,"app");
                using (var file = File.Create(zip))
                using (var hash = SHA256.Create()) {
                    byte[] buffer = new byte[131072];
                    int count; long total = 0; var timer = Stopwatch.StartNew();
                    while ((count = source.Read(buffer,0,buffer.Length)) > 0) {
                        file.Write(buffer,0,count);
                        hash.TransformBlock(buffer,0,count,buffer,0);
                        total += count;
                        if (timer.ElapsedMilliseconds > 200) {
                            status("Загрузка · " + total/1048576 + (length.HasValue ? " из " + length.Value/1048576 : "") + " МБ");
                            timer.Restart();
                        }
                    }
                    hash.TransformFinalBlock(buffer,0,0);
                    if ((length.HasValue && total != length.Value) || !String.Equals(BitConverter.ToString(hash.Hash).Replace("-",""),build.Hash,StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("Архив скачан не полностью или повреждён. Повторите загрузку.");
                }
                status("Распаковка обновления…");
                ZipFile.ExtractToDirectory(zip,unpack);
                Activate(stage,unpack,build);
            } finally { TryDelete(stage); }
        }
        void Activate(string stage,string unpack,Build build) {
                if (!Complete(unpack) || File.ReadAllText(Path.Combine(unpack,"gear-build.txt")).Trim() != build.Number.ToString())
                    throw new InvalidDataException("Состав сборки не прошёл проверку.");
                string target = Installed(build.Number);
                if (!Directory.Exists(target)) Directory.Move(unpack,target);
                if (!Complete(target)) throw new InvalidDataException("Установленная сборка повреждена.");
                string pointer = Path.Combine(stage,"active"), active = Path.Combine(root,"active");
                File.WriteAllText(pointer,build.Number.ToString());
                if (File.Exists(active)) File.Replace(pointer,active,null);
                else File.Move(pointer,active);
                // Keep the previous version in case another process still uses it.
                long previous = 0;
                foreach (string dir in Directory.GetDirectories(root,"build-*")) {
                    long n;
                    if (long.TryParse(Path.GetFileName(dir).Substring(6),out n) && n < build.Number) previous = Math.Max(previous,n);
                }
                foreach (string dir in Directory.GetDirectories(root,"build-*")) {
                    long n;
                    if (long.TryParse(Path.GetFileName(dir).Substring(6),out n) && n < previous) TryDelete(dir);
                }
        }
        static void TryDelete(string dir) {
            try { Directory.Delete(dir,true); } catch(IOException) {} catch(UnauthorizedAccessException) {}
        }
    }
}
