import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, Noto_Sans_JP } from "next/font/google";

import { SiteFooter, SiteHeader } from "@/components/layout/SiteHeader";

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
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {/*
         * The masthead lives in the layout, outside the page's Suspense
         * boundary, so it renders once and stays put while the page content
         * loads. Rendering it in both page.tsx and loading.tsx would emit two
         * <h1> elements into the prerendered HTML.
         */}
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
