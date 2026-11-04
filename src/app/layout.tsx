import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Florangi | Occasionwear, made personal",
  description: "Designer and made-to-measure dresses from Florangi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
