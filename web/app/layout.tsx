import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Operations Hub",
  description: "Operations Hub",
};

const themeInitScript = `
  (() => {
    try {
      const stored = window.localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme =
        stored === "dark" || stored === "light"
          ? stored
          : prefersDark
            ? "dark"
            : "light";
      const isDark = theme === "dark";
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    } catch (_) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <I18nProvider>
          {children}
          <Toaster
            position="top-center"
            duration={3000}
            richColors
            className="toaster"
          />
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
