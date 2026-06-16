import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers"; // ADDED

// Import the internal scheduler
import { startInternalScheduler } from "@/lib/scheduler";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All Chat CRM - WhatsApp Automation",
  description: "Automate WhatsApp Marketing with AI Powered CRM",
};

// START THE BACKGROUND SCHEDULER ON SERVER BOOT
// This ensures the 5-minute check runs internally without external APIs
if (typeof window === "undefined") {
  try {
    startInternalScheduler();
  } catch (e) {
    console.error("Failed to start scheduler", e);
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <Providers> {/* ADDED: Wraps the app in NextAuth SessionProvider */}
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}