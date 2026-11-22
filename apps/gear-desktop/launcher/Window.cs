using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GildraLauncher {
    class Window : Form {
        readonly Updates updates = new Updates(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Gildra Gear Launcher"),AppDomain.CurrentDomain.BaseDirectory);
        readonly Label installed = new Label(), status = new Label();
        readonly Button play = new Button(), update = new Button();
        Build latest;
        bool loading, installing;
        Window() {
            Text = "Gildra Gear · Лаунчер";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            ClientSize = new Size(520,270);
            AutoScaleMode = AutoScaleMode.Dpi;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(17,27,38);
            ForeColor = Color.WhiteSmoke;
            Font = new Font("Segoe UI",10);
            var rail = new Panel{BackColor=Color.FromArgb(112,193,201)};
            rail.SetBounds(0,0,520,3); Controls.Add(rail);
            var title = new Label{Text="Gildra Gear",Font=new Font("Georgia",30,FontStyle.Bold)};
            title.SetBounds(26,22,470,57); Controls.Add(title);
            installed.SetBounds(30,87,460,28); Controls.Add(installed);
            status.ForeColor = Color.LightSteelBlue;
            status.SetBounds(30,119,466,65); Controls.Add(status);
            ButtonStyle(play,"Запустить",30,Color.FromArgb(138,211,216),Color.FromArgb(12,33,42));
            ButtonStyle(update,"Проверить обновления",237,Color.FromArgb(45,63,80),Color.WhiteSmoke);
            play.Click += (s,e) => { try { updates.Launch(); Close(); } catch(Exception ex) { status.Text=ex.Message; } };
            update.Click += async (s,e) => { if (latest == null) await Check(); else await Install(); };
            Shown += async (s,e) => await Check();
            FormClosing += (s,e) => { if(installing) e.Cancel=true; };
        }
        void ButtonStyle(Button button,string caption,int x,Color bg,Color fg) {
            button.Text=caption; button.BackColor=bg; button.ForeColor=fg;
            button.FlatStyle=FlatStyle.Flat; button.FlatAppearance.BorderSize=0;
            button.SetBounds(x,196,x==30?193:252,45); Controls.Add(button);
        }
        void RefreshState() {
            long number; bool present=updates.Current(out number)!=null;
            installed.Text = present ? (number>0 ? "Установлена сборка " + number : "Найдена переносная копия") : "Приложение ещё не установлено";
            play.Enabled=present && !installing; update.Enabled=!loading && !installing;
            if(latest!=null && latest.Number<=number) latest=null;
            update.Text=latest==null ? "Проверить обновления" : present ? "Обновить" : "Установить";
        }
        async Task Check() {
            loading=true; RefreshState(); status.Text="Проверяем обновления…";
            try {
                latest=await Updates.Latest();
                if(IsDisposed) return;
                long n; updates.Current(out n);
                status.Text=n>=latest.Number ? "У вас актуальная версия." : "Доступна сборка " + latest.Number + ".";
            } catch(Exception ex) { if(!IsDisposed) status.Text="Не удалось проверить обновления. " + ex.Message; }
            finally { loading=false; if(!IsDisposed) RefreshState(); }
        }
        async Task Install() {
            installing=true; RefreshState(); status.Text="Подключение…";
            try {
                await updates.Download(latest, msg => BeginInvoke(new Action(() => status.Text=msg)));
                status.Text="Готово к запуску."; latest=null;
            } catch(Exception ex) { status.Text="Ошибка обновления. " + ex.Message; }
            finally { installing=false; RefreshState(); }
        }
        [STAThread]
        static void Main() {
            using(var mutex=new Mutex(true,@"Local\GildraGearLauncher-620e27",out acquired)) {
                if(!acquired) { MessageBox.Show("Лаунчер уже открыт.","Gildra Gear"); return; }
                ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new Window());
            }
        }
        static bool acquired;
    }
}
