import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, Noto_Sans_JP } from "next/font/google";

import "./globals.css";

/**
 * Three faces, each with one job:
 *  - Instrument Serif: editorial display type (masthead, restaurant names)
 *  - Inter:            UI and body Latin text
 *  - Noto Sans JP:     all Japanese text, selected automatically via lang="ja"
 *
 * Noto Sans JP is not preloaded: its Japanese ranges are large, and Google
 * serves them split by unicode-range so only the needed slices are fetched.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Fiyu — Tokyo restaurant discovery",
    template: "%s — Fiyu",
  },
  description:
    "Discover authentic, independent, underexposed restaurants in Tokyo, scored and explained.",
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
