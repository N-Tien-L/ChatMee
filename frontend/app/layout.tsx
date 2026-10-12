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
  title: "ChatMee - Real-time Chat Application",
  description: "Connect and chat with friends in real-time",
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
              background: "rgba(0, 0, 0, 0.8)",
              color: "#fff",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            },
            error: {
              style: {
                // background: 'rgba(239, 68, 68, 0.9)',
                color: "#fff",
              },
            },
            success: {
              style: {
                // background: 'rgba(34, 197, 94, 0.9)',
                color: "#fff",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
