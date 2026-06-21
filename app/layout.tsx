import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import BrandManager from "@/components/BrandManager"; // ✅ ADDED

import { startInternalScheduler } from "@/lib/scheduler";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All Chat CRM - WhatsApp Automation",
  description: "Automate WhatsApp Marketing with AI Powered CRM",
};

if (typeof window === "undefined") {
  try {
    startInternalScheduler();
  } catch (e) {
    console.error("Failed to start scheduler", e);
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <BrandManager /> {/* ✅ ADDED */}
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
