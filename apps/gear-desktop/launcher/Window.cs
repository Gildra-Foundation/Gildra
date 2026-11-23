using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;

using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GildraLauncher {
    class Window : Form {
        readonly Updates updates = new Updates(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Gildra Gear Launcher"),AppDomain.CurrentDomain.BaseDirectory);
        readonly Label installed = new Label(), status = new Label();
        readonly Bitmap castle=Art.Load("citadel"), action=Art.Load("action"), shield=Art.Load("shield");
        readonly Bitmap backdrop=new Bitmap(W,H);
        readonly IceButton play, update;
        readonly System.Windows.Forms.Timer animation=new System.Windows.Forms.Timer {Interval=50};
        readonly Stopwatch clock=new Stopwatch();
        readonly Font titleFont=new Font("Georgia",43,FontStyle.Regular,GraphicsUnit.Pixel);
        readonly Font chromeFont=new Font("Segoe UI Semibold",10);
        readonly Font barFont=new Font("Segoe UI",9);
        readonly Font nameFont=new Font("Segoe UI",12);
        const int W=816,H=466,Bar=42;
        Build latest;
        bool loading, installing;
        Window() {
            Text = "Gildra Gear · Лаунчер";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            AutoScaleMode = AutoScaleMode.None;
            FormBorderStyle = FormBorderStyle.None;
            ClientSize = new Size(W,H);
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            DoubleBuffered=true;
            Font = new Font("Segoe UI",10);
            var minimize=new CaptionButton(false); var close=new CaptionButton(true);
            minimize.SetBounds(W-88,1,42,Bar-2); close.SetBounds(W-46,1,45,Bar-2);
            minimize.Click+=(s,e)=>WindowState=FormWindowState.Minimized;
            close.Click+=(s,e)=>Close();
            Controls.Add(minimize); Controls.Add(close);
            installed.Font=nameFont; installed.ForeColor=Color.FromArgb(232,241,247);
            status.ForeColor=Color.FromArgb(180,204,222);
            installed.SetBounds(52,231,395,30);
            status.SetBounds(52,266,367,65);
            foreach(var label in new[]{installed,status}) {
                label.BackColor=Color.Transparent; Controls.Add(label);
            }
            using(var canvas=Graphics.FromImage(backdrop)) DrawBackdrop(canvas);
            play=new IceButton(action,backdrop); update=new IceButton(action,backdrop);
            play.Text="Запустить"; play.SetBounds(46,368,264,51);
            update.SetBounds(326,368,264,51);
            play.TabIndex=0;update.TabIndex=1;minimize.TabIndex=2;close.TabIndex=3;
            Controls.Add(play); Controls.Add(update);
            clock.Start();
            animation.Tick+=(s,e)=>Invalidate(new Rectangle(426,Bar+1,W-427,H-Bar-2));
            VisibleChanged+=(s,e)=>Animate();
            Resize+=(s,e)=>Animate();
            Microsoft.Win32.SystemEvents.UserPreferenceChanged+=PreferencesChanged;
            play.Click += (s,e) => { try { updates.Launch(); Close(); } catch(Exception ex) { status.Text=ex.Message; } };
            update.Click += async (s,e) => { if (latest == null) await Check(); else await Install(); };
            Shown += async (s,e) => await Check();
            FormClosing += (s,e) => { if(installing) e.Cancel=true; };
        }
        void Animate() {
            animation.Enabled=Visible && WindowState!=FormWindowState.Minimized && SystemInformation.UIEffectsEnabled && !SystemInformation.HighContrast;
        }
        void PreferencesChanged(object sender,Microsoft.Win32.UserPreferenceChangedEventArgs e) {
            if(IsHandleCreated && !IsDisposed) BeginInvoke(new Action(Animate));
        }
        protected override void Dispose(bool disposing) {
            if(disposing) {
                Microsoft.Win32.SystemEvents.UserPreferenceChanged-=PreferencesChanged;
                animation.Dispose(); backdrop.Dispose(); castle.Dispose(); action.Dispose(); shield.Dispose();
                titleFont.Dispose(); chromeFont.Dispose(); barFont.Dispose(); nameFont.Dispose();
            }
            base.Dispose(disposing);
        }
        protected override void WndProc(ref Message m) {
            base.WndProc(ref m);
            if(m.Msg==0x84 && m.Result==(IntPtr)1) {
                long coords=m.LParam.ToInt64();
                Point p=PointToClient(new Point((short)coords,(short)(coords>>16)));
                if(p.Y>=0 && p.Y<Bar && p.X<W-88) m.Result=(IntPtr)2;
            }
        }
        protected override void OnPaintBackground(PaintEventArgs e) {
            var g=e.Graphics;
            if(castle==null) { base.OnPaintBackground(e); return; }
            g.DrawImageUnscaled(backdrop,0,0);
            if(e.ClipRectangle.Right>426) {
                double t=clock.Elapsed.TotalSeconds;
                g.SmoothingMode=SmoothingMode.AntiAlias;
                for(int i=0;i<45;i++) {
                    float x=(float)(429+(i*97 + 40*Math.Sin(t*.15+i) + t*(4+i%5))%426);
                    float y=(float)(Bar+(i*61+t*(7+i%10))%(H-Bar));
                    if(x<427) continue;
                    int alpha=(int)(70+56*Math.Sin(t*.8+i*2));
                    using(var brush=new SolidBrush(Color.FromArgb(alpha,205,237,255))) {
                        float size=1+i%3*.48f; g.FillEllipse(brush,x,y,size,size);
                    }
                }
            }
        }
        void DrawBackdrop(Graphics g) {
            g.InterpolationMode=InterpolationMode.HighQualityBilinear;
            g.DrawImage(castle,new Rectangle(0,Bar,W,H-Bar),0,0,castle.Width,castle.Height,GraphicsUnit.Pixel);
            var scene=new Rectangle(0,Bar,W,H-Bar);
            using(var shade=new LinearGradientBrush(scene,Color.FromArgb(218,5,15,24),Color.FromArgb(4,5,15,24),0f))
                g.FillRectangle(shade,scene);
            using(var shade=new LinearGradientBrush(scene,Color.Transparent,Color.FromArgb(136,5,14,23),90f))
                g.FillRectangle(shade,scene);
            using(var header=new LinearGradientBrush(new Rectangle(0,0,W,Bar),Color.FromArgb(15,31,44),Color.FromArgb(15,28,40),0f))
                g.FillRectangle(header,0,0,W,Bar);
            using(var edge=new Pen(Color.FromArgb(82,115,137))) {
                g.DrawRectangle(edge,0,0,W-1,H-1);
                g.DrawLine(edge,0,Bar,W-1,Bar);
            }
            g.DrawImage(shield,16,6,29,29);
            g.DrawString("Gildra Gear",chromeFont,Brushes.WhiteSmoke,49,10);
            using(var dim=new SolidBrush(Color.FromArgb(166,191,209))) {
                g.DrawString("Лаунчер",barFont,dim,139,12);
                g.DrawLine(Pens.SlateGray,129,14,129,28);
            }
            g.DrawImage(shield,49,94,59,59);
            g.DrawString("Gildra Gear",titleFont,Brushes.WhiteSmoke,47,156);
            using(var rule=new LinearGradientBrush(new Rectangle(51,219,270,1),Color.FromArgb(176,168,206,223),Color.Transparent,0f))
                g.FillRectangle(rule,51,219,270,1);
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
                await updates.Plan(latest);
                if(IsDisposed) return;
                long n; updates.Current(out n);
                status.Text=n>=latest.Number ? "У вас актуальная версия." : "Доступна сборка " + latest.Number + " · " + Updates.Size(latest.Bytes);
            } catch(Exception ex) { if(!IsDisposed) status.Text="Не удалось проверить обновления. " + ex.Message; }
            finally { loading=false; if(!IsDisposed) RefreshState(); }
        }
        async Task Install() {
            installing=true; RefreshState(); status.Text="Подключение…";
            try {
                await Task.Run(()=>updates.Apply(latest, msg => BeginInvoke(new Action(() => status.Text=msg))));
                restart=updates.ManagedLauncher();
                status.Text="Готово к запуску."; latest=null;
            } catch(Exception ex) { latest=null;status.Text="Ошибка обновления. " + ex.Message; }
            finally { installing=false; RefreshState(); if(restart!=null) Close(); }
        }
        [STAThread]
        static void Main() {
            using(var mutex=new Mutex(true,@"Local\GildraGearLauncher-620e27",out acquired)) {
                if(!acquired) { MessageBox.Show("Лаунчер уже открыт.","Gildra Gear"); return; }
                ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                using(var window=new Window()) {
                    restart=window.updates.ManagedLauncher();
                    if(restart==null) Application.Run(window);
                }
            }
            if(restart!=null) Process.Start(restart);
        }
        static string restart;
        static bool acquired;
    }
}
