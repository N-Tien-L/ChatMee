import type { Metadata, Viewport } from "next";
import { Borel, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
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
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${borel.variable} antialiased h-full`}
        suppressHydrationWarning={true}
      >
        {children}
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
