import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import BrandManager from "@/components/BrandManager";
import Chatbot from "@/components/Chatbot";
import ReminderCenter from "@/components/ReminderCenter";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All Chat CRM - WhatsApp Automation",
  description: "Automate WhatsApp Marketing with AI Powered CRM",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <BrandManager />

          <Navbar />

          {children}

          <Chatbot />

          <ReminderCenter />
        </Providers>
      </body>
    </html>
  );
}
