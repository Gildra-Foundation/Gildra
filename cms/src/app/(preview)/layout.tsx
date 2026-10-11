import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa", color: "#1b1b1b" }}>{children}</body>
    </html>
  );
}
