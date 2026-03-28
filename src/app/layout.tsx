import type { Metadata } from "next";
import { DM_Sans, Rajdhani, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
  display: "swap",
});

const shareTechMono = Share_Tech_Mono({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-share-tech",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Helium Hero — Learn About Helium",
  description:
    "Educational chat with Helium Hero: the element helium (He) for students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rajdhani.variable} ${shareTechMono.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--bg)] font-[family-name:var(--font-dm-sans),system-ui,sans-serif] font-normal text-[var(--white)] selection:bg-[var(--blue)]/25 selection:text-white">
        {children}
      </body>
    </html>
  );
}
