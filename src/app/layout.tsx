import type { Metadata } from "next";
import { Exo_2, Orbitron } from "next/font/google";
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
      className={`${orbitron.variable} ${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#0a0a1a] font-[family-name:var(--font-exo2),system-ui,sans-serif] text-zinc-100">
        {children}
      </body>
    </html>
  );
}
