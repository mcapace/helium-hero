import type { Metadata } from "next";
import { Exo_2, JetBrains_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const exo2 = Exo_2({
  subsets: ["latin"],
  variable: "--font-exo2",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-tech",
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
      className={`${orbitron.variable} ${exo2.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#050510] font-[family-name:var(--font-exo2),system-ui,sans-serif] text-zinc-100 selection:bg-[#22d3ee]/25 selection:text-white">
        {children}
      </body>
    </html>
  );
}
