using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using GildraLauncher;

class Test {
    static byte[] Package(long version) {
        using(var data=new MemoryStream()) {
            using(var zip=new ZipArchive(data,ZipArchiveMode.Create,true)) {
                foreach(string path in new[]{"resources/app/package.json","resources/app/main.cjs","runtime/node.exe","runtime/simc.exe","runtime/gear-engine.exe","runtime/planner.mjs","gear-build.txt"})
                    using(var writer=new StreamWriter(zip.CreateEntry(path).Open())) writer.Write(version);
                zip.CreateEntryFromFile(Environment.GetCommandLineArgs()[0],"Gildra Gear.exe");
            }
            return data.ToArray();
        }
    }
    static Build Describe(long n,byte[] data) {
        using(var sha=SHA256.Create()) return new Build{Number=n,Hash=BitConverter.ToString(sha.ComputeHash(data)).Replace("-","")};
    }
    static int Main() {
        if(Path.GetFileName(Environment.GetCommandLineArgs()[0])=="Gildra Gear.exe") {
            File.WriteAllText("started","ok"); return 0;
        }
        string root=Path.Combine(Path.GetTempPath(),Guid.NewGuid().ToString());
        Directory.CreateDirectory(root);
        try {
            var u=new Updates(root,root);
            var old=Package(1); var next=Package(2); var build=Describe(2,next);
            u.Install(Describe(1,old),new MemoryStream(old),old.Length,s=>{});
            foreach(var bad in new[]{new byte[10],old}) {
                try { u.Install(build,new MemoryStream(bad),next.Length,s=>{}); throw new Exception("Accepted corrupt archive"); }
                catch(InvalidDataException) {}
                long n; if(u.Current(out n)==null || n!=1) throw new Exception("Lost previous version");
            }
            u.Install(build,new MemoryStream(next),next.Length,s=>{});
            long current; string exe=u.Current(out current);
            if(current!=2) throw new Exception("Update not activated");
            u.Launch();
            for(int i=0;i<100 && !File.Exists(Path.Combine(Path.GetDirectoryName(exe),"started"));i++) System.Threading.Thread.Sleep(50);
            if(!File.Exists(Path.Combine(Path.GetDirectoryName(exe),"started"))) throw new Exception("Launch failed");
            return 0;
        } finally { Directory.Delete(root,true); }
    }
}
