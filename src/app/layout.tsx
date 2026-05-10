import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

// Hall (K-v2) typography. Loaded via next/font for self-hosting + zero CLS.
// Exposed as CSS variables so Hall components can opt-in:
//   font-family: var(--font-hall-sans)
// Rest of the platform keeps Space Grotesk (loaded inside globals.css).
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hall-sans",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-hall-display",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-hall-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Common House — Client Portal",
  description: "Project intelligence platform",
  applicationName: "Common House",
  appleWebApp: {
    capable: true,
    title: "Common House",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
      >
        <body>
          {children}
          <RegisterServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}
