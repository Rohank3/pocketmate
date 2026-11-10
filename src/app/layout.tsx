import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PocketMate",
  description: "Financial workspace powered by PayPal Sandbox",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

const themeInitScript = `
(function() {
  try {
    var raw = localStorage.getItem("pocketmate_color_theme");
    var t = null;
    if (raw === "dark" || raw === "black-blue" || raw === "black-orange") t = "dark";
    else if (raw === "light" || raw === "white-blue" || raw === "white-orange") t = "light";
    var resolved = t || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", resolved);
    if (t) {
      var m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.setAttribute("content", t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
