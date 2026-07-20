import type { NextConfig } from "next";

// Wave 2 hardening: security headers on every response.
//
// The audit found that HTML routes under /admin/* and /hall/* had zero
// security headers, leaving the portal exposed to clickjacking, MIME-sniffing,
// reflected XSS amplification, and HSTS downgrade. vercel.json applied only
// X-Frame-Options + nosniff to /api/* — not enough.
//
// CSP design notes
//   - 'unsafe-inline' is required for Next/Tailwind's runtime style injection.
//   - 'unsafe-eval' is unavoidable because Tailwind v4 / some Next dev paths
//     require it; revisit when those drop the dependency.
//   - Clerk needs script + frame on its accounts subdomains.
//   - Supabase storage signed URLs live on *.supabase.co (img + connect).
//   - frame-ancestors 'none' replaces X-Frame-Options for modern browsers and
//     covers HTML pages (the prior X-Frame-Options DENY in vercel.json only
//     applied under /api/*).
//   - Anthropic + Notion calls happen server-side only, so they don't need
//     connect-src grants.
// frameAncestors: 'none' everywhere except the gated proposal-deck route
// (/proposal-deck/<slug>/*), which the room embeds same-origin in a preview
// iframe. 'self' keeps external framing (clickjacking) blocked. The deck bytes
// live in a private deck-content/ dir (never public/) and are served only
// through the Client-Room-authorised route handler.
function buildCsp(frameAncestors: string) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.wearecommonhouse.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.accounts.dev https://*.clerk.com https://clerk.wearecommonhouse.com",
    "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
    `frame-ancestors ${frameAncestors}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const baseHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), serial=()" },
];

const securityHeaders = [
  ...baseHeaders,
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: buildCsp("'none'") },
];

// Embeddable decks: same-origin framing allowed so the client room can preview
// them inline. SAMEORIGIN + frame-ancestors 'self' still block external embeds.
const embeddableHeaders = [
  ...baseHeaders,
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: buildCsp("'self'") },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The proposal-deck route reads bundle files from deck-content/ at runtime.
  // Force-include that dir in the route's serverless function so the files ship
  // with the deployment (they are outside public/, so tracing won't add them
  // automatically).
  // Key is a picomatch route glob: use "**" rather than the literal
  // "[slug]/[[...asset]]" (unescaped brackets would be read as a character class
  // and silently fail to match, leaving the deck files out of the bundle).
  outputFileTracingIncludes: {
    "/proposal-deck/**": ["./deck-content/**/*"],
  },
  async headers() {
    return [
      { source: "/proposal-deck/:path*", headers: embeddableHeaders },
      { source: "/((?!proposal-deck/).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
