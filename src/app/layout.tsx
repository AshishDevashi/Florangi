import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const headingFont = localFont({
  src: "./fonts/cormorant-garamond-latin.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--font-cormorant",
});

const bodyFont = localFont({
  src: "./fonts/manrope-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Florangi | Occasionwear, made personal",
  description: "Designer and made-to-measure dresses from Florangi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
