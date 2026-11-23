using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace GildraLauncher {
    static class Art {
        public static Bitmap Load(string name) {
            using(var stream=typeof(Art).Assembly.GetManifestResourceStream(name))
            using(var original=new Bitmap(stream)) return new Bitmap(original);
        }
    }
    sealed class IceButton : Button {
        readonly Image image;
        bool hover, pressed;
        public IceButton(Image image) {
            this.image=image;
            SetStyle(ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer,true);
            FlatStyle=FlatStyle.Flat;
            BackColor=Color.Transparent;
            ForeColor=Color.FromArgb(228,242,251);
            Font=new Font("Segoe UI Semibold",11);
            Cursor=Cursors.Hand;
        }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hover=true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover=pressed=false; Invalidate(); }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); pressed=true; Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); pressed=false; Invalidate(); }
        protected override void OnPaint(PaintEventArgs e) {
            var g=e.Graphics;
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;
            Rectangle dest=ClientRectangle;
            if(pressed) dest.Inflate(-2,-1);
            float brightness=!Enabled ? .76f : hover || Focused ? 1.35f : 1f;
            using(var effect=new ImageAttributes()) {
                var tint=new ColorMatrix();
                tint.Matrix00=tint.Matrix11=tint.Matrix22=brightness;
                effect.SetColorMatrix(tint);
                g.DrawImage(image,dest,0,0,image.Width,image.Height,GraphicsUnit.Pixel,effect);
            }
            TextRenderer.DrawText(g,Text,Font,dest,Enabled?ForeColor:Color.FromArgb(165,178,188),
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
            if(Focused && ShowFocusCues) {
                dest.Inflate(-Width/6,-Height/4);
                ControlPaint.DrawFocusRectangle(g,dest,Color.White,Color.FromArgb(16,40,53));
            }
        }
    }
    sealed class CaptionButton : Button {
        readonly bool close;
        bool hover;
        public CaptionButton(bool close) {
            this.close=close;
            AccessibleName=close?"Закрыть":"Свернуть";
            FlatStyle=FlatStyle.Flat; BackColor=Color.FromArgb(15,28,40);
            SetStyle(ControlStyles.OptimizedDoubleBuffer,true);
        }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hover=true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover=false; Invalidate(); }
        protected override void OnPaint(PaintEventArgs e) {
            var g=e.Graphics;
            g.Clear(hover || Focused ? (close?Color.FromArgb(104,48,57):Color.FromArgb(32,55,72)) : BackColor);
            g.SmoothingMode=SmoothingMode.AntiAlias;
            int x=Width/2,y=Height/2;
            using(var pen=new Pen(Color.FromArgb(206,224,236),1.35f)) {
                if(close) { g.DrawLine(pen,x-4,y-4,x+4,y+4); g.DrawLine(pen,x+4,y-4,x-4,y+4); }
                else g.DrawLine(pen,x-5,y+2,x+5,y+2);
            }
        }
    }
}
