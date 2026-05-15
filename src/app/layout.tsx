import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

// KaTeX + highlight.js CSS used to live here. They are render-blocking
// (~30KB combined) and only matter on pages that render problem markdown,
// so they're now imported in the route segments that need them
// (src/app/admin/problems/layout.tsx). Login / landing don't pay the cost.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for display headings. Picked Instrument Serif —
// distinctive italic, mathematical-journal feel, far from generic.
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sadikov Kamal — Isbotga yo'l",
  description:
    "Sadikov Kamal — O'zbekiston matematika olimpiadasi masalalari ma'lumotlar bazasi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uz"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
