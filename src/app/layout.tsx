import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
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
        </body>
      </html>
    </ClerkProvider>
  );
}
