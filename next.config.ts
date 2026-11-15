import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: process.env.APP_URL ? [new URL(process.env.APP_URL).hostname] : [],
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: { "/*": ["./public/brand/dabbat-logo.png"] },
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./.qa/**/*", "./.env*"] },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com https://*.myshopify.com https://admin.shopify.com https://accounts.shopify.com" }
    ] }];
  }
};
export default config;
