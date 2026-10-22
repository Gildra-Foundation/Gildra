import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import path from "node:path";

const baseline = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const framing = (value: "DENY" | "SAMEORIGIN", ancestors: "'none'" | "'self'") => [
  { key: "X-Frame-Options", value },
  { key: "Content-Security-Policy", value: `frame-ancestors ${ancestors}` },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The CMS stack is not advertised (was "x-powered-by: Next.js, Payload").
  poweredByHeader: false,
  images: {
    localPatterns: [{ pathname: "/api/media/file/**" }],
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async headers() {
    return [
      // The CMS is never framed by other origins. Only the CMS's own draft
      // preview may be embedded, and only by the admin on the same origin.
      { source: "/:path*", headers: [...baseline, ...framing("DENY", "'none'")] },
      { source: "/preview/:path*", headers: framing("SAMEORIGIN", "'self'") },
    ];
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
