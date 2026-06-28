import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClientWrapper } from "../lib/client-wrapper";
import "./globals.css";

// Disable static generation globally to work around Next.js 16 beta prerender issues
export const dynamic = "force-dynamic";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "AIFUT — AI-native operator control plane",
  description: "Turn app chaos into an intelligent operator stack. One control plane for multi-tenant businesses that need apps, workflows, AI, operators, and data to behave like one governed system.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
