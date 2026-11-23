using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Collections.Generic;

namespace GildraLauncher {
    public class IndexedFile {
        public string path {get;set;}
        public string hash {get;set;}
        public long offset {get;set;}
        public long compressed {get;set;}
        public long size {get;set;}
        public bool reuse;
    }
    public partial class Updates {
        static string Digest(Stream input) {
            using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();
        }
        static bool Matches(string file, IndexedFile entry) {
            if(!File.Exists(file) || new FileInfo(file).Length!=entry.size) return false;
            using(var data=File.OpenRead(file)) return Digest(data)==entry.hash;
        }
        public async Task Plan(Build build) {
            long number;
            var current=Current(out number);
            if(current==null || number>=build.Number || build.Index==null) return;
            var bytes=await http.GetByteArrayAsync(build.Index.browser_download_url);
            using(var data=new MemoryStream(bytes))
                if("sha256:"+Digest(data)!=build.Index.digest) throw new InvalidDataException("Повреждён индекс обновления.");
            var files=new JavaScriptSerializer(){MaxJsonLength=16*1024*1024}.Deserialize<IndexedFile[]>(System.Text.Encoding.UTF8.GetString(bytes));
            string dir=Path.GetDirectoryName(current);
            long required=await Task.Run(()=> {
                var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                long total=0;
                foreach(var entry in files) {
                    if(String.IsNullOrEmpty(entry.path) || Array.Exists(entry.path.Split('/'),p=>p=="" || p=="." || p==".." || p.IndexOfAny(Path.GetInvalidFileNameChars())>=0) || !paths.Add(entry.path)
                        || entry.offset<0 || entry.size<0 || entry.compressed<=0 || entry.offset>build.Bytes-entry.compressed) throw new InvalidDataException("Некорректный индекс обновления.");
                    entry.reuse=Matches(Path.Combine(dir,entry.path),entry);
                    if(!entry.reuse) total+=entry.compressed;
                }
                return total;
            });
            build.BaseDir=dir; build.Files=files; build.Bytes=required;
        }
        public async Task Apply(Build build, Action<string> status) {
            if(build.Files==null) { await Download(build,status); return; }
            Directory.CreateDirectory(root);
            var stage=Path.Combine(root,".update-"+Guid.NewGuid().ToString("N"));
            var unpack=Path.Combine(stage,"app");
            Directory.CreateDirectory(unpack);
            try {
                long loaded=0;
                foreach(var entry in build.Files) {
                    string dest=Path.Combine(unpack,entry.path);
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    if(entry.reuse) File.Copy(Path.Combine(build.BaseDir,entry.path),dest);
                    else {
                        using(var req=new HttpRequestMessage(HttpMethod.Get,build.Url)) {
                            req.Headers.Range=new RangeHeaderValue(entry.offset,entry.offset+entry.compressed-1);
                            using(var res=await http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead)) {
                                var range=res.Content.Headers.ContentRange;
                                if(res.StatusCode!=HttpStatusCode.PartialContent || range==null || range.From!=entry.offset || range.To!=entry.offset+entry.compressed-1)
                                    throw new IOException("Сервер не выдал часть архива. Повторите обновление.");
                                using(var src=await res.Content.ReadAsStreamAsync())
                                using(var inflate=new DeflateStream(src,CompressionMode.Decompress))
                                using(var output=File.Create(dest)) await inflate.CopyToAsync(output);
                            }
                        }
                        loaded+=entry.compressed;
                        status("Загружено "+Size(loaded)+" из "+Size(build.Bytes));
                    }
                    if(!Matches(dest,entry)) throw new InvalidDataException("Файл изменился. Проверьте обновления повторно.");
                }
                Activate(stage,unpack,build);
            } finally { TryDelete(stage); }
        }
        public static string Size(long bytes) { return bytes<1048576 ? Math.Ceiling(bytes/1024d)+" КБ" : (bytes/1048576d).ToString("0.0")+" МБ"; }

        public string ManagedLauncher() {
            long n;
            string exe=Current(out n);
            if(exe==null || !String.Equals(Path.GetDirectoryName(exe),Installed(n),StringComparison.OrdinalIgnoreCase)) return null;
            string candidate=Path.Combine(Installed(n),"Gildra Gear Launcher.exe");
            return File.Exists(candidate) && !String.Equals(candidate,System.Windows.Forms.Application.ExecutablePath,StringComparison.OrdinalIgnoreCase) ? candidate : null;
        }
    }
}
