import type { Metadata, Viewport } from "next";
import { Borel, Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { MotionProvider } from "@/components/fx/motion-provider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Brand font: used for the ChatMee wordmark only.
const borel = Borel({
  variable: "--font-borel",
  subsets: ["latin"],
  weight: "400",
});

// Display font: headlines on public pages and room titles (D-14).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChatMee",
  description: "Real-time chat with rooms, direct messages, presence and typing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Applies the saved or system theme before first paint (D-15). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${borel.variable} ${bricolage.variable} antialiased h-full`}
        suppressHydrationWarning={true}
      >
        <MotionProvider>{children}</MotionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "var(--foreground)",
              color: "var(--background)",
              borderRadius: "6px",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
